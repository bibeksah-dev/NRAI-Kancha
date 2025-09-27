/**
 * Session Service
 * Manages user sessions with TTL-based cleanup
 */

import { v4 as uuidv4 } from 'uuid';

export class SessionService {
    constructor() {
        this.sessions = new Map();
        this.sessionTTL = parseInt(process.env.SESSION_TTL) || 86400000; // 24 hours default
        this.cleanupInterval = 3600000; // 1 hour
        
        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Get or create a session
     * @param {string} sessionId - Optional existing session ID
     * @returns {Object} Session object
     */
    getOrCreateSession(sessionId = null) {
        // Validate and get existing session
        if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            session.lastActivity = Date.now();
            return session;
        }

        // Create new session
        const newSessionId = sessionId || uuidv4();
        const session = {
            sessionId: newSessionId,
            threadId: null,
            created: Date.now(),
            lastActivity: Date.now(),
            conversationHistory: [],
            userPreferences: {
                preferredLanguage: 'auto',
                voiceGender: 'female',
                audioQuality: 'standard'
            }
        };

        this.sessions.set(newSessionId, session);
        console.log(`[SESSION] Created new session: ${newSessionId}`);
        
        return session;
    }

    /**
     * Get an existing session
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session object or null
     */
    getSession(sessionId) {
        if (!sessionId || !this.sessions.has(sessionId)) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        
        // Check if session is expired
        if (this.isSessionExpired(session)) {
            this.deleteSession(sessionId);
            return null;
        }

        session.lastActivity = Date.now();
        return session;
    }

    /**
     * Update session data
     * @param {string} sessionId - Session ID
     * @param {Object} updates - Updates to apply
     */
    updateSession(sessionId, updates) {
        const session = this.getSession(sessionId);
        if (!session) {
            console.log(`[SESSION] Cannot update non-existent session: ${sessionId}`);
            return false;
        }

        Object.assign(session, updates);
        session.lastActivity = Date.now();
        return true;
    }

    /**
     * Delete a session
     * @param {string} sessionId - Session ID
     */
    deleteSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            console.log(`[SESSION] Deleted session: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * Check if a session is expired
     * @param {Object} session - Session object
     * @returns {boolean} True if expired
     */
    isSessionExpired(session) {
        return Date.now() - session.lastActivity > this.sessionTTL;
    }

    /**
     * Get active session count
     * @returns {number} Number of active sessions
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }

    /**
     * Get all active sessions (for monitoring)
     * @returns {Array} Array of session summaries
     */
    getActiveSessions() {
        const summaries = [];
        
        this.sessions.forEach(session => {
            if (!this.isSessionExpired(session)) {
                summaries.push({
                    sessionId: session.sessionId,
                    created: new Date(session.created).toISOString(),
                    lastActivity: new Date(session.lastActivity).toISOString(),
                    messageCount: session.conversationHistory.length,
                    language: session.userPreferences.preferredLanguage
                });
            }
        });
        
        return summaries;
    }

    /**
     * Start cleanup timer for expired sessions
     */
    startCleanupTimer() {
        this.cleanupTimerId = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
        
        console.log('[SESSION] Cleanup timer started');
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupTimerId) {
            clearInterval(this.cleanupTimerId);
            this.cleanupTimerId = null;
            console.log('[SESSION] Cleanup timer stopped');
        }
    }

    /**
     * Clean up expired sessions
     */
    cleanup() {
        const startSize = this.sessions.size;
        let cleaned = 0;

        this.sessions.forEach((session, sessionId) => {
            if (this.isSessionExpired(session)) {
                this.sessions.delete(sessionId);
                cleaned++;
            }
        });

        if (cleaned > 0) {
            console.log(`[SESSION] Cleaned up ${cleaned} expired sessions. Active: ${this.sessions.size}`);
        }
    }

    /**
     * Clear all sessions (for testing or reset)
     */
    clearAllSessions() {
        const count = this.sessions.size;
        this.sessions.clear();
        console.log(`[SESSION] Cleared all ${count} sessions`);
        return count;
    }

    /**
     * Export session data (for backup or analysis)
     * @param {string} sessionId - Session ID
     * @returns {Object} Session data for export
     */
    exportSession(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            return null;
        }

        return {
            ...session,
            exported: new Date().toISOString(),
            ttlRemaining: this.sessionTTL - (Date.now() - session.lastActivity)
        };
    }

    /**
     * Get session statistics
     * @returns {Object} Statistics about sessions
     */
    getStatistics() {
        const sessions = Array.from(this.sessions.values());
        const now = Date.now();

        const stats = {
            total: sessions.length,
            active: 0,
            expired: 0,
            totalMessages: 0,
            averageMessagesPerSession: 0,
            languageDistribution: {
                'en-US': 0,
                'ne-NP': 0,
                'auto': 0
            },
            oldestSession: null,
            newestSession: null
        };

        sessions.forEach(session => {
            if (this.isSessionExpired(session)) {
                stats.expired++;
            } else {
                stats.active++;
                stats.totalMessages += session.conversationHistory.length;
                
                const lang = session.userPreferences.preferredLanguage;
                if (stats.languageDistribution[lang] !== undefined) {
                    stats.languageDistribution[lang]++;
                }

                if (!stats.oldestSession || session.created < stats.oldestSession) {
                    stats.oldestSession = session.created;
                }
                
                if (!stats.newestSession || session.created > stats.newestSession) {
                    stats.newestSession = session.created;
                }
            }
        });

        if (stats.active > 0) {
            stats.averageMessagesPerSession = Math.round(stats.totalMessages / stats.active);
        }

        if (stats.oldestSession) {
            stats.oldestSession = new Date(stats.oldestSession).toISOString();
        }
        
        if (stats.newestSession) {
            stats.newestSession = new Date(stats.newestSession).toISOString();
        }

        return stats;
    }
}

export default SessionService;