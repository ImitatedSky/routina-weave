import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// ---- Release 簽章的來源 ----
// 與 Routina 家族其他成員同一把 keystore：優先讀 android/keystore.properties
// （已被 .gitignore 排除），其次讀環境變數（CI）。四者不齊全就沿用 debug 簽章，
// 讓本機照樣 build 得起來。
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

fun releaseSigningValue(propKey: String, envKey: String): String? =
    keystoreProperties.getProperty(propKey) ?: System.getenv(envKey)

val releaseStoreFile = releaseSigningValue("storeFile", "KEYSTORE_FILE")
val releaseStorePassword = releaseSigningValue("storePassword", "KEYSTORE_PASSWORD")
val releaseKeyAlias = releaseSigningValue("keyAlias", "KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("keyPassword", "KEY_PASSWORD")
val hasReleaseSigning = !releaseStoreFile.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()

// ---- 網頁內容 ----
// Vite 的產出在 repo 根目錄的 dist/，複製進產生目錄而不是 src/main/assets，
// 建置產物才不會混進原始碼樹。
val webDist = rootProject.layout.projectDirectory.dir("../dist")
val webAssetsDir = File(layout.buildDirectory.get().asFile, "generated/webAssets")

val copyWebAssets by tasks.registering(Sync::class) {
    // 用 Sync 而不是 Copy：上一次 build 留下的舊 hash 檔要清掉
    description = "把 Vite build 的產出複製進 APK 的 assets"
    from(webDist)
    into(webAssetsDir)
    doFirst {
        if (!webDist.asFile.exists() || webDist.asFile.listFiles().isNullOrEmpty()) {
            error("找不到網頁產出 ${webDist.asFile.absolutePath}，請先在 repo 根目錄執行：npm ci && npm run build")
        }
    }
}

android {
    namespace = "com.routina.tone"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.routina.tone"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 15
        versionName = "0.12.1"
    }

    sourceSets["main"].assets.srcDir(webAssetsDir)

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/*.version",
                "/META-INF/*.kotlin_module"
            )
        }
    }
}

// 每次打包前都重新複製，網頁改了卻忘記重建 APK 的情況就不會發生
tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    // 只有一個 WebView，不需要 Compose
    implementation(libs.androidx.activity)
    implementation(libs.androidx.webkit)
}
