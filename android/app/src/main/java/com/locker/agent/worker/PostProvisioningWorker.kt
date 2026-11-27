package com.locker.agent.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.locker.agent.LockerApp
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.service.LockerPersistentService

/**
 * Exécuté quelques secondes après ADMIN_POLICY_COMPLIANCE afin de laisser
 * Google Setup Wizard se terminer proprement avant d'appliquer les restrictions
 * strictes et de démarrer le daemon persistant.
 */
class PostProvisioningWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        Log.i("PostProvisioningWorker", "Finalisation post-enrôlement LockER...")

        val policyManager = LockerPolicyManager(ctx)
        if (policyManager.isDeviceOwner()) {
            policyManager.setupDeviceOwnerPolicies()
        }

        LockerPersistentService.start(ctx)
        LockerApp.syncWithCloudNow(ctx)
        return Result.success()
    }
}
