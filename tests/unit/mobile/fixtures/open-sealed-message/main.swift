import Foundation

func bytes(_ hex: String) -> Data {
  var data = Data()
  var index = hex.startIndex
  while index < hex.endIndex {
    let next = hex.index(index, offsetBy: 2)
    data.append(UInt8(hex[index..<next], radix: 16)!)
    index = next
  }
  return data
}

let arguments = CommandLine.arguments
let opened = SealedMessage.open(
  message: bytes(arguments[3]),
  secretKey: bytes(arguments[1]),
  prologue: bytes(arguments[2])
)
print(opened.map { $0.map { String(format: "%02x", $0) }.joined() } ?? "nil")
