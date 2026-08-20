import CryptoKit
import Security
import SwiftRs
import Tauri
import UIKit
import WebKit

private let identityTag = "it.ethosadamas.tacitus.identity.v2".data(using: .utf8)!
private let storageService = "it.ethosadamas.tacitus.storage.v2"

private class IdentityArgs: Decodable { let nickname: String }
private class BytesArgs: Decodable { let value: String }

private enum IdentityError: Error {
  case failure(String)
}

class IdentityPlugin: Plugin {
  @objc public func getOrCreate(_ invoke: Invoke) throws {
    do {
      let args = try invoke.parseArgs(IdentityArgs.self)
      let storedNickname = UserDefaults.standard.string(forKey: "tacitus.identity.nickname")
      guard storedNickname == nil || storedNickname == args.nickname else {
        throw IdentityError.failure("nickname is immutable")
      }
      let privateKey = try loadPrivateKey() ?? createPrivateKey()
      UserDefaults.standard.set(args.nickname, forKey: "tacitus.identity.nickname")
      guard let publicKey = SecKeyCopyPublicKey(privateKey),
            let external = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
        throw IdentityError.failure("public key export failed")
      }
      invoke.resolve(["publicKey": external.base64URL])
    } catch { invoke.reject(error.localizedDescription) }
  }

  @objc public func sign(_ invoke: Invoke) throws {
    do {
      let payload = try Data(base64URL: invoke.parseArgs(BytesArgs.self).value)
      guard let privateKey = try loadPrivateKey() else {
        throw IdentityError.failure("identity does not exist")
      }
      var error: Unmanaged<CFError>?
      guard let der = SecKeyCreateSignature(
        privateKey,
        .ecdsaSignatureMessageX962SHA256,
        payload as CFData,
        &error
      ) as Data? else {
        if let error { throw error.takeRetainedValue() }
        throw IdentityError.failure("signature failed")
      }
      invoke.resolve(["value": try derToRaw(der).base64URL])
    } catch { invoke.reject(error.localizedDescription) }
  }

  @objc public func seal(_ invoke: Invoke) throws {
    do {
      let plaintext = try Data(base64URL: invoke.parseArgs(BytesArgs.self).value)
      let key = SymmetricKey(data: try loadOrCreateStorageKey())
      let box = try AES.GCM.seal(plaintext, using: key)
      guard let combined = box.combined else { throw IdentityError.failure("encryption failed") }
      invoke.resolve(["value": combined.base64URL])
    } catch { invoke.reject(error.localizedDescription) }
  }

  @objc public func open(_ invoke: Invoke) throws {
    do {
      let combined = try Data(base64URL: invoke.parseArgs(BytesArgs.self).value)
      let key = SymmetricKey(data: try loadStorageKey())
      let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: key)
      invoke.resolve(["value": plaintext.base64URL])
    } catch { invoke.reject(error.localizedDescription) }
  }

  @objc public func delete(_ invoke: Invoke) {
    SecItemDelete([kSecClass: kSecClassKey, kSecAttrApplicationTag: identityTag] as CFDictionary)
    SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: storageService] as CFDictionary)
    UserDefaults.standard.removeObject(forKey: "tacitus.identity.nickname")
    invoke.resolve()
  }

  private func loadPrivateKey() throws -> SecKey? {
    let query: [CFString: Any] = [
      kSecClass: kSecClassKey,
      kSecAttrApplicationTag: identityTag,
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef: true,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw IdentityError.failure("keychain query failed") }
    return (result as! SecKey)
  }

  private func createPrivateKey() throws -> SecKey {
    let privateAttributes: [CFString: Any] = [
      kSecAttrIsPermanent: true,
      kSecAttrApplicationTag: identityTag,
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    var attributes: [CFString: Any] = [
      kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits: 256,
      kSecPrivateKeyAttrs: privateAttributes,
    ]
    #if !targetEnvironment(simulator)
    attributes[kSecAttrTokenID] = kSecAttrTokenIDSecureEnclave
    #endif
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      if let error { throw error.takeRetainedValue() }
      throw IdentityError.failure("key creation failed")
    }
    return key
  }

  private func loadOrCreateStorageKey() throws -> Data {
    if let key = try? loadStorageKey() { return key }
    var key = Data(count: 32)
    guard key.withUnsafeMutableBytes({ SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }) == errSecSuccess else {
      throw IdentityError.failure("random generator failed")
    }
    let status = SecItemAdd([
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: storageService,
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData: key,
    ] as CFDictionary, nil)
    guard status == errSecSuccess else { throw IdentityError.failure("storage key creation failed") }
    return key
  }

  private func loadStorageKey() throws -> Data {
    var result: CFTypeRef?
    let status = SecItemCopyMatching([
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: storageService,
      kSecReturnData: true,
    ] as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else {
      throw IdentityError.failure("storage key does not exist")
    }
    return data
  }
}

private func derToRaw(_ der: Data) throws -> Data {
  let bytes = [UInt8](der)
  var offset = 0
  func readLength() throws -> Int {
    guard offset < bytes.count else { throw IdentityError.failure("invalid ECDSA signature") }
    let first = Int(bytes[offset]); offset += 1
    if first < 128 { return first }
    var value = 0
    for _ in 0..<(first & 127) {
      guard offset < bytes.count else { throw IdentityError.failure("invalid ECDSA signature") }
      value = value * 256 + Int(bytes[offset]); offset += 1
    }
    return value
  }
  guard bytes.indices.contains(offset), bytes[offset] == 0x30 else { throw IdentityError.failure("invalid ECDSA signature") }
  offset += 1; _ = try readLength()
  func readInteger() throws -> [UInt8] {
    guard bytes.indices.contains(offset), bytes[offset] == 0x02 else { throw IdentityError.failure("invalid ECDSA signature") }
    offset += 1
    let length = try readLength()
    guard offset + length <= bytes.count else { throw IdentityError.failure("invalid ECDSA signature") }
    let value = Array(bytes[offset..<(offset + length)]); offset += length
    return Array(value.drop(while: { $0 == 0 }))
  }
  func fixed32(_ value: [UInt8]) throws -> [UInt8] {
    guard value.count <= 32 else { throw IdentityError.failure("invalid ECDSA signature") }
    return Array(repeating: 0, count: 32 - value.count) + value
  }
  return Data(try fixed32(readInteger()) + fixed32(readInteger()))
}

private extension Data {
  init(base64URL: String) throws {
    var value = base64URL.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    value += String(repeating: "=", count: (4 - value.count % 4) % 4)
    guard let data = Data(base64Encoded: value) else { throw IdentityError.failure("invalid Base64URL") }
    self = data
  }
  var base64URL: String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
}

@_cdecl("init_plugin_identity")
func initPlugin() -> Plugin { IdentityPlugin() }
