package com.locker.agent.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.locker.agent.util.NetworkConfig

/**
 * Activité appelée par Android Setup Wizard / ManagedProvisioning (Android 10+)
 * lors du scan du QR code (7 taps à l'allumage) pour choisir le mode d'enrôlement.
 * Retourne PROVISIONING_MODE_FULLY_MANAGED_DEVICE (Device Owner complet).
 */
class GetProvisioningModeActivity : Activity() {

    companion object {
        private const val TAG = "GetProvisioningMode"
    }

    @SuppressLint("InlinedApi")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val adminExtras = NetworkConfig.applyFromIntent(this, intent)

        val allowedModes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            intent?.getIntegerArrayListExtra(DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES)
        } else {
            null
        }

        val selectedMode = when {
            allowedModes.isNullOrEmpty() -> DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            allowedModes.contains(DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE) ->
                DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            else -> allowedModes.first()
        }

        Log.i(TAG, "Mode d'enrôlement sélectionné pour LockER : $selectedMode (autorisés: $allowedModes)")

        val resultIntent = Intent().apply {
            putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, selectedMode)
            if (adminExtras != null) {
                putExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE, adminExtras)
            }
        }

        setResult(RESULT_OK, resultIntent)
        finish()
    }
}
