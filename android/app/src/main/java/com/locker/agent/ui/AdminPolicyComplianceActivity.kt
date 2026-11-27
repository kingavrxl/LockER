package com.locker.agent.ui

import android.app.Activity
import android.os.Bundle
import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.locker.agent.LockerApp
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.util.NetworkConfig
import com.locker.agent.worker.PostProvisioningWorker
import java.util.concurrent.TimeUnit

/**
 * Activité appelée par Android ManagedProvisioning (Android 12+) juste après
 * l'attribution du statut Device Owner via QR Code.
 * Applique uniquement les politiques initiales non-bloquantes, planifie l'activation
 * du daemon après la sortie de l'assistant Setup Wizard, et renvoie immédiatement RESULT_OK.
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
            Log.i(TAG, "Device Owner vérifié pendant ADMIN_POLICY_COMPLIANCE. Politiques initiales...")
            policyManager.setupInitialProvisioningPolicies()
            LockerApp.syncWithCloudNow(this)

            try {
                val postWork = OneTimeWorkRequestBuilder<PostProvisioningWorker>()
                    .setInitialDelay(5, TimeUnit.SECONDS)
                    .build()
                WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                    "locker_post_provisioning",
                    ExistingWorkPolicy.REPLACE,
                    postWork
                )
            } catch (e: Exception) {
                Log.w(TAG, "Planification PostProvisioningWorker: ${e.message}")
            }

            setResult(RESULT_OK, intent)
        } else {
            Log.w(TAG, "AdminPolicyCompliance lancé mais l'application n'est pas Device Owner.")
            setResult(RESULT_CANCELED)
        }

        finish()
    }
}
