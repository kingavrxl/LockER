package com.locker.agent.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import com.locker.agent.R
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class LockScreenActivity : Activity() {

    private lateinit var tvReason: TextView
    private lateinit var btnPayNow: Button
    private lateinit var btnCallSupport: Button
    private lateinit var btnRefreshStatus: Button
    private lateinit var btnEmergencyCall: Button

    private var supportPhoneNumber: String = "+2290191521518"

    // Récepteur pour fermer l'activité dès la réception de l'ordre UNLOCK
    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            try {
                stopLockTask()
            } catch (e: Exception) {
                Log.w("LockScreen", "stopLockTask: ${e.message}")
            }
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Configuration plein écran strict et au-dessus de l'écran de verrouillage standard
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_lock_screen)

        tvReason = findViewById(R.id.tvLockReason)
        btnPayNow = findViewById(R.id.btnPayNow)
        btnCallSupport = findViewById(R.id.btnCallSupport)
        btnRefreshStatus = findViewById(R.id.btnRefreshStatus)
        btnEmergencyCall = findViewById(R.id.btnEmergencyCall)

        val reason = intent.getStringExtra("EXTRA_REASON") ?: "Paiement en retard de plus de 3 jours"
        supportPhoneNumber = intent.getStringExtra("EXTRA_SUPPORT_PHONE") ?: "+2290191521518"
        tvReason.text = "Motif : $reason"

        setupActions()

        // Activer le mode Kiosk non-quittable si l'application est Device Owner
        try {
            startLockTask()
        } catch (e: Exception) {
            Log.w("LockScreen", "startLockTask warning: ${e.message}")
        }

        // Enregistrer le récepteur d'événement UNLOCK
        val filter = IntentFilter("com.locker.agent.ACTION_UNLOCK")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(unlockReceiver, filter)
        }
    }

    private fun setupActions() {
        // 1. Bouton Payer Immédiatement (Options Mobile Money Bénin MTN / Moov)
        btnPayNow.setOnClickListener {
            val options = arrayOf(
                "🟡 MTN Mobile Money (*133#)",
                "🔵 Moov Money Bénin (*880#)",
                "📞 Contacter le Support pour Dépôt Direct"
            )
            AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Régulariser mon versement (5 000 FCFA)")
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> {
                            val ussdIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:" + Uri.encode("*133#"))
                            }
                            startActivity(ussdIntent)
                        }
                        1 -> {
                            val ussdIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:" + Uri.encode("*880#"))
                            }
                            startActivity(ussdIntent)
                        }
                        2 -> {
                            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$supportPhoneNumber")
                            }
                            startActivity(callIntent)
                        }
                    }
                }
                .setNegativeButton("Fermer", null)
                .show()
        }

        // 2. Appeler le support de la flotte (Direct dialer)
        btnCallSupport.setOnClickListener {
            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:$supportPhoneNumber")
            }
            startActivity(callIntent)
        }

        // 3. Appel d'urgence 112 (Conformité légale impérative)
        btnEmergencyCall.setOnClickListener {
            val emergencyIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:112")
            }
            startActivity(emergencyIntent)
        }

        // 4. Actualiser l'état (Ping le serveur pour vérifier si le paiement est confirmé)
        btnRefreshStatus.setOnClickListener {
            Toast.makeText(this, "Vérification auprès du serveur central...", Toast.LENGTH_SHORT).show()
            Thread {
                try {
                    val client = OkHttpClient()
                    val json = JSONObject().apply {
                        put("imei", "352965710157155")
                    }
                    val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                    val request = Request.Builder()
                        .url("http://192.168.100.30:8000/api/v1/devices/heartbeat")
                        .post(body)
                        .build()
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val respBody = response.body?.string() ?: ""
                        val respJson = JSONObject(respBody)
                        val isLocked = respJson.optBoolean("is_locked", true)
                        runOnUiThread {
                            if (!isLocked) {
                                Toast.makeText(this@LockScreenActivity, "Paiement validé ! Déverrouillage...", Toast.LENGTH_LONG).show()
                                try { stopLockTask() } catch (_: Exception) {}
                                finish()
                            } else {
                                Toast.makeText(this@LockScreenActivity, "Paiement non encore détecté. Veuillez patienter après versement.", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        Toast.makeText(this@LockScreenActivity, "Impossible de joindre le serveur central.", Toast.LENGTH_SHORT).show()
                    }
                }
            }.start()
        }
    }

    // Interdire la touche Retour pour quitter l'écran de verrouillage
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Bloqué pour maintenir le Kiosk
    }

    // Touches physiques : Seuls Home et App Switch sont neutralisés pour ne pas quitter.
    // Les touches Volume, Power et Clavier tactile restent actives.
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_HOME || keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(unlockReceiver)
        } catch (e: Exception) {
            // Déjà désenregistré
        }
    }
}
