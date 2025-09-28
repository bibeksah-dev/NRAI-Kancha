/**
 * Optimized Speech Service with Connection Pooling
 * Enhanced performance through resource reuse and efficient memory management
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export class OptimizedSpeechService {
    constructor() {
        // Azure Configuration
        this.speechKey = process.env.AZURE_API_KEY || process.env.AZURE_VOICELIVE_API_KEY;
        this.region = process.env.AZURE_REGION || 'swedencentral';
        this.initialized = false;

        // Connection Pool Configuration
        this.configPool = [];
        this.poolSize = 5;
        this.poolStats = {
            created: 0,
            reused: 0,
            destroyed: 0
        };

        // Voice mappings for TTS
        this.voices = {
            'ne-NP': {
                female: 'ne-NP-HemkalaNeural',
                male: 'ne-NP-SagarNeural'
            },
            'en-US': {
                female: 'en-US-AriaNeural', 
                male: 'en-US-DavisNeural'
            }
        };

        // Performance metrics
        this.metrics = {
            sttCount: 0,
            ttsCount: 0,
            avgSttTime: 0,
            avgTtsTime: 0,
            errors: 0
        };

        console.log('[OptimizedSpeechService] Initializing with connection pooling');
    }

    /**
     * Initialize the Speech Service with connection pool
     */
    async initialize() {
        try {
            if (this.initialized) return;

            if (!this.speechKey || !this.region) {
                throw new Error('Missing Azure Speech Service credentials');
            }

            // Pre-create speech configs for pooling
            await this.initializeConfigPool();

            this.initialized = true;
            console.log('✅ Optimized Speech Service initialized with pool size:', this.poolSize);
        } catch (error) {
            console.error('❌ Failed to initialize Speech Service:', error.message);
            throw error;
        }
    }

    /**
     * Initialize connection pool
     */
    async initializeConfigPool() {
        console.log('[Pool] Creating connection pool...');
        
        for (let i = 0; i < this.poolSize; i++) {
            const config = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            config.outputFormat = sdk.OutputFormat.Detailed;
            
            // Optimize for performance
            config.setProperty('Speech_LogFilename', ''); // Disable logging for performance
            config.setProperty('Speech_SegmentationSilenceTimeoutMs', '1000'); // Faster silence detection
            
            this.configPool.push({
                config,
                inUse: false,
                created: Date.now(),
                lastUsed: Date.now()
            });
            
            this.poolStats.created++;
        }
    }

    /**
     * Get a config from the pool
     */
    getConfigFromPool() {
        // Find an available config
        let poolItem = this.configPool.find(item => !item.inUse);
        
        if (!poolItem) {
            // All configs in use, create a temporary one
            console.log('[Pool] All configs in use, creating temporary');
            const config = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            config.outputFormat = sdk.OutputFormat.Detailed;
            
            poolItem = {
                config,
                inUse: true,
                temporary: true,
                created: Date.now(),
                lastUsed: Date.now()
            };
            
            this.poolStats.created++;
        } else {
            poolItem.inUse = true;
            poolItem.lastUsed = Date.now();
            this.poolStats.reused++;
        }
        
        return poolItem;
    }

    /**
     * Return a config to the pool
     */
    returnConfigToPool(poolItem) {
        if (poolItem.temporary) {
            // Destroy temporary configs
            poolItem.config.close();
            this.poolStats.destroyed++;
        } else {
            // Return to pool for reuse
            poolItem.inUse = false;
            poolItem.lastUsed = Date.now();
        }
    }

    /**
     * Optimized speech-to-text with connection pooling
     */
    async speechToText(audioBuffer) {
        const startTime = Date.now();
        
        if (!this.initialized) {
            await this.initialize();
        }

        let poolItem = null;

        try {
            // Validate audio buffer
            if (!audioBuffer || audioBuffer.length < 1000) {
                return {
                    transcript: '',
                    language: 'en-US',
                    confidence: 0,
                    error: 'Audio too short or empty'
                };
            }

            // Get config from pool
            poolItem = this.getConfigFromPool();
            
            // Step 1: Language detection with pooled config
            const detectedLanguage = await this.detectLanguageFromAudioPooled(audioBuffer, poolItem);
            
            // Step 2: Transcription with language-specific model
            const transcriptionResult = await this.transcribeWithLanguagePooled(
                audioBuffer, 
                detectedLanguage.language, 
                poolItem
            );

            // Update metrics
            this.metrics.sttCount++;
            const duration = Date.now() - startTime;
            this.metrics.avgSttTime = 
                (this.metrics.avgSttTime * (this.metrics.sttCount - 1) + duration) / 
                this.metrics.sttCount;

            return {
                transcript: transcriptionResult.transcript,
                language: detectedLanguage.language,
                confidence: detectedLanguage.confidence,
                method: 'pooled-two-step',
                processingTime: duration
            };

        } catch (error) {
            console.error('[STT] Error:', error);
            this.metrics.errors++;
            
            return {
                transcript: '',
                language: 'en-US',
                confidence: 0,
                error: `Speech-to-text failed: ${error.message}`
            };
        } finally {
            // Always return config to pool
            if (poolItem) {
                this.returnConfigToPool(poolItem);
            }
        }
    }

    /**
     * Optimized language detection using pooled config
     */
    async detectLanguageFromAudioPooled(audioBuffer, poolItem) {
        try {
            // Create auto-detect config
            const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(['en-US', 'ne-NP']);

            // Create push stream
            const pushStream = sdk.AudioInputStream.createPushStream();
            pushStream.write(audioBuffer);
            pushStream.close();

            const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

            // Use pooled config for recognizer
            const recognizer = new sdk.SpeechRecognizer(
                poolItem.config, 
                audioConfig, 
                autoDetectConfig
            );

            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    recognizer.close();
                    reject(new Error('Language detection timeout'));
                }, 10000); // 10 second timeout

                recognizer.recognizeOnceAsync(
                    (result) => {
                        clearTimeout(timeout);
                        resolve(result);
                    },
                    (error) => {
                        clearTimeout(timeout);
                        reject(new Error(error));
                    }
                );
            });

            recognizer.close();

            return this.processLanguageDetection(result);

        } catch (error) {
            console.error('[Language Detection] Failed:', error);
            return { language: 'en-US', confidence: 0.5 };
        }
    }

    /**
     * Optimized transcription using pooled config
     */
    async transcribeWithLanguagePooled(audioBuffer, language, poolItem) {
        try {
            // Configure for specific language
            poolItem.config.speechRecognitionLanguage = language;

            // Create push stream
            const pushStream = sdk.AudioInputStream.createPushStream();
            pushStream.write(audioBuffer);
            pushStream.close();

            const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

            // Create recognizer with pooled config
            const recognizer = new sdk.SpeechRecognizer(poolItem.config, audioConfig);

            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    recognizer.close();
                    reject(new Error('Transcription timeout'));
                }, 15000); // 15 second timeout

                recognizer.recognizeOnceAsync(
                    (result) => {
                        clearTimeout(timeout);
                        resolve(result);
                    },
                    (error) => {
                        clearTimeout(timeout);
                        reject(new Error(error));
                    }
                );
            });

            recognizer.close();

            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                return { transcript: result.text };
            } else if (result.reason === sdk.ResultReason.NoMatch) {
                return { transcript: '' };
            } else {
                throw new Error(`Recognition failed: ${sdk.ResultReason[result.reason]}`);
            }

        } catch (error) {
            console.error('[Transcription] Failed:', error);
            throw error;
        }
    }

    /**
     * Process language detection result
     */
    processLanguageDetection(result) {
        let detectedLanguage = 'en-US';
        let confidence = 0.5;

        // Try multiple methods to extract language
        if (result.autoDetectSourceLanguageResult) {
            detectedLanguage = result.autoDetectSourceLanguageResult.language;
            confidence = result.autoDetectSourceLanguageResult.confidence || 0.9;
        } else if (result.properties) {
            const languageKey = 'SpeechServiceConnection_AutoDetectSourceLanguageResult';
            const propValue = result.properties.getProperty(languageKey);
            
            if (propValue) {
                try {
                    const parsed = JSON.parse(propValue);
                    detectedLanguage = parsed.Language || 'en-US';
                    confidence = parsed.Confidence || 0.8;
                } catch (e) {
                    console.error('[Language Detection] Failed to parse properties');
                }
            }
        }

        // Validate and normalize language code
        if (!['en-US', 'ne-NP'].includes(detectedLanguage)) {
            detectedLanguage = 'en-US';
            confidence = 0.5;
        }

        return { language: detectedLanguage, confidence };
    }

    /**
     * Optimized text-to-speech with connection pooling
     */
    async textToSpeech(text, language = 'en-US', gender = 'female') {
        const startTime = Date.now();
        
        if (!this.initialized) {
            await this.initialize();
        }

        let poolItem = null;

        try {
            // Get config from pool
            poolItem = this.getConfigFromPool();
            
            // Select appropriate voice
            const voiceMap = this.voices[language] || this.voices['en-US'];
            const voiceName = voiceMap[gender] || voiceMap.female;
            
            poolItem.config.speechSynthesisVoiceName = voiceName;
            poolItem.config.speechSynthesisOutputFormat = 
                sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;

            // Create synthesizer with pooled config
            const synthesizer = new sdk.SpeechSynthesizer(poolItem.config);

            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    synthesizer.close();
                    reject(new Error('TTS timeout'));
                }, 20000); // 20 second timeout

                synthesizer.speakTextAsync(
                    text,
                    (result) => {
                        clearTimeout(timeout);
                        resolve(result);
                    },
                    (error) => {
                        clearTimeout(timeout);
                        reject(new Error(error));
                    }
                );
            });

            synthesizer.close();

            // Update metrics
            this.metrics.ttsCount++;
            const duration = Date.now() - startTime;
            this.metrics.avgTtsTime = 
                (this.metrics.avgTtsTime * (this.metrics.ttsCount - 1) + duration) / 
                this.metrics.ttsCount;

            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                const audioData = Buffer.from(result.audioData).toString('base64');
                return {
                    success: true,
                    audioData,
                    processingTime: duration
                };
            } else {
                throw new Error(`TTS failed: ${sdk.ResultReason[result.reason]}`);
            }

        } catch (error) {
            console.error('[TTS] Error:', error);
            this.metrics.errors++;
            
            return {
                success: false,
                error: error.message
            };
        } finally {
            // Return config to pool
            if (poolItem) {
                this.returnConfigToPool(poolItem);
            }
        }
    }

    /**
     * Pool maintenance - clean up old connections
     */
    performPoolMaintenance() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        this.configPool.forEach(item => {
            if (!item.inUse && (now - item.lastUsed) > maxAge) {
                // Recreate stale configs
                item.config.close();
                item.config = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
                item.config.outputFormat = sdk.OutputFormat.Detailed;
                item.created = now;
                item.lastUsed = now;
                
                console.log('[Pool] Refreshed stale config');
            }
        });
    }

    /**
     * Get pool statistics
     */
    getPoolStats() {
        const inUse = this.configPool.filter(item => item.inUse).length;
        const available = this.configPool.filter(item => !item.inUse).length;
        
        return {
            poolSize: this.poolSize,
            inUse,
            available,
            created: this.poolStats.created,
            reused: this.poolStats.reused,
            destroyed: this.poolStats.destroyed,
            reuseRate: this.poolStats.created > 0 
                ? this.poolStats.reused / (this.poolStats.created + this.poolStats.reused) 
                : 0
        };
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            pool: this.getPoolStats()
        };
    }

    /**
     * Check health
     */
    async checkHealth() {
        try {
            if (!this.initialized) {
                return false;
            }
            
            // Check if pool has available configs
            const available = this.configPool.some(item => !item.inUse);
            return available;
        } catch (error) {
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    async close() {
        console.log('[OptimizedSpeechService] Closing...');
        
        // Close all configs in pool
        this.configPool.forEach(item => {
            if (item.config) {
                item.config.close();
            }
        });
        
        this.configPool = [];
        this.initialized = false;
    }
}

// Start pool maintenance interval
const speechService = new OptimizedSpeechService();

setInterval(() => {
    speechService.performPoolMaintenance();
}, 60000); // Every minute

export default speechService;
