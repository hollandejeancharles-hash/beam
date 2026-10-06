import AppKit
import Foundation
import WebKit

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

// Keep text editing separate from the native window drag surface.
final class CapturePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
final class CaptureDragHandle: NSView {
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
}

final class BeamDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let localToken = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    var window: NSWindow?
    var webView: WKWebView?
    var statusItem: NSStatusItem!
    var statusMenu: NSMenu?
    var capturePanel: CapturePanel?
    var captureView: WKWebView?
    lazy var updater = BeamUpdater(self)
    @objc func checkUpdate() { updater.begin() }
    @objc func rollbackUpdate() { updater.begin(rollback: true) }
    var server: Process?
    var capturePending = false
    var starting = false
    var destination = "#gantt"
    var pendingInvitation: String?
    let base = "http://127.0.0.1:5173/"
    var portable: Bool { Bundle.main.object(forInfoDictionaryKey: "BeamPortable") as? Bool ?? false }
    var repo: String { portable ? Bundle.main.resourceURL!.appendingPathComponent("runtime").path : Bundle.main.object(forInfoDictionaryKey: "BeamRepository") as? String ?? "" }
    var workDirectory: String { portable ? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Beam").path : repo }
    var node: String { portable ? Bundle.main.resourceURL!.appendingPathComponent("node").path : Bundle.main.object(forInfoDictionaryKey: "BeamNode") as? String ?? "" }
    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let icon = beamMark(20); icon.isTemplate = true
        statusItem.button?.image = icon
        statusItem.button?.toolTip = "Beam — noter rapidement"
        statusItem.button?.target = self
        statusItem.button?.action = #selector(statusClick)
        statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        let menu = NSMenu()
        menu.addItem(withTitle: "Ouvrir Beam", action: #selector(openBeam), keyEquivalent: "")
        menu.addItem(withTitle: "Capturer une note", action: #selector(captureNote), keyEquivalent: "")
        menu.addItem(withTitle: "Ouvrir les notes", action: #selector(openNotes), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        let local = NSMenuItem(title: "Sur ce Mac · accès local uniquement", action: nil, keyEquivalent: ""); local.isEnabled = false; menu.addItem(local)
        menu.addItem(withTitle: "Quitter Beam", action: #selector(quit), keyEquivalent: "q")
        for item in menu.items { item.target = self }
        statusMenu = menu
        installAppMenu()
        let updateError = URL(fileURLWithPath: workDirectory).appendingPathComponent("update-backups/last-error.txt")
        if let message = try? String(contentsOf: updateError, encoding: .utf8) {
            try? FileManager.default.removeItem(at: updateError)
            updater.alert("La mise à jour n’a pas été terminée", message)
        }
        // The previous browser launcher is replaced by the dedicated-window app.
        let previous = NSRunningApplication.runningApplications(withBundleIdentifier: "local.beam.launcher")
        previous.forEach { $0.terminate() }
        finishMigration(previous, remaining: 40)
    }
    func finishMigration(_ previous: [NSRunningApplication], remaining: Int) {
        if previous.allSatisfy({ $0.isTerminated }) || remaining == 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.openBeam() }
        } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.finishMigration(previous, remaining: remaining - 1) } }
    }
    func installAppMenu() {
        let root = NSMenu()
        let app = NSMenuItem(); root.addItem(app)
        let appMenu = NSMenu(); app.submenu = appMenu
        appMenu.addItem(withTitle: "Capturer une note", action: #selector(captureNote), keyEquivalent: "").target = self
        appMenu.addItem(withTitle: "Rechercher une mise à jour…", action: #selector(checkUpdate), keyEquivalent: "").target = self
        appMenu.addItem(withTitle: "Revenir à la version précédente…", action: #selector(rollbackUpdate), keyEquivalent: "").target = self
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quitter Beam", action: #selector(quit), keyEquivalent: "q").target = self
        let edit = NSMenuItem(title: "Édition", action: nil, keyEquivalent: ""); root.addItem(edit)
        let editMenu = NSMenu(title: "Édition"); edit.submenu = editMenu
        for (title, action, key) in [("Annuler", "undo:", "z"), ("Couper", "cut:", "x"), ("Copier", "copy:", "c"), ("Coller", "paste:", "v"), ("Tout sélectionner", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        NSApplication.shared.mainMenu = root
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first, url.scheme == "beam", url.host == "join",
              let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value,
              code.range(of: "^[a-fA-F0-9]{48}$", options: .regularExpression) != nil else { return }
        pendingInvitation = "#invite=" + code.lowercased()
        capturePending = false; capturePanel?.orderOut(nil)
        open(pendingInvitation!)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if window != nil { present() } else { openBeam() }; return false
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    @objc func statusClick() {
        if NSApplication.shared.currentEvent?.type == .rightMouseUp {
            statusItem.menu = statusMenu
            statusItem.button?.performClick(nil)
            statusItem.menu = nil
        } else { captureNote() }
    }
    @objc func captureNote() {
        if capturePanel?.isVisible == true { capturePanel?.orderOut(nil); return }
        capturePending = true
        open(destination)
    }
    func showCapture() {
        capturePending = false
        if capturePanel == nil {
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            configuration.userContentController.add(self, name: "beamCapture")
            let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 420, height: 320), configuration: configuration)
            view.navigationDelegate = self; view.uiDelegate = self
            // WKWebView's native focus ring must not outline the rectangular host.
            // The textarea retains its own visible focus treatment.
            view.focusRingType = .none
            view.underPageBackgroundColor = .clear
            view.setValue(false, forKey: "drawsBackground")
            view.autoresizingMask = [.width, .height]
            let controller = NSViewController()
            let content = NSView(frame: view.frame)
            content.focusRingType = .none
            content.wantsLayer = true
            content.layer?.backgroundColor = NSColor.clear.cgColor
            content.layer?.cornerRadius = 20
            content.layer?.masksToBounds = true
            content.addSubview(view)
            let handle = CaptureDragHandle(frame: NSRect(x: 0, y: 262, width: 325, height: 58))
            handle.autoresizingMask = [.width, .minYMargin]
            content.addSubview(handle)
            if #available(macOS 26.0, *) {
                let glass = NSGlassEffectView(frame: view.frame)
                glass.style = .regular
                glass.cornerRadius = 20
                glass.contentView = content
                controller.view = glass
            } else {
                let material = NSVisualEffectView(frame: view.frame)
                material.material = .popover
                material.blendingMode = .behindWindow
                material.state = .active
                material.wantsLayer = true
                material.layer?.cornerRadius = 20
                material.layer?.masksToBounds = true
                material.addSubview(content)
                controller.view = material
            }
            let panel = CapturePanel(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            panel.contentViewController = controller
            panel.isOpaque = false; panel.backgroundColor = .clear
            // A borderless window's system shadow can retain the rectangular
            // backing extent when the glass changes appearance on activation.
            // Glass provides its own edge treatment; keep the host fully clipped.
            panel.hasShadow = false; panel.level = .floating
            controller.view.wantsLayer = true
            controller.view.layer?.backgroundColor = NSColor.clear.cgColor
            controller.view.layer?.cornerRadius = 20
            controller.view.layer?.masksToBounds = true
            if let frameView = panel.contentView?.superview {
                frameView.wantsLayer = true
                frameView.layer?.backgroundColor = NSColor.clear.cgColor
                frameView.layer?.cornerRadius = 20
                frameView.layer?.masksToBounds = true
            }
            panel.isReleasedWhenClosed = false
            panel.hidesOnDeactivate = false
            panel.appearance = NSAppearance(named: .darkAqua)
            panel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
            if let button = statusItem.button, let statusWindow = button.window {
                let anchor = statusWindow.convertToScreen(button.convert(button.bounds, to: nil))
                let screen = statusWindow.screen ?? NSScreen.main
                let visible = screen?.visibleFrame ?? anchor
                let x = min(max(anchor.midX - 210, visible.minX + 8), visible.maxX - 428)
                let y = max(visible.minY + 8, min(anchor.minY - 328, visible.maxY - 328))
                panel.setFrameOrigin(NSPoint(x: x, y: y))
            }
            capturePanel = panel; captureView = view
            loadLocal(view, URL(string: base + "?capture=1")!)
        }
        capturePanel?.makeKeyAndOrderFront(nil)
        captureView?.evaluateJavaScript("window.__beamFocusCapture?.()", completionHandler: nil)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "beamUpdate" {
            guard message.webView === webView, message.frameInfo.isMainFrame, let url = message.frameInfo.request.url, isLocal(url) else { return }
            if message.body as? String == "rollback" { updater.begin(rollback: true) }
            else if message.body as? String == "check" { updater.begin() }
            return
        }
        guard message.webView === captureView else { return }
        if message.body as? String == "close" { capturePanel?.orderOut(nil); return }
        guard let payload = message.body as? [String: String], payload["action"] == "resize", let panel = capturePanel else { return }
        let expanded = payload["mode"] == "notebook"
        let visible = panel.screen?.visibleFrame ?? NSScreen.main!.visibleFrame
        let size = NSSize(width: min(expanded ? 940 : 420, visible.width - 16), height: min(expanded ? 680 : 320, visible.height - 16))
        let old = panel.frame
        let origin = NSPoint(x: min(max(old.minX, visible.minX + 8), visible.maxX - size.width - 8), y: min(max(old.maxY - size.height, visible.minY + 8), visible.maxY - size.height - 8))
        panel.setFrame(NSRect(origin: origin, size: size), display: true, animate: true)
        panel.makeKeyAndOrderFront(nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === captureView { webView.evaluateJavaScript("window.__beamFocusCapture?.()", completionHandler: nil) }
    }
    @objc func openBeam() { capturePending = false; capturePanel?.orderOut(nil); open(pendingInvitation ?? "#gantt"); pendingInvitation = nil }
    @objc func openNotes() { capturePending = false; capturePanel?.orderOut(nil); open("#notes") }
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
        request.setValue("Bearer " + localToken, forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, response, error in
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let http = response as? HTTPURLResponse
            let healthy = http?.statusCode == 200 && http?.value(forHTTPHeaderField: "X-Beam-Local-Auth") == "required" && json?["name"] is String
            DispatchQueue.main.async { completion(healthy, response != nil) }
        }.resume()
    }
    func startServer() {
        guard FileManager.default.fileExists(atPath: repo + "/server/index.js"), FileManager.default.isExecutableFile(atPath: node), FileManager.default.fileExists(atPath: repo + "/node_modules/vite") else {
            fail("Les fichiers de Beam ou Node.js sont introuvables. Conservez le dépôt à son emplacement actuel et relancez la création du lanceur si vous le déplacez."); return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [repo + "/server/index.js"]
        try? FileManager.default.createDirectory(atPath: workDirectory + "/data", withIntermediateDirectories: true)
        process.currentDirectoryURL = URL(fileURLWithPath: workDirectory)
        var env = ProcessInfo.processInfo.environment
        env["HOST"] = "127.0.0.1"; env["PORT"] = "5173"; env["NODE_ENV"] = "development"
        env["BEAM_DB"] = workDirectory + "/data/beam.sqlite"
        if portable {
            env["NODE_ENV"] = "production"; env["BEAM_DESKTOP"] = "1"
            env["BEAM_ASSETS"] = repo + "/dist"
            env["BEAM_OLLAMA"] = Bundle.main.resourceURL!.appendingPathComponent("ai/runtime/ollama").path
            let bundledModels = Bundle.main.resourceURL!.appendingPathComponent("ai/models").path
            env["BEAM_MODELS"] = FileManager.default.fileExists(atPath: bundledModels) ? bundledModels : workDirectory + "/data/ai/models"
        }
        // The launcher serves this Mac only; inherited deployment settings must not change that scope.
        env["BEAM_ADMIN_TOKEN"] = localToken
        env["BEAM_DESKTOP"] = "1"
        env["BEAM_KEYCHAIN_HELPER"] = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/BeamSecureStore").path
        env.removeValue(forKey: "BEAM_SEED")
        process.environment = env
        let logPath = workDirectory + "/data/launcher.log"
        try? FileManager.default.createDirectory(atPath: workDirectory + "/data", withIntermediateDirectories: true)
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
    func present() {
        window?.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
    func show() {
        starting = false
        if capturePending { showCapture(); return }
        if webView == nil {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .default()
            config.userContentController.add(self, name: "beamUpdate")
            let view = WKWebView(frame: .zero, configuration: config)
            view.navigationDelegate = self; view.uiDelegate = self
            view.autoresizingMask = [.width, .height]
            view.underPageBackgroundColor = NSColor(calibratedRed: 0.063, green: 0.067, blue: 0.078, alpha: 1)
            let frame = NSRect(x: 0, y: 0, width: 1280, height: 820)
            let shell = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            shell.title = "Beam"; shell.isReleasedWhenClosed = false
            shell.minSize = NSSize(width: 640, height: 480)
            shell.appearance = NSAppearance(named: .darkAqua)
            shell.backgroundColor = view.underPageBackgroundColor
            shell.setFrameAutosaveName("BeamWorkspace")
            shell.contentView = view; shell.center()
            window = shell; webView = view
        }
        let target = URL(string: base + destination)!
        if webView?.url != target, let view = webView { loadLocal(view, target) }
        if target.fragment?.hasPrefix("invite=") == true { pendingInvitation = nil }
        present()
    }
    func loadLocal(_ view: WKWebView, _ url: URL) {
        let cookie = HTTPCookie(properties: [.name: "beam_local_session", .value: localToken, .domain: "127.0.0.1", .path: "/", HTTPCookiePropertyKey("HttpOnly"): "TRUE", HTTPCookiePropertyKey("SameSite"): "Strict"])!
        view.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }
    func isLocal(_ url: URL) -> Bool {
        url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "") && url.port == 5173
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if isLocal(url) { decisionHandler(.allow) }
        else {
            if ["https", "http", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { fail("La fenêtre n’a pas pu charger Beam. Réouvrez Beam depuis la barre de menus pour réessayer.") }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let url = frame.request.url, isLocal(url) else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.title = "Joindre un fichier"
        panel.prompt = "Joindre"
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        if let window = webView.window {
            panel.beginSheetModal(for: window) { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
        } else {
            panel.begin { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = "Confirmer l’action"; alert.informativeText = message
        alert.addButton(withTitle: "Confirmer"); alert.addButton(withTitle: "Annuler")
        if let window = webView.window { alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) } }
        else { completionHandler(alert.runModal() == .alertFirstButtonReturn) }
    }
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
withExtendedLifetime(delegate) { application.run() }
