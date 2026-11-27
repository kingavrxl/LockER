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
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.ui.LockScreenActivity
import com.locker.agent.util.NetworkConfig
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LockerPersistentService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var policyManager: LockerPolicyManager
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // 0 pour maintien WebSocket infini
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var activeWebSocket: WebSocket? = null
    private var isWebSocketConnected = false

    companion object {
        private const val TAG = "LockerDaemon"
        private const val NOTIF_CHANNEL_ID = "locker_service_channel"
        private const val NOTIF_ID = 8888

        fun start(context: Context) {
            try {
                val intent = Intent(context, LockerPersistentService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "startForegroundService exception: ${e.message}", e)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        try {
            policyManager = LockerPolicyManager(this)
            createNotificationChannel()

            val notification = buildForegroundNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIF_ID, 
                    notification, 
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIF_ID, notification)
            }

            if (policyManager.isDeviceOwner() && com.locker.agent.LockerApp.isDeviceProvisioned(this)) {
                policyManager.setupDeviceOwnerPolicies()
            }

            // Démarrage des liaisons Cloud Native
            startCloudWebSocketConnection()
            startPeriodicHeartbeatLoop()
            Log.i(TAG, "LockerPersistentService actif en premier plan permanent (100% Native Cloud Push).")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur critique dans onCreate service: ${e.message}", e)
        }
    }

    private fun startCloudWebSocketConnection() {
        serviceScope.launch {
            while (isActive) {
                try {
                    val imei = resolveImei()
                    val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                    val token = prefs.getString("device_auth_token", "") ?: ""
                    val wsUrl = NetworkConfig.getWebSocketUrl(applicationContext, imei, token)

                    Log.i(TAG, "Connexion WebSocket Cloud vers : $wsUrl")
                    val request = Request.Builder().url(wsUrl).build()

                    val listener = object : WebSocketListener() {
                        override fun onOpen(webSocket: WebSocket, response: Response) {
                            isWebSocketConnected = true
                            activeWebSocket = webSocket
                            Log.i(TAG, "✓ Liaison WebSocket Cloud sub-50ms établie avec succès !")
                        }

                        override fun onMessage(webSocket: WebSocket, text: String) {
                            try {
                                val json = JSONObject(text)
                                val action = json.optString("action")
                                val reason = json.optString("reason", "Action administrative Cloud")
                                val supportPhone = json.optString("support_phone", NetworkConfig.getSupportPhone(applicationContext))

                                when (action) {
                                    "LOCK" -> {
                                        Log.w(TAG, "Ordre LOCK direct sub-50ms reçu !")
                                        policyManager.lockDevice(reason, supportPhone)
                                    }
                                    "UNLOCK" -> {
                                        Log.i(TAG, "Ordre UNLOCK direct sub-50ms reçu !")
                                        policyManager.unlockDevice()
                                    }
                                    "RENEW_LEASE" -> {
                                        val leaseExpiry = json.optString("lease_expires_at", "")
                                        if (leaseExpiry.isNotBlank()) {
                                            prefs.edit().putString("lease_expires_at", leaseExpiry).apply()
                                            Log.i(TAG, "Bail local prolongé : $leaseExpiry")
                                        }
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Erreur parsing message WebSocket: ${e.message}")
                            }
                        }

                        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                            isWebSocketConnected = false
                        }

                        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                            isWebSocketConnected = false
                        }

                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                            isWebSocketConnected = false
                            Log.d(TAG, "Déconnexion WebSocket Cloud : ${t.message}. Reconnexion automatique...")
                        }
                    }

                    client.newWebSocket(request, listener)

                    // Surveiller la vie du socket
                    while (isActive && isWebSocketConnected) {
                        delay(10000)
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Erreur boucle WebSocket: ${e.message}")
                }

                delay(5000) // Reconnexion après 5 secondes si déconnecté
            }
        }
    }

    private fun startPeriodicHeartbeatLoop() {
        serviceScope.launch {
            while (isActive) {
                try {
                    val imei = resolveImei()
                    val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                    val token = prefs.getString("device_auth_token", "") ?: ""
                    val batteryLevel = getBatteryLevel()
                    val loc = fetchCurrentLocation()
                    val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

                    val json = JSONObject().apply {
                        put("imei", imei)
                        put("android_id", androidId)
                        put("device_token", token)
                        put("battery_level", batteryLevel)
                        put("is_network_connected", true)
                        if (loc != null) {
                            put("latitude", loc.first)
                            put("longitude", loc.second)
                        }
                    }

                    val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                    val request = Request.Builder()
                        .url(NetworkConfig.getHeartbeatUrl(applicationContext))
                        .post(body)
                        .build()

                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string()
                        if (!responseBody.isNullOrBlank()) {
                            val respJson = JSONObject(responseBody)
                            val isLockedOnServer = respJson.optBoolean("is_locked", false)
                            val lockReason = respJson.optString("lock_reason", "Échéance journalière dépassée (≥ 3 jours)")
                            val supportPhone = respJson.optString("support_phone", NetworkConfig.getSupportPhone(applicationContext))
                            val isCurrentlyLocked = prefs.getBoolean("is_locked", false)

                            val returnedToken = respJson.optString("auth_token", "")
                            if (returnedToken.isNotBlank() && returnedToken != token) {
                                prefs.edit().putString("device_auth_token", returnedToken).apply()
                            }

                            if (isLockedOnServer) {
                                if (!isCurrentlyLocked) {
                                    Log.w(TAG, "VERROUILLAGE CONFIRMÉ PAR LE SERVEUR CLOUD")
                                    policyManager.lockDevice(reason = lockReason, supportPhone = supportPhone)
                                }
                                ensureLockScreenVisible(lockReason)
                            } else if (!isLockedOnServer && isCurrentlyLocked) {
                                Log.i(TAG, "DÉVERROUILLAGE CONFIRMÉ PAR LE SERVEUR CLOUD")
                                policyManager.unlockDevice()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Ping heartbeat HTTP exception: ${e.message}")
                }

                // Vérifier la persistance du verrouillage local
                val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
                if (prefs.getBoolean("is_locked", false)) {
                    ensureLockScreenVisible(prefs.getString("lock_reason", "Échéance dépassée") ?: "Échéance dépassée")
                }

                // Intervalle optimisé : 45 secondes si WebSocket est actif, 15 secondes si hors ligne
                val interval = if (isWebSocketConnected) 45000L else 15000L
                delay(interval)
            }
        }
    }

    private fun ensureLockScreenVisible(reason: String) {
        try {
            val intent = Intent(this, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra("EXTRA_REASON", reason)
                putExtra("EXTRA_SUPPORT_PHONE", NetworkConfig.getSupportPhone(applicationContext))
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "ensureLockScreenVisible: ${e.message}")
        }
    }

    private fun resolveImei(): String {
        return com.locker.agent.LockerApp.resolveDeviceImei(applicationContext)
    }

    private fun getBatteryLevel(): Int {
        val batteryStatus: Intent? = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100) / scale else 100
    }

    @SuppressLint("MissingPermission")
    private fun fetchCurrentLocation(): Pair<Double, Double>? {
        try {
            val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
            var bestLoc: Location? = null

            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                bestLoc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            }
            if (bestLoc == null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                bestLoc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }
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
            .setContentText("Liaison Cloud Directe sub-50ms active")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        try {
            activeWebSocket?.close(1000, "Service destroyed")
        } catch (e: Exception) {
            // Ignorer
        }
        val broadcastIntent = Intent("com.locker.agent.RESTART_DAEMON")
        sendBroadcast(broadcastIntent)
    }
}
