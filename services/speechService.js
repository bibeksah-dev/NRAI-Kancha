/**
 * Speech Service - Microsoft Cognitive Services Integration
 * Enhanced with better audio format handling and debugging
 * Supports STT with automatic language detection and TTS for English/Nepali
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export class SpeechService {
    constructor() {
        // Azure Configuration
        this.speechKey = process.env.AZURE_API_KEY || process.env.AZURE_VOICELIVE_API_KEY;
        this.region = process.env.AZURE_REGION || 'swedencentral';
        this.initialized = false;

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

        console.log('[SpeechService] Initializing with region:', this.region);
    }

    /**
     * Initialize the Speech Service
     */
    async initialize() {
        try {
            if (this.initialized) return;

            if (!this.speechKey || !this.region) {
                throw new Error('Missing Azure Speech Service credentials');
            }

            // Test the configuration
            const testConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            testConfig.close();

            this.initialized = true;
            console.log('✅ Speech Service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Speech Service:', error.message);
            throw error;
        }
    }

    /**
     * Convert speech to text with proper language-specific transcription
     * Two-step process: 1) Detect language, 2) Transcribe with correct model
     * @param {Buffer} audioBuffer - Audio data as buffer
     * @returns {Promise<Object>} Transcription result with detected language
     */
    async speechToText(audioBuffer) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            console.log(`[STT] Processing audio buffer: ${audioBuffer.length} bytes`);
            
            // Validate audio buffer
            if (!audioBuffer || audioBuffer.length < 1000) {
                console.log('[STT] Audio buffer too small, likely empty recording');
                return {
                    transcript: '',
                    language: 'en-US',
                    confidence: 0,
                    error: 'Audio too short or empty'
                };
            }

            // Log audio format information
            this.logAudioInfo(audioBuffer);

            // STEP 1: Detect language first
            const detectedLanguage = await this.detectLanguageFromAudio(audioBuffer);
            console.log(`[STT] 🎯 Detected language: ${detectedLanguage.language} (confidence: ${detectedLanguage.confidence.toFixed(2)})`);

            // STEP 2: Transcribe using language-specific model
            const transcriptionResult = await this.transcribeWithLanguage(audioBuffer, detectedLanguage.language);

            return {
                transcript: transcriptionResult.transcript,
                language: detectedLanguage.language,
                confidence: detectedLanguage.confidence,
                method: 'two-step-detection'
            };

        } catch (error) {
            console.error('[STT] Error:', error);
            return {
                transcript: '',
                language: 'en-US',
                confidence: 0,
                error: `Speech-to-text failed: ${error.message}`
            };
        }
    }

    /**
     * STEP 1: Detect language from audio using auto-detection
     * @param {Buffer} audioBuffer - Audio data buffer
     * @returns {Promise<Object>} Language detection result
     */
    async detectLanguageFromAudio(audioBuffer) {
        try {
            console.log('[STT] Step 1: Detecting language...');

            // Create speech configuration for language detection
            const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            speechConfig.outputFormat = sdk.OutputFormat.Detailed;

            // Create auto-detect language config for English and Nepali
            const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages(['en-US', 'ne-NP']);

            // Create push stream and push audio data
            const pushStream = sdk.AudioInputStream.createPushStream();
            pushStream.write(audioBuffer);
            pushStream.close();

            // Create audio config from stream
            const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

            // Create recognizer with auto-detect config
            const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig, autoDetectConfig);

            // Perform recognition for language detection
            const result = await new Promise((resolve, reject) => {
                recognizer.recognizeOnceAsync(
                    (result) => resolve(result),
                    (error) => reject(new Error(error))
                );
            });

            // Close resources
            recognizer.close();
            speechConfig.close();

            // Process language detection result
            return this.processLanguageDetection(result);

        } catch (error) {
            console.error('[STT] Language detection failed:', error);
            // Fallback to pattern-based detection if available
            return { language: 'en-US', confidence: 0.6, method: 'fallback' };
        }
    }

    /**
     * STEP 2: Transcribe audio using specific language model
     * @param {Buffer} audioBuffer - Audio data buffer
     * @param {string} detectedLanguage - Detected language code
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeWithLanguage(audioBuffer, detectedLanguage) {
        try {
            console.log(`[STT] Step 2: Transcribing with ${detectedLanguage} model...`);

            // Create speech configuration specifically for the detected language
            const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            speechConfig.speechRecognitionLanguage = detectedLanguage; // CRITICAL: Set specific language
            speechConfig.outputFormat = sdk.OutputFormat.Detailed;

            // Enhanced settings for better accuracy
            if (detectedLanguage === 'ne-NP') {
                // Nepali-specific optimizations
                speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '8000');
                speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
            }

            // Create fresh audio stream
            const pushStream = sdk.AudioInputStream.createPushStream();
            pushStream.write(audioBuffer);
            pushStream.close();

            const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

            // Create recognizer WITHOUT auto-detect (use specific language)
            const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            // Add event handlers for debugging
            recognizer.recognizing = (sender, e) => {
                if (e.result.text) {
                    console.log(`[STT] Recognizing (${detectedLanguage}): "${e.result.text}"`);
                }
            };

            // Perform transcription
            const result = await new Promise((resolve, reject) => {
                recognizer.recognizeOnceAsync(
                    (result) => resolve(result),
                    (error) => reject(new Error(error))
                );
            });

            // Close resources
            recognizer.close();
            speechConfig.close();

            // Process transcription result
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                console.log(`[STT] ✅ Transcription (${detectedLanguage}): "${result.text}"`);
                return { transcript: result.text };
            } else {
                console.log(`[STT] ⚠️ Transcription failed, reason: ${sdk.ResultReason[result.reason]}`);
                return { transcript: '' };
            }

        } catch (error) {
            console.error(`[STT] Transcription with ${detectedLanguage} failed:`, error);
            return { transcript: '' };
        }
    }

    /**
     * Process language detection result from recognition
     * @param {Object} result - Speech recognition result from auto-detect
     * @returns {Object} Language detection result
     */
    processLanguageDetection(result) {
        let detectedLanguage = 'en-US';
        let confidence = 0.6;
        let detectionMethod = 'default';

        // Check if recognition was successful
        if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
            console.log('[STT] Language detection: No speech recognized');
            return { language: detectedLanguage, confidence, method: detectionMethod };
        }

        const transcript = result.text || '';
        console.log(`[STT] Language detection transcript: "${transcript}"`);

        try {
            // Method 1: Check autoDetectSourceLanguageResult
            if (result.autoDetectSourceLanguageResult && result.autoDetectSourceLanguageResult.language) {
                detectedLanguage = result.autoDetectSourceLanguageResult.language;
                confidence = 0.9;
                detectionMethod = 'autoDetectResult';
                console.log(`[STT] Method 1 - AutoDetect: ${detectedLanguage}`);
            }
            // Method 2: Check properties
            else if (result.properties) {
                const langProperty = result.properties.getProperty(
                    sdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult
                );
                if (langProperty) {
                    try {
                        const parsed = JSON.parse(langProperty);
                        detectedLanguage = parsed.AutoDetectSourceLanguageResult?.Language || parsed.language || detectedLanguage;
                        confidence = parsed.AutoDetectSourceLanguageResult?.Confidence || 0.85;
                        detectionMethod = 'properties';
                        console.log(`[STT] Method 2 - Properties: ${detectedLanguage}`);
                    } catch (parseError) {
                        console.log('[STT] Failed to parse language property');
                    }
                }
            }
        } catch (error) {
            console.log('[STT] Language detection error:', error.message);
        }

        // Method 3: Fallback to pattern-based detection
        if (detectedLanguage === 'en-US' && transcript) {
            const patternDetection = this.detectLanguageFromText(transcript);
            if (patternDetection.language === 'ne-NP' && patternDetection.confidence > 0.7) {
                detectedLanguage = patternDetection.language;
                confidence = patternDetection.confidence;
                detectionMethod = 'pattern-based';
                console.log(`[STT] Method 3 - Pattern: ${detectedLanguage} (confidence: ${confidence.toFixed(2)})`);
            }
        }

        return {
            language: detectedLanguage,
            confidence,
            method: detectionMethod,
            originalTranscript: transcript
        };
    }

    /**
     * Log audio format information for debugging
     * @param {Buffer} audioBuffer - Audio data buffer
     */
    logAudioInfo(audioBuffer) {
        try {
            console.log(`[STT] Audio buffer size: ${audioBuffer.length} bytes`);
            
            // Check for common audio format signatures
            const header = audioBuffer.slice(0, Math.min(44, audioBuffer.length));
            const headerStr = header.toString('ascii', 0, 4);
            
            if (headerStr === 'RIFF') {
                console.log('[STT] Audio format: WAV/RIFF detected');
                
                if (audioBuffer.length >= 44) {
                    try {
                        // Read WAV format details
                        const audioFormat = audioBuffer.readUInt16LE(20);
                        const channels = audioBuffer.readUInt16LE(22);
                        const sampleRate = audioBuffer.readUInt32LE(24);
                        const bitsPerSample = audioBuffer.readUInt16LE(34);
                        
                        console.log(`[STT] WAV details - Format: ${audioFormat}, Channels: ${channels}, Sample Rate: ${sampleRate}Hz, Bits: ${bitsPerSample}`);
                        
                        if (sampleRate !== 16000 && sampleRate !== 44100) {
                            console.log(`[STT] WARNING: Sample rate is ${sampleRate}Hz, recommended: 16000Hz or 44100Hz`);
                        }
                        if (channels !== 1) {
                            console.log(`[STT] WARNING: ${channels} channels detected, mono (1 channel) is optimal for speech`);
                        }
                    } catch (parseError) {
                        console.log('[STT] Could not parse WAV header details:', parseError.message);
                    }
                }
            } else if (header.includes(Buffer.from('webm', 'ascii')) || 
                       header.toString('hex').includes('1a45dfa3')) { // WebM signature
                console.log('[STT] Audio format: WebM detected');
                console.log('[STT] NOTE: WebM format detected - Azure Speech Services prefers WAV format');
            } else if (header.includes(Buffer.from('OggS', 'ascii'))) {
                console.log('[STT] Audio format: Ogg detected');
            } else {
                console.log('[STT] Audio format: Unknown/Unrecognized');
                console.log(`[STT] Header bytes: ${header.slice(0, 8).toString('hex')}`);
                console.log(`[STT] Header ASCII: ${header.slice(0, 8).toString('ascii').replace(/[^\x20-\x7E]/g, '.')}`);
            }
        } catch (error) {
            console.log('[STT] Could not analyze audio format:', error.message);
        }
    }

    /**
     * Legacy method - kept for backward compatibility
     * @deprecated Use the new two-step detection process
     */
    processSTTResult(result) {
        const response = {
            transcript: '',
            language: 'en-US',
            confidence: 0
        };

        // Check if we got a valid result
        if (result.reason === sdk.ResultReason.NoMatch) {
            console.log('[STT] No speech detected - possible causes:');
            console.log('  - Audio quality too low');
            console.log('  - Background noise too high');
            console.log('  - Audio format incompatible');
            console.log('  - Speech too quiet or unclear');
            console.log('  - Recording duration too short');
            return response;
        }

        if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
            console.log('[STT] Recognition failed, reason:', sdk.ResultReason[result.reason]);
            return response;
        }

        // Get transcript
        response.transcript = result.text;
        console.log(`[STT] ✅ Recognized text: "${result.text}"`);

        // Try to get detected language from AutoDetectSourceLanguageResult
        let detectedLanguage = 'en-US';
        let confidence = 0.8;

        try {
            // Method 1: Check if we have language detection result
            if (result.autoDetectSourceLanguageResult) {
                detectedLanguage = result.autoDetectSourceLanguageResult.language;
                confidence = 0.9;
                console.log(`[STT] Auto-detected language: ${detectedLanguage}`);
            }
            // Method 2: Check properties for language detection
            else if (result.properties) {
                const langProperty = result.properties.getProperty(
                    sdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult
                );
                if (langProperty) {
                    try {
                        const parsed = JSON.parse(langProperty);
                        detectedLanguage = parsed.AutoDetectSourceLanguageResult?.Language || parsed.language || 'en-US';
                        confidence = parsed.AutoDetectSourceLanguageResult?.Confidence || 0.8;
                        console.log(`[STT] Properties language: ${detectedLanguage}`);
                    } catch (parseError) {
                        console.log('[STT] Failed to parse language property:', parseError.message);
                    }
                }
            }
        } catch (error) {
            console.log('[STT] Language detection error:', error.message);
        }

        // Method 3: Fallback to pattern-based detection
        if (detectedLanguage === 'en-US' && response.transcript) {
            const patternDetection = this.detectLanguageFromText(response.transcript);
            if (patternDetection.language === 'ne-NP' && patternDetection.confidence > 0.7) {
                detectedLanguage = patternDetection.language;
                confidence = patternDetection.confidence;
                console.log(`[STT] Pattern-based detection: ${detectedLanguage} (confidence: ${confidence.toFixed(2)})`);
            }
        }

        response.language = detectedLanguage;
        response.confidence = confidence;

        console.log(`[STT] 🎯 Final result - Language: ${detectedLanguage}, Confidence: ${confidence.toFixed(2)}`);

        return response;
    }

    /**
     * Convert text to speech
     * @param {string} text - Text to synthesize
     * @param {string} language - Language code (e.g., 'en-US', 'ne-NP')
     * @param {string} gender - Voice gender ('male' or 'female')
     * @returns {Promise<Object>} Audio data as base64
     */
    async textToSpeech(text, language = 'en-US', gender = 'female') {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            console.log(`[TTS] Synthesizing text: "${text.substring(0, 50)}..." in ${language} (${gender})`);

            // Create speech configuration
            const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            
            // Select appropriate voice
            const voiceName = this.selectVoice(language, gender);
            speechConfig.speechSynthesisVoiceName = voiceName;
            speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;

            console.log(`[TTS] Using voice: ${voiceName}`);

            // Create synthesizer
            const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

            // Perform synthesis
            const result = await new Promise((resolve, reject) => {
                synthesizer.speakTextAsync(
                    text,
                    (result) => {
                        resolve(result);
                    },
                    (error) => {
                        reject(new Error(error));
                    }
                );
            });

            // Cleanup
            synthesizer.close();
            speechConfig.close();

            // Check if synthesis was successful
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                // Convert audio data to base64
                const audioData = Buffer.from(result.audioData).toString('base64');
                
                console.log(`[TTS] ✅ Generated audio: ${result.audioData.byteLength} bytes`);
                
                return {
                    audioData: `data:audio/wav;base64,${audioData}`,
                    voiceUsed: voiceName,
                    language: language,
                    duration: result.audioDuration
                };
            } else {
                throw new Error(`TTS synthesis failed: ${result.errorDetails}`);
            }

        } catch (error) {
            console.error('[TTS] Error:', error);
            throw new Error(`Text-to-speech failed: ${error.message}`);
        }
    }

    /**
     * Select appropriate voice based on language and gender
     * @param {string} language - Language code
     * @param {string} gender - Voice gender preference
     * @returns {string} Voice name
     */
    selectVoice(language, gender = 'female') {
        // Normalize language code
        let normalizedLang = language.toLowerCase();
        
        // Map various Nepali language codes to ne-NP
        if (normalizedLang.includes('ne') || normalizedLang.includes('nepali')) {
            normalizedLang = 'ne-NP';
        } else {
            // Default to English for unknown languages
            normalizedLang = 'en-US';
        }

        // Get voice from mapping
        const voiceGroup = this.voices[normalizedLang] || this.voices['en-US'];
        return voiceGroup[gender] || voiceGroup['female'];
    }

    /**
     * Detect language from text using pattern matching (fallback method)
     * @param {string} text - Text to analyze
     * @returns {Object} Language detection result
     */
    detectLanguageFromText(text) {
        const nepaliPatterns = {
            words: ['malai', 'tapai', 'hamro', 'nepal', 'samvidhan', 'garnu', 'bhanne', 'kobarema', 'bojanucha', 'kasailai', 'kasari'],
            endings: [/cha$/i, /ma$/i, /lai$/i, /ko$/i, /le$/i, /nu$/i, /hos$/i, /dai$/i]
        };

        const words = text.toLowerCase().split(/\s+/);
        let nepaliScore = 0;
        let totalChecks = 0;

        // Check for Nepali words
        words.forEach(word => {
            // Check known Nepali words
            if (nepaliPatterns.words.includes(word)) {
                nepaliScore += 2;
                totalChecks += 2;
            }

            // Check word endings
            nepaliPatterns.endings.forEach(pattern => {
                if (pattern.test(word)) {
                    nepaliScore += 1;
                    totalChecks += 1;
                }
            });
        });

        // Calculate confidence
        const confidence = totalChecks > 0 ? Math.min(nepaliScore / totalChecks, 0.9) : 0.6;

        // Determine language
        if (confidence > 0.7) {
            return { language: 'ne-NP', confidence };
        }

        return { language: 'en-US', confidence: 0.6 };
    }

    /**
     * Check service health
     * @returns {Promise<boolean>} Health status
     */
    async checkHealth() {
        try {
            if (!this.speechKey || !this.region) {
                return false;
            }

            // Test creating a config
            const config = sdk.SpeechConfig.fromSubscription(this.speechKey, this.region);
            config.close();
            return true;
        } catch (error) {
            console.error('[SpeechService] Health check failed:', error.message);
            return false;
        }
    }
}

export default SpeechService;
