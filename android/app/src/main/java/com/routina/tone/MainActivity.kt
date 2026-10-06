package com.routina.tone

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * 調色 App 的外殼：整個畫面是一個 WebView，載入打包進 assets 的網頁版（repo 根目錄的
 * Vite 專案）。網頁與 App 共用同一份原始碼，完全離線可用。
 *
 * 網頁在 App 裡做不到的只有「存檔」：WebView 不處理 blob: 下載，所以存照片與匯出預設集
 * 走 [FileSaver] 這個 JS bridge。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var fileSaver: FileSaver

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
         * file:// 是不透明來源，IndexedDB（預設集、目前的編輯都存在這裡）會不可靠。
         * 路徑對上網頁版的 Vite base，網頁的建置設定就不用為 App 改。
         */
        val assets = WebViewAssetLoader.AssetsPathHandler(this)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler(BASE_PATH) { path ->
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
        }

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // 外部連結交給瀏覽器，不然會困在沒有網址列的頁面裡
                val url = request.url
                if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
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
        }

        fileSaver = FileSaver(this, webView)
        webView.addJavascriptInterface(fileSaver.bridge, FileSaver.BRIDGE_NAME)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}$BASE_PATH")
        } else {
            webView.restoreState(savedInstanceState)
        }
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
     * 「.json」這種副檔名寫法會變成一個什麼檔都選不到的選擇器。
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
                // 有副檔名寫法（.json）時系統無從過濾，全部列出，交給網頁判斷內容
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
        private const val BASE_PATH = "/routina-tone/"
        private const val INDEX = "index.html"
    }
}
