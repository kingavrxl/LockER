package com.locker.agent.service

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.locker.agent.manager.LockerPolicyManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class LockerFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "LockerFCM"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "Nouveau token FCM généré : $token")
        
        // Sauvegarder localement
        val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
        
        // Synchroniser avec l'API Backend (/api/v1/devices/register)
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "352965710157155"
        Thread {
            try {
                val client = OkHttpClient()
                val json = JSONObject().apply {
                    put("imei", androidId)
                    put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                    put("fcm_token", token)
                    put("app_version", "1.0.0")
                }
                val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder()
                    .url("https://locker-2nuk.onrender.com/api/v1/devices/register")
                    .post(body)
                    .build()
                client.newCall(request).execute()
            } catch (e: Exception) {
                Log.w(TAG, "Erreur sync onNewToken: ${e.message}")
            }
        }.start()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "Message FCM reçu en tâche de fond : ${remoteMessage.data}")

        val data = remoteMessage.data
        val action = data["action"] ?: return
        val policyManager = LockerPolicyManager(applicationContext)

        when (action) {
            "LOCK" -> {
                val reason = data["reason"] ?: "Paiement en retard de plus de 3 jours"
                val supportPhone = data["support_phone"] ?: "+2290191521518"
                policyManager.lockDevice(reason, supportPhone)
            }
            "UNLOCK" -> {
                policyManager.unlockDevice()
            }
            "RENEW_LEASE" -> {
                val leaseExpiry = data["lease_expires_at"] ?: return
                val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                prefs.edit().putString("lease_expires_at", leaseExpiry).apply()
                Log.i(TAG, "Bail local renouvelé jusqu'au: $leaseExpiry")
            }
            else -> {
                Log.w(TAG, "Action inconnue reçue : $action")
            }
        }
    }
}
