package com.locker.agent.manager

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager
import android.util.Log
import com.locker.agent.receiver.LockerDeviceAdminReceiver
import com.locker.agent.ui.LockScreenActivity

class LockerPolicyManager(private val context: Context) {

    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = LockerDeviceAdminReceiver.getComponentName(context)

    companion object {
        private const val TAG = "LockerPolicyManager"
    }

    fun isDeviceOwner(): Boolean {
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Configure l'application pour qu'elle puisse verrouiller le terminal en mode Kiosk LockTask
     * et applique les restrictions de sécurité antivol.
     */
    fun setupDeviceOwnerPolicies() {
        if (!isDeviceOwner()) {
            Log.w(TAG, "L'application n'est pas Device Owner. Impossible d'appliquer les politiques.")
            return
        }

        try {
            // 1. Autoriser notre propre package à entrer en LockTask Mode (Kiosk)
            dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))

            // 2. Empêcher la réinitialisation d'usine et le redémarrage en mode sans échec
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_UNINSTALL_APPS)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER)

            // 3. Activer la persistance de l'activité après redémarrage
            dpm.setLockTaskFeatures(
                adminComponent,
                DevicePolicyManager.LOCK_TASK_FEATURE_NONE // Bloque barre d'état, boutons accueil et récents
            )

            Log.i(TAG, "Politiques Device Owner configurées avec succès.")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la configuration des politiques Device Owner: ${e.message}", e)
        }
    }

    /**
     * Déclenche le verrouillage immédiat du téléphone :
     * Lance l'activité plein écran non-quittable.
     */
    fun lockDevice(reason: String, supportPhone: String) {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("is_locked", true)
            .putString("lock_reason", reason)
            .putString("support_phone", supportPhone)
            .apply()

        // Lancer l'activité Kiosk LockScreen
        val intent = Intent(context, LockScreenActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            putExtra("EXTRA_REASON", reason)
            putExtra("EXTRA_SUPPORT_PHONE", supportPhone)
        }
        context.startActivity(intent)
        Log.i(TAG, "Verrouillage de l'appareil activé : $reason")
    }

    /**
     * Déverrouille l'appareil :
     * Rétablit l'état normal et quitte le mode Kiosk.
     */
    fun unlockDevice() {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_locked", false).apply()

        // Notifier l'activité de s'arrêter
        val intent = Intent("com.locker.agent.ACTION_UNLOCK")
        context.sendBroadcast(intent)
        Log.i(TAG, "Déverrouillage de l'appareil ordonné.")
    }
}
