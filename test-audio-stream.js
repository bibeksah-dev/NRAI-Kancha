/**
 * Test STT with dummy audio data to verify the stream processing
 */

import { SpeechService } from './services/speechService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAudioStream() {
    console.log('🎤 Testing Audio Stream Processing...\n');
    
    try {
        const speechService = new SpeechService();
        await speechService.initialize();
        
        // Create a minimal WAV header + dummy audio data
        // This won't produce actual speech but will test if the stream processing works
        const wavHeader = Buffer.from([
            0x52, 0x49, 0x46, 0x46, // "RIFF"
            0x24, 0x08, 0x00, 0x00, // File size
            0x57, 0x41, 0x56, 0x45, // "WAVE"
            0x66, 0x6D, 0x74, 0x20, // "fmt "
            0x10, 0x00, 0x00, 0x00, // Subchunk size
            0x01, 0x00, 0x01, 0x00, // Audio format & channels
            0x40, 0x1F, 0x00, 0x00, // Sample rate (8000 Hz)
            0x80, 0x3E, 0x00, 0x00, // Byte rate
            0x02, 0x00, 0x10, 0x00, // Block align & bits per sample
            0x64, 0x61, 0x74, 0x61, // "data"
            0x00, 0x08, 0x00, 0x00  // Data size
        ]);
        
        // Add some dummy audio data (silence)
        const audioData = Buffer.alloc(2048, 0);
        const dummyWav = Buffer.concat([wavHeader, audioData]);
        
        console.log(`Created dummy WAV: ${dummyWav.length} bytes`);
        
        // Test the speechToText method
        console.log('Testing speechToText with dummy data...');
        const result = await speechService.speechToText(dummyWav);
        
        console.log('✅ STT processing completed without errors!');
        console.log(`Result: ${JSON.stringify(result, null, 2)}`);
        
        console.log('\n🎉 Stream processing is working correctly!');
        console.log('Ready to test with real audio data.');
        
    } catch (error) {
        if (error.message.includes('No speech could be recognized') || 
            error.message.includes('NoMatch')) {
            console.log('✅ STT processing works (no speech detected in dummy data, as expected)');
        } else {
            console.error('❌ Stream processing failed:', error.message);
            console.error('This indicates an issue with audio stream handling.');
        }
    }
}

testAudioStream();
