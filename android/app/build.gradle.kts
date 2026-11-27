import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.locker.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.locker.agent"
        minSdk = 28 // Android 9+
        targetSdk = 34
        versionCode = 4
        versionName = "2.2.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val ksPath = keystoreProperties.getProperty("storeFile")
                ?: System.getenv("LOCKER_KEYSTORE_PATH")
            if (!ksPath.isNullOrBlank() && rootProject.file(ksPath).exists()) {
                storeFile = rootProject.file(ksPath)
                storePassword = keystoreProperties.getProperty("storePassword")
                    ?: System.getenv("LOCKER_KEYSTORE_PASSWORD")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                    ?: System.getenv("LOCKER_KEY_ALIAS")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                    ?: System.getenv("LOCKER_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            val releaseSigning = signingConfigs.getByName("release")
            signingConfig = if (releaseSigning.storeFile != null) {
                releaseSigning
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isDebuggable = true
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    
    // WorkManager pour les tâches de fond et bail hors-ligne local (72h)
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    
    // OkHttp3 & Coroutines pour Liaison WebSocket Cloud Directe sub-50ms (100% Hors Firebase)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
