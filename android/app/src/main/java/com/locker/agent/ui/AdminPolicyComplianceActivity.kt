package com.locker.agent.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.locker.agent.LockerApp
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.service.LockerPersistentService
import com.locker.agent.util.NetworkConfig

/**
 * Activité appelée par Android ManagedProvisioning (Android 12+) juste après
 * l'attribution du statut Device Owner via QR Code.
 * Applique les politiques antivol, démarre le daemon Cloud et renvoie RESULT_OK.
 */
class AdminPolicyComplianceActivity : Activity() {

    companion object {
        private const val TAG = "AdminPolicyCompliance"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        NetworkConfig.applyFromIntent(this, intent)

        val policyManager = LockerPolicyManager(this)
        if (policyManager.isDeviceOwner()) {
            Log.i(TAG, "Device Owner vérifié pendant ADMIN_POLICY_COMPLIANCE. Application des politiques...")
            policyManager.setupDeviceOwnerPolicies()
        } else {
            Log.w(TAG, "AdminPolicyCompliance lancé mais l'application n'est pas encore Device Owner.")
        }

        try {
            LockerPersistentService.start(this)
        } catch (e: Exception) {
            Log.w(TAG, "Démarrage service compliance: ${e.message}")
        }

        LockerApp.syncWithCloudNow(this)

        setResult(RESULT_OK, Intent())
        finish()
    }
}
