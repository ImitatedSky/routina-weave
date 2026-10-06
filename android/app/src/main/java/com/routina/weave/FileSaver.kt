package com.routina.weave

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/**
 * 替網頁存檔。網頁端呼叫 `RoutinaWeaveFiles.saveFile(id, base64, filename, mimeType)`，
 * 跳系統的「另存新檔」讓使用者選位置，結果非同步回呼
 * `window.__weaveSaveResult(id, status, message)`，status 是 saved / cancelled / error。
 * error 的 message 是代碼（decode / dialog / write，後面可接「:例外訊息」），
 * 由網頁換成文字。對應的網頁程式在 src/lib/saveFile.ts。
 */
class FileSaver(private val activity: ComponentActivity, private val webView: WebView) {

    private class Pending(val id: String, val bytes: ByteArray)

    // 同時只會有一個「另存新檔」畫面，只在主執行緒讀寫
    private var pending: Pending? = null

    private val createDocument = activity.registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val request = pending ?: return@registerForActivityResult
        pending = null
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            report(request.id, STATUS_CANCELLED, "")
            return@registerForActivityResult
        }
        Thread {
            runCatching { write(uri, request.bytes) }
                .onSuccess { report(request.id, STATUS_SAVED, "") }
                .onFailure { report(request.id, STATUS_ERROR, detail("write", it)) }
        }.start()
    }

    val bridge = Bridge()

    inner class Bridge {
        // 在 WebView 的 bridge 執行緒上跑，不是主執行緒，解碼大檔不會卡畫面
        @JavascriptInterface
        fun saveFile(id: String, base64: String, filename: String, mimeType: String) {
            val bytes = runCatching { Base64.decode(base64, Base64.DEFAULT) }.getOrElse {
                report(id, STATUS_ERROR, "decode")
                return
            }
            activity.runOnUiThread { askWhereToSave(Pending(id, bytes), filename, mimeType) }
        }
    }

    private fun askWhereToSave(request: Pending, filename: String, mimeType: String) {
        pending?.let { report(it.id, STATUS_CANCELLED, "") }
        pending = request
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, filename)
        }
        runCatching { createDocument.launch(intent) }.onFailure {
            pending = null
            report(request.id, STATUS_ERROR, "dialog")
        }
    }

    private fun write(uri: Uri, bytes: ByteArray) {
        val stream = activity.contentResolver.openOutputStream(uri) ?: error("openOutputStream returned null")
        stream.use { it.write(bytes) }
    }

    private fun detail(code: String, error: Throwable) =
        error.message?.let { "$code:$it" } ?: code

    private fun report(id: String, status: String, message: String) {
        val js = "window.__weaveSaveResult && window.__weaveSaveResult(" +
            "${JSONObject.quote(id)}, ${JSONObject.quote(status)}, ${JSONObject.quote(message)})"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaWeaveFiles"
        private const val STATUS_SAVED = "saved"
        private const val STATUS_CANCELLED = "cancelled"
        private const val STATUS_ERROR = "error"
    }
}
