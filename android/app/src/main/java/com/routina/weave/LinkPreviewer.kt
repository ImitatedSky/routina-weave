package com.routina.weave

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.text.Html
import android.util.Base64
import android.webkit.WebView
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.IDN
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URL
import java.nio.charset.Charset
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * 替網頁抓網址預覽（標題、說明、網站名稱、縮圖）。網頁直接 fetch 別的網站會被 CORS 擋，
 * 原生端沒有這個限制。
 *
 * 網頁端對 `RoutinaWeaveLinks` 送 `{"id":…,"url":…}`（bridge 的共用部分見 [WebBridge]），回覆：
 * 成功 `{"ok":true,"title":…,"description":…,"site":…,"image":<JPEG base64>}`（欄位可能缺），
 * 失敗 `{"ok":false,"error":<代碼或例外訊息>}`。對應的網頁程式在 src/lib/linkPreview.ts。
 *
 * bridge 只注入 App 自己的 origin，所以只有我們的網頁叫得到這裡；
 * 即使如此，仍然只允許 http/https，並拒絕連到本機與私有網段，免得被拿來掃內網。
 * http 網址也抓，所以 network_security_config 的預設允許明文。
 */
class LinkPreviewer {

    private class Download(val url: URL, val contentType: String, val bytes: ByteArray)

    private class PreviewException(code: String) : IOException(code)

    // 抓網頁要好幾秒，listener 在主執行緒，要丟到背景。固定兩條，一次貼很多網址也不會開一堆執行緒
    private val executor = Executors.newFixedThreadPool(2)

    fun register(webView: WebView) {
        WebBridge.register(webView, BRIDGE_NAME) { data, proxy ->
            val json = WebBridge.parse(data) ?: return@register
            val reply = BridgeReply.of(proxy, json) ?: return@register
            val url = json.optString("url")
            executor.execute {
                val result = runCatching { preview(url) }.getOrElse {
                    JSONObject().put("ok", false).put("error", it.message ?: it.javaClass.simpleName)
                }
                reply.send(result)
            }
        }
    }

    private fun preview(url: String): JSONObject {
        val page = download(url, MAX_HTML_BYTES, ACCEPT_HTML, truncate = true)
        if (page.contentType.isNotEmpty() && !page.contentType.contains("html", ignoreCase = true)) {
            throw PreviewException("not-html")
        }
        val html = String(page.bytes, charsetOf(page))
        val meta = metaTags(html)

        val json = JSONObject().put("ok", true)
        json.putOpt("title", meta["og:title"] ?: meta["twitter:title"] ?: titleTag(html))
        json.putOpt("description", meta["og:description"] ?: meta["twitter:description"] ?: meta["description"])
        json.putOpt("site", meta["og:site_name"])

        val image = meta["og:image"] ?: meta["og:image:url"] ?: meta["og:image:secure_url"]
            ?: meta["twitter:image"] ?: meta["twitter:image:src"]
        if (image != null) {
            val imageUrl = runCatching { URL(page.url, image) }.getOrNull()
            // 原圖網址寫進筆記，其他軟體（Obsidian 的 cardlink）才看得到圖
            json.putOpt("imageUrl", imageUrl?.toString())
            // 縮圖抓不到不影響標題與說明
            json.putOpt("image", imageUrl?.let { runCatching { thumbnail(it) }.getOrNull() })
        }
        return json
    }

    /** 自己處理轉址，每一跳都重新檢查 scheme 與主機，不然一個 302 就能繞過檢查 */
    private fun download(start: String, limit: Int, accept: String, truncate: Boolean): Download {
        var url = URL(start)
        for (hop in 0..MAX_REDIRECTS) {
            checkAllowed(url)
            val connection = url.openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = TIMEOUT_MS
                connection.readTimeout = TIMEOUT_MS
                connection.setRequestProperty("User-Agent", USER_AGENT)
                connection.setRequestProperty("Accept", accept)
                connection.setRequestProperty("Accept-Language", ACCEPT_LANGUAGE)

                val code = connection.responseCode
                if (code in 300..399) {
                    val location = connection.getHeaderField("Location") ?: throw PreviewException("redirect")
                    url = URL(url, location)
                    continue
                }
                if (code !in 200..299) throw PreviewException("http:$code")
                if (!truncate && connection.contentLengthLong > limit) throw PreviewException("too-large")

                val bytes = connection.inputStream.use { readAtMost(it, limit, truncate) }
                return Download(url, connection.contentType ?: "", bytes)
            } finally {
                connection.disconnect()
            }
        }
        throw PreviewException("redirects")
    }

    /**
     * 先解析一次 DNS 檢查位址。HttpURLConnection 連線時會再解析一次，理論上
     * DNS rebinding 能在兩次之間換位址；但這裡只回傳標題與縮圖、不回傳原始內容，可以接受。
     */
    private fun checkAllowed(url: URL) {
        if (url.protocol != "http" && url.protocol != "https") throw PreviewException("scheme")
        val host = url.host
        if (host.isNullOrEmpty()) throw PreviewException("host")
        val asciiHost = if (host.all { it.code < 128 }) host else IDN.toASCII(host)
        if (InetAddress.getAllByName(asciiHost).any { isPrivate(it) }) throw PreviewException("blocked")
    }

    private fun isPrivate(address: InetAddress): Boolean {
        if (address.isLoopbackAddress || address.isAnyLocalAddress || address.isLinkLocalAddress ||
            address.isSiteLocalAddress || address.isMulticastAddress
        ) return true
        val first = address.address[0].toInt() and 0xff
        return when (address) {
            // 0.0.0.0/8 在 Linux 上會連到本機
            is Inet4Address -> first == 0
            // fc00::/7 唯一本地位址（IPv6 的私有網段）
            is Inet6Address -> (first and 0xfe) == 0xfc
            else -> false
        }
    }

    private fun readAtMost(input: InputStream, limit: Int, truncate: Boolean): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
            if (out.size() > limit) {
                if (!truncate) throw PreviewException("too-large")
                break
            }
        }
        val bytes = out.toByteArray()
        return if (bytes.size > limit) bytes.copyOf(limit) else bytes
    }

    /** Content-Type 的 charset，其次 <meta charset>，都沒有就當 UTF-8 */
    private fun charsetOf(page: Download): Charset {
        val head = String(page.bytes, 0, minOf(page.bytes.size, 4096), Charsets.ISO_8859_1)
        val name = CHARSET_PARAM.find(page.contentType)?.groupValues?.get(1)
            ?: META_CHARSET.find(head)?.groupValues?.get(1)
        return name?.let { runCatching { Charset.forName(it.trim('"', '\'', ' ')) }.getOrNull() }
            ?: Charsets.UTF_8
    }

    /** property 或 name → content，同一個鍵以第一個出現的為準 */
    private fun metaTags(html: String): Map<String, String> {
        val out = HashMap<String, String>()
        for (tag in META_TAG.findAll(html)) {
            val attributes = HashMap<String, String>()
            for (m in ATTRIBUTE.findAll(tag.value)) {
                val value = m.groupValues[2].ifEmpty { m.groupValues[3] }.ifEmpty { m.groupValues[4] }
                attributes[m.groupValues[1].lowercase()] = value
            }
            val key = (attributes["property"] ?: attributes["name"] ?: continue).lowercase()
            val content = decodeEntities(attributes["content"] ?: continue)
            if (content.isNotEmpty()) out.putIfAbsent(key, content)
        }
        return out
    }

    private fun titleTag(html: String): String? =
        TITLE_TAG.find(html)?.groupValues?.get(1)?.let { decodeEntities(it) }?.ifEmpty { null }

    // Html.fromHtml 認得所有具名與數字 entity，順便把連續空白收成一個
    private fun decodeEntities(text: String): String =
        Html.fromHtml(text, Html.FROM_HTML_MODE_LEGACY).toString().trim()

    /** 先只讀尺寸算出 inSampleSize，大圖才不會整張解碼吃光記憶體 */
    private fun thumbnail(url: URL): String? {
        val bytes = download(url.toString(), MAX_IMAGE_BYTES, ACCEPT_IMAGE, truncate = false).bytes
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= THUMBNAIL_SIZE) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null

        val scale = minOf(1f, THUMBNAIL_SIZE.toFloat() / maxOf(decoded.width, decoded.height))
        val width = maxOf(1, (decoded.width * scale).roundToInt())
        val height = maxOf(1, (decoded.height * scale).roundToInt())
        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(output).apply {
            // JPEG 沒有透明度，透明的 PNG 不先鋪白底會變黑
            drawColor(Color.WHITE)
            drawBitmap(decoded, null, Rect(0, 0, width, height), Paint(Paint.FILTER_BITMAP_FLAG))
        }
        decoded.recycle()

        val buffer = ByteArrayOutputStream()
        output.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, buffer)
        output.recycle()
        return Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP)
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaWeaveLinks"

        private const val TIMEOUT_MS = 8_000
        private const val MAX_REDIRECTS = 5
        private const val MAX_HTML_BYTES = 512 * 1024
        private const val MAX_IMAGE_BYTES = 5 * 1024 * 1024
        private const val THUMBNAIL_SIZE = 480
        private const val JPEG_QUALITY = 80

        // 有些網站只給看起來像瀏覽器的請求完整的 <head>
        private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 8) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        private const val ACCEPT_LANGUAGE = "zh-TW,zh;q=0.9,en;q=0.8"
        private const val ACCEPT_HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
        private const val ACCEPT_IMAGE = "image/*,*/*;q=0.8"

        private val CHARSET_PARAM = Regex("charset=([^;\\s]+)", RegexOption.IGNORE_CASE)
        private val META_CHARSET = Regex("<meta[^>]+charset\\s*=\\s*[\"']?([\\w-]+)", RegexOption.IGNORE_CASE)
        private val META_TAG = Regex("<meta\\b[^>]*>", RegexOption.IGNORE_CASE)
        private val ATTRIBUTE = Regex("([\\w:-]+)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))")
        private val TITLE_TAG = Regex("<title[^>]*>([\\s\\S]*?)</title>", RegexOption.IGNORE_CASE)
    }
}
