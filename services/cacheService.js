/**
 * Cache Service for NRAI Voice Assistant
 * Implements LRU caching for agent responses and language detection
 * Significantly improves response time for repeated queries
 */

import crypto from 'crypto';

export class CacheService {
    constructor() {
        // Simple in-memory cache with TTL
        this.responseCache = new Map();
        this.languageCache = new Map();
        this.transcriptCache = new Map();
        
        // Cache configuration
        this.config = {
            responseMaxSize: 100,
            responseTTL: 5 * 60 * 1000, // 5 minutes (restored to normal)
            languageMaxSize: 50,
            languageTTL: 2 * 60 * 1000, // 2 minutes
            transcriptMaxSize: 30,
            transcriptTTL: 1 * 60 * 1000 // 1 minute
        };
        
        // Start cleanup interval
        this.startCleanupInterval();
        
        console.log('✅ Cache Service initialized');
    }

    /**
     * Generate cache key from input
     */
    generateKey(input, type = '') {
        const hash = crypto.createHash('md5').update(input).digest('hex');
        return `${type}:${hash}`;
    }

    /**
     * Get agent response from cache
     */
    getResponse(message, sessionId) {
        const key = this.generateKey(`${message}:${sessionId}`, 'response');
        const cached = this.responseCache.get(key);
        
        if (cached && cached.expires > Date.now()) {
            console.log('📦 Cache hit for response');
            return cached.data;
        }
        
        return null;
    }

    /**
     * Cache agent response
     */
    setResponse(message, sessionId, response) {
        const key = this.generateKey(`${message}:${sessionId}`, 'response');
        
        // Implement LRU by removing oldest if at max size
        if (this.responseCache.size >= this.config.responseMaxSize) {
            const firstKey = this.responseCache.keys().next().value;
            this.responseCache.delete(firstKey);
        }
        
        this.responseCache.set(key, {
            data: response,
            expires: Date.now() + this.config.responseTTL
        });
        
        console.log(`📦 Cached response (${this.responseCache.size}/${this.config.responseMaxSize})`);
    }

    /**
     * Get language detection from cache
     */
    getLanguage(audioHash) {
        const key = this.generateKey(audioHash, 'lang');
        const cached = this.languageCache.get(key);
        
        if (cached && cached.expires > Date.now()) {
            console.log('📦 Cache hit for language detection');
            return cached.data;
        }
        
        return null;
    }

    /**
     * Cache language detection result
     */
    setLanguage(audioHash, language) {
        const key = this.generateKey(audioHash, 'lang');
        
        if (this.languageCache.size >= this.config.languageMaxSize) {
            const firstKey = this.languageCache.keys().next().value;
            this.languageCache.delete(firstKey);
        }
        
        this.languageCache.set(key, {
            data: language,
            expires: Date.now() + this.config.languageTTL
        });
    }

    /**
     * Get transcript from cache
     */
    getTranscript(audioHash) {
        const key = this.generateKey(audioHash, 'transcript');
        const cached = this.transcriptCache.get(key);
        
        if (cached && cached.expires > Date.now()) {
            console.log('📦 Cache hit for transcript');
            return cached.data;
        }
        
        return null;
    }

    /**
     * Cache transcript result
     */
    setTranscript(audioHash, transcript) {
        const key = this.generateKey(audioHash, 'transcript');
        
        if (this.transcriptCache.size >= this.config.transcriptMaxSize) {
            const firstKey = this.transcriptCache.keys().next().value;
            this.transcriptCache.delete(firstKey);
        }
        
        this.transcriptCache.set(key, {
            data: transcript,
            expires: Date.now() + this.config.transcriptTTL
        });
    }

    /**
     * Get audio hash for caching
     */
    getAudioHash(audioBuffer) {
        // Use first and last 1KB of audio for hash (faster than full buffer)
        const start = audioBuffer.slice(0, 1024);
        const end = audioBuffer.slice(-1024);
        const combined = Buffer.concat([start, end]);
        return crypto.createHash('md5').update(combined).digest('hex');
    }

    /**
     * Clear expired entries
     */
    clearExpired() {
        const now = Date.now();
        let cleared = 0;
        
        // Clear expired responses
        for (const [key, value] of this.responseCache.entries()) {
            if (value.expires <= now) {
                this.responseCache.delete(key);
                cleared++;
            }
        }
        
        // Clear expired language detections
        for (const [key, value] of this.languageCache.entries()) {
            if (value.expires <= now) {
                this.languageCache.delete(key);
                cleared++;
            }
        }
        
        // Clear expired transcripts
        for (const [key, value] of this.transcriptCache.entries()) {
            if (value.expires <= now) {
                this.transcriptCache.delete(key);
                cleared++;
            }
        }
        
        if (cleared > 0) {
            console.log(`🧹 Cleared ${cleared} expired cache entries`);
        }
    }

    /**
     * Start cleanup interval
     */
    startCleanupInterval() {
        setInterval(() => {
            this.clearExpired();
        }, 60000); // Run every minute
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            responseCache: {
                size: this.responseCache.size,
                maxSize: this.config.responseMaxSize
            },
            languageCache: {
                size: this.languageCache.size,
                maxSize: this.config.languageMaxSize
            },
            transcriptCache: {
                size: this.transcriptCache.size,
                maxSize: this.config.transcriptMaxSize
            },
            totalSize: this.responseCache.size + this.languageCache.size + this.transcriptCache.size
        };
    }

    /**
     * Clear all caches
     */
    clearAll() {
        this.responseCache.clear();
        this.languageCache.clear();
        this.transcriptCache.clear();
        console.log('🧹 All caches cleared');
    }

    /**
     * Prune caches to free memory
     */
    prune() {
        // Remove oldest 25% of entries if caches are full
        const pruneCache = (cache, maxSize) => {
            if (cache.size >= maxSize * 0.9) {
                const toRemove = Math.floor(cache.size * 0.25);
                const keys = Array.from(cache.keys()).slice(0, toRemove);
                keys.forEach(key => cache.delete(key));
                return toRemove;
            }
            return 0;
        };
        
        const pruned = 
            pruneCache(this.responseCache, this.config.responseMaxSize) +
            pruneCache(this.languageCache, this.config.languageMaxSize) +
            pruneCache(this.transcriptCache, this.config.transcriptMaxSize);
        
        if (pruned > 0) {
            console.log(`🧹 Pruned ${pruned} cache entries`);
        }
    }
}
