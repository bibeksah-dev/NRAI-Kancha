/**
 * Test TTS with Nepali text
 */

import { SpeechService } from './services/speechService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testNepaliTTS() {
    const speechService = new SpeechService();
    await speechService.initialize();
    
    const testTexts = [
        {
            text: "Hello, how are you?",
            expectedLang: "en-US"
        },
        {
            text: "सुधार कार्यसूचीको ७औं एजेन्डा सबै सरकारी सेवाहरूको डिजिटलरण गर्ने योजनासँग सम्बन्धित छ।",
            expectedLang: "ne-NP"
        },
        {
            text: "नमस्ते! तपाईंलाई के जानकारी चाहिन्छ?",
            expectedLang: "ne-NP"
        },
        {
            text: "Mixed text: Hello सुधार कार्यसूची with English",
            expectedLang: "ne-NP" // Should detect Nepali due to Devanagari
        }
    ];
    
    for (const test of testTexts) {
        console.log('\n' + '='.repeat(60));
        console.log(`Testing: "${test.text.substring(0, 50)}..."`);
        console.log(`Expected: ${test.expectedLang}`);
        
        // Test language detection
        const detected = speechService.detectLanguageFromTextContent(test.text);
        console.log(`Detected: ${detected.language} (confidence: ${detected.confidence}, method: ${detected.method})`);
        
        if (detected.language === test.expectedLang) {
            console.log('✅ Language detection correct!');
        } else {
            console.log('❌ Language detection mismatch!');
        }
        
        // Test TTS (don't actually generate audio, just check voice selection)
        const voiceToUse = speechService.selectVoice(detected.language, 'female');
        console.log(`Voice selected: ${voiceToUse}`);
    }
}

testNepaliTTS().catch(console.error);
