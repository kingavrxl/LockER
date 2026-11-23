package com.locker.agent

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID

class LockerApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // 1. Gestionnaire global d'exceptions non interceptées pour éviter tout crash brutal
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("LockerApp", "Exception non gérée sur le thread ${thread.name}: ${throwable.message}", throwable)
        }

        Log.i("LockerApp", "Application LockER démarrée.")

        // 2. Démarrer immédiatement le service d'arrière-plan permanent
        try {
            com.locker.agent.service.LockerPersistentService.start(this)
        } catch (e: Exception) {
            Log.w("LockerApp", "LockerPersistentService start: ${e.message}")
        }

        // 3. Récupérer le token FCM officiel Google
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                val imei = resolveDeviceImei()
                if (task.isSuccessful) {
                    val token = task.result ?: ""
                    Log.i("LockerFCM", "REAL_FCM_TOKEN: $token")
                    val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                    prefs.edit().putString("fcm_token", token).apply()
                    syncWithBackend(imei, token)
                } else {
                    Log.w("LockerFCM", "Échec récupération FCM token: ${task.exception?.message}")
                    syncWithBackend(imei, "")
                }
            }
        } catch (e: Exception) {
            Log.w("LockerApp", "Firebase init error: ${e.message}")
        }
    }

    @SuppressLint("HardwareIds")
    fun resolveDeviceImei(): String {
        val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        val saved = prefs.getString("assigned_imei", null)
        if (!saved.isNullOrBlank()) {
            return saved
        }

        // 1. Tenter lecture IMEI matériel
        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val imei = tm?.imei
                if (!imei.isNullOrBlank()) {
                    prefs.edit().putString("assigned_imei", imei).apply()
                    return imei
                }
            }
        } catch (e: Exception) {
            Log.d("LockerApp", "TelephonyManager imei: ${e.message}")
        }

        // 2. Tenter numéro de série matériel
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val serial = Build.getSerial()
                if (!serial.isNullOrBlank() && serial != Build.UNKNOWN) {
                    prefs.edit().putString("assigned_imei", serial).apply()
                    return serial
                }
            }
        } catch (e: Exception) {
            Log.d("LockerApp", "Build.getSerial: ${e.message}")
        }

        // 3. Tenter Android ID
        try {
            val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            if (!androidId.isNullOrBlank()) {
                prefs.edit().putString("assigned_imei", androidId).apply()
                return androidId
            }
        } catch (e: Exception) {
            Log.d("LockerApp", "Android ID read: ${e.message}")
        }

        // 4. Identifiant unique persistant généré à la volée
        val newId = "DEV_" + UUID.randomUUID().toString().replace("-", "").take(15)
        prefs.edit().putString("assigned_imei", newId).apply()
        return newId
    }

    private fun syncWithBackend(imei: String, token: String) {
        Thread {
            val endpoint = "https://locker-2nuk.onrender.com/api/v1/devices/register"
            try {
                val client = OkHttpClient()
                val json = JSONObject().apply {
                    put("imei", imei)
                    put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                    put("fcm_token", token)
                    put("app_version", "1.0.0")
                }
                val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder().url(endpoint).post(body).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    Log.i("LockerApp", "Enregistrement automatique réussi sur Cloud Render (HTTP ${response.code})")
                }
            } catch (e: Exception) {
                Log.d("LockerApp", "Sync Cloud exception: ${e.message}")
            }
        }.start()
    }
}
