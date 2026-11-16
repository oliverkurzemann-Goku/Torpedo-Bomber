import UIKit
import WebKit

// Build 277 (GRAPHICS-PLAN phase 6): tells the game when the iPad gets hot or
// short of memory. The game listens for the window event "graphicsdevicehealth"
// (graphics-quality.js) and lowers its highest permitted graphics tier:
//   thermal 0 nominal / 1 fair -> High allowed, 2 serious -> Medium, 3 critical
//   or a memory warning -> Low. Nothing here changes frame rate or the display;
//   the target stays a steady 60 frames per second.
final class GraphicsHealth {
    private weak var webView: WKWebView?
    private var observers: [NSObjectProtocol] = []
    private var memoryWarningUntil = Date.distantPast
    private var timer: Timer?

    init(webView: WKWebView) {
        self.webView = webView
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification,
                                            object: nil, queue: .main) { [weak self] _ in self?.send() })
        observers.append(center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            // A memory warning holds the lowest tier for two minutes.
            self?.memoryWarningUntil = Date().addingTimeInterval(120)
            self?.send()
            DispatchQueue.main.asyncAfter(deadline: .now() + 121) { self?.send() }
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification,
                                            object: nil, queue: .main) { [weak self] _ in self?.send() })
        // The game pages are separate documents (board -> mission); a page that
        // loads while the iPad is already warm hears about it within 15 s.
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if ProcessInfo.processInfo.thermalState != .nominal || Date() < self.memoryWarningUntil { self.send() }
        }
    }

    deinit {
        timer?.invalidate()
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }

    func send() {
        let thermal: Int
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = 0
        case .fair: thermal = 1
        case .serious: thermal = 2
        case .critical: thermal = 3
        @unknown default: thermal = 1
        }
        let memory = Date() < memoryWarningUntil
        let js = "window.dispatchEvent(new CustomEvent('graphicsdevicehealth',{detail:{thermal:\(thermal),memoryWarning:\(memory)}}));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
