import AppKit
import Foundation

func beamMark(_ size: CGFloat, background: Bool = false) -> NSImage {
    NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
        if background {
            NSColor(calibratedRed: 0.075, green: 0.08, blue: 0.10, alpha: 1).setFill()
            NSBezierPath(roundedRect: rect.insetBy(dx: size * 0.04, dy: size * 0.04), xRadius: size * 0.22, yRadius: size * 0.22).fill()
            NSColor(calibratedRed: 0.68, green: 0.63, blue: 0.96, alpha: 1).setFill()
        } else { NSColor.labelColor.setFill() }
        for offset: CGFloat in [0, 0.22] {
            let p = NSBezierPath()
            p.move(to: NSPoint(x: size * (0.20 + offset), y: size * 0.24))
            p.line(to: NSPoint(x: size * (0.48 + offset), y: size * 0.76))
            p.line(to: NSPoint(x: size * (0.60 + offset), y: size * 0.76))
            p.line(to: NSPoint(x: size * (0.32 + offset), y: size * 0.24))
            p.close(); p.fill()
        }
        return true
    }
}
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--render-icon" {
    let image = beamMark(1024, background: true)
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
    exit(0)
}

final class BeamDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var server: Process?
    var starting = false
    var destination = "#gantt"
    let base = "http://127.0.0.1:5173/"
    var repo: String { Bundle.main.object(forInfoDictionaryKey: "BeamRepository") as? String ?? "" }
    var node: String { Bundle.main.object(forInfoDictionaryKey: "BeamNode") as? String ?? "" }
    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let icon = beamMark(20); icon.isTemplate = true
        statusItem.button?.image = icon
        statusItem.button?.toolTip = "Beam — votre espace produit local"
        let menu = NSMenu()
        menu.addItem(withTitle: "Ouvrir Beam", action: #selector(openBeam), keyEquivalent: "")
        menu.addItem(withTitle: "Ouvrir les notes", action: #selector(openNotes), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        let local = NSMenuItem(title: "Sur ce Mac · accès local uniquement", action: nil, keyEquivalent: ""); local.isEnabled = false; menu.addItem(local)
        menu.addItem(withTitle: "Quitter le lanceur Beam", action: #selector(quit), keyEquivalent: "q")
        for item in menu.items { item.target = self }
        statusItem.menu = menu
        openBeam()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { openBeam(); return false }
    @objc func openBeam() { open("#gantt") }
    @objc func openNotes() { open("#notes") }
    @objc func quit() { NSApplication.shared.terminate(nil) }
    func open(_ path: String) {
        destination = path
        if starting { return }
        starting = true
        probe { healthy, occupied in
            if healthy { self.show(); return }
            if occupied { self.fail("Le port 5173 est occupé par une autre application. Fermez-la, puis réessayez."); return }
            self.startServer()
        }
    }
    func probe(_ completion: @escaping (Bool, Bool) -> Void) {
        var request = URLRequest(url: URL(string: base + "api/admin/product")!)
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, response, error in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let healthy = (response as? HTTPURLResponse)?.statusCode == 200 && json?["name"] is String
            DispatchQueue.main.async { completion(healthy, response != nil) }
        }.resume()
    }
    func startServer() {
        guard FileManager.default.fileExists(atPath: repo + "/server/index.js"), FileManager.default.isExecutableFile(atPath: node), FileManager.default.fileExists(atPath: repo + "/node_modules/vite") else {
            fail("Les fichiers de Beam ou Node.js sont introuvables. Conservez le dépôt à son emplacement actuel et relancez la création du lanceur si vous le déplacez."); return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = ["server/index.js"]
        process.currentDirectoryURL = URL(fileURLWithPath: repo)
        var env = ProcessInfo.processInfo.environment
        env["HOST"] = "127.0.0.1"; env["PORT"] = "5173"; env["NODE_ENV"] = "development"
        env["BEAM_DB"] = repo + "/data/beam.sqlite"
        // The launcher serves this Mac only; inherited deployment settings must not change that scope.
        env.removeValue(forKey: "BEAM_ADMIN_TOKEN"); env.removeValue(forKey: "BEAM_SEED")
        process.environment = env
        let logPath = repo + "/data/launcher.log"
        try? FileManager.default.createDirectory(atPath: repo + "/data", withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: logPath, contents: nil)
        let log = FileHandle(forWritingAtPath: logPath)
        process.standardOutput = log; process.standardError = log
        do { try process.run(); server = process; waitForServer(40) }
        catch { fail("Beam n’a pas pu démarrer. Consultez data/launcher.log dans le dépôt.") }
    }
    func waitForServer(_ remaining: Int) {
        probe { healthy, _ in
            if healthy { self.show(); return }
            if remaining == 0 || self.server?.isRunning == false { self.fail("Beam n’a pas répondu. Consultez data/launcher.log dans le dépôt, puis réessayez."); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitForServer(remaining - 1) }
        }
    }
    func show() { starting = false; NSWorkspace.shared.open(URL(string: base + destination)!) }
    func fail(_ message: String) {
        starting = false
        if let process = server, process.isRunning { process.terminate() }; server = nil
        NSApplication.shared.activate(ignoringOtherApps: true)
        let alert = NSAlert(); alert.messageText = "Impossible d’ouvrir Beam"; alert.informativeText = message; alert.addButton(withTitle: "OK"); alert.runModal()
    }
    func applicationWillTerminate(_ notification: Notification) {
        // A server already running before launch belongs to its original process and is left alone.
        if let process = server, process.isRunning { process.terminate() }
    }
}
let application = NSApplication.shared
let delegate = BeamDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
