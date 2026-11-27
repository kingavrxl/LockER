# LockER — Plateforme de Gestion & Verrouillage à Distance (Samsung Galaxy A34 5G)

Plateforme de gestion de flotte et de verrouillage à distance (Device Owner / MDM) pour 20 téléphones **Samsung Galaxy A34 5G** attribués en crédit-bail à des conducteurs au **Bénin**.

---

## 🎯 Règles Métier
- **Paiement journalier obligatoire** (ex: 5 000 FCFA/jour via Mobile Money MTN / Moov ou Stripe).
- **J+1 & J+2 d'impayé** : Notification d'avertissement push au conducteur.
- **J+3 d'impayé** : **Verrouillage strict immédiat** du téléphone à distance.
- **En mode verrouillé** :
  - L'écran passe en mode Kiosk permanent non-quittable (`LockTaskMode`).
  - Aucun appel entrant n'est autorisé.
  - Seuls sont autorisés :
    1. **Le bouton d'appel direct vers le support de flotte** (+229 01 91 52 15 18).
    2. **Le bouton d'appel d'urgence 112** (Obligation légale au Bénin et internationale).
  - Déverrouillage automatique et instantané dès confirmation du paiement (Webhook).
- **Sécurité hors-ligne (Anti-Contournement)** :
  - Bail cryptographique local de 72 heures. Si le téléphone est déconnecté du réseau pour tenter d'échapper au signal FCM, il se bloque automatiquement au bout de 72h.

---

## 🏗️ Structure du Projet

```
LockER/
├── android/               # Application Kotlin "AgentVerrouillage" (Device Owner)
│   ├── app/
│   │   ├── src/main/java/com/locker/agent/
│   │   │   ├── receiver/LockerDeviceAdminReceiver.kt  # Enrôlement MDM
│   │   │   ├── manager/LockerPolicyManager.kt         # Politiques DPM & Kiosk
│   │   │   ├── service/LockerFirebaseMessagingService.kt # Push FCM haute priorité
│   │   │   ├── ui/LockScreenActivity.kt               # Écran Kiosk infranchissable
│   │   │   └── worker/OfflineLeaseWorker.kt           # Watchdog hors-ligne 72h
├── backend/               # API FastAPI + PostgreSQL + FCM + Webhooks
│   ├── app/
│   │   ├── api/v1/endpoints/  # /drivers, /devices, /block, /unblock, /webhooks
│   │   ├── core/              # Config, DB async SQLAlchemy
│   │   ├── models/            # Tables Driver, Device, Payment, AuditLog
│   │   └── services/          # FCM Push & Moteur de verrouillage
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # Dashboard d'administration (React + Vite + Tailwind)
│   ├── src/App.tsx        # Vue temps réel des 20 conducteurs, statuts & actions
├── scripts/               # Outillage d'enrôlement
│   ├── enroll_adb.ps1     # Script d'enrôlement ADB (Windows)
│   ├── enroll_adb.sh      # Script d'enrôlement ADB (Linux/macOS)
│   └── generate_qr_provisioning.py # Générateur de QR Code Android Enterprise
└── docker-compose.yml     # Lancement simplifié de l'infrastructure
```

---

## 🚀 Démarrage Rapide

### 1. Lancement du Backend & Base de données
```bash
cd LockER
docker-compose up -d --build
```
L'API FastAPI est accessible sur : `http://localhost:8000/docs`

### 2. Lancement du Dashboard Web
```bash
cd LockER/frontend
npm install
npm run dev
```
Le tableau de bord est accessible sur : `http://localhost:3000`

---

## 📱 Enrôlement des Samsung Galaxy A34 5G

### Méthode 1 : Par QR Code Android Enterprise (Recommandé en production)
1. Allumer un téléphone neuf ou réinitialisé en sortie d'usine sur l'écran **"Bienvenue"**.
2. **Tapoter 7 fois rapidement** (6 à 7 fois selon le modèle) sur un espace vide de l'écran de bienvenue pour ouvrir le lecteur QR Android Enterprise.
3. Connecter le Wi-Fi (ou utiliser les données mobiles / Wi-Fi préconfiguré dans le QR) et scanner le QR Code affiché dans le Dashboard (**+ Ajouter un Téléphone**) ou généré par :
   ```bash
   python scripts/generate_qr_provisioning.py
   ```
4. Android télécharge `app-release.apk`, vérifie son empreinte SHA-256, active automatiquement LockER en `Device Owner` (`GET_PROVISIONING_MODE` / `ADMIN_POLICY_COMPLIANCE`) et enrôle le téléphone sur la plateforme Cloud.

### Méthode 2 : Par câble USB (ADB)
1. Activer le débogage USB sur le téléphone (sans compte Google configuré).
2. Brancher le téléphone à l'ordinateur.
3. Exécuter le script :
   ```powershell
   cd scripts
   .\enroll_adb.ps1
   ```

---

## ⚖️ Conformité Juridique au Bénin
- **Loi n°2017-20 portant Code du Numérique du Bénin** :
  - Déclaration du traitement des données auprès de l'**APDP** (Autorité de Protection des Données Personnelles).
  - Clause contractuelle de réserve de propriété et de verrouillage technique obligatoire dans le contrat de crédit du conducteur.
  - Journal d'audit conservé 12 mois dans la table `audit_logs`.
  - Maintien obligatoire de la ligne d'urgence (112).
