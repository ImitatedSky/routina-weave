package com.routina.tone

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/**
 * 替網頁存檔。網頁端呼叫 `RoutinaToneFiles.saveFile(...)`，結果非同步回呼
 * `window.__toneSaveResult(id, status, message)`，status 是 saved / cancelled / error。
 * message 是和語言無關的代碼（saved：gallery / document；error：decode / gallery / dialog / write，
 * 後面可接「:例外訊息」），由網頁依介面語言換成文字。對應的網頁程式在 src/lib/saveFile.ts。
 *
 * - 照片（kind = "image"）在 Android 10 以上直接寫進相簿的 Pictures/Routina Tone，
 *   App 自己新增的媒體檔不需要任何權限。
 * - 其他檔案，以及 Android 8–9 的照片，跳系統的「另存新檔」讓使用者選位置。
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
                .onSuccess { report(request.id, STATUS_SAVED, "document") }
                .onFailure { report(request.id, STATUS_ERROR, detail("write", it)) }
        }.start()
    }

    val bridge = Bridge()

    inner class Bridge {
        // 在 WebView 的 bridge 執行緒上跑，不是主執行緒，所以可以直接做 I/O
        @JavascriptInterface
        fun saveFile(id: String, base64: String, filename: String, mimeType: String, kind: String) {
            val bytes = runCatching { Base64.decode(base64, Base64.DEFAULT) }.getOrElse {
                report(id, STATUS_ERROR, "decode")
                return
            }
            if (kind == KIND_IMAGE && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                runCatching { saveToGallery(bytes, filename, mimeType) }
                    .onSuccess { report(id, STATUS_SAVED, "gallery") }
                    .onFailure { report(id, STATUS_ERROR, detail("gallery", it)) }
            } else {
                activity.runOnUiThread { askWhereToSave(Pending(id, bytes), filename, mimeType) }
            }
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

    private fun saveToGallery(bytes: ByteArray, filename: String, mimeType: String) {
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, filename)
            put(MediaStore.Images.Media.MIME_TYPE, mimeType)
            put(MediaStore.Images.Media.RELATIVE_PATH, GALLERY_DIR)
            // 寫完之前先藏起來，相簿不會看到寫到一半的檔案
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: error("insert returned null")
        try {
            write(uri, bytes)
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
    }

    private fun write(uri: Uri, bytes: ByteArray) {
        val stream = activity.contentResolver.openOutputStream(uri) ?: error("openOutputStream returned null")
        stream.use { it.write(bytes) }
    }

    private fun detail(code: String, error: Throwable) =
        error.message?.let { "$code:$it" } ?: code

    private fun report(id: String, status: String, message: String) {
        val js = "window.__toneSaveResult && window.__toneSaveResult(" +
            "${JSONObject.quote(id)}, ${JSONObject.quote(status)}, ${JSONObject.quote(message)})"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaToneFiles"
        private const val KIND_IMAGE = "image"
        private const val STATUS_SAVED = "saved"
        private const val STATUS_CANCELLED = "cancelled"
        private const val STATUS_ERROR = "error"
        private val GALLERY_DIR = "${Environment.DIRECTORY_PICTURES}/Routina Tone"
    }
}
