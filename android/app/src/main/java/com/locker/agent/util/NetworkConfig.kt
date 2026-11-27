package com.locker.agent.util

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PersistableBundle
import android.util.Log

object NetworkConfig {
    private const val TAG = "NetworkConfig"
    private const val PREFS_NAME = "locker_prefs"
    private const val KEY_SERVER_URL = "custom_server_url"
    private const val KEY_SUPPORT_PHONE = "support_phone"
    const val DEFAULT_SERVER_URL = "https://locker-2nuk.onrender.com"
    const val DEFAULT_SUPPORT_PHONE = "+2290191521518"

    fun normalizeServerUrl(url: String): String {
        var clean = url.trim().removeSuffix("/")
        if (clean.lowercase().endsWith("/api/v1")) {
            clean = clean.substring(0, clean.length - "/api/v1".length).removeSuffix("/")
        }
        return clean
    }

    fun getServerUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_SERVER_URL, null)
        return if (!saved.isNullOrBlank()) normalizeServerUrl(saved) else DEFAULT_SERVER_URL
    }

    fun setServerUrl(context: Context, url: String) {
        val clean = normalizeServerUrl(url)
        if (clean.isBlank()) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SERVER_URL, clean).apply()
    }

    fun getSupportPhone(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_SUPPORT_PHONE, null)
        return if (!saved.isNullOrBlank()) saved.trim() else DEFAULT_SUPPORT_PHONE
    }

    fun setSupportPhone(context: Context, phone: String) {
        val clean = phone.trim()
        if (clean.isBlank()) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SUPPORT_PHONE, clean).apply()
    }

    fun applyAdminExtrasBundle(context: Context, extras: PersistableBundle?) {
        if (extras == null) return
        val serverUrl = extras.getString("server_url")
            ?: extras.getString("serverurl")
            ?: extras.getString("api_url")
        if (!serverUrl.isNullOrBlank()) {
            setServerUrl(context, serverUrl)
            Log.i(TAG, "Server URL configurée via QR provisioning : ${getServerUrl(context)}")
        }

        val supportPhone = extras.getString("support_phone")
        if (!supportPhone.isNullOrBlank()) {
            setSupportPhone(context, supportPhone)
            Log.i(TAG, "Support phone configuré via QR provisioning : ${getSupportPhone(context)}")
        }
    }

    fun applyFromIntent(context: Context, intent: Intent?): PersistableBundle? {
        if (intent == null) return null
        val extras: PersistableBundle? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                PersistableBundle::class.java
            )
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        }
        applyAdminExtrasBundle(context, extras)
        return extras
    }

    fun getRegisterUrl(context: Context): String {
        return "${getServerUrl(context)}/api/v1/devices/register"
    }

    fun getHeartbeatUrl(context: Context): String {
        return "${getServerUrl(context)}/api/v1/devices/heartbeat"
    }

    fun getWebSocketUrl(context: Context, imei: String, token: String): String {
        val base = getServerUrl(context)
        val wsBase = if (base.startsWith("https://")) {
            base.replaceFirst("https://", "wss://")
        } else if (base.startsWith("http://")) {
            base.replaceFirst("http://", "ws://")
        } else {
            "wss://$base"
        }
        return if (token.isNotBlank()) {
            "$wsBase/api/v1/devices/$imei/ws?token=$token"
        } else {
            "$wsBase/api/v1/devices/$imei/ws"
        }
    }
}
