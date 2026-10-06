# @JavascriptInterface 的方法是被 WebView 以名稱反射呼叫的，
# R8 看不到呼叫端會把它們刪掉，發音功能就會在 release 版靜靜失效。
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
