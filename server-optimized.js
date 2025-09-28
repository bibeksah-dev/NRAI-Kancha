/**
 * NRAI Voice Assistant Server - OPTIMIZED VERSION
 * Includes caching, compression, and performance improvements
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Services
import { AgentService } from './services/agentService.js';
import { SpeechService } from './services/speechService.js';
import { SessionService } from './services/sessionService.js';
import { CacheService } from './services/cacheService.js';

// Load environment variables
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const agentService = new AgentService();
const speechService = new SpeechService();
const sessionService = new SessionService();
const cacheService = new CacheService();

// Performance monitoring
const performanceMetrics = {
    requestCount: 0,
    errorCount: 0,
    totalResponseTime: 0,
    languageStats: {},
    cacheHits: 0,
    cacheMisses: 0
};

// Configure multer for audio file uploads with optimization
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Accept only audio files
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'), false);
        }
    }
});

// Compression middleware for responses
app.use(compression({
    level: 6, // Balanced compression level
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
        // Compress everything except audio responses
        if (res.getHeader('Content-Type')?.includes('audio')) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    maxAge: 86400 // Cache CORS preflight for 24 hours
}));

// Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files with caching headers
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    etag: true,
    setHeaders: (res, path) => {
        // Set longer cache for immutable assets
        if (path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
        }
    }
}));

// Request logging middleware with performance tracking
app.use((req, res, next) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    // Track response time
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        performanceMetrics.requestCount++;
        performanceMetrics.totalResponseTime += duration;
        
        if (res.statusCode >= 400) {
            performanceMetrics.errorCount++;
        }
        
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });
    
    next();
});

// Rate limiting middleware (basic implementation)
const requestCounts = new Map();
const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    
    const timestamps = requestCounts.get(ip).filter(t => t > windowStart);
    
    if (timestamps.length >= 30) { // 30 requests per minute
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    
    timestamps.push(now);
    requestCounts.set(ip, timestamps);
    next();
};

app.use('/api/', rateLimitMiddleware);

/**
 * Health Check Endpoint - Enhanced with metrics
 */
app.get('/api/health', async (req, res) => {
    try {
        const avgResponseTime = performanceMetrics.requestCount > 0 
            ? performanceMetrics.totalResponseTime / performanceMetrics.requestCount 
            : 0;
        
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                server: true,
                speechService: await speechService.checkHealth(),
                aiFoundry: await agentService.checkHealth()
            },
            metrics: {
                activeSessions: sessionService.getActiveSessionCount(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                requestCount: performanceMetrics.requestCount,
                errorRate: performanceMetrics.requestCount > 0 
                    ? performanceMetrics.errorCount / performanceMetrics.requestCount 
                    : 0,
                avgResponseTime: Math.round(avgResponseTime),
                cacheStats: cacheService.getStats(),
                cacheHitRate: performanceMetrics.cacheHits + performanceMetrics.cacheMisses > 0
                    ? performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)
                    : 0
            }
        };

        // Determine overall status
        if (!health.services.speechService || !health.services.aiFoundry) {
            health.status = health.services.server ? 'degraded' : 'unhealthy';
        }

        res.status(health.status === 'healthy' ? 200 : 503).json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * Text Chat Endpoint - With Caching
 */
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ 
                error: 'Message and sessionId are required' 
            });
        }

        // Get or create session
        let session = sessionService.getSession(sessionId);
        
        // Create new session if it doesn't exist
        if (!session) {
            session = sessionService.getOrCreateSession(sessionId);
            // Create thread ID for Azure AI Foundry if not exists
            if (!session.threadId) {
                session.threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                sessionService.updateSession(sessionId, { threadId: session.threadId });
            }
        }

        // Check cache first
        const cachedResponse = cacheService.getResponse(message, sessionId);
        if (cachedResponse) {
            performanceMetrics.cacheHits++;
            console.log(`✅ Returning cached response (${Date.now() - startTime}ms)`);
            return res.json(cachedResponse);
        }
        performanceMetrics.cacheMisses++;

        console.log(`[Chat] Processing message for session ${sessionId}`);

        // Ensure agent service is initialized
        if (!agentService.initialized) {
            await agentService.initialize();
        }

        // Send to agent with thread context
        const agentResult = await agentService.runAgentConversation(
            sessionId,
            message
        );

        // Extract response from agent output
        // Look for the most recent assistant response
        let assistantResponse = null;
        for (let i = agentResult.output.length - 1; i >= 0; i--) {
            if (agentResult.output[i].startsWith('assistant:')) {
                assistantResponse = agentResult.output[i].replace('assistant: ', '');
                break;
            }
        }
        
        const agentResponse = {
            response: assistantResponse || 'I apologize, but I could not generate a response.',
            sources: []
        };

        // Update session
        await sessionService.updateSession(sessionId, {
            lastMessage: message,
            lastResponse: agentResponse.response
        });

        const response = {
            response: agentResponse.response,
            sources: agentResponse.sources,
            sessionId: sessionId
        };

        // Cache the response
        cacheService.setResponse(message, sessionId, response);

        console.log(`✅ Chat processed successfully (${Date.now() - startTime}ms)`);
        res.json(response);

    } catch (error) {
        console.error('Chat processing error:', error);
        
        // Provide fallback response if agent fails
        const fallbackResponse = {
            response: 'I apologize, but I encountered an error processing your request. Please try again.',
            sources: [],
            sessionId: sessionId
        };
        
        // Still cache even the error response to prevent repeated failures
        cacheService.setResponse(message, sessionId, fallbackResponse);
        
        res.status(500).json({ 
            error: 'Failed to process message',
            details: error.message,
            ...fallbackResponse
        });
    }
});

/**
 * Voice Chat Endpoint - Optimized with Caching
 */
app.post('/api/voice', upload.single('audio'), async (req, res) => {
    const startTime = Date.now();
    let audioProcessed = false;
    
    try {
        // Extract audio and parameters
        const audioFile = req.file;
        const { sessionId, returnAudio = 'true' } = req.body;

        if (!audioFile || !sessionId) {
            return res.status(400).json({ 
                error: 'Audio file and sessionId are required' 
            });
        }

        console.log(`[Voice] Processing ${audioFile.size} bytes for session ${sessionId}`);

        // Get audio hash for caching
        const audioHash = cacheService.getAudioHash(audioFile.buffer);

        // Check cache for transcript
        const cachedTranscript = cacheService.getTranscript(audioHash);
        let transcript, detectedLanguage, confidence;

        if (cachedTranscript) {
            performanceMetrics.cacheHits++;
            console.log('📦 Using cached transcript');
            transcript = cachedTranscript.transcript;
            detectedLanguage = cachedTranscript.language;
            confidence = cachedTranscript.confidence;
        } else {
            performanceMetrics.cacheMisses++;
            
            // Convert speech to text with language detection
            const sttResult = await speechService.speechToText(audioFile.buffer);
            
            if (sttResult.error) {
                console.error('[Voice] STT Error:', sttResult.error);
                return res.status(400).json({ 
                    error: sttResult.error,
                    transcript: '',
                    language: 'en-US'
                });
            }

            transcript = sttResult.transcript;
            detectedLanguage = sttResult.language;
            confidence = sttResult.confidence;

            // Cache the transcript
            cacheService.setTranscript(audioHash, {
                transcript,
                language: detectedLanguage,
                confidence
            });
        }

        console.log(`[Voice] Transcript (${detectedLanguage}, confidence: ${confidence}): "${transcript}"`);

        // Update language statistics
        performanceMetrics.languageStats[detectedLanguage] = 
            (performanceMetrics.languageStats[detectedLanguage] || 0) + 1;

        // Get session for context
        let session = sessionService.getSession(sessionId);
        
        // Create new session if it doesn't exist
        if (!session) {
            session = sessionService.getOrCreateSession(sessionId);
            // Create thread ID for Azure AI Foundry if not exists
            if (!session.threadId) {
                session.threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                sessionService.updateSession(sessionId, { threadId: session.threadId });
            }
        }

        // Check cache for agent response
        const cachedResponse = cacheService.getResponse(transcript, sessionId);
        let agentResponse;

        if (cachedResponse) {
            console.log('📦 Using cached agent response');
            agentResponse = {
                response: cachedResponse.response,
                sources: cachedResponse.sources
            };
        } else {
            // Ensure agent service is initialized
            if (!agentService.initialized) {
                await agentService.initialize();
            }
            
            // Send to agent
            const agentResult = await agentService.runAgentConversation(
                sessionId,
                transcript
            );

            // Extract response from agent output
            // Look for the most recent assistant response
            let assistantResponse = null;
            for (let i = agentResult.output.length - 1; i >= 0; i--) {
                if (agentResult.output[i].startsWith('assistant:')) {
                    assistantResponse = agentResult.output[i].replace('assistant: ', '');
                    break;
                }
            }
            
            agentResponse = {
                response: assistantResponse || 'I apologize, but I could not generate a response.',
                sources: []
            };

            // Cache the response
            cacheService.setResponse(transcript, sessionId, {
                response: agentResponse.response,
                sources: agentResponse.sources,
                sessionId
            });
        }

        // Update session
        await sessionService.updateSession(sessionId, {
            lastMessage: transcript,
            lastResponse: agentResponse.response,
            lastLanguage: detectedLanguage
        });

        // Prepare response
        const response = {
            transcript: transcript,
            response: agentResponse.response,
            sources: agentResponse.sources,
            detectedLanguage: detectedLanguage,
            confidence: confidence,
            sessionId: sessionId,
            processingTime: Date.now() - startTime
        };

        // Generate audio response if requested
        if (returnAudio === 'true') {
            console.log('[Voice] Generating TTS audio...');
            
            // Determine voice gender from session preferences or default
            const voiceGender = session.userPreferences?.voiceGender || session.preferences?.voiceGender || 'female';
            
            try {
                const audioResponse = await speechService.textToSpeech(
                    agentResponse.response,
                    detectedLanguage,
                    voiceGender
                );

                // Check if audio was generated successfully
                if (audioResponse && audioResponse.audioData) {
                    // Extract base64 data (remove data URL prefix if present)
                    const base64Audio = audioResponse.audioData.startsWith('data:') 
                        ? audioResponse.audioData.split(',')[1]
                        : audioResponse.audioData;
                        
                    response.audioResponse = base64Audio;
                    console.log(`✅ Audio generated: ${base64Audio.length} bytes`);
                } else {
                    console.error('[Voice] TTS failed: No audio data');
                }
            } catch (ttsError) {
                console.error('[Voice] TTS error:', ttsError.message);
                // Continue without audio - text response is still valid
            }
        }

        audioProcessed = true;
        console.log(`✅ Voice processed successfully (${Date.now() - startTime}ms)`);
        res.json(response);

    } catch (error) {
        console.error('Voice processing error:', error);
        res.status(500).json({ 
            error: 'Failed to process voice',
            details: error.message,
            transcript: '',
            response: 'I apologize, but I encountered an error processing your voice input. Please try again.'
        });
    } finally {
        // Log performance metrics
        const duration = Date.now() - startTime;
        if (audioProcessed && duration > 3000) {
            console.warn(`⚠️ Slow voice processing: ${duration}ms`);
        }
    }
});

/**
 * Performance Metrics Endpoint
 */
app.get('/api/metrics', (req, res) => {
    const avgResponseTime = performanceMetrics.requestCount > 0 
        ? performanceMetrics.totalResponseTime / performanceMetrics.requestCount 
        : 0;
    
    res.json({
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        requests: {
            total: performanceMetrics.requestCount,
            errors: performanceMetrics.errorCount,
            errorRate: performanceMetrics.requestCount > 0 
                ? performanceMetrics.errorCount / performanceMetrics.requestCount 
                : 0,
            avgResponseTime: Math.round(avgResponseTime)
        },
        cache: {
            hits: performanceMetrics.cacheHits,
            misses: performanceMetrics.cacheMisses,
            hitRate: performanceMetrics.cacheHits + performanceMetrics.cacheMisses > 0
                ? performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)
                : 0,
            stats: cacheService.getStats()
        },
        languages: performanceMetrics.languageStats,
        memory: process.memoryUsage(),
        sessions: {
            active: sessionService.getActiveSessionCount()
        }
    });
});

/**
 * Cache Management Endpoints
 */
app.post('/api/cache/clear', (req, res) => {
    cacheService.clearAll();
    res.json({ message: 'Cache cleared successfully' });
});

app.get('/api/cache/stats', (req, res) => {
    res.json(cacheService.getStats());
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    performanceMetrics.errorCount++;
    
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    });
});

/**
 * Memory monitoring and cleanup
 */
setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 400) { // 400MB threshold
        console.warn(`⚠️ High memory usage: ${heapUsedMB.toFixed(2)}MB`);
        
        // Trigger cleanup
        sessionService.clearExpiredSessions();
        cacheService.prune();
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            console.log('🧹 Garbage collection triggered');
        }
    }
}, 60000); // Check every minute

/**
 * Graceful shutdown handler
 */
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    
    // Close services
    await speechService.close?.();
    await agentService.close?.();
    
    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

/**
 * Start the server
 */
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   NRAI Voice Assistant Server                   ║
║                        OPTIMIZED VERSION                        ║
╠════════════════════════════════════════════════════════════════╣
║  🚀 Server running on: http://localhost:${PORT}                    ║
║  📊 Metrics available at: /api/metrics                         ║
║  🔧 Health check at: /api/health                              ║
║  💾 Caching enabled for improved performance                   ║
║  🗣️ Bilingual support: English & Nepali                       ║
╚════════════════════════════════════════════════════════════════╝
    `);
    
    // Initialize services
    Promise.all([
        speechService.initialize(),
        agentService.initialize()
    ]).then(() => {
        console.log('✅ All services initialized successfully');
    }).catch(error => {
        console.error('⚠️ Service initialization warning:', error.message);
    });
});

export default app;
