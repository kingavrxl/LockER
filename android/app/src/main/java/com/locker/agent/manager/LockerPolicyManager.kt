package com.locker.agent.manager

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.UserManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.locker.agent.receiver.LockerDeviceAdminReceiver
import com.locker.agent.ui.LockScreenActivity

class LockerPolicyManager(private val context: Context) {

    private val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = LockerDeviceAdminReceiver.getComponentName(context)

    companion object {
        private const val TAG = "LockerPolicyManager"
        private const val LOCK_CHANNEL_ID = "locker_lock_channel"
        private const val LOCK_NOTIF_ID = 9999
    }

    fun isDeviceOwner(): Boolean {
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    /**
     * Configure l'application pour qu'elle puisse verrouiller le terminal en mode Kiosk LockTask,
     * accorde automatiquement toutes les permissions nécessaires sans solliciter l'utilisateur
     * et applique les restrictions de sécurité antivol.
     */
    fun setupDeviceOwnerPolicies() {
        if (!isDeviceOwner()) {
            Log.w(TAG, "L'application n'est pas Device Owner. Impossible d'appliquer les politiques.")
            return
        }

        try {
            // 1. Accorder automatiquement TOUTES les permissions sans demander à l'utilisateur
            val perms = arrayOf(
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.CALL_PHONE,
                "android.permission.READ_PHONE_NUMBERS",
                "android.permission.POST_NOTIFICATIONS"
            )
            for (p in perms) {
                try {
                    dpm.setPermissionGrantState(adminComponent, context.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                } catch (pe: Exception) {
                    Log.d(TAG, "setPermissionGrantState $p: ${pe.message}")
                }
            }

            // 2. Autoriser notre propre package et les services d'appel/urgence en Kiosk LockTask Mode
            val allowedPackages = arrayOf(
                context.packageName,
                "com.samsung.android.dialer",
                "com.samsung.android.incallui",
                "com.google.android.dialer",
                "com.android.phone",
                "com.android.server.telecom"
            )
            dpm.setLockTaskPackages(adminComponent, allowedPackages)

            // 3. Empêcher la réinitialisation d'usine, le mode sans échec et la désinstallation
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_UNINSTALL_APPS)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER)

            // 4. Activer les touches physiques (Power/Volume) et l'accès d'urgence
            val lockTaskFeatures = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS or
                    DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
            dpm.setLockTaskFeatures(adminComponent, lockTaskFeatures)

            Log.i(TAG, "Politiques Device Owner configurées avec succès.")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la configuration des politiques Device Owner: ${e.message}", e)
        }
    }

    /**
     * Déclenche le verrouillage immédiat du téléphone :
     * 1. Déclenche une notification Full-Screen haute priorité pour contourner le blocage d'activité en arrière-plan d'Android
     * 2. Lance l'activité plein écran non-quittable
     */
    fun lockDevice(reason: String, supportPhone: String) {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("is_locked", true)
            .putString("lock_reason", reason)
            .putString("support_phone", supportPhone)
            .apply()

        // 1. Notification Plein Écran Haute Priorité (Wakeup immédiat même écran éteint ou sur YouTube)
        showFullScreenLockNotification(reason, supportPhone)

        // 2. Démarrer directement l'activité
        try {
            val intent = Intent(context, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra("EXTRA_REASON", reason)
                putExtra("EXTRA_SUPPORT_PHONE", supportPhone)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "startActivity direct warning: ${e.message}")
        }
        Log.i(TAG, "Verrouillage de l'appareil activé : $reason")
    }

    private fun showFullScreenLockNotification(reason: String, supportPhone: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                LOCK_CHANNEL_ID,
                "Verrouillage Flotte",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notification de verrouillage obligatoire"
                setSound(null, null)
                enableVibration(true)
            }
            nm.createNotificationChannel(channel)
        }

        val lockIntent = Intent(context, LockScreenActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            putExtra("EXTRA_REASON", reason)
            putExtra("EXTRA_SUPPORT_PHONE", supportPhone)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            lockIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, LOCK_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("TERMINAL BLOQUÉ - ÉCHÉANCE DÉPASSÉE")
            .setContentText("Motif : $reason")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(false)
            .setOngoing(true)
            .build()

        nm.notify(LOCK_NOTIF_ID, notification)
    }

    /**
     * Déverrouille l'appareil :
     * Rétablit l'état normal et quitte le mode Kiosk.
     */
    fun unlockDevice() {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_locked", false).apply()

        // 1. Supprimer la notification permanente de blocage
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(LOCK_NOTIF_ID)

        // 2. Notifier l'activité de s'arrêter via broadcast explicite
        val intent = Intent("com.locker.agent.ACTION_UNLOCK").apply {
            setPackage(context.packageName)
        }
        context.sendBroadcast(intent)

        // 3. Envoyer également une intention directe avec EXTRA_UNLOCK pour garantir la fermeture
        try {
            val unlockIntent = Intent(context, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("EXTRA_UNLOCK", true)
            }
            context.startActivity(unlockIntent)
        } catch (e: Exception) {
            Log.w(TAG, "startActivity EXTRA_UNLOCK: ${e.message}")
        }

        Log.i(TAG, "Déverrouillage de l'appareil ordonné avec succès.")
    }
}
