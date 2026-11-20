package com.locker.agent.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.locker.agent.manager.LockerPolicyManager
import java.time.Instant

/**
 * Surveillance hors-ligne :
 * Exécuté périodiquement par WorkManager.
 * Si le téléphone est coupé d'Internet depuis plus de 72 heures et que le bail expire,
 * le téléphone est automatiquement verrouillé en local sans dépendre de FCM.
 */
class OfflineLeaseWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "OfflineLeaseWorker"
    }

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        val leaseExpiryStr = prefs.getString("lease_expires_at", null)
        val isLocked = prefs.getBoolean("is_locked", false)

        if (leaseExpiryStr != null && !isLocked) {
            try {
                val expiry = Instant.parse(leaseExpiryStr)
                val now = Instant.now()

                if (now.isAfter(expiry)) {
                    Log.w(TAG, "Le bail de validité locale a expiré (> 72h hors-ligne). Verrouillage forcé.")
                    val policyManager = LockerPolicyManager(applicationContext)
                    policyManager.lockDevice(
                        reason = "Bail hors-ligne expiré (> 72h sans contact avec le serveur)",
                        supportPhone = prefs.getString("support_phone", "+2290191521518") ?: "+2290191521518"
                    )
                }
            } catch (e: Exception) {
                Log.error(TAG, "Erreur lors de la vérification du bail : ${e.message}")
            }
        }

        return Result.success()
    }
}
