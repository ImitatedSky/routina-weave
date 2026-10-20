package com.routina.weave

import android.app.Activity
import android.app.PendingIntent
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 替網頁拿 Google 雲端硬碟的 access token。Google 不允許在 WebView 裡登入
 * （disallowed_useragent），所以用 Play services 的 Authorization API。
 * 不需要在程式裡填用戶端 ID：Google 用 package 名稱加簽章 SHA-1 對應到 Cloud 專案裡的
 * Android 用戶端（見 docs/google-setup.md）。
 *
 * 網頁端對 `RoutinaWeaveAuth` 送 `{"id":…,"method":"getToken","interactive":…,"forceRefresh":…}`
 * 或 `{"id":…,"method":"signOut"}`（bridge 的共用部分見 [WebBridge]）。
 * 回覆：成功 `{"ok":true,"token":…}`（signOut 沒有 token），失敗 `{"ok":false,"error":<代碼>}`。代碼：needs-interaction（要使用者按連線）、cancelled、denied、
 * unavailable（沒有 Play services）、config（package 或 SHA-1 跟 Cloud 設定對不上）、network、
 * failed:<狀態碼>。對應的網頁程式在 src/sync/authAndroid.ts。
 *
 * token 只回覆給發出請求的那個 frame，不寫進 Logcat、檔案或 SharedPreferences；快取由 Play services 負責。
 */
class GoogleAuth(private val activity: ComponentActivity) {

    private val client = Identity.getAuthorizationClient(activity)
    private val request = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build()

    // 停在同意畫面的那個請求。同時只會有一個，只在主執行緒讀寫
    private var pending: BridgeReply? = null

    private val consent = activity.registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        val reply = pending ?: return@registerForActivityResult
        pending = null
        if (result.resultCode != Activity.RESULT_OK) {
            reply.send(failure("cancelled"))
            return@registerForActivityResult
        }
        val auth = try {
            client.getAuthorizationResultFromIntent(result.data)
        } catch (e: ApiException) {
            reply.send(failure(errorCode(e)))
            return@registerForActivityResult
        }
        reply.send(tokenResult(auth))
    }

    /** 呼叫前要先確認 [WebBridge.isSupported]。不支援時不能退回 addJavascriptInterface：token 不能讓每個 frame 都叫得到 */
    fun register(webView: WebView) {
        // 在主執行緒執行
        WebBridge.register(webView, BRIDGE_NAME) { data, proxy ->
            val json = WebBridge.parse(data) ?: return@register
            val reply = BridgeReply.of(proxy, json) ?: return@register
            when (json.optString("method")) {
                "getToken" -> {
                    val interactive = json.optBoolean("interactive")
                    if (json.optBoolean("forceRefresh")) clearCachedToken { authorize(reply, interactive) }
                    else authorize(reply, interactive)
                }
                "signOut" -> revoke(reply)
                else -> reply.send(failure("failed:method"))
            }
        }
    }

    private fun authorize(reply: BridgeReply, interactive: Boolean) {
        client.authorize(request)
            .addOnSuccessListener { result ->
                val pendingIntent = result.pendingIntent
                when {
                    !result.hasResolution() -> reply.send(tokenResult(result))
                    !interactive || pendingIntent == null -> reply.send(failure("needs-interaction"))
                    else -> askConsent(reply, pendingIntent)
                }
            }
            .addOnFailureListener { reply.send(failure(errorCode(it))) }
    }

    private fun askConsent(reply: BridgeReply, pendingIntent: PendingIntent) {
        pending?.send(failure("cancelled"))
        pending = reply
        runCatching {
            consent.launch(IntentSenderRequest.Builder(pendingIntent.intentSender).build())
        }.onFailure {
            pending = null
            reply.send(failure("failed"))
        }
    }

    /**
     * Drive 回 401：Play services 快取的 token 已被伺服器拒絕（例如使用者在 Google 帳戶撤銷了權限），
     * 不清掉的話 authorize 會一直給同一個。先非互動地拿到目前快取的那個，再把它清掉。
     */
    private fun clearCachedToken(then: () -> Unit) {
        client.authorize(request)
            .addOnSuccessListener { result ->
                val token = result.accessToken
                if (result.hasResolution() || token == null) {
                    then()
                } else {
                    client.clearToken(ClearTokenRequest.builder().setToken(token).build())
                        .addOnCompleteListener { then() }
                }
            }
            .addOnFailureListener { then() }
    }

    /**
     * 中斷連線：撤銷這個 App 的雲端硬碟授權，並清掉 Play services 的 token 快取。
     *
     * 不用 AuthorizationClient.revokeAccess：它要指定帳號，只做授權（沒有登入）時唯一拿得到帳號的
     * AuthorizationResult.toGoogleSignInAccount() 已經 deprecated。改呼叫 Google OAuth 的標準撤銷端點，
     * 撤銷 access token 會把同一個授權一起撤銷。
     */
    private fun revoke(reply: BridgeReply) {
        client.authorize(request)
            .addOnSuccessListener { result ->
                val token = result.accessToken
                // 本來就沒有授權，沒有東西要撤銷
                if (result.hasResolution() || token == null) {
                    reply.send(JSONObject().put("ok", true))
                    return@addOnSuccessListener
                }
                Thread {
                    val revoked = revokeOverHttp(token)
                    activity.runOnUiThread { clearAndReport(reply, token, revoked) }
                }.start()
            }
            .addOnFailureListener { reply.send(failure(errorCode(it))) }
    }

    private fun clearAndReport(reply: BridgeReply, token: String, revoked: Boolean) {
        client.clearToken(ClearTokenRequest.builder().setToken(token).build()).addOnCompleteListener {
            reply.send(if (revoked) JSONObject().put("ok", true) else failure("failed:revoke"))
        }
    }

    /** 在背景執行緒呼叫。token 放在 POST 內容裡，不放網址 */
    private fun revokeOverHttp(token: String): Boolean = runCatching {
        val connection = URL(REVOKE_URL).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            connection.outputStream.use { it.write("token=${URLEncoder.encode(token, "UTF-8")}".toByteArray()) }
            connection.responseCode in 200..299
        } finally {
            connection.disconnect()
        }
    }.getOrDefault(false)

    private fun tokenResult(result: AuthorizationResult): JSONObject {
        val token = result.accessToken ?: return failure("failed:no-token")
        // 同意畫面上沒勾雲端硬碟權限
        if (DRIVE_FILE !in result.grantedScopes) return failure("denied")
        return JSONObject().put("ok", true).put("token", token)
    }

    private fun failure(code: String) = JSONObject().put("ok", false).put("error", code)

    private fun errorCode(error: Exception): String {
        val status = (error as? ApiException)?.statusCode ?: return "failed"
        return when (status) {
            CommonStatusCodes.CANCELED -> "cancelled"
            CommonStatusCodes.NETWORK_ERROR -> "network"
            CommonStatusCodes.DEVELOPER_ERROR -> "config"
            CommonStatusCodes.SIGN_IN_REQUIRED -> "needs-interaction"
            // 手機沒有 Play services、版本太舊或被停用
            ConnectionResult.SERVICE_MISSING,
            ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED,
            ConnectionResult.SERVICE_DISABLED,
            ConnectionResult.SERVICE_INVALID,
            CommonStatusCodes.API_NOT_CONNECTED -> "unavailable"
            else -> "failed:$status"
        }
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaWeaveAuth"

        private const val DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"
        private val SCOPES = listOf(Scope(DRIVE_FILE))
        private const val REVOKE_URL = "https://oauth2.googleapis.com/revoke"
        private const val TIMEOUT_MS = 10_000
    }
}
