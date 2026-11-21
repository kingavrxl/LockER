package com.locker.agent.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.locker.agent.R
import com.locker.agent.manager.LockerPolicyManager
import com.locker.agent.receiver.LockerDeviceAdminReceiver
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var tvCloudStatus: TextView
    private lateinit var tvModel: TextView
    private lateinit var tvImei: TextView
    private lateinit var tvSerial: TextView
    private lateinit var tvFcmToken: TextView
    private lateinit var tvAdminStatus: TextView
    private lateinit var btnSyncNow: Button
    private lateinit var btnRequestAdmin: Button

    private lateinit var policyManager: LockerPolicyManager
    private lateinit var dpm: DevicePolicyManager
    private lateinit var adminComponent: ComponentName

    private var currentImei: String = "352965710157155"
    private var currentFcmToken: String = ""

    companion object {
        private const val PERMISSION_REQ_CODE = 1001
        private const val ADMIN_REQ_CODE = 1002
        private const val BACKEND_URL = "https://locker-2nuk.onrender.com/api/v1/devices/register"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Si le téléphone est verrouillé, basculer directement sur le LockScreen
        val prefs = getSharedPreferences("locker_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("is_locked", false)) {
            val intent = Intent(this, LockScreenActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("EXTRA_REASON", prefs.getString("lock_reason", "Échéance dépassée"))
                putExtra("EXTRA_SUPPORT_PHONE", prefs.getString("support_phone", "+2290191521518"))
            }
            startActivity(intent)
            finish()
            return
        }

        setContentView(R.layout.activity_main)

        policyManager = LockerPolicyManager(this)
        dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponent = LockerDeviceAdminReceiver.getComponentName(this)

        initViews()
        requestAppPermissions()
        refreshIdentifiers()
        setupListeners()
    }

    override fun onResume() {
        super.onResume()
        refreshIdentifiers()
        syncWithCloud()
    }

    private fun initViews() {
        tvCloudStatus = findViewById(R.id.tvCloudStatus)
        tvModel = findViewById(R.id.tvModel)
        tvImei = findViewById(R.id.tvImei)
        tvSerial = findViewById(R.id.tvSerial)
        tvFcmToken = findViewById(R.id.tvFcmToken)
        tvAdminStatus = findViewById(R.id.tvAdminStatus)
        btnSyncNow = findViewById(R.id.btnSyncNow)
        btnRequestAdmin = findViewById(R.id.btnRequestAdmin)

        tvModel.text = "Modèle : ${Build.MANUFACTURER} ${Build.MODEL}".trim()
    }

    private fun setupListeners() {
        btnSyncNow.setOnClickListener {
            refreshIdentifiers()
            syncWithCloud()
            Toast.makeText(this, "Synchronisation lancée...", Toast.LENGTH_SHORT).show()
        }

        btnRequestAdmin.setOnClickListener {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Requis pour activer la protection antivol et le verrouillage de flotte LockER.")
            }
            startActivityForResult(intent, ADMIN_REQ_CODE)
        }
    }

    private fun requestAppPermissions() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CALL_PHONE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_NUMBERS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_PHONE_NUMBERS)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), PERMISSION_REQ_CODE)
        }
    }

    @SuppressLint("HardwareIds")
    private fun refreshIdentifiers() {
        // 1. Statut Administrateur
        val isDeviceOwner = dpm.isDeviceOwnerApp(packageName)
        val isAdminActive = dpm.isAdminActive(adminComponent)

        if (isDeviceOwner) {
            tvAdminStatus.text = "● Droits MDM : Device Owner ACTIF (Protection maximale)"
            tvAdminStatus.setTextColor(Color.parseColor("#10B981"))
            btnRequestAdmin.visibility = View.GONE
            policyManager.setupDeviceOwnerPolicies()
        } else if (isAdminActive) {
            tvAdminStatus.text = "● Droits MDM : Administrateur de l'appareil ACTIF"
            tvAdminStatus.setTextColor(Color.parseColor("#38BDF8"))
            btnRequestAdmin.visibility = View.GONE
        } else {
            tvAdminStatus.text = "● Droits MDM : Droits requis non accordés"
            tvAdminStatus.setTextColor(Color.parseColor("#EF4444"))
            btnRequestAdmin.visibility = View.VISIBLE
        }

        // 2. Détection IMEI matérielle
        var imeiDetected = ""
        try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                imeiDetected = tm?.imei ?: ""
                if (imeiDetected.isBlank() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    imeiDetected = tm?.getImei(0) ?: ""
                }
            }
        } catch (e: Exception) {
            Log.w("MainActivity", "Erreur lecture IMEI direct: ${e.message}")
        }

        // 3. Détection Numéro de Série
        var serialDetected = ""
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                serialDetected = Build.getSerial()
            }
        } catch (e: Exception) {
            Log.w("MainActivity", "Erreur lecture Série: ${e.message}")
        }

        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

        currentImei = if (imeiDetected.isNotBlank()) imeiDetected else if (androidId.isNotBlank()) androidId else "352965710157155"

        tvImei.text = "IMEI / Identifiant : $currentImei"
        tvSerial.text = "Série : ${if (serialDetected.isNotBlank() && serialDetected != Build.UNKNOWN) serialDetected else androidId}"

        // 4. Token FCM Google
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                currentFcmToken = task.result
                tvFcmToken.text = "Jeton FCM Google : ${currentFcmToken.take(16)}... (Actif)"
                tvFcmToken.setTextColor(Color.parseColor("#10B981"))
            } else {
                tvFcmToken.text = "Jeton FCM Google : Échec (${task.exception?.message})"
                tvFcmToken.setTextColor(Color.parseColor("#EF4444"))
            }
        }
    }

    private fun syncWithCloud() {
        tvCloudStatus.text = "● Synchronisation avec Render en cours..."
        tvCloudStatus.setTextColor(Color.parseColor("#F59E0B"))

        Thread {
            try {
                val client = OkHttpClient()
                val json = JSONObject().apply {
                    put("imei", currentImei)
                    put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                    put("fcm_token", currentFcmToken)
                    put("app_version", "1.0.0")
                }
                val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

                val request = Request.Builder()
                    .url(BACKEND_URL)
                    .post(body)
                    .build()

                val response = client.newCall(request).execute()
                val isSuccess = response.isSuccessful

                runOnUiThread {
                    if (isSuccess) {
                        tvCloudStatus.text = "● Connecté au Serveur Cloud LockER (Bénin)"
                        tvCloudStatus.setTextColor(Color.parseColor("#10B981"))
                    } else {
                        tvCloudStatus.text = "● Erreur Serveur (HTTP ${response.code})"
                        tvCloudStatus.setTextColor(Color.parseColor("#EF4444"))
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    tvCloudStatus.text = "● Échec connexion : ${e.localizedMessage ?: "Vérifiez internet"}"
                    tvCloudStatus.setTextColor(Color.parseColor("#EF4444"))
                }
            }
        }.start()
    }
}
