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
     * Configure l'application pour verrouiller le terminal en mode Kiosk LockTask,
     * accorde automatiquement toutes les permissions nécessaires sans solliciter l'utilisateur
     * et applique les restrictions de sécurité antivol strictes.
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
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                "android.permission.ACCESS_BACKGROUND_LOCATION",
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

            // 3. Durcissement matériel antivol : neutraliser Power menu, Safe Mode, ADB USB, Réinitialisation
            dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_UNINSTALL_APPS)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_DEBUGGING_FEATURES)
            dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_USB_FILE_TRANSFER)

            Log.i(TAG, "Politiques Device Owner durcies configurées avec succès.")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la configuration des politiques Device Owner: ${e.message}", e)
        }
    }

    /**
     * Déclenche le verrouillage immédiat du téléphone :
     * 1. Déclenche une notification Full-Screen haute priorité
     * 2. Désactive la barre de statut (accès aux réglages rapides)
     * 3. Lance l'activité plein écran non-quittable
     */
    fun lockDevice(reason: String, supportPhone: String) {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean("is_locked", true)
            .putString("lock_reason", reason)
            .putString("support_phone", supportPhone)
            .apply()

        // Désactiver la barre de notification et statut si Device Owner (Android 9+)
        try {
            if (isDeviceOwner() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.setStatusBarDisabled(adminComponent, true)
            }
        } catch (e: Exception) {
            Log.d(TAG, "setStatusBarDisabled: ${e.message}")
        }

        // Notification Plein Écran Haute Priorité
        showFullScreenLockNotification(reason, supportPhone)

        // Démarrer directement l'activité Kiosk
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
     * Rétablit l'état normal, réactive la barre de statut et quitte le mode Kiosk.
     */
    fun unlockDevice() {
        val prefs = context.getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("is_locked", false).apply()

        // Réactiver la barre de statut si Device Owner
        try {
            if (isDeviceOwner() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.setStatusBarDisabled(adminComponent, false)
            }
        } catch (e: Exception) {
            Log.d(TAG, "setStatusBarDisabled restore: ${e.message}")
        }

        // Supprimer la notification permanente de blocage
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(LOCK_NOTIF_ID)

        // Notifier l'activité de s'arrêter
        val intent = Intent("com.locker.agent.ACTION_UNLOCK").apply {
            setPackage(context.packageName)
        }
        context.sendBroadcast(intent)

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
