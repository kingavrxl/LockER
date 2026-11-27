package com.locker.agent.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.locker.agent.service.LockerPersistentService
import com.locker.agent.ui.LockScreenActivity

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.i("BootReceiver", "Événement de démarrage reçu : $action")

        // 1. Démarrer le service d'arrière-plan permanent
        LockerPersistentService.start(context)

        // 2. Si le téléphone était verrouillé avant l'extinction, le reverrouiller immédiatement au démarrage
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        val isLocked = prefs.getBoolean("is_locked", false)
        if (isLocked) {
            val lockIntent = Intent(context, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra("EXTRA_REASON", prefs.getString("lock_reason", "Échéance journalière dépassée"))
                putExtra("EXTRA_SUPPORT_PHONE", com.locker.agent.util.NetworkConfig.getSupportPhone(context))
            }
            context.startActivity(lockIntent)
        }
    }
}
