package com.locker.agent.util

import android.content.Context

object NetworkConfig {
    private const val PREFS_NAME = "locker_prefs"
    private const val KEY_SERVER_URL = "custom_server_url"
    const val DEFAULT_SERVER_URL = "https://locker-2nuk.onrender.com"

    fun getServerUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_SERVER_URL, null)
        return if (!saved.isNullOrBlank()) saved.trim().removeSuffix("/") else DEFAULT_SERVER_URL
    }

    fun setServerUrl(context: Context, url: String) {
        val clean = url.trim().removeSuffix("/")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SERVER_URL, clean).apply()
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
