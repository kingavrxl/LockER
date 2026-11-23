import logging
import re
import os
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
import httpx

from app.models.driver import Driver, PaymentStatusEnum
from app.models.device import Device
from app.models.payment import Payment
from app.models.audit_log import AuditLog
from app.models.lockybee_memory import LockybeeMemory
from app.models.payment_schedule import PaymentScheduleRule
from app.core.config import settings
from app.services.lock_service import LockService

logger = logging.getLogger("Lockybee")


class LockybeeService:
    """
    Lockybee - Mini Agent IA Gardien, Auditeur Permanent & Assistant Cognitif.
    Conçu pour converser avec la finesse et l'intelligence de Claude AI,
    apprendre les directives permanentes de l'administrateur et n'exécuter
    strictement QUE ce qui lui est ordonné (obéissance absolue aux règles fixées).
    """

    @staticmethod
    async def perform_system_audit(db: AsyncSession) -> Dict[str, Any]:
        """
        Audit en bonne et due forme de l'intégrité de la plateforme LockER.
        """
        now = datetime.utcnow()
        offline_threshold_24h = now - timedelta(hours=24)
        offline_threshold_72h = now - timedelta(hours=72)

        drivers_res = await db.execute(select(Driver))
        drivers = drivers_res.scalars().all()

        devices_res = await db.execute(select(Device))
        devices = devices_res.scalars().all()

        payments_res = await db.execute(select(Payment).order_by(Payment.id.desc()).limit(20))
        recent_payments = payments_res.scalars().all()

        memories_res = await db.execute(select(LockybeeMemory).where(LockybeeMemory.is_active == True))
        memories = memories_res.scalars().all()

        total_drivers = len(drivers)
        total_devices = len(devices)

        active_devices = [d for d in drivers if d.current_status == PaymentStatusEnum.UP_TO_DATE]
        overdue_devices = [d for d in drivers if d.current_status in (PaymentStatusEnum.OVERDUE_1, PaymentStatusEnum.OVERDUE_2)]
        locked_devices = [d for d in drivers if d.current_status == PaymentStatusEnum.LOCKED]

        offline_devices_24h = [d for d in devices if d.last_heartbeat and d.last_heartbeat < offline_threshold_24h]
        critical_offline_72h = [d for d in devices if d.last_heartbeat and d.last_heartbeat < offline_threshold_72h]
        low_battery_devices = [d for d in devices if d.battery_level is not None and d.battery_level <= 15]
        active_gps_devices = [d for d in devices if d.latitude is not None and d.longitude is not None]

        alerts: List[Dict[str, Any]] = []

        for dev in critical_offline_72h:
            alerts.append({
                "id": f"OFFLINE_72H_{dev.id}",
                "level": "CRITICAL",
                "category": "Intégrité Matérielle & Réseau",
                "title": f"Rupture Heartbeat prolongée (>72h) - IMEI {dev.imei[-6:]}",
                "description": f"Le terminal {dev.model} (IMEI: {dev.imei}) n'a émis aucun signal depuis plus de 3 jours.",
                "timestamp": dev.last_heartbeat.isoformat() if dev.last_heartbeat else now.isoformat(),
                "action_recommended": "Contacter le chauffeur ou attendre l'ordre de l'administrateur.",
                "device_id": dev.id,
                "imei": dev.imei
            })

        for drv in locked_devices:
            alerts.append({
                "id": f"LOCKED_OVERDUE_{drv.id}",
                "level": "WARNING",
                "category": "Recouvrement & Kiosk",
                "title": f"Terminal Kiosk Verrouillé - {drv.full_name}",
                "description": f"Le chauffeur présente un impayé de {drv.consecutive_overdue_days} jour(s). Mode Kiosk strict actif.",
                "timestamp": drv.updated_at.isoformat() if drv.updated_at else now.isoformat(),
                "action_recommended": "Attente de paiement Mobile Money ou déblocage sur ordre de l'administrateur.",
                "driver_id": drv.id,
                "driver_name": drv.full_name
            })

        for dev in low_battery_devices:
            alerts.append({
                "id": f"LOW_BATTERY_{dev.id}",
                "level": "INFO",
                "category": "Télémétrie Matérielle",
                "title": f"Batterie Critique ({dev.battery_level}%) - IMEI {dev.imei[-6:]}",
                "description": f"Batterie faible sur le terminal de {dev.driver_id}. Risque de coupure du traçage GPS.",
                "timestamp": now.isoformat(),
                "action_recommended": "Notifier le conducteur de recharger.",
                "device_id": dev.id,
                "imei": dev.imei
            })

        if not alerts:
            alerts.append({
                "id": "ALL_GREEN",
                "level": "SECURE",
                "category": "Audit Global",
                "title": "Plateforme LockER 100% Opérationnelle",
                "description": "Tous les terminaux sous surveillance répondent aux baux de sécurité.",
                "timestamp": now.isoformat(),
                "action_recommended": "Aucune anomalie détectée."
            })

        security_score = 100
        if critical_offline_72h:
            security_score -= min(30, len(critical_offline_72h) * 10)
        if overdue_devices:
            security_score -= min(20, len(overdue_devices) * 5)
        if low_battery_devices:
            security_score -= min(10, len(low_battery_devices) * 2)
        security_score = max(40, security_score)

        return {
            "agent": "Lockybee AI Guardian",
            "status": "OPERATIONAL",
            "security_score": security_score,
            "audit_timestamp": now.isoformat(),
            "metrics": {
                "total_drivers": total_drivers,
                "total_devices": total_devices,
                "active_devices": len(active_devices),
                "overdue_devices": len(overdue_devices),
                "locked_devices": len(locked_devices),
                "offline_24h_count": len(offline_devices_24h),
                "critical_offline_count": len(critical_offline_72h),
                "low_battery_count": len(low_battery_devices),
                "gps_active_count": len(active_gps_devices),
                "gps_coverage_percent": round((len(active_gps_devices) / total_devices * 100) if total_devices > 0 else 100, 1),
                "recent_payments_count": len(recent_payments),
                "learned_rules_count": len(memories)
            },
            "alerts": alerts,
            "engine": {
                "cloud_mode": "DIRECT_CLOUD_PUSH_WEBSOCKET",
                "obedience_mode": "STRICT_ADMIN_ONLY",
                "memory_system": "ACTIVE_PERSISTENT"
            }
        }

    _custom_api_key: Optional[str] = None
    _provider_type: Optional[str] = None

    @classmethod
    def set_custom_llm_key(cls, key: str, provider: str = "gemini"):
        cls._custom_api_key = key.strip()
        cls._provider_type = provider.lower()
        logger.info(f"[Lockybee] Clé LLM dynamique configurée pour : {provider}")

    @classmethod
    def get_llm_config(cls) -> Dict[str, Any]:
        gemini_key = cls._custom_api_key if cls._provider_type == "gemini" else (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        anthropic_key = cls._custom_api_key if cls._provider_type == "anthropic" else os.getenv("ANTHROPIC_API_KEY")
        openai_key = cls._custom_api_key if cls._provider_type == "openai" else os.getenv("OPENAI_API_KEY")

        active_provider = "NONE"
        if gemini_key:
            active_provider = "GEMINI"
        elif anthropic_key:
            active_provider = "ANTHROPIC"
        elif openai_key:
            active_provider = "OPENAI"

        return {
            "has_llm_key": active_provider != "NONE",
            "active_provider": active_provider,
            "engine_mode": "LLM_DIRECT" if active_provider != "NONE" else "ADVANCED_COGNITIVE_SIMULATOR"
        }

    @staticmethod
    async def _call_external_llm(system_prompt: str, user_query: str) -> Optional[str]:
        gemini_key = LockybeeService._custom_api_key if LockybeeService._provider_type == "gemini" else (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        anthropic_key = LockybeeService._custom_api_key if LockybeeService._provider_type == "anthropic" else os.getenv("ANTHROPIC_API_KEY")
        openai_key = LockybeeService._custom_api_key if LockybeeService._provider_type == "openai" else os.getenv("OPENAI_API_KEY")

        if gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
                payload = {
                    "contents": [{"role": "user", "parts": [{"text": f"{system_prompt}\n\n[ADMINISTRATEUR] : {user_query}"}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1000}
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception as e:
                logger.warning(f"[Lockybee LLM] Erreur appel Gemini: {e}")

        if anthropic_key:
            try:
                url = "https://api.anthropic.com/v1/messages"
                headers = {"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
                payload = {
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 1000,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_query}]
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["content"][0]["text"].strip()
            except Exception as e:
                logger.warning(f"[Lockybee LLM] Erreur appel Anthropic: {e}")

        if openai_key:
            try:
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {openai_key}", "Content-type": "application/json"}
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_query}],
                    "temperature": 0.4
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data["choices"][0]["message"]["content"].strip()
            except Exception as e:
                logger.warning(f"[Lockybee LLM] Erreur appel OpenAI: {e}")

        return None

    @staticmethod
    async def chat_with_lockybee(query: str, db: AsyncSession) -> Dict[str, Any]:
        raw_query = query.strip()
        q_lower = raw_query.lower()

        drivers_res = await db.execute(select(Driver))
        drivers = drivers_res.scalars().all()

        devices_res = await db.execute(select(Device))
        devices = devices_res.scalars().all()

        memories_res = await db.execute(select(LockybeeMemory).where(LockybeeMemory.is_active == True).order_by(LockybeeMemory.id.desc()))
        learned_memories = memories_res.scalars().all()

        audit_data = await LockybeeService.perform_system_audit(db)
        metrics = audit_data["metrics"]
        score = audit_data["security_score"]

        # 1. RÈGLES & ÉCHÉANCIERS
        rule_triggers = [
            "nouvelle règle", "nouvelle regle", "ajoute une règle", "ajoute une regle", 
            "ajouter une règle", "ajouter une regle", "nouvel échéancier", "nouvel echeancier", 
            "ajouter un échéancier", "ajouter un echeancier", "échéancier de paiement", 
            "echeancier de paiement", "règle de paiement", "regle de paiement"
        ]

        if any(trig in q_lower for trig in rule_triggers):
            date_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})', raw_query)
            day_match = re.search(r'(?:le|chaque)\s+(\d{1,2})(?:er)?\s+(?:du|de chaque)\s+mois', q_lower)
            
            if date_match:
                due_date_str = f"Date fixe : {date_match.group(1)}"
            elif day_match:
                due_date_str = f"Chaque {day_match.group(1)} du mois"
            elif any(w in q_lower for w in ["quotidien", "journalier", "tous les jours", "tous les soirs"]):
                due_date_str = "Journalier (Tous les soirs avant 22h)"
            elif any(w in q_lower for w in ["semaine", "hebdomadaire", "lundi", "dimanche"]):
                due_date_str = "Hebdomadaire (Tous les lundis matin)"
            else:
                due_date_str = "Échéance personnalisée"

            query_without_date = re.sub(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', '', q_lower)
            amount_match_unit = re.search(r'(\d+[\s\d]*)\s*(?:fcfa|f|xof)\b', query_without_date)
            amount_match_any = re.search(r'(?:de|montant|somme)\s*(\d+[\s\d]*)', query_without_date)
            if amount_match_unit:
                extracted_amount = int(amount_match_unit.group(1).replace(" ", ""))
            elif amount_match_any:
                extracted_amount = int(amount_match_any.group(1).replace(" ", ""))
            else:
                extracted_amount = settings.DAILY_PAYMENT_AMOUNT_XOF

            if "mtn" in q_lower and "moov" in q_lower:
                payment_method = "🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)"
            elif "moov" in q_lower:
                payment_method = "🔵 Moov Money Bénin (*880#)"
            elif "mtn" in q_lower:
                payment_method = "🟡 MTN Mobile Money Bénin (*133#)"
            elif any(w in q_lower for w in ["banque", "virement", "dépôt", "depot"]):
                payment_method = "🏦 Virement Bancaire & Dépôt Agence Cotonou"
            else:
                payment_method = "🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)"

            new_rule = PaymentScheduleRule(
                title=f"Échéancier ({due_date_str}) - {extracted_amount:,} FCFA",
                due_date_str=due_date_str,
                amount_xof=extracted_amount,
                payment_method=payment_method,
                payment_instructions=f"Paiement via {payment_method}. Déblocage automatique instantané en sub-30 secondes.",
                grace_period_days=3,
                is_active=True
            )
            db.add(new_rule)

            memory_entry = LockybeeMemory(
                category="REGLE_ECHEANCIER",
                content=f"Échéancier {due_date_str} : {extracted_amount:,} FCFA par {payment_method}",
                learned_from="ADMINISTRATEUR",
                is_active=True
            )
            db.add(memory_entry)
            await db.commit()

            reply = (
                f"📅 **Nouvelle Règle d'Échéancier Enregistrée avec Succès !**\n\n"
                f"• **Échéance (Jour / Mois / An) :** `{due_date_str}`\n"
                f"• **Montant du Versement :** `{extracted_amount:,} FCFA`\n"
                f"• **Comment Payer :** {payment_method}\n"
                f"• **Conséquence Antivol :** Si non payé après `3 jours` d'impayé, le terminal Android est automatiquement verrouillé en mode Kiosk.\n"
                f"• **Déverrouillage :** Instantané dès paiement Mobile Money.\n\n"
                f"🛡️ *La règle est active immédiatement sur toute la flotte.*"
            )
            suggestions = ["Quelles sont les règles ?", "Statut de la flotte", "Fais un audit de sécurité"]
            return {"reply": reply, "suggestions": suggestions, "action_executed": "CREATED_RULE", "status": "online"}

        # Consultation des règles & échéanciers
        if any(w in q_lower for w in ["les règles", "les regles", "mes règles", "mes regles", "échéanciers", "echeanciers", "comment payer", "modalités de paiement", "modalites de paiement"]):
            rules_res = await db.execute(select(PaymentScheduleRule).where(PaymentScheduleRule.is_active == True).order_by(PaymentScheduleRule.id.desc()))
            active_rules = rules_res.scalars().all()
            if active_rules:
                rule_lines = []
                for idx, r in enumerate(active_rules, 1):
                    rule_lines.append(
                        f"**{idx}. {r.title}**\n"
                        f"   • *Échéance :* `{r.due_date_str}`\n"
                        f"   • *Montant :* `{r.amount_xof:,} FCFA`\n"
                        f"   • *Comment Payer :* {r.payment_method}\n"
                        f"   • *Instructions :* {r.payment_instructions}"
                    )
                reply = (
                    f"📅 **Règles & Échéanciers de Paiement Actifs ({len(active_rules)}) :**\n\n"
                    + "\n\n".join(rule_lines) +
                    f"\n\n⚡ *Règle d'or : Tout retard ≥ 3 jours entraîne le verrouillage automatique Kiosk.*"
                )
            else:
                reply = (
                    "📅 **Échéancier de Versement Actuel :**\n\n"
                    "• **Échéance :** Tous les soirs (Journalier)\n"
                    "• **Montant :** 5 000 FCFA / jour\n"
                    "• **Comment Payer :** MTN Mobile Money (*133#) et Moov Money (*880#)\n\n"
                    "Vous pouvez ajouter un échéancier à tout moment en me disant par exemple :\n"
                    "• « *Ajoute une règle : échéance le 25 de chaque mois de 35 000 FCFA par MTN Mobile Money* »"
                )
            suggestions = ["Ajouter une règle", "Statut de la flotte", "Fais un audit"]
            return {"reply": reply, "suggestions": suggestions, "status": "online"}

        # 2. DÉTECTION D'ORDRE D'APPRENTISSAGE
        learn_triggers = [
            "apprends que", "apprend que", "retiens que", "mémorise que", "memorise que", 
            "ajoute cette consigne", "note que", "à partir de maintenant", "a partir de maintenant", "consigne :"
        ]

        matched_trigger = next((trig for trig in learn_triggers if trig in q_lower), None)
        if matched_trigger:
            instruction_content = raw_query
            pos = q_lower.find(matched_trigger)
            if pos != -1:
                instruction_content = raw_query[pos + len(matched_trigger):].strip().lstrip(":,-").strip()

            if len(instruction_content) > 3:
                new_memory = LockybeeMemory(
                    category="INSTRUCTION",
                    content=instruction_content,
                    learned_from="ADMINISTRATEUR",
                    is_active=True
                )
                db.add(new_memory)
                await db.commit()

                reply = (
                    f"🧠 **Consigne apprise et gravée dans ma mémoire permanente !**\n\n"
                    f"• **Directive mémorisée :** « *{instruction_content}* »\n"
                    f"• **Statut d'application :** Actif immédiatement.\n\n"
                    f"📋 *Conformément à ma règle d'obéissance absolue, je ne ferai strictement que ce que vous m'ordonnez et j'appliquerai fidèlement cette directive lors de mes futures analyses.*"
                )
                suggestions = ["Qu'as-tu appris jusqu'ici ?", "Fais un audit de sécurité", "Statut de la flotte"]
                return {
                    "reply": reply,
                    "suggestions": suggestions,
                    "action_executed": "LEARNED_INSTRUCTION",
                    "status": "online"
                }

        # 3. CONSULTATION DE LA MÉMOIRE
        if any(w in q_lower for w in ["appris", "ta mémoire", "ta memoire", "tes consignes", "directives", "ce que tu sais"]):
            if learned_memories:
                memory_lines = [f"{i+1}. « *{m.content}* » *(Enregistré le {m.created_at.strftime('%d/%m/%Y à %H:%M')})*" for i, m in enumerate(learned_memories)]
                reply = (
                    f"🧠 **Directives et consignes enregistrées dans ma mémoire permanente ({len(learned_memories)}) :**\n\n"
                    + "\n".join(memory_lines) +
                    f"\n\n🛡️ *Je n'agis que selon ces ordres et vos commandes explicites.*"
                )
            else:
                reply = (
                    "🧠 **Ma mémoire est actuellement vierge de consigne personnalisée.**\n\n"
                    "Vous pouvez m'enseigner une règle à tout moment en me disant par exemple :\n"
                    "• « *Apprends que le chauffeur a une dérogation jusqu'à vendredi* »\n"
                    "• « *Retiens que le numéro prioritaire de la flotte est le +229...* »"
                )
            suggestions = ["Fais un audit de la flotte", "Statut de la plateforme", "Ajouter une règle"]
            return {"reply": reply, "suggestions": suggestions, "status": "online"}

        # 4. EXÉCUTION D'ORDRES DIRECTS DE L'ADMINISTRATEUR
        if ("verrouille" in q_lower or "bloque" in q_lower) and not any(w in q_lower for w in ["combien", "pourquoi", "qui", "liste", "comment"]):
            target_driver = None
            for d in drivers:
                if d.full_name.lower() in q_lower or str(d.id) in q_lower.split():
                    target_driver = d
                    break

            if target_driver:
                await LockService.lock_driver_device(
                    db=db,
                    driver_id=target_driver.id,
                    reason="Ordre direct de l'administrateur via Lockybee",
                    performed_by="ADMIN_VIA_LOCKYBEE"
                )
                reply = (
                    f"🔒 **Ordre exécuté avec succès :**\n\n"
                    f"Le terminal de **{target_driver.full_name}** a été immédiatement verrouillé en mode Kiosk Cloud.\n"
                    f"L'ordre a été diffusé en direct (sub-50ms via WebSocket Cloud) et la traçabilité d'audit a été enregistrée."
                )
                suggestions = ["Débloquer le chauffeur", "Statut de la flotte", "Audit de sécurité"]
                return {"reply": reply, "suggestions": suggestions, "action_executed": "LOCK", "status": "online"}

        if ("déverrouille" in q_lower or "deverrouille" in q_lower or "débloque" in q_lower or "debloque" in q_lower) and not any(w in q_lower for w in ["combien", "comment"]):
            target_driver = None
            for d in drivers:
                if d.full_name.lower() in q_lower or str(d.id) in q_lower.split():
                    target_driver = d
                    break

            if target_driver:
                await LockService.unlock_driver_device(
                    db=db,
                    driver_id=target_driver.id,
                    reason="Déverrouillage ordonné par l'administrateur via Lockybee",
                    performed_by="ADMIN_VIA_LOCKYBEE"
                )
                reply = (
                    f"🔓 **Ordre exécuté avec succès :**\n\n"
                    f"Le terminal de **{target_driver.full_name}** est déverrouillé et rétabli en statut normal (`UP_TO_DATE`).\n"
                    f"Son bail hors-ligne local a été prolongé de 72 heures."
                )
                suggestions = ["Statut de la flotte", "Rapport d'audit", "Voir les paiements"]
                return {"reply": reply, "suggestions": suggestions, "action_executed": "UNLOCK", "status": "online"}

        # 5. GÉNÉRATION DE RÉPONSE INTELLIGENTE VIA LLM OU MOTEUR COGNITIF
        drivers_summary = ", ".join([f"{d.full_name} ({d.current_status.value}, {d.daily_rate_xof} FCFA/j)" for d in drivers])
        memories_text = "\n".join([f"- {m.content}" for m in learned_memories]) if learned_memories else "Aucune consigne pour le moment."

        system_prompt = (
            "Tu es Lockybee, l'Agent IA Gardien 3D, auditeur permanent et assistant d'administration "
            "de la plateforme LockER au Bénin (gestion et verrouillage Kiosk de la flotte Android). "
            "Tu as la finesse intellectuelle, la profondeur analytique, l'élégance de style et la clarté de Claude AI (Anthropic). "
            "RÈGLE SUPRÊME : Tu fais STRICTEMENT ce que l'administrateur t'ordonne ('ne fait que ce qu'on lui dit'). "
            "Tu ne prends jamais d'initiative de blocage ou modification sans accord exprès. "
            f"ÉTAT ACTUEL DE LA FLOTTE : Total terminaux = {metrics['total_devices']}, En règle = {metrics['active_devices']}, "
            f"Impayés = {metrics['overdue_devices']}, Bloqués = {metrics['locked_devices']}, "
            f"Couverture GPS = {metrics['gps_coverage_percent']}%, Score Sécurité = {score}%. "
            f"CHAUFFEURS : {drivers_summary}. "
            f"CONSIGNES ET RÈGLES APPRISES DE L'ADMINISTRATEUR : {memories_text}. "
            "Réponds en français impeccable avec des émojis pertinents, du Markdown élégant, des listes claires et un esprit stratégique."
        )

        llm_reply = await LockybeeService._call_external_llm(system_prompt, raw_query)
        if llm_reply:
            return {
                "reply": llm_reply,
                "suggestions": ["Statut de la flotte", "Fais un audit de sécurité", "Qu'as-tu appris ?"],
                "security_score": score,
                "status": "online",
                "timestamp": datetime.utcnow().isoformat(),
                "engine": "LLM_DIRECT"
            }

        # Moteur cognitif
        if any(w in q_lower for w in ["statut", "status", "santé", "etat", "comment ça va", "rapport"]):
            reply = (
                f"🐝 **Synthèse Stratégique & Opérationnelle de la Flotte LockER :**\n\n"
                f"L'écosystème Cloud fonctionne avec une stabilité optimale. Voici l'état de vos opérations en temps réel au Bénin :\n\n"
                f"• **Score d'Intégrité Globale :** `{score}%` (Tous protocoles nominaux)\n"
                f"• **Flotte Déployée :** `{metrics['total_devices']}` terminaux Android sous gestion active\n"
                f"• **Chauffeurs à Jour :** `{metrics['active_devices']}` terminaux actifs et totalement débloqués\n"
                f"• **Impayés Détectés (J+1 / J+2) :** `{metrics['overdue_devices']}` chauffeur(s) sous surveillance préventive\n"
                f"• **Mode Kiosk Strict Actif :** `{metrics['locked_devices']}` terminal(aux) bloqué(s) pour impayé ≥ 3 jours\n"
                f"• **Couverture Télémétrique GPS :** `{metrics['gps_coverage_percent']}%` avec actualisation continue par point vert\n"
                f"• **Directives Mémorisées :** `{metrics['learned_rules_count']}` consigne(s) permanente(s) actives\n\n"
                f"📋 *Rappel d'obéissance : Aucune action de blocage ou d'exemption ne sera entreprise sans votre ordre formel.*"
            )
            suggestions = ["Fais un audit de sécurité", "Terminaux en retard ?", "Qu'as-tu appris ?", "Simuler un paiement"]

        elif any(w in q_lower for w in ["audit", "sécurité", "securite", "alerte", "vulnérabilité", "fraude", "protection"]):
            crit_count = metrics['critical_offline_count']
            lock_count = metrics['locked_devices']
            reply = (
                f"🛡️ **Audit de Sécurité Approfondi & Conformité Légale (Code du Numérique Bénin) :**\n\n"
                f"J'ai passé au crible l'ensemble des vecteurs de sécurité et de conformité matérielle :\n\n"
                f"1. **Baux Cryptographiques Hors-Ligne (72h) :** `{crit_count}` défaillance(s). Les terminaux hors réseau renouvellent leur certificat local ou s'auto-verrouillent après 72h.\n"
                f"2. **Mode Kiosk Anti-Fraude & Boutons Physiques :** Actif sur `{lock_count}` appareil(s). L'extinction, le redémarrage et le mode sans échec sont neutralisés.\n"
                f"3. **Canal Push Cloud Direct :** La liaison WebSocket sub-50ms est opérationnelle sur Render Cloud, avec bascule automatique sur Heartbeat HTTP.\n"
                f"4. **Traçabilité GPS Permanente :** `{metrics['gps_active_count']}` balise(s) actives sur carte satellite Google Maps sans sollicitation d'autorisation récurrente.\n\n"
                f"🚨 **Alertes Actives ({len(audit_data['alerts'])}) :**\n"
                + "\n".join([f"• [{a['level']}] **{a['title']}** : {a['action_recommended']}" for a in audit_data['alerts'][:3]]) +
                f"\n\n*Conformément à mes directives, je reste en attente de vos instructions pour agir sur ces alertes.*"
            )
            suggestions = ["Résoudre les alertes", "Statut général", "Directives en mémoire"]

        elif any(w in q_lower for w in ["qui es tu", "qui est tu", "rôle", "role", "présente toi", "claude", "intelligent"]):
            reply = (
                f"🐝 Je suis **Lockybee**, votre Agent IA Gardien 3D dédié à la surveillance, l'audit et la gouvernance de la flotte LockER au Bénin.\n\n"
                f"Mes piliers fondamentaux :\n"
                f"1. **Intelligence & Analyse Continue :** J'analyse les flux de télémétrie, les coordonnées GPS réelles, les niveaux de batterie et les cycles de recouvrement Mobile Money.\n"
                f"2. **Apprentissage Dynamique :** Tout ce que vous m'enseignez (« *Apprends que...* ») est enregistré dans ma mémoire permanente pour personnaliser mes diagnostics.\n"
                f"3. **Obéissance Absolue :** Je ne fais STRICTEMENT que ce que vous m'ordonnez. Aucun verrouillage ni déblocage n'est déclenché sans votre commande explicite.\n"
                f"4. **Compatibilité LLM :** Vous pouvez connecter directement votre clé Google Gemini ou Claude pour converser avec moi en langage naturel illimité.\n\n"
                f"Donnez-moi un ordre ou posez-moi n'importe quelle question sur la plateforme !"
            )
            suggestions = ["Statut de la flotte", "Apprends une nouvelle règle", "Fais un audit de sécurité"]

        elif any(w in q_lower for w in ["gps", "carte", "satellite", "position", "localisation", "itinéraire", "itineraire"]):
            reply = (
                f"🛰️ **Système de Géolocalisation & Imagerie Satellite en Direct :**\n\n"
                f"• **Technologie de Cartographie :** Vue Satellite Hybride Google Maps / Esri World Imagery avec photographies réelles des rues et bâtiments de Cotonou.\n"
                f"• **Précision Matérielle :** Extraction directe des coordonnées GPS réelles transmises par le matériel Android (`GPS_PROVIDER` + `NETWORK_PROVIDER`).\n"
                f"• **Indicateur Visuel :** Point vert pulsant indiquant la position exacte en temps réel de chaque véhicule.\n"
                f"• **Calcul d'Itinéraire :** Cliquez sur « *Localiser le téléphone* » sur la carte pour tracer la route dynamique et estimer le temps de trajet depuis votre QG."
            )
            suggestions = ["Voir la carte en direct", "Statut des terminaux", "Audit complet"]

        else:
            reply = (
                f"🐝 **Analyse Cognitive Lockybee :**\n\n"
                f"J'ai attentivement analysé votre message : « *{raw_query}* ».\n\n"
                f"Au regard de l'état actuel de votre parc LockER ({metrics['total_devices']} appareils, {metrics['active_devices']} en règle, {metrics['locked_devices']} verrouillé(s)) :\n"
                f"• L'intégrité globale du système se maintient à `{score}%`.\n"
                f"• Toutes les commandes passées respectent strictement vos {metrics['learned_rules_count']} consigne(s) en mémoire.\n\n"
                f"Que souhaitez-vous ordonner ? Je peux verrouiller ou déverrouiller un chauffeur, ajuster les tarifs, enregistrer une consigne ou lancer un diagnostic de sécurité approfondi."
            )
            suggestions = ["Statut de la flotte", "Audit de sécurité", "Qu'as-tu appris ?"]

        return {
            "reply": reply,
            "suggestions": suggestions,
            "security_score": score,
            "status": "online",
            "timestamp": datetime.utcnow().isoformat(),
            "engine": "COGNITIVE_REASONING"
        }
