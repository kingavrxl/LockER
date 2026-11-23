package com.locker.agent.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.ui.LockScreenActivity
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LockerPersistentService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var policyManager: LockerPolicyManager
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val TAG = "LockerDaemon"
        private const val NOTIF_CHANNEL_ID = "locker_service_channel"
        private const val NOTIF_ID = 8888
        private const val HEARTBEAT_URL = "https://locker-2nuk.onrender.com/api/v1/devices/heartbeat"

        fun start(context: Context) {
            val intent = Intent(context, LockerPersistentService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        policyManager = LockerPolicyManager(this)
        createNotificationChannel()
        startForeground(NOTIF_ID, buildForegroundNotification())
        startHeartbeatLoop()
        startCloudWebSocket()
        Log.i(TAG, "LockerPersistentService démarré en premier plan permanent (Mode Cloud Unifié).")
    }

    private fun startCloudWebSocket() {
        serviceScope.launch {
            try {
                val imei = resolveImei()
                val wsUrl = "wss://locker-2nuk.onrender.com/api/v1/devices/$imei/ws"
                val wsRequest = Request.Builder().url(wsUrl).build()

                client.newWebSocket(wsRequest, object : okhttp3.WebSocketListener() {
                    override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                        try {
                            val json = JSONObject(text)
                            val action = json.optString("action")
                            val reason = json.optString("reason", "Action administrative Cloud")
                            val supportPhone = json.optString("support_phone", "+2290191521518")

                            if (action == "LOCK") {
                                Log.w(TAG, "Cloud WebSocket: Ordre LOCK direct reçu !")
                                policyManager.lockDevice(reason, supportPhone)
                            } else if (action == "UNLOCK") {
                                Log.i(TAG, "Cloud WebSocket: Ordre UNLOCK direct reçu !")
                                policyManager.unlockDevice()
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Erreur parse message Cloud: ${e.message}")
                        }
                    }

                    override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                        Log.d(TAG, "Liaison WebSocket Cloud en attente de reconnexion...")
                    }
                })
            } catch (e: Exception) {
                Log.d(TAG, "Init WebSocket Cloud: ${e.message}")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIF_CHANNEL_ID,
                "Service de Protection LockER",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Maintient la protection antivol et la liaison avec la flotte en arrière-plan"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        return NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("LockER MDM Enterprise")
            .setContentText("Protection de flotte active en arrière-plan")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    @SuppressLint("MissingPermission")
    private fun fetchCurrentLocation(): Pair<Double, Double>? {
        try {
            val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
            var bestLoc: Location? = null

            // 1. Essayer GPS_PROVIDER
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                bestLoc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            }
            // 2. Si non disponible, essayer NETWORK_PROVIDER (Antennes cellulaires MTN/Moov Bénin & WiFi)
            if (bestLoc == null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                bestLoc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }
            // 3. Essayer PASSIVE_PROVIDER
            if (bestLoc == null && lm.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
                bestLoc = lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)
            }

            if (bestLoc != null) {
                return Pair(bestLoc.latitude, bestLoc.longitude)
            }
        } catch (e: Exception) {
            Log.d(TAG, "fetchCurrentLocation: ${e.message}")
        }
        return null
    }

    private fun startHeartbeatLoop() {
        serviceScope.launch {
            while (isActive) {
                try {
                    val imei = resolveImei()
                    val fcmToken = getStoredFcmToken()
                    val batteryLevel = getBatteryLevel()
                    val loc = fetchCurrentLocation()
                    val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

                    val json = JSONObject().apply {
                        put("imei", imei)
                        put("android_id", androidId)
                        put("fcm_token", fcmToken)
                        put("battery_level", batteryLevel)
                        put("is_network_connected", true)
                        if (loc != null) {
                            put("latitude", loc.first)
                            put("longitude", loc.second)
                        }
                    }

                    val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                    val request = Request.Builder()
                        .url(HEARTBEAT_URL)
                        .post(body)
                        .build()

                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string()
                        if (!responseBody.isNullOrBlank()) {
                            val respJson = JSONObject(responseBody)
                            val isLockedOnServer = respJson.optBoolean("is_locked", false)
                            val lockReason = respJson.optString("lock_reason", "Échéance journalière dépassée (≥ 3 jours)")
                            val supportPhone = respJson.optString("support_phone", "+2290191521518")
                            val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                            val isCurrentlyLocked = prefs.getBoolean("is_locked", false)

                            if (isLockedOnServer) {
                                if (!isCurrentlyLocked) {
                                    Log.w(TAG, "VERROUILLAGE DÉTECTÉ DEPUIS LE SERVEUR CLOUD !")
                                    policyManager.lockDevice(reason = lockReason, supportPhone = supportPhone)
                                }
                                ensureLockScreenVisible(lockReason)
                            } else if (!isLockedOnServer && isCurrentlyLocked) {
                                Log.i(TAG, "DÉVERROUILLAGE DÉTECTÉ DEPUIS LE SERVEUR CLOUD !")
                                policyManager.unlockDevice()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Ping heartbeat exception: ${e.message}")
                }

                // Vérifier la persistance du verrouillage local :
                // Si l'état local est locked, s'assurer que LockScreenActivity est toujours à l'écran
                val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                if (prefs.getBoolean("is_locked", false)) {
                    ensureLockScreenVisible(prefs.getString("lock_reason", "Échéance dépassée") ?: "Échéance dépassée")
                }

                delay(3000) // Interrogation régulière toutes les 3 secondes
            }
        }
    }

    private fun ensureLockScreenVisible(reason: String) {
        try {
            val intent = Intent(this, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra("EXTRA_REASON", reason)
                putExtra("EXTRA_SUPPORT_PHONE", "+2290191521518")
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "ensureLockScreenVisible: ${e.message}")
        }
    }

    private fun resolveImei(): String {
        val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        val savedImei = prefs.getString("assigned_imei", "")
        if (!savedImei.isNullOrBlank()) return savedImei

        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val imei = tm?.imei
                if (!imei.isNullOrBlank()) return imei
            }
        } catch (e: Exception) {
            // Permission ou non-device owner
        }
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        return if (!androidId.isNullOrBlank()) androidId else "352965710157155"
    }

    private fun getStoredFcmToken(): String {
        val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        return prefs.getString("fcm_token", "") ?: ""
    }

    private fun getBatteryLevel(): Int {
        val batteryStatus: Intent? = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100) / scale else 100
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        // Relancer le service s'il a été tué par le système
        val broadcastIntent = Intent("com.locker.agent.RESTART_DAEMON")
        sendBroadcast(broadcastIntent)
    }
}
