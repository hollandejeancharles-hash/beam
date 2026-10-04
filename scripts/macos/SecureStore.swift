import Foundation
import Security
// Secrets travel through stdin/stdout, never process arguments or log files.
do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count < 262144,
          let input = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let account = input["account"] as? String, account.count <= 128,
          let operation = input["operation"] as? String else { exit(2) }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app.beam.sessions", kSecAttrAccount as String: account]
    var output: Any = NSNull()
    if operation == "read" {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess, let bytes = result as? Data { output = try JSONSerialization.jsonObject(with: bytes) }
        else if status != errSecItemNotFound { exit(3) }
    } else if operation == "write" {
        let bytes = try JSONSerialization.data(withJSONObject: input["value"] ?? NSNull(), options: [.fragmentsAllowed])
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
        if status == errSecItemNotFound {
            var entry = query
            entry[kSecValueData as String] = bytes
            entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { exit(3) }
        } else if status != errSecSuccess { exit(3) }
        output = true
    } else if operation == "delete" {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { exit(3) }
        output = true
    } else { exit(2) }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.fragmentsAllowed]))
} catch { exit(3) }
