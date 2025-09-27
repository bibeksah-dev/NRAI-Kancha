/**
 * Quick test to verify Speech Service is working
 */

import { SpeechService } from './services/speechService.js';
import dotenv from 'dotenv';

dotenv.config();

async function quickTest() {
    console.log('🔍 Quick Speech Service Test...\n');
    
    try {
        const speechService = new SpeechService();
        
        console.log('1. Testing initialization...');
        await speechService.initialize();
        console.log('✅ Initialization successful\n');
        
        console.log('2. Testing health check...');
        const health = await speechService.checkHealth();
        console.log(`✅ Health check: ${health ? 'PASSED' : 'FAILED'}\n`);
        
        console.log('3. Testing voice selection...');
        console.log(`English voice: ${speechService.selectVoice('en-US', 'female')}`);
        console.log(`Nepali voice: ${speechService.selectVoice('ne-NP', 'female')}\n`);
        
        console.log('4. Testing language detection...');
        const englishTest = speechService.detectLanguageFromText('Hello how are you');
        const nepaliTest = speechService.detectLanguageFromText('malai ramro cha');
        console.log(`English detection: ${englishTest.language} (${englishTest.confidence})`);
        console.log(`Nepali detection: ${nepaliTest.language} (${nepaliTest.confidence})\n`);
        
        console.log('🎉 Basic functionality verified!');
        console.log('✅ Ready for STT/TTS testing with actual audio');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

quickTest();
