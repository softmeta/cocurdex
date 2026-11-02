import Compression
import CryptoKit
import ExpoModulesCore

private let tagLength = 16
private let chunkLength = 64 * 1024

internal final class SealedTooShortException: Exception {
  override var reason: String { "Sealed data is shorter than its authentication tag" }
}

internal final class CompressionFailedException: Exception {
  override var reason: String { "The data could not be compressed or decompressed" }
}

internal final class InflatedTooLargeException: Exception {
  override var reason: String { "The decompressed data exceeds its limit" }
}

private func process(_ input: Data, operation: compression_stream_operation, limit: Int) throws -> Data {
  let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
  defer { stream.deallocate() }
  guard compression_stream_init(stream, operation, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
    throw CompressionFailedException()
  }
  defer { compression_stream_destroy(stream) }
  let chunk = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkLength)
  defer { chunk.deallocate() }
  var output = Data()
  try input.withUnsafeBytes { (source: UnsafeRawBufferPointer) in
    stream.pointee.src_ptr = source.bindMemory(to: UInt8.self).baseAddress ?? UnsafePointer(chunk)
    stream.pointee.src_size = input.count
    while true {
      stream.pointee.dst_ptr = chunk
      stream.pointee.dst_size = chunkLength
      let status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
      output.append(chunk, count: chunkLength - stream.pointee.dst_size)
      if output.count > limit { throw InflatedTooLargeException() }
      switch status {
      case COMPRESSION_STATUS_END:
        return
      case COMPRESSION_STATUS_OK:
        if stream.pointee.dst_size > 0 && stream.pointee.src_size == 0 {
          throw CompressionFailedException()
        }
      default:
        throw CompressionFailedException()
      }
    }
  }
  return output
}

public class CocurdexWireModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CocurdexWire")

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

    Function("deflateRaw") { (data: Data) throws -> Data in
      try process(data, operation: COMPRESSION_STREAM_ENCODE, limit: Int.max)
    }

    Function("inflateRaw") { (data: Data, maxLength: Int) throws -> Data in
      try process(data, operation: COMPRESSION_STREAM_DECODE, limit: maxLength)
    }
  }
}
