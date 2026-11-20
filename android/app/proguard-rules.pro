# LockER MDM ProGuard Rules
-keep class com.locker.agent.receiver.LockerDeviceAdminReceiver { *; }
-keep class com.locker.agent.service.LockerFirebaseMessagingService { *; }
-keep class com.locker.agent.ui.LockScreenActivity { *; }
-keep class com.locker.agent.worker.OfflineLeaseWorker { *; }

# Firebase & Play Services
-keep class com.google.firebase.** { *; }

# Gson & Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class retrofit2.** { *; }
