import CryptoKit
import Foundation

enum SealedMessage {
  static let protocolName = "Noise_N_25519_ChaChaPoly_SHA256"
  static let keyLength = 32
  static let tagLength = 16

  static func open(message: Data, secretKey: Data, prologue: Data) -> Data? {
    guard message.count >= keyLength + tagLength,
          let recipient = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: secretKey)
    else { return nil }
    var hash = initialHash()
    var chainingKey = hash
    hash = mixHash(hash, prologue)
    hash = mixHash(hash, recipient.publicKey.rawRepresentation)
    let ephemeralBytes = message.prefix(keyLength)
    hash = mixHash(hash, ephemeralBytes)
    guard let ephemeral = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: ephemeralBytes),
          let shared = try? recipient.sharedSecretFromKeyAgreement(with: ephemeral)
    else { return nil }
    let sharedBytes = shared.withUnsafeBytes { Data($0) }
    let (nextChainingKey, cipherKey) = hkdf(chainingKey: chainingKey, input: sharedBytes)
    chainingKey = nextChainingKey
    let body = message.dropFirst(keyLength)
    guard let nonce = try? ChaChaPoly.Nonce(data: Data(count: 12)),
          let box = try? ChaChaPoly.SealedBox(
            nonce: nonce,
            ciphertext: body.dropLast(tagLength),
            tag: body.suffix(tagLength)
          )
    else { return nil }
    return try? ChaChaPoly.open(box, using: SymmetricKey(data: cipherKey), authenticating: hash)
  }

  private static func initialHash() -> Data {
    let name = Data(protocolName.utf8)
    if name.count <= 32 { return name + Data(count: 32 - name.count) }
    return Data(SHA256.hash(data: name))
  }

  private static func mixHash<D: DataProtocol>(_ hash: Data, _ data: D) -> Data {
    var hasher = SHA256()
    hasher.update(data: hash)
    hasher.update(data: Data(data))
    return Data(hasher.finalize())
  }

  private static func hmac(_ key: Data, _ data: Data) -> Data {
    Data(HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key)))
  }

  private static func hkdf(chainingKey: Data, input: Data) -> (Data, Data) {
    let temp = hmac(chainingKey, input)
    let first = hmac(temp, Data([1]))
    let second = hmac(temp, first + Data([2]))
    return (first, second)
  }
}
