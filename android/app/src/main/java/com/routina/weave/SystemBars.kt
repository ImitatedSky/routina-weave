package com.routina.weave

import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.core.view.WindowInsetsControllerCompat

/**
 * 狀態列與導覽列跟著網頁的深淺色走。主題（values / values-night）只認得系統的深淺色，
 * 使用者在 App 裡手動選了相反的顏色時，要靠網頁通知這裡。
 * 網頁端：`RoutinaWeaveSystemBars.setDark(true | false)`（src/App.tsx 的 useThemeClass）。
 */
class SystemBars(private val activity: ComponentActivity) {

    val bridge = Bridge()

    inner class Bridge {
        @JavascriptInterface
        fun setDark(dark: Boolean) {
            activity.runOnUiThread { apply(dark) }
        }
    }

    @Suppress("DEPRECATION")
    private fun apply(dark: Boolean) {
        val window = activity.window
        val color = if (dark) DARK else LIGHT
        // Android 15 以上強制 edge-to-edge，系統列底下露出的是視窗背景，兩個都要換
        window.decorView.setBackgroundColor(color)
        window.statusBarColor = color
        window.navigationBarColor = color
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    companion object {
        const val BRIDGE_NAME = "RoutinaWeaveSystemBars"
        // 與網頁的背景色一致（index.html 的 theme-color）
        private const val LIGHT = 0xFFFAF8F3.toInt()
        private const val DARK = 0xFF1F1D1B.toInt()
    }
}
