import AppKit
import WebKit
import CryptoKit

final class BeamUpdater {
    weak var owner: BeamDelegate?
    var busy = false
    var panel: NSPanel?
    var label: NSTextField?
    var progress: NSProgressIndicator?
    var timer: Timer?
    var installer: Process?
    init(_ owner: BeamDelegate) { self.owner = owner }
    func alert(_ title: String, _ detail: String) { DispatchQueue.main.async { let a=NSAlert(); a.messageText=title; a.informativeText=detail; a.addButton(withTitle:"OK"); a.runModal() } }
    func begin(rollback: Bool = false) {
        guard !busy, let owner=owner else { return }
        let app=Bundle.main.bundleURL
        guard owner.portable, app.deletingLastPathComponent().path == "/Applications", FileManager.default.isWritableFile(atPath: "/Applications") else {
            alert("Installez Beam dans Applications", "Les mises à jour intégrées sont disponibles dans l’app Mac installée dans Applications. Déplacez Beam depuis son disque d’installation vers Applications ; aucun mot de passe administrateur n’est demandé par Beam."); return
        }
        guard owner.server?.isRunning == true else { alert("Fermez les autres instances de Beam", "Cette fenêtre utilise un serveur démarré par une autre instance. Fermez les autres instances puis relancez Beam avant de mettre à jour."); return }
        let previous=app.deletingLastPathComponent().appendingPathComponent(".Beam-previous.app")
        if rollback {
            guard FileManager.default.fileExists(atPath:previous.path) else { alert("Pas de version précédente", "Elle sera conservée après votre première mise à jour depuis Beam."); return }
            confirm(staged:previous, version:"la version précédente", rollback:true); return
        }
        busy=true
        let request=URLRequest(url:URL(string:"https://api.github.com/repos/hollandejeancharles-hash/beam/releases?per_page=20")!, timeoutInterval:20)
        URLSession.shared.dataTask(with:request) { data,response,error in
            do {
                guard let data=data, (response as? HTTPURLResponse)?.statusCode == 200 else { throw NSError(domain:"Beam",code:1,userInfo:[NSLocalizedDescriptionKey:"Vérification indisponible. Réessayez plus tard."]) }
                let rows=try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
                let current=Bundle.main.object(forInfoDictionaryKey:"BeamVersion") as? String ?? "0"
                let releases=rows.filter { ($0["draft"] as? Bool) != true && self.validVersion($0["tag_name"] as? String ?? "") && ($0["assets"] as? [[String:Any]] ?? []).contains(where: { ($0["name"] as? String) == "Beam-AppleSilicon.dmg" }) }.sorted { self.newer($0["tag_name"] as? String ?? "", $1["tag_name"] as? String ?? "") }
                guard let release=releases.first, let version=release["tag_name"] as? String, self.newer(version,current) else { self.busy=false; self.alert("Beam est à jour", "Version \(current)"); return }
                guard let assets=release["assets"] as? [[String:Any]], let asset=assets.first(where: { ($0["name"] as? String) == "Beam-AppleSilicon.dmg" }), let address=asset["browser_download_url"] as? String, let url=URL(string:address), url.scheme == "https", url.host == "github.com", url.path == "/hollandejeancharles-hash/beam/releases/download/\(version)/Beam-AppleSilicon.dmg", let digest=asset["digest"] as? String, digest.hasPrefix("sha256:"), digest.count == 71 else { throw NSError(domain:"Beam",code:2,userInfo:[NSLocalizedDescriptionKey:"Cette version ne fournit pas un paquet vérifiable. Utilisez son installation manuelle."]) }
                DispatchQueue.main.async { self.download(url, digest:String(digest.dropFirst(7)), version:version) }
            } catch { self.busy=false; self.alert("Mise à jour impossible",error.localizedDescription) }
        }.resume()
    }
    func newer(_ a:String,_ b:String)->Bool {
        func parts(_ v:String)->[Int] { let pieces=v.replacingOccurrences(of:"v",with:"").components(separatedBy:"-beta."); return pieces[0].split(separator:".").map { Int($0) ?? 0 } + [pieces.count>1 ? Int(pieces[1]) ?? 0 : Int.max] }
        let x=parts(a), y=parts(b); guard x.count==4,y.count==4 else { return false }; for i in 0..<4 { if x[i] != y[i] { return x[i]>y[i] } }; return false
    }
    func validVersion(_ v:String)->Bool { v.range(of:"^v[0-9]+\\.[0-9]+\\.[0-9]+(?:-beta\\.[0-9]+)?$",options:.regularExpression) != nil }
    func phase(_ text:String) { DispatchQueue.main.async { self.label?.stringValue=text; self.progress?.isIndeterminate=true; self.progress?.startAnimation(nil) } }
    func download(_ url:URL,digest:String,version:String) {
        let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:400,height:140),styleMask:[.titled],backing:.buffered,defer:false)
        panel.title="Mise à jour de Beam"; panel.isReleasedWhenClosed=false
        let label=NSTextField(labelWithString:"Téléchargement de \(version)…"); label.frame=NSRect(x:24,y:85,width:350,height:25)
        let progress=NSProgressIndicator(frame:NSRect(x:24,y:52,width:350,height:14)); progress.style = .bar; progress.minValue=0; progress.maxValue=100; progress.isIndeterminate=true; progress.startAnimation(nil)
        panel.contentView?.addSubview(label); panel.contentView?.addSubview(progress); panel.center(); panel.makeKeyAndOrderFront(nil)
        self.panel=panel; self.label=label; self.progress=progress
        var task:URLSessionDownloadTask!
        task=URLSession.shared.downloadTask(with:url) { file,response,error in
            DispatchQueue.main.async { self.timer?.invalidate(); self.timer=nil }
            do {
                guard let file=file, (response as? HTTPURLResponse)?.statusCode == 200 else { throw NSError(domain:"Beam",code:3,userInfo:[NSLocalizedDescriptionKey:error?.localizedDescription ?? "Téléchargement interrompu."]) }
                self.phase("Vérification du téléchargement…")
                let handle=try FileHandle(forReadingFrom:file); defer { try? handle.close() }
                var hash=SHA256(); while let chunk=try handle.read(upToCount:1048576), !chunk.isEmpty { hash.update(data:chunk) }
                let actual=hash.finalize().map { String(format:"%02x",$0) }.joined()
                guard actual == digest else { throw NSError(domain:"Beam",code:4,userInfo:[NSLocalizedDescriptionKey:"Le fichier reçu ne correspond pas à la version publiée. Installation annulée."]) }
                let scratch=FileManager.default.temporaryDirectory.appendingPathComponent("beam-update-"+UUID().uuidString)
                try FileManager.default.createDirectory(at:scratch,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
                let dmg=scratch.appendingPathComponent("Beam.dmg"), mount=scratch.appendingPathComponent("mount")
                try FileManager.default.moveItem(at:file,to:dmg)
                self.phase("Préparation de la nouvelle version…")
                try self.run("/usr/bin/hdiutil",["attach",dmg.path,"-nobrowse","-readonly","-mountpoint",mount.path])
                defer { try? self.run("/usr/bin/hdiutil",["detach",mount.path]) }
                let source=mount.appendingPathComponent("Beam.app")
                try self.validate(source,version:version)
                let staged=Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent(".Beam-staged-"+UUID().uuidString+".app")
                try self.run("/usr/bin/ditto",[source.path,staged.path])
                try self.validate(staged,version:version)
                DispatchQueue.main.async { self.panel?.close(); self.panel=nil; self.busy=false; self.confirm(staged:staged,version:version,rollback:false) }
                try? FileManager.default.removeItem(at:scratch)
            } catch { DispatchQueue.main.async { self.panel?.close(); self.panel=nil; self.busy=false; self.alert("Mise à jour impossible",error.localizedDescription) } }
        }
        timer=Timer.scheduledTimer(withTimeInterval:0.3,repeats:true) { _ in
            let total=task.countOfBytesExpectedToReceive, received=task.countOfBytesReceived
            if total>0 { progress.isIndeterminate=false; progress.doubleValue=Double(received)/Double(total)*100; label.stringValue="Téléchargement · \(Int(progress.doubleValue)) %" }
        }
        task.resume()
    }
    func run(_ path:String,_ args:[String]) throws {
        let p=Process(); p.executableURL=URL(fileURLWithPath:path); p.arguments=args; p.standardOutput=FileHandle.nullDevice; p.standardError=FileHandle.nullDevice; try p.run(); p.waitUntilExit()
        if p.terminationStatus != 0 { throw NSError(domain:"Beam",code:5,userInfo:[NSLocalizedDescriptionKey:"La préparation du paquet a échoué. L’app actuelle reste conservée."]) }
    }
    func validate(_ app:URL,version:String? = nil) throws {
        let info=NSDictionary(contentsOf:app.appendingPathComponent("Contents/Info.plist"))
        guard info?["CFBundleIdentifier"] as? String == "app.beam.desktop", info?["BeamPortable"] as? Bool == true, version == nil || info?["BeamVersion"] as? String == version?.replacingOccurrences(of:"v",with:"") else { throw NSError(domain:"Beam",code:6,userInfo:[NSLocalizedDescriptionKey:"Ce paquet n’est pas une version portable de Beam attendue."]) }
        try run("/usr/bin/codesign",["--verify","--deep","--strict",app.path])
    }
    func confirm(staged:URL,version:String,rollback:Bool) {
        let a=NSAlert(); a.messageText=rollback ? "Revenir à la version précédente ?" : "\(version) est prête"
        a.informativeText="Enregistrez vos modifications avant de continuer. Beam va se fermer, sauvegarder les données locales, remplacer l’app et se relancer. Vos notes, workspaces et modèles IA sont conservés. Cette bêta reste non notarisée : macOS peut demander une autorisation d’ouverture."
        a.addButton(withTitle:rollback ? "Revenir et relancer" : "Installer et relancer"); a.addButton(withTitle:"Plus tard")
        guard a.runModal() == .alertFirstButtonReturn else { if !rollback { try? FileManager.default.removeItem(at:staged) }; return }
        do {
            try validate(staged)
            guard let owner=owner else { return }
            let app=Bundle.main.bundleURL, scratch=FileManager.default.temporaryDirectory.appendingPathComponent("beam-install-"+UUID().uuidString)
            try FileManager.default.createDirectory(at:scratch,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            let node=scratch.appendingPathComponent("node"), script=scratch.appendingPathComponent("install-update.mjs"), plan=scratch.appendingPathComponent("plan.json")
            try FileManager.default.copyItem(at:URL(fileURLWithPath:owner.node),to:node)
            try FileManager.default.copyItem(at:Bundle.main.resourceURL!.appendingPathComponent("install-update.mjs"),to:script)
            let recovery=URL(fileURLWithPath:owner.workDirectory).appendingPathComponent("update-backups/"+ISO8601DateFormatter().string(from:Date()))
            let value:[String:Any]=["current":app.path,"staged":staged.path,"previous":app.deletingLastPathComponent().appendingPathComponent(".Beam-previous.app").path,"data":owner.workDirectory+"/data","recovery":recovery.path,"pid":ProcessInfo.processInfo.processIdentifier,"serverPid":owner.server?.processIdentifier ?? 0,"rollback":rollback]
            try JSONSerialization.data(withJSONObject:value).write(to:plan)
            let log=scratch.appendingPathComponent("installer.log")
            FileManager.default.createFile(atPath:log.path,contents:nil,attributes:[.posixPermissions:0o600])
            let output=try FileHandle(forWritingTo:log)
            let p=Process(); p.executableURL=node; p.arguments=[script.path,plan.path]; p.standardOutput=output; p.standardError=output; try p.run()
            self.installer=p
            // Wait for the helper's acknowledgement before closing the app.
            DispatchQueue.global().async {
                let acknowledgement=scratch.appendingPathComponent("started.json")
                for _ in 0..<100 {
                    if FileManager.default.fileExists(atPath:acknowledgement.path) {
                        DispatchQueue.main.async { NSApplication.shared.terminate(nil) }; return
                    }
                    if !p.isRunning { break }
                    Thread.sleep(forTimeInterval:0.05)
                }
                if p.isRunning { p.terminate() }
                let diagnostic=(try? String(contentsOf:log,encoding:.utf8)) ?? ""
                DispatchQueue.main.async {
                    self.installer=nil
                    self.alert("Installation annulée", "Le programme d’installation n’a pas démarré. Beam reste ouvert et la version actuelle est conservée.\n"+String(diagnostic.prefix(500)))
                }
            }
        } catch { alert("Installation annulée",error.localizedDescription) }
    }
}
