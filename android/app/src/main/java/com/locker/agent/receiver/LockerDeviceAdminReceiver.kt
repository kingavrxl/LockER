package com.locker.agent.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import com.locker.agent.LockerApp
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.service.LockerPersistentService
import com.locker.agent.util.NetworkConfig

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
        val policyManager = LockerPolicyManager(context)
        if (policyManager.isDeviceOwner()) {
            policyManager.setupDeviceOwnerPolicies()
        }
        Toast.makeText(context, "LockER Device Owner Actif", Toast.LENGTH_LONG).show()
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Enrôlement Device Owner (QR / NFC / ADB) terminé avec succès.")

        NetworkConfig.applyFromIntent(context, intent)

        // Initialiser les politiques Device Owner : permissions, Kiosk Mode (LockTask), antivol
        val policyManager = LockerPolicyManager(context)
        policyManager.setupDeviceOwnerPolicies()

        // Démarrer la liaison Cloud WebSocket & enregistrer le terminal immédiatement
        LockerPersistentService.start(context)
        LockerApp.syncWithCloudNow(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Locker Device Admin désactivé.")
    }
}
