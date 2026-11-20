package com.locker.agent.ui

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import com.locker.agent.R

class LockScreenActivity : Activity() {

    private lateinit var tvReason: TextView
    private lateinit var btnCallSupport: Button
    private lateinit var btnRefreshStatus: Button
    private lateinit var btnEmergencyCall: Button

    private var supportPhoneNumber: String = "+2290191521518"

    // Récepteur pour fermer l'activité dès la réception de l'ordre UNLOCK
    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            stopLockTask()
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
            // Si pas encore Device Owner, restera affiché au premier plan sans LockTask natif
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
        // Appeler le support de la flotte (Direct dialer)
        btnCallSupport.setOnClickListener {
            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:$supportPhoneNumber")
            }
            startActivity(callIntent)
        }

        // Appel d'urgence 112 (Conformité légale impérative)
        btnEmergencyCall.setOnClickListener {
            val emergencyIntent = Intent(Intent.ACTION_DIAL).apply {
                data = Uri.parse("tel:112")
            }
            startActivity(emergencyIntent)
        }

        // Actualiser l'état (Ping le serveur pour vérifier si le paiement Mobile Money est arrivé)
        btnRefreshStatus.setOnClickListener {
            Toast.makeText(this, "Vérification du statut de paiement en cours...", Toast.LENGTH_SHORT).show()
            // Déclenche une synchronisation
        }
    }

    // Interdire la touche Retour physique
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Ne rien faire pour bloquer la sortie
    }

    // Bloquer les boutons de volume ou touches matérielles pour quitter
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
