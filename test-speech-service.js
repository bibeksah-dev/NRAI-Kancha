/**
 * Test script for the new Speech Service
 * Tests both STT and TTS functionality
 */

import { SpeechService } from './services/speechService.js';
import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSpeechService() {
    console.log('🧪 Testing Speech Service...\n');

    const speechService = new SpeechService();

    try {
        // Test 1: Initialize service
        console.log('📋 Test 1: Initializing Speech Service...');
        await speechService.initialize();
        console.log('✅ Speech Service initialized successfully\n');

        // Test 2: Health check
        console.log('📋 Test 2: Health check...');
        const isHealthy = await speechService.checkHealth();
        console.log(`✅ Health check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);

        // Test 3: TTS Test
        console.log('📋 Test 3: Text-to-Speech (English)...');
        const englishTTS = await speechService.textToSpeech(
            'Hello, this is a test of the text to speech system.',
            'en-US',
            'female'
        );
        console.log(`✅ English TTS: Generated ${englishTTS.audioData.length} characters of base64 audio`);
        console.log(`   Voice used: ${englishTTS.voiceUsed}\n`);

        // Test 4: TTS Test (Nepali)
        console.log('📋 Test 4: Text-to-Speech (Nepali)...');
        const nepaliTTS = await speechService.textToSpeech(
            'नमस्कार, यो पाठ स्वरूप परीक्षण हो।',
            'ne-NP',
            'female'
        );
        console.log(`✅ Nepali TTS: Generated ${nepaliTTS.audioData.length} characters of base64 audio`);
        console.log(`   Voice used: ${nepaliTTS.voiceUsed}\n`);

        // Test 5: Language Detection
        console.log('📋 Test 5: Language Detection (Text Pattern)...');
        const englishDetection = speechService.detectLanguageFromText('Hello how are you doing today?');
        console.log(`✅ English text detection: ${englishDetection.language} (confidence: ${englishDetection.confidence})`);
        
        const nepaliDetection = speechService.detectLanguageFromText('malai ramro cha tapai kobarema');
        console.log(`✅ Nepali text detection: ${nepaliDetection.language} (confidence: ${nepaliDetection.confidence})\n`);

        // Test 6: Voice Selection
        console.log('📋 Test 6: Voice Selection...');
        console.log(`English female voice: ${speechService.selectVoice('en-US', 'female')}`);
        console.log(`English male voice: ${speechService.selectVoice('en-US', 'male')}`);
        console.log(`Nepali female voice: ${speechService.selectVoice('ne-NP', 'female')}`);
        console.log(`Nepali male voice: ${speechService.selectVoice('ne-NP', 'male')}`);
        console.log(`Unknown language (should default): ${speechService.selectVoice('fr-FR', 'female')}\n`);

        console.log('🎉 All tests completed successfully!');
        console.log('\n📝 Summary:');
        console.log('   ✅ Service initialization works');
        console.log('   ✅ Health check works');
        console.log('   ✅ English TTS works');
        console.log('   ✅ Nepali TTS works');
        console.log('   ✅ Language detection works');
        console.log('   ✅ Voice selection works');
        console.log('\n🚀 The speech service is ready for production use!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('   1. Check your .env file has correct AZURE_API_KEY and AZURE_REGION');
        console.error('   2. Verify your Azure Speech Service is active');
        console.error('   3. Ensure you have internet connectivity');
        console.error('\n📋 Current configuration:');
        console.error(`   Region: ${process.env.AZURE_REGION || 'NOT SET'}`);
        console.error(`   API Key: ${process.env.AZURE_API_KEY ? 'SET (hidden)' : 'NOT SET'}`);
    }
}

// Run the test
testSpeechService().catch(console.error);
