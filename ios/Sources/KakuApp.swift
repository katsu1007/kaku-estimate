import SwiftUI
import WebKit
import UIKit
import UniformTypeIdentifiers

@main
struct KakuApp: App {
    var body: some Scene {
        WindowGroup {
            WebView()
                .ignoresSafeArea()
        }
    }
}

/// アプリの中の web フォルダを kaku://app/ として配る
/// （file:// だと PDF図面を読む部品が動かないため）
final class BundleScheme: NSObject, WKURLSchemeHandler {
    static let scheme = "kaku"
    private let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        var file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        /// ./old/ のようなフォルダのアドレスは、中の index.html を返す（URL.path は最後の / を落とすので、本当にフォルダかで見る）
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), isDir.boolValue {
            file = file.appendingPathComponent("index.html")
        }
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file) else {
            let res = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(res)
            task.didFinish()
            return
        }
        let res = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                  headerFields: ["Content-Type": BundleScheme.mime(file.pathExtension),
                                                 "Content-Length": String(data.count),
                                                 "Cache-Control": "no-cache"])!
        task.didReceive(res)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "json": return "application/json"
        case "css": return "text/css"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "webmanifest": return "application/manifest+json"
        case "wasm": return "application/wasm"
        case "md", "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

/// ページの保存データ（localStorage）を、アプリを消すまで残るようにファイルにも書いておく
final class Store: NSObject, WKScriptMessageHandler {
    static var file: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("kaku-storage.json")
    }
    static func loadSaved() -> String {
        if let d = try? Data(contentsOf: file), let s = String(data: d, encoding: .utf8),
           (try? JSONSerialization.jsonObject(with: d)) != nil { return s }
        return "{}"
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let json = message.body as? String, let data = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil else { return }
        try? data.write(to: Store.file, options: .atomic)
    }
}

/// 新しいKAKUの保存（IndexedDB）の控え：保存のたびにページから全部が届くので、ファイルに書いておく。
/// 起動の時に window.__kakuDB として戻し、ブラウザ側の保存が消えていたらページが自分で戻す
final class DBStore: NSObject, WKScriptMessageHandler {
    static var file: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("kaku-db.json")
    }
    static func loadSaved() -> String {
        if let d = try? Data(contentsOf: file), let s = String(data: d, encoding: .utf8),
           (try? JSONSerialization.jsonObject(with: d)) != nil { return s }
        return "null"
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let json = message.body as? String, let data = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil else { return }
        DispatchQueue.global(qos: .utility).async { try? data.write(to: DBStore.file, options: .atomic) }
    }
}

/// 共有メニューを出す（CSV・PDF共通）
func presentShareSheet(for url: URL) {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let window = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first,
          var top = window.rootViewController else { return }
    while let presented = top.presentedViewController { top = presented }
    let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = top.view
    top.present(sheet, animated: true)
}

func topController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let window = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first,
          var top = window.rootViewController else { return nil }
    while let presented = top.presentedViewController { top = presented }
    return top
}

/// 保存先フォルダ（会社の OneDrive・Googleドライブ・iCloud など、「ファイル」に出てくる所）。
/// 1回選んでもらったフォルダを覚えておき（ブックマーク）、ページからの頼みで中の .kaku.json を読んだり、ファイルを書いたりする
final class Folder: NSObject, WKScriptMessageHandlerWithReply, UIDocumentPickerDelegate {
    static let key = "kakuFolderBookmark"
    private var pickReply: ((Any?, String?) -> Void)?

    func folderURL() -> URL? {
        guard let d = UserDefaults.standard.data(forKey: Folder.key) else { return nil }
        var stale = false
        guard let u = try? URL(resolvingBookmarkData: d, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        if stale {
            let ok = u.startAccessingSecurityScopedResource()
            if let nd = try? u.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) { UserDefaults.standard.set(nd, forKey: Folder.key) }
            if ok { u.stopAccessingSecurityScopedResource() }
        }
        return u
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let d = message.body as? [String: Any], let op = d["op"] as? String else { replyHandler(nil, "頼み方が違います"); return }
        switch op {
        case "status":
            replyHandler(folderURL()?.lastPathComponent, nil)
        case "pick":
            DispatchQueue.main.async {
                guard let top = topController() else { replyHandler(nil, "画面が見つかりません"); return }
                self.pickReply?(nil, nil)
                self.pickReply = replyHandler
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
                picker.delegate = self
                picker.allowsMultipleSelection = false
                top.present(picker, animated: true)
            }
        case "list":
            guard let u = folderURL() else { replyHandler(nil, "保存先のフォルダが選ばれていません"); return }
            DispatchQueue.global(qos: .userInitiated).async {
                let ok = u.startAccessingSecurityScopedResource()
                defer { if ok { u.stopAccessingSecurityScopedResource() } }
                var out: [[String: Any]] = []
                var err: NSError?
                NSFileCoordinator().coordinate(readingItemAt: u, options: [], error: &err) { dir in
                    let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
                    for f in items where f.lastPathComponent.hasSuffix(".kaku.json") {
                        if let t = try? String(contentsOf: f, encoding: .utf8) { out.append(["name": f.lastPathComponent, "text": t]) }
                    }
                }
                DispatchQueue.main.async {
                    if let e = err { replyHandler(nil, "フォルダを読めませんでした：" + e.localizedDescription) } else { replyHandler(out, nil) }
                }
            }
        case "write":
            guard let u = folderURL() else { replyHandler(nil, "保存先のフォルダが選ばれていません"); return }
            guard let name = d["name"] as? String else { replyHandler(nil, "ファイル名がありません"); return }
            var data: Data? = nil
            if let t = d["text"] as? String { data = t.data(using: .utf8) }
            else if let b = d["b64"] as? String { data = Data(base64Encoded: b) }
            guard let body = data else { replyHandler(nil, "中身がありません"); return }
            let safe = name.replacingOccurrences(of: "/", with: "_")
            DispatchQueue.global(qos: .utility).async {
                let ok = u.startAccessingSecurityScopedResource()
                defer { if ok { u.stopAccessingSecurityScopedResource() } }
                let f = u.appendingPathComponent(safe)
                var err: NSError?
                var wrote = false
                NSFileCoordinator().coordinate(writingItemAt: f, options: .forReplacing, error: &err) { dst in
                    wrote = (try? body.write(to: dst, options: .atomic)) != nil
                }
                DispatchQueue.main.async { replyHandler(wrote, wrote ? nil : "フォルダに書けませんでした" + (err.map { "：" + $0.localizedDescription } ?? "")) }
            }
        default:
            replyHandler(nil, "知らない頼みです")
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let u = urls.first else { pickReply?(nil, nil); pickReply = nil; return }
        let ok = u.startAccessingSecurityScopedResource()
        defer { if ok { u.stopAccessingSecurityScopedResource() } }
        if let d = try? u.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(d, forKey: Folder.key)
            pickReply?(u.lastPathComponent, nil)
        } else {
            pickReply?(nil, "このフォルダは覚えておけませんでした。別の場所を選んでください")
        }
        pickReply = nil
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { pickReply?(nil, nil); pickReply = nil }
}

/// CSVをファイルにして共有メニュー（ファイルに保存・LINE・AirDropなど）
final class Sharer: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let name = dict["name"] as? String else { return }
        let safeName = name.replacingOccurrences(of: "/", with: "_")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
        if let b64 = dict["b64"] as? String, !b64.isEmpty, let data = Data(base64Encoded: b64) {
            // JWW・DXF などのバイトのままのファイル
            do { try data.write(to: url, options: .atomic) } catch { return }
        } else {
            guard let text = dict["text"] as? String else { return }
            do { try text.write(to: url, atomically: true, encoding: .utf8) } catch { return }
        }
        DispatchQueue.main.async { presentShareSheet(for: url) }
    }
}

/// 見積書のHTMLを見えないブラウザで開いて、PDFにしてから共有メニューを出す
final class PDFMaker: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private var web: WKWebView?
    private var fileName = "見積書.pdf"
    private var timer: Timer?
    private var paper = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)   // A4縦

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let name = dict["name"] as? String,
              let html = dict["html"] as? String else { return }
        DispatchQueue.main.async {
            if self.web != nil { return }   // 作っている途中なら何もしない
            var fn = name.replacingOccurrences(of: "/", with: "_")
            if !fn.lowercased().hasSuffix(".pdf") { fn += ".pdf" }
            self.fileName = fn
            let pw = (dict["w"] as? Double) ?? 595.2, ph = (dict["h"] as? Double) ?? 841.8
            self.paper = CGRect(x: 0, y: 0, width: pw, height: ph)
            let w = WKWebView(frame: self.paper, configuration: WKWebViewConfiguration())
            w.navigationDelegate = self
            self.web = w
            w.loadHTMLString(html, baseURL: nil)
            self.timer?.invalidate()
            self.timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in self?.web = nil }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.render(webView) }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { web = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { web = nil }

    private func render(_ webView: WKWebView) {
        timer?.invalidate()
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let paper = self.paper
        let printable = paper.insetBy(dx: 34, dy: 38)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        let pages = max(renderer.numberOfPages, 1)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: pages))
        for i in 0..<pages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        web = nil
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do { try data.write(to: url, options: .atomic) } catch { return }
        presentShareSheet(for: url)
    }
}

/// ネットのリンクはアプリの外（Safari）で開く。確認ダイアログも出す
final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    private func openOutside(_ url: URL?) -> Bool {
        guard let url = url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return false }
        UIApplication.shared.open(url)
        return true
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if openOutside(navigationAction.request.url) { decisionHandler(.cancel) } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        _ = openOutside(navigationAction.request.url)
        return nil
    }
    private func topVC() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let window = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first,
              var top = window.rootViewController else { return nil }
        while let p = top.presentedViewController { top = p }
        return top
    }
    /// confirm()（案件の削除など）
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let top = topVC() else { completionHandler(false); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        top.present(a, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let top = topVC() else { completionHandler(); return }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        top.present(a, animated: true)
    }
}

struct WebView: UIViewRepresentable {
    let store = Store()
    let dbStore = DBStore()
    let folder = Folder()
    let sharer = Sharer()
    let pdfMaker = PDFMaker()
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(store, name: "kakuStorage")
        controller.add(dbStore, name: "kakuDB")
        controller.addScriptMessageHandler(folder, contentWorld: .page, name: "kakuFolder")
        controller.add(sharer, name: "share")
        controller.add(pdfMaker, name: "pdf")

        // 前回の保存データをページより先に戻し、変わったらアプリにも書いておく
        let saved = Store.loadSaved()
        let script = """
        (function(){
          var saved = \(saved);
          try { if (!localStorage.getItem('kaku-estimate-v1')) { for (var k in saved) localStorage.setItem(k, saved[k]); } } catch(e) {}
          var last = '';
          function push(){ try { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); }
            var s = JSON.stringify(o); if (s !== last) { last = s; window.webkit.messageHandlers.kakuStorage.postMessage(s); } } catch(e) {} }
          setInterval(push, 3000);
          document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') push(); });
          window.addEventListener('pagehide', push);
        })();
        """
        controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: "window.__kakuDB = \(DBStore.loadSaved());", injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.setURLSchemeHandler(BundleScheme(), forURLScheme: BundleScheme.scheme)
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor { t in t.userInterfaceStyle == .dark ? UIColor(red: 0x0d/255, green: 0x11/255, blue: 0x19/255, alpha: 1) : UIColor(red: 0xf4/255, green: 0xf1/255, blue: 0xeb/255, alpha: 1) }
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        webView.load(URLRequest(url: URL(string: "\(BundleScheme.scheme)://app/index.html")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
