package com.routina.weave

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * 網頁與原生之間的 bridge 共用的部分，以及「哪些網址算 App 自己的頁面」。
 *
 * 用 WebViewCompat.addWebMessageListener 而不是 addJavascriptInterface：後者會注入每個 frame、
 * 之後載入的每個頁面，App 端也分不出是誰在呼叫。這裡只對 App 自己的 origin 注入，
 * 收到訊息時再確認是主框架，回覆也只送回發出請求的那個 frame。
 *
 * 訊息都是 JSON 字串：網頁送 `{"id":…, …}`，回覆帶回同一個 id。
 * 對應的網頁程式在 src/lib/nativeBridge.ts。
 */
object WebBridge {
    const val APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
    const val APP_ORIGIN = "https://$APP_HOST"
    const val APP_PATH = "/routina-weave/"

    private val ALLOWED_ORIGINS = setOf(APP_ORIGIN)

    fun isAppOrigin(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == APP_HOST && (uri.port == -1 || uri.port == 443)

    /** App 打包的頁面。WebView 裡只能打開這些網址 */
    fun isAppPage(uri: Uri): Boolean = isAppOrigin(uri) && (uri.path ?: "").startsWith(APP_PATH)

    /** WebView 82 以上才有。不支援時一個 bridge 都不註冊，網頁端會退回沒有原生功能的做法 */
    fun isSupported(): Boolean = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)

    /**
     * 註冊一個 bridge，要在 loadUrl / restoreState 之前呼叫。
     * onMessage 在主執行緒執行，拿到的是原始字串：大的內容可以交給背景執行緒再解析。
     */
    fun register(webView: WebView, name: String, onMessage: (data: String, reply: JavaScriptReplyProxy) -> Unit) {
        WebViewCompat.addWebMessageListener(webView, name, ALLOWED_ORIGINS) { _, message, sourceOrigin, isMainFrame, reply ->
            // allowedOrigins 已經擋掉別的 origin，這裡再擋同 origin 的子框架
            if (!isMainFrame || !isAppOrigin(sourceOrigin)) return@addWebMessageListener
            if (message.type != WebMessageCompat.TYPE_STRING) return@addWebMessageListener
            val data = message.data ?: return@addWebMessageListener
            onMessage(data, reply)
        }
    }

    fun parse(data: String): JSONObject? = runCatching { JSONObject(data) }.getOrNull()
}

/** 回覆給發出請求的那個 frame。哪個執行緒呼叫都可以，會切回主執行緒送出 */
class BridgeReply(private val proxy: JavaScriptReplyProxy, private val id: String) {

    fun send(result: JSONObject) {
        val text = result.put("id", id).toString()
        if (Looper.myLooper() == Looper.getMainLooper()) proxy.postMessage(text)
        else mainHandler.post { proxy.postMessage(text) }
    }

    companion object {
        private val mainHandler = Handler(Looper.getMainLooper())

        /** 需要回覆的請求一定要有 id，沒有就當作壞掉的訊息 */
        fun of(proxy: JavaScriptReplyProxy, json: JSONObject): BridgeReply? =
            json.optString("id").takeIf { it.isNotEmpty() }?.let { BridgeReply(proxy, it) }
    }
}
