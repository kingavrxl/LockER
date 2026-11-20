package com.locker.agent.service

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.locker.agent.manager.LockerPolicyManager

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
        
        // TODO: Synchroniser avec l'API Backend (/api/v1/devices/register)
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
