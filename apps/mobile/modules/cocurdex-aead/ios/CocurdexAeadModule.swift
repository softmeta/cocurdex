import CryptoKit
import ExpoModulesCore

private let tagLength = 16

internal final class SealedTooShortException: Exception {
  override var reason: String { "Sealed data is shorter than its authentication tag" }
}

public class CocurdexAeadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CocurdexAead")

    Constant("available") { true }

    Function("seal") { (key: Data, nonce: Data, ad: Data, plaintext: Data) throws -> Data in
      let box = try ChaChaPoly.seal(
        plaintext,
        using: SymmetricKey(data: key),
        nonce: ChaChaPoly.Nonce(data: nonce),
        authenticating: ad
      )
      return box.ciphertext + box.tag
    }

    Function("open") { (key: Data, nonce: Data, ad: Data, sealed: Data) throws -> Data in
      guard sealed.count >= tagLength else {
        throw SealedTooShortException()
      }
      let box = try ChaChaPoly.SealedBox(
        nonce: ChaChaPoly.Nonce(data: nonce),
        ciphertext: sealed.prefix(sealed.count - tagLength),
        tag: sealed.suffix(tagLength)
      )
      return try ChaChaPoly.open(box, using: SymmetricKey(data: key), authenticating: ad)
    }
  }
}
