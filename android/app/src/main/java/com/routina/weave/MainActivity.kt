package com.routina.weave

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.WindowInsets
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * 筆記 App 的外殼：整個畫面是一個 WebView，載入打包進 assets 的網頁版（repo 根目錄的
 * Vite 專案）。網頁與 App 共用同一份原始碼，除了網址預覽之外完全離線可用。
 *
 * 網頁在 App 裡做不到的事走 bridge（共用部分見 [WebBridge]）：
 * - 存檔（匯出 zip）：WebView 不處理 blob: 下載，見 [FileSaver]。
 * - 網址預覽：網頁直接 fetch 別的網站會被 CORS 擋，見 [LinkPreviewer]。
 * - Google 帳號授權（雲端硬碟同步）：Google 不允許在 WebView 裡登入，見 [GoogleAuth]。
 * - 系統列顏色跟著網頁的深淺色，見 [SystemBars]。
 *
 * 安全：bridge 只注入 App 自己的 origin（https://appassets.androidplatform.net），只接受主框架的訊息。
 * 導覽也只放行自己打包的頁面，其他網址交給瀏覽器（子框架的不交），也不開檔案存取。
 * iframe 第一次載入不會經過 shouldOverrideUrlLoading，所以別的網站的 iframe 仍載得進來，但拿不到 bridge。
 * 筆記的 HTML 經過 DOMPurify，預設不允許 iframe，頁面裡不會嵌進別人的網站。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var fileSaver: FileSaver
    private lateinit var googleAuth: GoogleAuth

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        filePathCallback?.onReceiveValue(
            if (result.resultCode == RESULT_OK) pickedUris(result.data) else null
        )
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        /*
         * assets 掛在 https://appassets.androidplatform.net 底下而不是 file://：
         * file:// 是不透明來源，IndexedDB（筆記都存在這裡）會不可靠。
         * 路徑對上網頁版的 Vite base，網頁的建置設定就不用為 App 改。
         */
        val assets = WebViewAssetLoader.AssetsPathHandler(this)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler(WebBridge.APP_PATH) { path ->
                // 目錄請求要自己補 index.html。找不到檔案時 AssetsPathHandler 回的是
                // data 為 null 的回應而不是 null，所以要看 data
                val requested = if (path.isEmpty() || path.endsWith("/")) path + INDEX else path
                val response = assets.handle(requested)
                if (response?.data != null) response else assets.handle(INDEX)
            }
            .build()

        webView = WebView(this)
        val container = FrameLayout(this)
        container.addView(webView)
        setContentView(container)
        applySystemBarInsets(container)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            // 開了才會走 onCreateWindow，target="_blank" 與 window.open 才能統一交給瀏覽器
            setSupportMultipleWindows(true)
            // 讓網頁知道自己在 App 裡：bridge 沒注入（WebView 太舊）時，網頁版的 Google 登入也會被擋，要藏起同步
            userAgentString = "$userAgentString $USER_AGENT_MARKER"
        }

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // 外部連結交給瀏覽器，不然會困在沒有網址列的頁面裡。
                // POST 導覽不會經過這裡，所以這只是使用體驗；真正保護 bridge 的是 origin 限制
                val url = request.url
                if (WebBridge.isAppPage(url)) return false
                // 子框架的外部導覽直接擋掉，不要因為一個 iframe 就把瀏覽器叫出來（iframe 第一次載入不會到這裡）
                if (request.isForMainFrame) openExternal(url)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // 網頁的 <input type="file">。不實作的話點了完全沒反應
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return runCatching {
                    fileChooser.launch(chooserIntent(params))
                    true
                }.getOrElse {
                    filePathCallback = null
                    false
                }
            }

            /*
             * target="_blank" 與 window.open 會要求開新視窗。window.open 的網址在這裡拿不到，
             * 所以給它一個不顯示的暫時 WebView，攔下它的第一個導覽交給瀏覽器後丟掉。
             */
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                val popup = WebView(view.context)
                popup.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(popupView: WebView, request: WebResourceRequest): Boolean {
                        // 自己的頁面就在原本的 WebView 開，暫時 WebView 沒有 assetLoader
                        if (WebBridge.isAppPage(request.url)) {
                            webView.loadUrl(request.url.toString())
                        } else {
                            openExternal(request.url)
                        }
                        popupView.post { popupView.destroy() }
                        return true
                    }
                }
                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = popup
                resultMsg.sendToTarget()
                return true
            }
        }

        // 兩個都要在 onCreate 建立，裡面註冊了 ActivityResult
        fileSaver = FileSaver(this)
        googleAuth = GoogleAuth(this)
        /*
         * bridge 要在 loadUrl / restoreState 之前註冊。WebView 太舊（82 以前）時一個都不註冊，
         * 也不退回 addJavascriptInterface（它會注入每個 frame、每個頁面）。網頁端會自己退回：
         * 網址預覽只顯示網域、存檔提示更新 WebView、同步藏起來、系統列維持主題預設色。
         */
        if (WebBridge.isSupported()) {
            fileSaver.register(webView)
            LinkPreviewer().register(webView)
            SystemBars(this).register(webView)
            googleAuth.register(webView)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(WebBridge.APP_ORIGIN + WebBridge.APP_PATH)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    /** 只交出一般網址與 mailto，intent:、file: 之類的 scheme 一律忽略 */
    private fun openExternal(url: Uri) {
        if (url.scheme?.lowercase() !in EXTERNAL_SCHEMES) return
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
    }

    /**
     * targetSdk 35 在 Android 15 以上強制 edge-to-edge，網頁會畫到狀態列和導覽列底下，
     * 鍵盤跳出時 adjustResize 也不再縮小視窗。把系統列與鍵盤的高度當成外框的 padding，
     * 網頁就不用處理 safe-area。舊版 Android 視窗本來就避開系統列，這裡拿到的是 0。
     */
    private fun applySystemBarInsets(container: FrameLayout) {
        container.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }
    }

    /**
     * 不用 params.createIntent()：它把 accept 屬性原封不動當 MIME type，
     * 「.zip」這種副檔名寫法會變成一個什麼檔都選不到的選擇器。
     */
    private fun chooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val mimeTypes = params.acceptTypes.map { it.trim() }.filter { it.contains('/') }.distinct()
        val onlyMime = params.acceptTypes.all { it.isBlank() || it.contains('/') }
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            if (onlyMime && mimeTypes.isNotEmpty()) {
                type = if (mimeTypes.size == 1) mimeTypes[0] else "*/*"
                if (mimeTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
            } else {
                // 有副檔名寫法（.zip、.md）時系統無從過濾，全部列出，交給網頁判斷內容
                type = "*/*"
            }
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
    }

    private fun pickedUris(data: Intent?): Array<Uri>? {
        data ?: return null
        val clip = data.clipData
        if (clip != null && clip.itemCount > 0) {
            return Array(clip.itemCount) { clip.getItemAt(it).uri }
        }
        return data.data?.let { arrayOf(it) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    companion object {
        private const val INDEX = "index.html"
        private const val USER_AGENT_MARKER = "RoutinaWeaveAndroid"
        private val EXTERNAL_SCHEMES = setOf("http", "https", "mailto")
    }
}
