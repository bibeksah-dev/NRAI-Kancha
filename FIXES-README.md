# NRAI Voice Assistant - Recent Fixes

## Issues Fixed

### 1. Repeated Response Issue (FIXED)
**Problem:** Chat was returning the same response repeatedly within a session.

**Root Cause:** The agent service was retrieving ALL messages from the conversation thread and always returning the FIRST assistant response instead of the LATEST one.

**Solution:** 
- Changed message retrieval order from ascending to descending
- Added logic to extract only the most recent assistant response
- Added debug logging to track message retrieval

### 2. TTS Language Detection Issue (FIXED)
**Problem:** When agent responded in Nepali text, the TTS was trying to read it with English voice.

**Root Cause:** The TTS was using the detected language from user's SPEECH INPUT instead of detecting the language of the TEXT to be synthesized.

**Solution:**
- Added `detectLanguageFromTextContent()` method that detects Devanagari script
- TTS now analyzes the response text to determine which voice to use
- Devanagari script detection provides high confidence for Nepali language

## Testing Instructions

### 1. Restart the Server
```bash
# Stop current server (Ctrl+C)
# Start optimized server
npm run start:optimized
```

### 2. Clear Cache (if needed)
```powershell
# Run in PowerShell
.\clear-cache.ps1
```

### 3. Test Different Messages
Test that each message gets a unique response:
1. Send: "Hello"
2. Send: "Tell me about Nepal's constitution"  
3. Send: "What's the weather?"

Each should give a different, relevant response.

### 4. Test Nepali TTS
1. Send: "Read this to me in Nepali" 
   - Should respond with Nepali text
   - Should use Nepali voice (HemkalaNeural or SagarNeural)
   
2. Send: "नेपालको बारेमा बताउनुहोस्" (in Nepali)
   - Should detect Nepali input
   - Should respond in Nepali
   - Should use Nepali voice

### 5. Test Language Detection
Run the test script:
```bash
node test-tts-nepali.js
```

This will verify that:
- English text is detected as English
- Nepali text (Devanagari) is detected as Nepali
- Mixed text with Devanagari is detected as Nepali

## Debug Logging

The server now includes enhanced debug logging:
- `[DEBUG] Retrieving messages from thread` - Shows thread message retrieval
- `[DEBUG] Latest conversation (X messages)` - Shows the extracted conversation
- `[TTS] Text language detected` - Shows detected language for TTS
- `[TTS] Devanagari script detected` - Shows Devanagari character ratio
- `[TTS] Using voice` - Shows which voice is being used

## Voice Mappings

### Nepali Voices
- Female: `ne-NP-HemkalaNeural`
- Male: `ne-NP-SagarNeural`

### English Voices  
- Female: `en-US-AriaNeural`
- Male: `en-US-DavisNeural`

## Language Detection Methods

1. **Devanagari Script Detection** (Primary for TTS)
   - Detects Unicode range U+0900 to U+097F
   - Calculates ratio of Devanagari characters
   - High confidence for Nepali if >30% Devanagari

2. **Pattern Matching** (Fallback)
   - Checks for common Nepali words
   - Analyzes word endings (-cha, -ma, -lai, -ko)
   - Used for romanized Nepali

3. **Auto-detection** (For STT)
   - Uses Azure's automatic language detection
   - Supports en-US and ne-NP

## Cache Configuration

Current cache TTLs:
- Response cache: 5 minutes
- Language cache: 2 minutes  
- Transcript cache: 1 minute

Cache can be cleared via:
- API: `POST /api/cache/clear`
- PowerShell: `.\clear-cache.ps1`
- Metrics: View at `/api/metrics`

## Performance Metrics

Monitor at: `http://localhost:3001/api/metrics`

Shows:
- Cache hit/miss rates
- Average response times
- Language detection statistics
- Active sessions
- Memory usage

## Troubleshooting

If issues persist:
1. Clear the cache: `.\clear-cache.ps1`
2. Check health: `http://localhost:3001/api/health`
3. View metrics: `http://localhost:3001/api/metrics`
4. Restart the server
5. Check environment variables in `.env`

## Environment Variables Required
```
AZURE_AGENT_ENDPOINT=your_endpoint
AZURE_AGENT_ID=your_agent_id
AZURE_API_KEY=your_speech_key
AZURE_REGION=swedencentral
PORT=3001
```
