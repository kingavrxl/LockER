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

class LockerApp : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.i("LockerApp", "Application LockER démarrée.")

        // Lancer immédiatement le service d'arrière-plan permanent
        try {
            com.locker.agent.service.LockerPersistentService.start(this)
        } catch (e: Exception) {
            Log.w("LockerApp", "LockerPersistentService start: ${e.message}")
        }

        // Récupérer le token FCM officiel Google
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val imei = resolveDeviceImei()
            if (task.isSuccessful) {
                val token = task.result
                Log.i("LockerFCM", "REAL_FCM_TOKEN: $token")
                val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("fcm_token", token).apply()
                syncWithBackend(imei, token)
            } else {
                Log.w("LockerFCM", "Échec récupération FCM token: ${task.exception?.message}")
                syncWithBackend(imei, "")
            }
        }
    }

    @SuppressLint("HardwareIds")
    private fun resolveDeviceImei(): String {
        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val imei = tm?.imei
                if (!imei.isNullOrBlank()) {
                    Log.i("LockerApp", "IMEI matériel détecté: $imei")
                    return imei
                }
            }
        } catch (e: Exception) {
            Log.w("LockerApp", "TelephonyManager imei: ${e.message}")
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val serial = Build.getSerial()
                if (!serial.isNullOrBlank() && serial != Build.UNKNOWN) {
                    return serial
                }
            }
        } catch (e: Exception) {
            Log.w("LockerApp", "Build.getSerial: ${e.message}")
        }

        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return if (!androidId.isNullOrBlank()) androidId else "352965710157155"
    }

    private fun syncWithBackend(imei: String, token: String) {
        Thread {
            val endpoints = listOf(
                "https://locker-2nuk.onrender.com/api/v1/devices/register",
                "http://192.168.100.30:8000/api/v1/devices/register",
                "http://10.0.2.2:8000/api/v1/devices/register"
            )

            val client = OkHttpClient()
            val json = JSONObject().apply {
                put("imei", imei)
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                put("fcm_token", token)
                put("app_version", "1.0.0")
            }
            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

            for (url in endpoints) {
                try {
                    val request = Request.Builder().url(url).post(body).build()
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        Log.i("LockerApp", "Enregistrement automatique réussi sur $url (HTTP ${response.code})")
                        break
                    }
                } catch (e: Exception) {
                    Log.d("LockerApp", "Tentative sur $url: ${e.message}")
                }
            }
        }.start()
    }
}
