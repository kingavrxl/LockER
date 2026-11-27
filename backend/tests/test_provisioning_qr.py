import base64
import hashlib
import io
import json
import unittest
from PIL import Image
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.provisioning_qr import (
    DEVICE_ADMIN_COMPONENT_NAME,
    find_apk_path,
)


class ProvisioningQRTests(unittest.IsolatedAsyncioTestCase):
    async def test_provisioning_payload_contains_android_enterprise_7tap_fields(self):
        """Vérifie que le payload de provisioning contient toutes les clés Android Enterprise 7-tap et le checksum SHA-256 exact."""
        apk_path = find_apk_path()
        self.assertIsNotNone(apk_path, "app-release.apk doit exister pour les tests de provisioning")

        with open(apk_path, "rb") as fh:
            expected_checksum = (
                base64.urlsafe_b64encode(hashlib.sha256(fh.read()).digest())
                .decode("ascii")
                .rstrip("=")
            )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="https://locker-2nuk.onrender.com") as ac:
            res = await ac.get(
                "/api/v1/provisioning/payload",
                params={"wifi_ssid": "LockER_Office", "wifi_password": "secret123", "wifi_security": "WPA"},
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()

            self.assertEqual(data["apk_checksum_sha256_b64url"], expected_checksum)
            payload = data["payload"]
            self.assertEqual(
                payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME"],
                DEVICE_ADMIN_COMPONENT_NAME,
            )
            self.assertEqual(
                payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION"],
                "https://locker-2nuk.onrender.com/download/app-release.apk",
            )
            self.assertEqual(
                payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"],
                expected_checksum,
            )
            self.assertNotIn("=", payload["android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM"])
            self.assertIs(payload["android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED"], True)
            self.assertIs(payload["android.app.extra.PROVISIONING_USE_MOBILE_DATA"], True)
            self.assertEqual(payload["android.app.extra.PROVISIONING_WIFI_SSID"], "LockER_Office")
            self.assertEqual(payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"], "WPA")
            self.assertEqual(payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"], "secret123")
            self.assertEqual(
                payload["android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE"]["server_url"],
                "https://locker-2nuk.onrender.com",
            )

            parsed = json.loads(data["payload_json"])
            self.assertEqual(parsed, payload)

    async def test_provisioning_qr_png_returns_valid_png(self):
        """Vérifie que /api/v1/provisioning/qr.png génère une image PNG valide."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="https://locker-2nuk.onrender.com") as ac:
            res = await ac.get("/api/v1/provisioning/qr.png")
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.headers["content-type"].startswith("image/png"))
            img = Image.open(io.BytesIO(res.content))
            self.assertEqual(img.format, "PNG")
            self.assertGreater(img.width, 200)
            self.assertGreater(img.height, 200)

            head_qr = await ac.head("/api/v1/provisioning/qr.png")
            self.assertEqual(head_qr.status_code, 200)

            head_apk = await ac.head("/download/app-release.apk")
            self.assertEqual(head_apk.status_code, 200)
            self.assertEqual(head_apk.headers.get("content-type"), "application/vnd.android.package-archive")

    async def test_provisioning_rejects_invalid_server_url(self):
        """Vérifie qu'une URL invalide est rejetée avec HTTP 400."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="https://locker-2nuk.onrender.com") as ac:
            res = await ac.get("/api/v1/provisioning/payload", params={"server_url": "ftp://evil.example"})
            self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
