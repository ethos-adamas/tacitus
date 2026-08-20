package it.ethosadamas.tacitus.identity

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64

private const val SIGNING_ALIAS = "tacitus.identity.v2"
private const val STORAGE_ALIAS = "tacitus.storage.v2"
private const val PREFERENCES = "tacitus.identity.v2"

@InvokeArg
class IdentityArgs { lateinit var nickname: String }

@InvokeArg
class BytesArgs { lateinit var value: String }

@TauriPlugin
class IdentityPlugin(private val activity: Activity): Plugin(activity) {
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    @Command
    fun getOrCreate(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(IdentityArgs::class.java)
            val preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            val existingNickname = preferences.getString("nickname", null)
            if (existingNickname != null && existingNickname != args.nickname) {
                throw IllegalStateException("nickname is immutable")
            }
            if (!keyStore.containsAlias(SIGNING_ALIAS)) generateSigningKey()
            preferences.edit().putString("nickname", args.nickname).apply()
            val publicKey = keyStore.getCertificate(SIGNING_ALIAS).publicKey as ECPublicKey
            invoke.resolve(JSObject().apply { put("publicKey", encode(uncompressed(publicKey))) })
        } catch (error: Exception) { invoke.reject(error.message ?: "identity creation failed") }
    }

    @Command
    fun sign(invoke: Invoke) {
        try {
            val bytes = decode(invoke.parseArgs(BytesArgs::class.java).value)
            val privateKey = keyStore.getKey(SIGNING_ALIAS, null)
                ?: throw IllegalStateException("identity does not exist")
            val signature = Signature.getInstance("SHA256withECDSA").apply {
                initSign(privateKey as java.security.PrivateKey)
                update(bytes)
            }.sign()
            invoke.resolve(JSObject().apply { put("value", encode(derToRaw(signature))) })
        } catch (error: Exception) { invoke.reject(error.message ?: "signature failed") }
    }

    @Command
    fun seal(invoke: Invoke) {
        try {
            if (!keyStore.containsAlias(STORAGE_ALIAS)) generateStorageKey()
            val key = keyStore.getKey(STORAGE_ALIAS, null) as javax.crypto.SecretKey
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            val ciphertext = cipher.doFinal(decode(invoke.parseArgs(BytesArgs::class.java).value))
            invoke.resolve(JSObject().apply { put("value", encode(cipher.iv + ciphertext)) })
        } catch (error: Exception) { invoke.reject(error.message ?: "encryption failed") }
    }

    @Command
    fun open(invoke: Invoke) {
        try {
            val combined = decode(invoke.parseArgs(BytesArgs::class.java).value)
            require(combined.size > 28)
            val key = keyStore.getKey(STORAGE_ALIAS, null) as? javax.crypto.SecretKey
                ?: throw IllegalStateException("storage key does not exist")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, combined.copyOfRange(0, 12)))
            }
            invoke.resolve(JSObject().apply { put("value", encode(cipher.doFinal(combined.copyOfRange(12, combined.size)))) })
        } catch (error: Exception) { invoke.reject(error.message ?: "decryption failed") }
    }

    @Command
    fun delete(invoke: Invoke) {
        try {
            keyStore.deleteEntry(SIGNING_ALIAS)
            keyStore.deleteEntry(STORAGE_ALIAS)
            activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
            invoke.resolve()
        } catch (error: Exception) { invoke.reject(error.message ?: "identity deletion failed") }
    }

    private fun signingSpec(strongBox: Boolean) = KeyGenParameterSpec.Builder(
        SIGNING_ALIAS,
        KeyProperties.PURPOSE_SIGN,
    ).setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .apply {
            if (Build.VERSION.SDK_INT >= 28) {
                setUnlockedDeviceRequired(true)
                setIsStrongBoxBacked(strongBox)
            }
        }.build()

    private fun generateSigningKey() {
        val wantsStrongBox = Build.VERSION.SDK_INT >= 28 &&
            activity.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        try {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(signingSpec(wantsStrongBox)); generateKeyPair()
            }
        } catch (error: StrongBoxUnavailableException) {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(signingSpec(false)); generateKeyPair()
            }
        }
    }

    private fun storageSpec(strongBox: Boolean) = KeyGenParameterSpec.Builder(
        STORAGE_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .apply {
            if (Build.VERSION.SDK_INT >= 28) {
                setUnlockedDeviceRequired(true)
                setIsStrongBoxBacked(strongBox)
            }
        }.build()

    private fun generateStorageKey() {
        val wantsStrongBox = Build.VERSION.SDK_INT >= 28 &&
            activity.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        try {
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
                init(storageSpec(wantsStrongBox)); generateKey()
            }
        } catch (error: StrongBoxUnavailableException) {
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
                init(storageSpec(false)); generateKey()
            }
        }
    }

    private fun uncompressed(key: ECPublicKey): ByteArray = byteArrayOf(4) +
        fixed32(key.w.affineX.toByteArray()) + fixed32(key.w.affineY.toByteArray())

    private fun fixed32(value: ByteArray): ByteArray {
        val unsigned = value.dropWhile { it == 0.toByte() }.toByteArray()
        require(unsigned.size <= 32)
        return ByteArray(32 - unsigned.size) + unsigned
    }

    private fun derToRaw(der: ByteArray): ByteArray {
        var offset = 0
        fun length(): Int {
            val first = der[offset++].toInt() and 255
            if (first < 128) return first
            var value = 0
            repeat(first and 127) { value = value * 256 + (der[offset++].toInt() and 255) }
            return value
        }
        require(der[offset++].toInt() == 0x30); length()
        fun integer(): ByteArray {
            require(der[offset++].toInt() == 0x02)
            val size = length()
            return der.copyOfRange(offset, offset + size).also { offset += size }
        }
        return fixed32(integer()) + fixed32(integer())
    }

    private fun encode(value: ByteArray) = Base64.encodeToString(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private fun decode(value: String) = Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
