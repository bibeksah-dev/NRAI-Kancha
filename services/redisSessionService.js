/**
 * Redis Session Service for Distributed Session Management
 * Enables horizontal scaling across multiple server instances
 */

import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

export class RedisSessionService {
    constructor() {
        this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.client = null;
        this.subscriber = null;
        this.publisher = null;
        this.connected = false;
        
        // Session configuration
        this.config = {
            ttl: parseInt(process.env.SESSION_TTL) || 86400, // 24 hours
            prefix: 'session:',
            threadPrefix: 'thread:',
            lockPrefix: 'lock:',
            metricsKey: 'metrics:sessions'
        };
        
        // Local cache for performance
        this.localCache = new Map();
        this.cacheSize = 100;
        
        this.initialize();
    }

    /**
     * Initialize Redis connections
     */
    async initialize() {
        try {
            // Main client for get/set operations
            this.client = createClient({ url: this.redisUrl });
            
            // Separate clients for pub/sub
            this.subscriber = createClient({ url: this.redisUrl });
            this.publisher = createClient({ url: this.redisUrl });
            
            // Error handlers
            this.client.on('error', err => console.error('Redis Client Error:', err));
            this.subscriber.on('error', err => console.error('Redis Subscriber Error:', err));
            this.publisher.on('error', err => console.error('Redis Publisher Error:', err));
            
            // Connect all clients
            await Promise.all([
                this.client.connect(),
                this.subscriber.connect(),
                this.publisher.connect()
            ]);
            
            this.connected = true;
            
            // Subscribe to session events
            await this.subscribeToEvents();
            
            // Start cleanup interval
            this.startCleanupInterval();
            
            console.log('✅ Redis Session Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Redis:', error);
            this.connected = false;
            
            // Fallback to in-memory if Redis fails
            console.log('⚠️ Falling back to in-memory session storage');
        }
    }

    /**
     * Subscribe to session events for cache invalidation
     */
    async subscribeToEvents() {
        if (!this.connected) return;
        
        await this.subscriber.subscribe('session:update', (message) => {
            const { sessionId } = JSON.parse(message);
            // Invalidate local cache
            this.localCache.delete(sessionId);
        });
        
        await this.subscriber.subscribe('session:delete', (message) => {
            const { sessionId } = JSON.parse(message);
            // Remove from local cache
            this.localCache.delete(sessionId);
        });
    }

    /**
     * Get or create session with distributed locking
     */
    async getSession(sessionId) {
        // Check local cache first
        if (this.localCache.has(sessionId)) {
            const cached = this.localCache.get(sessionId);
            if (cached.expires > Date.now()) {
                return cached.data;
            }
            this.localCache.delete(sessionId);
        }
        
        if (!this.connected) {
            return this.getSessionFallback(sessionId);
        }
        
        try {
            const key = `${this.config.prefix}${sessionId}`;
            const data = await this.client.get(key);
            
            if (data) {
                const session = JSON.parse(data);
                
                // Update local cache
                this.cacheSession(sessionId, session);
                
                // Update last activity
                await this.updateActivity(sessionId);
                
                return session;
            }
            
            // Create new session with distributed lock
            return await this.createSessionWithLock(sessionId);
            
        } catch (error) {
            console.error('Redis get session error:', error);
            return this.getSessionFallback(sessionId);
        }
    }

    /**
     * Create session with distributed lock to prevent race conditions
     */
    async createSessionWithLock(sessionId) {
        const lockKey = `${this.config.lockPrefix}${sessionId}`;
        const lockValue = uuidv4();
        
        try {
            // Try to acquire lock (SET NX with expiry)
            const acquired = await this.client.set(
                lockKey,
                lockValue,
                { NX: true, EX: 5 } // Lock expires in 5 seconds
            );
            
            if (!acquired) {
                // Another instance is creating the session
                await this.sleep(100); // Wait briefly
                return await this.getSession(sessionId); // Retry
            }
            
            // Create new session
            const session = {
                id: sessionId,
                threadId: await this.createThread(),
                createdAt: Date.now(),
                lastActivity: Date.now(),
                messages: [],
                preferences: {
                    language: 'auto',
                    voiceGender: 'female'
                },
                metrics: {
                    messageCount: 0,
                    voiceCount: 0,
                    averageResponseTime: 0
                }
            };
            
            // Save to Redis
            await this.saveSession(sessionId, session);
            
            // Release lock
            await this.releaseLock(lockKey, lockValue);
            
            return session;
            
        } catch (error) {
            console.error('Create session error:', error);
            
            // Try to release lock on error
            try {
                await this.releaseLock(lockKey, lockValue);
            } catch (e) {
                // Ignore unlock errors
            }
            
            throw error;
        }
    }

    /**
     * Save session to Redis
     */
    async saveSession(sessionId, session) {
        if (!this.connected) {
            return this.saveSessionFallback(sessionId, session);
        }
        
        try {
            const key = `${this.config.prefix}${sessionId}`;
            
            // Save with TTL
            await this.client.setex(
                key,
                this.config.ttl,
                JSON.stringify(session)
            );
            
            // Update local cache
            this.cacheSession(sessionId, session);
            
            // Publish update event for other instances
            await this.publisher.publish('session:update', JSON.stringify({ sessionId }));
            
            // Update metrics
            await this.updateMetrics('save');
            
        } catch (error) {
            console.error('Redis save session error:', error);
            return this.saveSessionFallback(sessionId, session);
        }
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updates) {
        const session = await this.getSession(sessionId);
        
        if (!session) {
            console.warn(`Session ${sessionId} not found`);
            return null;
        }
        
        // Merge updates
        const updatedSession = {
            ...session,
            ...updates,
            lastActivity: Date.now()
        };
        
        // Update metrics
        if (updates.lastMessage) {
            updatedSession.messages.push({
                message: updates.lastMessage,
                response: updates.lastResponse,
                timestamp: Date.now()
            });
            updatedSession.metrics.messageCount++;
        }
        
        if (updates.lastLanguage) {
            updatedSession.metrics.voiceCount++;
        }
        
        await this.saveSession(sessionId, updatedSession);
        
        return updatedSession;
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        if (!this.connected) {
            this.localCache.delete(sessionId);
            return;
        }
        
        try {
            const key = `${this.config.prefix}${sessionId}`;
            await this.client.del(key);
            
            // Remove from local cache
            this.localCache.delete(sessionId);
            
            // Publish delete event
            await this.publisher.publish('session:delete', JSON.stringify({ sessionId }));
            
            // Update metrics
            await this.updateMetrics('delete');
            
        } catch (error) {
            console.error('Redis delete session error:', error);
        }
    }

    /**
     * Get active session count across all instances
     */
    async getActiveSessionCount() {
        if (!this.connected) {
            return this.localCache.size;
        }
        
        try {
            // Use Redis SCAN to count sessions
            let cursor = 0;
            let count = 0;
            
            do {
                const result = await this.client.scan(
                    cursor,
                    { MATCH: `${this.config.prefix}*`, COUNT: 100 }
                );
                
                cursor = result.cursor;
                count += result.keys.length;
                
            } while (cursor !== 0);
            
            return count;
            
        } catch (error) {
            console.error('Redis count error:', error);
            return 0;
        }
    }

    /**
     * Clear expired sessions
     */
    async clearExpiredSessions() {
        if (!this.connected) {
            // Clear local cache
            const now = Date.now();
            for (const [key, value] of this.localCache.entries()) {
                if (value.expires < now) {
                    this.localCache.delete(key);
                }
            }
            return;
        }
        
        try {
            // Redis automatically expires keys with TTL
            // This method can be used for additional cleanup if needed
            
            const metrics = await this.getMetrics();
            console.log(`📊 Session metrics: ${JSON.stringify(metrics)}`);
            
        } catch (error) {
            console.error('Clear expired sessions error:', error);
        }
    }

    /**
     * Create thread ID (for Azure AI Foundry)
     */
    async createThread() {
        // Generate unique thread ID
        return `thread_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Update last activity timestamp
     */
    async updateActivity(sessionId) {
        if (!this.connected) return;
        
        try {
            const key = `${this.config.prefix}${sessionId}`;
            
            // Reset TTL
            await this.client.expire(key, this.config.ttl);
            
        } catch (error) {
            // Non-critical error, ignore
        }
    }

    /**
     * Release distributed lock
     */
    async releaseLock(lockKey, lockValue) {
        if (!this.connected) return;
        
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        
        await this.client.eval(script, {
            keys: [lockKey],
            arguments: [lockValue]
        });
    }

    /**
     * Cache session locally
     */
    cacheSession(sessionId, session) {
        // Limit cache size
        if (this.localCache.size >= this.cacheSize) {
            const firstKey = this.localCache.keys().next().value;
            this.localCache.delete(firstKey);
        }
        
        this.localCache.set(sessionId, {
            data: session,
            expires: Date.now() + 60000 // 1 minute local cache
        });
    }

    /**
     * Update metrics
     */
    async updateMetrics(operation) {
        if (!this.connected) return;
        
        try {
            const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const key = `${this.config.metricsKey}:${now}`;
            
            await this.client.hincrby(key, operation, 1);
            await this.client.expire(key, 86400 * 7); // Keep metrics for 7 days
            
        } catch (error) {
            // Non-critical error, ignore
        }
    }

    /**
     * Get metrics
     */
    async getMetrics() {
        if (!this.connected) {
            return {
                activeCount: this.localCache.size,
                redisConnected: false
            };
        }
        
        try {
            const activeCount = await this.getActiveSessionCount();
            const info = await this.client.info('memory');
            
            return {
                activeCount,
                redisConnected: true,
                memoryUsage: this.parseRedisInfo(info, 'used_memory_human'),
                connectedClients: this.parseRedisInfo(info, 'connected_clients')
            };
            
        } catch (error) {
            return {
                activeCount: 0,
                redisConnected: false,
                error: error.message
            };
        }
    }

    /**
     * Parse Redis INFO output
     */
    parseRedisInfo(info, key) {
        const regex = new RegExp(`${key}:(.+)`);
        const match = info.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Fallback methods for when Redis is unavailable
     */
    getSessionFallback(sessionId) {
        // In-memory fallback
        if (!this.localCache.has(sessionId)) {
            const session = {
                id: sessionId,
                threadId: `thread_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                messages: [],
                preferences: {
                    language: 'auto',
                    voiceGender: 'female'
                }
            };
            
            this.localCache.set(sessionId, {
                data: session,
                expires: Date.now() + this.config.ttl * 1000
            });
        }
        
        const cached = this.localCache.get(sessionId);
        return cached ? cached.data : null;
    }

    saveSessionFallback(sessionId, session) {
        this.localCache.set(sessionId, {
            data: session,
            expires: Date.now() + this.config.ttl * 1000
        });
    }

    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Start cleanup interval
     */
    startCleanupInterval() {
        // Clean expired sessions every hour
        setInterval(() => {
            this.clearExpiredSessions();
        }, 3600000);
    }

    /**
     * Graceful shutdown
     */
    async close() {
        if (this.connected) {
            await this.client.quit();
            await this.subscriber.quit();
            await this.publisher.quit();
        }
    }
}

// Export singleton instance
const redisSessionService = new RedisSessionService();
export default redisSessionService;
