import Foundation
import Security
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var fallback: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    let content = (request.content.mutableCopy() as? UNMutableNotificationContent)
      ?? UNMutableNotificationContent()
    fallback = content
    guard let sealed = request.content.userInfo["c"] as? String,
          let message = PushPayload.decodeBase64Url(sealed),
          let opened = PushKeys.open(message),
          let payload = try? JSONDecoder().decode(PushPayload.self, from: opened)
    else {
      contentHandler(content)
      return
    }
    payload.apply(to: content, strings: PushStrings())
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let fallback { deliver(fallback) }
  }
}

struct PushPayload: Decodable {
  let v: Int
  let kind: String
  let hostId: String
  let hostName: String
  let sessionId: String
  let sessionTitle: String
  let detail: String?
  let requestId: String?

  func apply(to content: UNMutableNotificationContent, strings: PushStrings) {
    content.title = sessionTitle.isEmpty ? strings.text("PUSH_UNTITLED_SESSION") : sessionTitle
    content.subtitle = hostName
    let summary = strings.text(PushPayload.kindKeys[kind] ?? "PUSH_FALLBACK")
    if let detail, !detail.isEmpty {
      content.body = "\(summary): \(detail)"
    } else {
      content.body = summary
    }
    content.threadIdentifier = "\(hostId):\(sessionId)"
    var data: [String: Any] = ["hostId": hostId, "sessionId": sessionId, "kind": kind]
    if let requestId { data["requestId"] = requestId }
    var userInfo = content.userInfo
    userInfo.removeValue(forKey: "c")
    userInfo["body"] = data
    content.userInfo = userInfo
  }

  static let kindKeys = [
    "approval": "PUSH_APPROVAL",
    "question": "PUSH_QUESTION",
    "plan": "PUSH_PLAN",
    "turnCompleted": "PUSH_TURN_COMPLETED",
    "turnFailed": "PUSH_TURN_FAILED",
  ]

  static func decodeBase64Url(_ value: String) -> Data? {
    var base64 = value.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    return Data(base64Encoded: base64)
  }
}

struct PushStrings {
  private let bundle: Bundle

  init() {
    let appURL = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
    bundle = Bundle(url: appURL) ?? Bundle.main
  }

  func text(_ key: String) -> String {
    bundle.localizedString(forKey: key, value: nil, table: nil)
  }
}

enum PushKeys {
  static let prologue = Data("cocurdex-push/1".utf8)
  static let servicePrefix = "dev.cocurdex.push"

  static func open(_ message: Data) -> Data? {
    for secretKey in secretKeys() {
      if let opened = SealedMessage.open(message: message, secretKey: secretKey, prologue: prologue) {
        return opened
      }
    }
    return nil
  }

  private static func secretKeys() -> [Data] {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CocurdexKeychainGroup") as? String else {
      return []
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccessGroup as String: group,
      kSecMatchLimit as String: kSecMatchLimitAll,
      kSecReturnAttributes as String: true,
      kSecReturnData as String: true,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let items = result as? [[String: Any]]
    else { return [] }
    return items.compactMap { item in
      guard let service = item[kSecAttrService as String] as? String,
            service.hasPrefix(servicePrefix),
            let data = item[kSecValueData as String] as? Data,
            let encoded = String(data: data, encoding: .utf8)
      else { return nil }
      return PushPayload.decodeBase64Url(encoded)
    }
  }
}
