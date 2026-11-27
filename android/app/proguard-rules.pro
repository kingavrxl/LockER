# LockER MDM ProGuard / R8 Rules
-keep class com.locker.agent.** { *; }
-keepclassmembers class com.locker.agent.** { *; }

-keepattributes Signature
-keepattributes *Annotation*

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
