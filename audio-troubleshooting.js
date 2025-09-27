/**
 * Audio Format Troubleshooting Guide and Tips
 */

console.log(`
🎤 AUDIO FORMAT TROUBLESHOOTING GUIDE
====================================

If you're experiencing "No speech detected" issues, here are the most common causes and solutions:

📋 **COMMON ISSUES:**

1. **WebM/Opus Format Issue:**
   - Browser records in WebM/Opus by default
   - Azure Speech Services prefers WAV format
   - Solution: Updated frontend to handle format detection

2. **Audio Quality Issues:**
   - Background noise too high
   - Speaking too quietly
   - Poor microphone quality
   - Solution: Speak clearly, reduce noise, check mic

3. **Sample Rate Mismatch:**
   - Optimal: 16kHz or 44.1kHz sample rate
   - Mono (1 channel) preferred for speech
   - Solution: Frontend now requests optimal settings

4. **Recording Duration:**
   - Too short recordings (< 1 second) often fail
   - Very long recordings may timeout
   - Solution: Speak for 2-5 seconds clearly

📊 **WHAT THE LOGS TELL YOU:**

✅ **Good Signs:**
   [STT] Audio format: WAV/RIFF detected
   [STT] WAV details - Channels: 1, Sample Rate: 16000Hz
   [STT] Recognizing: "hello"
   [STT] ✅ Recognized text: "hello world"

❌ **Problem Signs:**
   [STT] Audio format: WebM detected
   [STT] WARNING: Sample rate is 48000Hz, recommended: 16000Hz
   [STT] No speech detected
   [STT] Audio buffer too small

🔧 **TESTING STEPS:**

1. Check browser support:
   - Chrome/Edge: Best WebM/WAV support
   - Firefox: Good Ogg/WAV support
   - Safari: Limited format support

2. Test your microphone:
   - Check system microphone levels
   - Test in other applications
   - Ensure microphone permissions granted

3. Test recording quality:
   - Speak clearly and loudly
   - Minimize background noise
   - Hold button for 2-3 seconds while speaking

4. Check network connectivity:
   - Azure Speech Services requires internet
   - Slow connections may cause timeouts

💡 **TIPS FOR BETTER RECOGNITION:**

- Speak in short, clear sentences
- Pause between words
- Use common vocabulary when possible
- Avoid very noisy environments
- Ensure good microphone quality

🚀 **NEXT STEPS:**

If issues persist:
1. Check server logs for detailed audio format info
2. Test with different browsers
3. Try different microphones
4. Check Azure Speech Service quotas/limits

The updated implementation now provides much better debugging information!
`);

export const audioTroubleshootingGuide = {
    checkAudioFormat: (buffer) => {
        // This would be used to analyze audio format
        console.log('Audio buffer analysis:', {
            size: buffer.length,
            isEmpty: buffer.length < 1000,
            format: buffer.slice(0, 4).toString('ascii')
        });
    }
};
