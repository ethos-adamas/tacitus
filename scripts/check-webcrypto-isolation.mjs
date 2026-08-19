import assert from "node:assert/strict";

const { subtle } = globalThis.crypto;

const [aliceAgreement, bobAgreement, aliceSigning] = await Promise.all([
  subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]),
  subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]),
  subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]),
]);

assert.equal(aliceAgreement.privateKey.extractable, false);
assert.equal(aliceSigning.privateKey.extractable, false);

for (const [format, key] of [
  ["pkcs8", aliceAgreement.privateKey],
  ["pkcs8", aliceSigning.privateKey],
]) {
  await assert.rejects(subtle.exportKey(format, key));
}

const [aliceSecret, bobSecret] = await Promise.all([
  subtle.deriveBits(
    { name: "X25519", public: bobAgreement.publicKey },
    aliceAgreement.privateKey,
    256,
  ),
  subtle.deriveBits(
    { name: "X25519", public: aliceAgreement.publicKey },
    bobAgreement.privateKey,
    256,
  ),
]);

assert.deepEqual(new Uint8Array(aliceSecret), new Uint8Array(bobSecret));

const message = new TextEncoder().encode("tacitus-webcrypto-isolation-v1");
const signature = await subtle.sign("Ed25519", aliceSigning.privateKey, message);
assert.equal(
  await subtle.verify("Ed25519", aliceSigning.publicKey, signature, message),
  true,
);

console.log("WebCrypto opaque Ed25519/X25519 keys: supported");
