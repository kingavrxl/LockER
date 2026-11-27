package com.locker.agent

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import com.locker.agent.service.LockerPersistentService
import com.locker.agent.util.NetworkConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID

class LockerApp : Application() {

    companion object {
        private const val TAG = "LockerApp"
        const val APP_VERSION = "2.1.0"

        @SuppressLint("HardwareIds")
        fun resolveDeviceImei(context: Context): String {
            val appCtx = context.applicationContext
            val prefs = appCtx.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)

            // 1. Tenter lecture IMEI matériel (accessible au Device Owner même sous Android 10+)
            try {
                val tm = appCtx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    var imei = tm?.imei
                    if (imei.isNullOrBlank()) {
                        imei = tm?.getImei(0)
                    }
                    if (!imei.isNullOrBlank()) {
                        prefs.edit().putString("assigned_imei", imei).apply()
                        return imei
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "TelephonyManager imei: ${e.message}")
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
                Log.d(TAG, "Build.getSerial: ${e.message}")
            }

            // 3. Utiliser la valeur assignée par le serveur si disponible
            val saved = prefs.getString("assigned_imei", null)
            if (!saved.isNullOrBlank()) {
                return saved
            }

            // 4. Repli vers Android ID (sans le figer définitivement avant Device Owner)
            try {
                val androidId = Settings.Secure.getString(appCtx.contentResolver, Settings.Secure.ANDROID_ID)
                if (!androidId.isNullOrBlank()) {
                    return androidId
                }
            } catch (e: Exception) {
                Log.d(TAG, "Android ID read: ${e.message}")
            }

            val newId = "DEV_" + UUID.randomUUID().toString().replace("-", "").take(15)
            prefs.edit().putString("assigned_imei", newId).apply()
            return newId
        }

        @SuppressLint("HardwareIds")
        fun syncWithCloudNow(context: Context) {
            val appCtx = context.applicationContext
            Thread {
                try {
                    val imei = resolveDeviceImei(appCtx)
                    val prefs = appCtx.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                    val existingToken = prefs.getString("device_auth_token", "") ?: ""
                    val androidId = Settings.Secure.getString(appCtx.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
                    val serialDetected = try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val s = Build.getSerial()
                            if (!s.isNullOrBlank() && s != Build.UNKNOWN) s else androidId
                        } else {
                            androidId
                        }
                    } catch (e: Exception) {
                        androidId
                    }

                    val endpoint = NetworkConfig.getRegisterUrl(appCtx)
                    val client = OkHttpClient()

                    val json = JSONObject().apply {
                        put("imei", imei)
                        put("android_id", androidId)
                        put("serial_number", serialDetected)
                        put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                        put("device_token", existingToken)
                        put("app_version", APP_VERSION)
                    }
                    val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                    val request = Request.Builder().url(endpoint).post(body).build()
                    val response = client.newCall(request).execute()

                    if (response.isSuccessful) {
                        val respStr = response.body?.string() ?: ""
                        if (respStr.isNotBlank()) {
                            val respObj = JSONObject(respStr)
                            val returnedImei = respObj.optString("imei", "")
                            val returnedToken = respObj.optString("auth_token", "")
                            val editor = prefs.edit()
                            if (returnedImei.isNotBlank()) {
                                editor.putString("assigned_imei", returnedImei)
                            }
                            if (returnedToken.isNotBlank()) {
                                editor.putString("device_auth_token", returnedToken)
                            }
                            editor.apply()
                            Log.i(TAG, "Synchronisation Cloud réussie (IMEI=$returnedImei).")
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Sync Cloud exception: ${e.message}")
                }
            }.start()
        }
    }

    override fun onCreate() {
        super.onCreate()

        // 1. Gestionnaire global d'exceptions non interceptées
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Exception non gérée sur ${thread.name}: ${throwable.message}", throwable)
        }

        Log.i(TAG, "Application LockER démarrée (Mode Cloud Native - 100% Hors Firebase).")

        // 2. Démarrer immédiatement le service de liaison Cloud permanente
        try {
            LockerPersistentService.start(this)
        } catch (e: Exception) {
            Log.w(TAG, "LockerPersistentService start: ${e.message}")
        }

        // 3. Enregistrement initial auprès du Cloud
        syncWithCloudNow(this)
    }

    fun resolveDeviceImei(): String = resolveDeviceImei(this)
}
