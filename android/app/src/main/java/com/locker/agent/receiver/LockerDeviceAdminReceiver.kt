package com.locker.agent.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import com.locker.agent.manager.LockerPolicyManager

class LockerDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "LockerDeviceAdmin"

        fun getComponentName(context: Context): ComponentName {
            return ComponentName(context.applicationContext, LockerDeviceAdminReceiver::class.java)
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Locker Device Admin activé avec succès.")
        Toast.makeText(context, "LockER Device Owner Actif", Toast.LENGTH_LONG).show()
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Enrôlement Device Owner terminé avec succès.")
        
        // Initialiser les politiques Device Owner : autoriser l'app en Kiosk Mode (LockTask)
        val policyManager = LockerPolicyManager(context)
        policyManager.setupDeviceOwnerPolicies()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Locker Device Admin désactivé.")
    }
}
