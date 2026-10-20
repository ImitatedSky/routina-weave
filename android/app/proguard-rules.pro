# bridge 用 WebViewCompat.addWebMessageListener（一般的 Kotlin lambda），沒有反射呼叫，不用 keep。
# androidx.webkit 與 play-services-auth 都自帶 consumer 規則，不用另外寫。

# release 版移除 v/d/i 等級的 log，免得日後不小心把 token 之類的資料寫進 logcat
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
