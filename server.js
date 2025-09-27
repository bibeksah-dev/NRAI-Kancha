/**
 * NRAI Voice Assistant Server
 * Production-ready bilingual (English/Nepali) voice assistant with RAG capabilities
 * Built with lessons learned from debugging sessions and optimized for production
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Services
import { AgentService } from './services/agentService.js';
import { SpeechService } from './services/speechService.js';
import { SessionService } from './services/sessionService.js';

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

// Configure multer for audio file uploads
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

// Middleware configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

/**
 * Health Check Endpoint
 * Returns service status and metrics
 */
app.get('/api/health', async (req, res) => {
    try {
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
                memoryUsage: process.memoryUsage()
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
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Text Chat Endpoint
 * Processes text messages with Azure AI Foundry agent
 */
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    let sessionId = req.body.sessionId;

    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get or create session
        const session = sessionService.getOrCreateSession(sessionId);
        sessionId = session.sessionId;

        console.log(`[CHAT] Processing message for session ${sessionId}: "${message.substring(0, 50)}..."`);

        // Process message with agent (now using runAgentConversation)
        const agentResponse = await agentService.runAgentConversation(
            session.sessionId,
            message
        );

        // Update session
        session.threadId = agentResponse.threadId;
        session.lastActivity = Date.now();
        session.conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: agentResponse.output?.join('\n') }
        );

        // Only return the latest assistant reply
        let assistantReply = "";
        if (Array.isArray(agentResponse.output)) {
            const lastLine = [...agentResponse.output].reverse().find(line => line.startsWith('assistant:'));
            if (lastLine) {
                assistantReply = lastLine.replace(/^assistant:/, '').trim();
            }
        }

        const processingTime = Date.now() - startTime;
        console.log(`[CHAT] Response generated in ${processingTime}ms`);

        // Send response (cleaned)
        res.json({
            response: assistantReply,
            sources: [],
            sessionId,
            processingTime
        });

    } catch (error) {
        console.error('[CHAT] Error:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            sessionId
        });
    }
});

/**
 * Voice Chat Endpoint
 * Processes voice input with STT, agent, and TTS pipeline
 */
app.post('/api/voice', upload.single('audio'), async (req, res) => {
    const startTime = Date.now();
    let sessionId = req.body.sessionId;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }

        // Get or create session
        const session = sessionService.getOrCreateSession(sessionId);
        sessionId = session.sessionId;

        console.log(`[VOICE] Processing audio for session ${sessionId}, size: ${req.file.size} bytes`);

        // Step 1: Speech-to-Text with language detection
        const sttResult = await speechService.speechToText(req.file.buffer);
        console.log(`[VOICE] STT complete - Language: ${sttResult.language}, Confidence: ${sttResult.confidence}`);

        // Check if STT was successful
        if (!sttResult.transcript && !sttResult.error) {
            return res.status(400).json({
                error: 'Could not transcribe audio. Please speak more clearly and try again.',
                transcript: '',
                response: '',
                detectedLanguage: sttResult.language,
                confidence: sttResult.confidence,
                sessionId,
                processingTime: Date.now() - startTime
            });
        }

        // If there was an STT error but we want to continue
        if (sttResult.error && !sttResult.transcript) {
            console.log(`[VOICE] STT error: ${sttResult.error}`);
            return res.status(400).json({
                error: sttResult.error,
                transcript: '',
                response: '',
                detectedLanguage: sttResult.language,
                confidence: sttResult.confidence,
                sessionId,
                processingTime: Date.now() - startTime
            });
        }

        // Step 2: Process with Agent
        const agentResponse = await agentService.runAgentConversation(
            session.sessionId,
            sttResult.transcript
        );

        // Extract the assistant's response from the output
        let assistantReply = "";
        if (Array.isArray(agentResponse.output)) {
            const lastLine = [...agentResponse.output].reverse().find(line => line.startsWith('assistant:'));
            if (lastLine) {
                assistantReply = lastLine.replace(/^assistant:/, '').trim();
            }
        }

        // Update session
        session.threadId = agentResponse.threadId;
        session.lastActivity = Date.now();
        session.userPreferences.preferredLanguage = sttResult.language;
        session.conversationHistory.push(
            { role: 'user', content: sttResult.transcript },
            { role: 'assistant', content: assistantReply }
        );

        // Step 3: Text-to-Speech (if requested)
        let audioResponse = null;
        if (req.body.returnAudio !== 'false') {
            const ttsResult = await speechService.textToSpeech(
                assistantReply,
                sttResult.language,
                session.userPreferences.voiceGender
            );
            audioResponse = ttsResult.audioData;
        }

        const processingTime = Date.now() - startTime;
        console.log(`[VOICE] Complete pipeline in ${processingTime}ms`);

        // Send response
        res.json({
            transcript: sttResult.transcript,
            response: assistantReply,
            audioResponse,
            detectedLanguage: sttResult.language,
            confidence: sttResult.confidence,
            sources: [],
            sessionId,
            processingTime
        });

    } catch (error) {
        console.error('[VOICE] Error:', error);
        res.status(500).json({
            error: 'Failed to process voice',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            sessionId
        });
    }
});

/**
 * Session Info Endpoint
 * Returns session details
 */
app.get('/api/session/:sessionId', (req, res) => {
    try {
        const session = sessionService.getSession(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
            sessionId: session.sessionId,
            created: new Date(session.created).toISOString(),
            lastActivity: new Date(session.lastActivity).toISOString(),
            messageCount: session.conversationHistory.length,
            preferences: session.userPreferences
        });
    } catch (error) {
        console.error('[SESSION] Error:', error);
        res.status(500).json({ error: 'Failed to retrieve session' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handling middleware (must be last)
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    
    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    
    if (err.message === 'Only audio files are allowed') {
        return res.status(400).json({ error: err.message });
    }

    // Default error response
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🎤 NRAI Voice Assistant Server');
    console.log('='.repeat(60));
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗣️ Speech Region: ${process.env.AZURE_REGION || 'swedencentral'}`);
    console.log('='.repeat(60));
    
    // Initialize services
    Promise.all([
        agentService.initialize(),
        speechService.initialize()
    ]).then(() => {
        console.log('✅ All services initialized successfully');
    }).catch(error => {
        console.error('⚠️ Service initialization warning:', error.message);
    });

    // Cleanup on shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down gracefully...');
        sessionService.cleanup();
        process.exit(0);
    });
});

export default app;