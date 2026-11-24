package com.locker.agent.service

/**
 * DEPRECATED: Firebase Cloud Messaging a été intégralement éliminé du projet LockER.
 * La réception des ordres LOCK/UNLOCK est gérée par la liaison WebSocket Cloud native
 * dans LockerPersistentService (100% Hors Firebase).
 */
class LockerFirebaseMessagingService {
    // Obsolete - All push messaging is handled directly via Native WebSocket
}
