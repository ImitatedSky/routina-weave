package com.routina.weave

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 替網頁存檔。網頁端對 `RoutinaWeaveFiles` 送 `{"id":…,"base64":…,"filename":…,"mimeType":…}`
 * （bridge 的共用部分見 [WebBridge]），跳系統的「另存新檔」讓使用者選位置，
 * 回覆 `{"status":…,"message":…}`，status 是 saved / cancelled / error。
 * error 的 message 是代碼（decode / dialog / write，後面可接「:例外訊息」），
 * 由網頁換成文字。對應的網頁程式在 src/lib/saveFile.ts。
 */
class FileSaver(private val activity: ComponentActivity) {

    private class Pending(val reply: BridgeReply, val bytes: ByteArray)

    // 同時只會有一個「另存新檔」畫面，只在主執行緒讀寫
    private var pending: Pending? = null

    // 解析、解碼與寫檔都可能很久（匯出的 zip 可能很大），listener 在主執行緒，要丟到背景
    private val worker = Executors.newSingleThreadExecutor()

    private val createDocument = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val request = pending ?: return@registerForActivityResult
        pending = null
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            report(request.reply, STATUS_CANCELLED, "")
            return@registerForActivityResult
        }
        worker.execute {
            runCatching { write(uri, request.bytes) }
                .onSuccess { report(request.reply, STATUS_SAVED, "") }
                .onFailure { report(request.reply, STATUS_ERROR, detail("write", it)) }
        }
    }

    fun register(webView: WebView) {
        WebBridge.register(webView, BRIDGE_NAME) { data, proxy ->
            worker.execute { receive(data, proxy) }
        }
    }

    /** 在背景執行緒 */
    private fun receive(data: String, proxy: JavaScriptReplyProxy) {
        val json = WebBridge.parse(data) ?: return
        val reply = BridgeReply.of(proxy, json) ?: return
        val bytes = runCatching { Base64.decode(json.getString("base64"), Base64.DEFAULT) }.getOrElse {
            report(reply, STATUS_ERROR, "decode")
            return
        }
        val filename = json.optString("filename")
        val mimeType = json.optString("mimeType").ifEmpty { "application/octet-stream" }
        activity.runOnUiThread { askWhereToSave(Pending(reply, bytes), filename, mimeType) }
    }

    private fun askWhereToSave(request: Pending, filename: String, mimeType: String) {
        pending?.let { report(it.reply, STATUS_CANCELLED, "") }
        pending = request
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, filename)
        }
        runCatching { createDocument.launch(intent) }.onFailure {
            pending = null
            report(request.reply, STATUS_ERROR, "dialog")
        }
    }

    private fun write(uri: Uri, bytes: ByteArray) {
        val stream = activity.contentResolver.openOutputStream(uri) ?: error("openOutputStream returned null")
        stream.use { it.write(bytes) }
    }

    private fun detail(code: String, error: Throwable) =
        error.message?.let { "$code:$it" } ?: code

    private fun report(reply: BridgeReply, status: String, message: String) {
        reply.send(JSONObject().put("status", status).put("message", message))
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaWeaveFiles"
        private const val STATUS_SAVED = "saved"
        private const val STATUS_CANCELLED = "cancelled"
        private const val STATUS_ERROR = "error"
    }
}
