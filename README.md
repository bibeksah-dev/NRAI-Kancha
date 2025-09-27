# 🎤 NRAI Voice Assistant

Production-ready bilingual (English/Nepali) voice assistant with RAG capabilities for understanding Nepal's Constitution, political manifestos, and legal frameworks.

## ✨ Features

- **Bilingual Support**: Seamless English and Nepali language support with auto-detection
- **Voice Interaction**: Press-and-hold voice recording with high-quality STT/TTS
- **RAG Integration**: Azure AI Foundry GPT-4o agent with document retrieval
- **Multi-fallback Language Detection**: 4-level fallback system for accurate Nepali detection
- **Production Optimized**: <2s text response, <5s voice pipeline
- **Session Management**: TTL-based session cleanup and conversation history
- **Health Monitoring**: Real-time service health checks and metrics

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Azure Speech Services subscription
- Azure AI Foundry agent configured with Nepal documents

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
Ensure your `.env` file has the following:
```env
# Azure AI Foundry Configuration
AZURE_AGENT_ENDPOINT=your_endpoint_here
AZURE_AGENT_ID=your_agent_id_here
AZURE_API_KEY=your_api_key_here

# Azure Region (use swedencentral for best Nepali support)
AZURE_REGION=swedencentral

# Server Configuration
PORT=3001
NODE_ENV=development
SESSION_TTL=86400000
```

3. **Start the server:**
```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

4. **Open the application:**
Navigate to `http://localhost:3001` in your browser

## 🏗️ Architecture

### Technology Stack
- **Backend**: Express.js with ES modules
- **Speech Services**: Microsoft Cognitive Services (swedencentral region)
- **AI Agent**: Azure AI Foundry with GPT-4o
- **Frontend**: Vanilla JavaScript with modern CSS
- **Audio**: MediaRecorder API with WAV format (16kHz mono)

### Core Services
1. **Agent Service** - Azure AI Foundry integration
2. **Speech Service** - STT/TTS with multi-fallback language detection
3. **Session Service** - User session management with TTL cleanup

### API Endpoints
- `POST /api/chat` - Text message processing
- `POST /api/voice` - Voice message processing with STT/TTS
- `GET /api/health` - Service health check
- `GET /api/session/:id` - Session information

## 🎯 Performance Targets

- **Text Response**: < 2 seconds
- **Voice Pipeline**: < 5 seconds end-to-end
- **Language Detection**: 95%+ accuracy
- **Uptime**: 99.9% availability
- **Concurrent Users**: 100+ simultaneous sessions

## 🗣️ Language Support

### Supported Languages
- **English (en-US)**: AriaNeural (F), DavisNeural (M)
- **Nepali (ne-NP)**: HemkalaNeural (F), SagarNeural (M)

### Multi-fallback Detection Strategy
1. AutoDetectSourceLanguageResult (Primary)
2. Properties extraction (Fallback 1)
3. JSON parsing (Fallback 2)
4. Pattern analysis (Final fallback)

## 📝 Usage

### Text Chat
1. Type your message in English or Nepali
2. Press Enter or click Send
3. View AI response with source citations

### Voice Chat
1. Press and hold the microphone button
2. Speak your question in English or Nepali
3. Release to process
4. Listen to the audio response

### Settings
- **Language**: Auto-detect, English, or Nepali
- **Voice Gender**: Female or Male
- **Session**: Clear conversation or view statistics

## 🔧 Development

### Project Structure
```
NRAI-Kancha/
├── server.js              # Main Express server
├── services/
│   ├── agentService.js    # Azure AI Foundry integration
│   ├── speechService.js   # Microsoft Speech Services
│   └── sessionService.js  # Session management
├── public/
│   ├── index.html         # Frontend UI
│   ├── voice-widget.js    # Voice recording/playback
│   └── styles.css         # Styling
├── package.json
├── .env
└── README.md
```

### Key Implementation Lessons

1. **Speech SDK Parameter Order**: 
```javascript
// CORRECT order - critical for language detection
new SpeechRecognizer(config, audioConfig, autoDetectConfig)
```

2. **Audio Processing**:
- Use blob conversion, not data URLs
- Clean up resources after playback
- WAV format at 16kHz for best results

3. **Language Detection**:
- Multi-fallback approach essential for Nepali
- Pattern matching as final fallback
- Confidence scoring for accuracy

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3001/api/health
```

Returns:
- Service status (healthy/degraded/unhealthy)
- Individual service health
- Active session count
- Memory usage

### Logs
Monitor server logs for:
- Request processing times
- Language detection results
- Error details
- Session lifecycle

## 🐛 Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   - Check browser permissions
   - Ensure HTTPS in production

2. **Language Detection Failing**
   - Verify Speech Service region is `swedencentral`
   - Check audio quality (16kHz mono)

3. **Agent Timeout**
   - Increase timeout in agentService.js
   - Check Azure AI Foundry status

4. **No Audio Playback**
   - Verify browser audio permissions
   - Check base64 encoding

## 📚 Documentation

### Azure Setup
1. Create Speech Service resource in Azure
2. Use `swedencentral` region for Nepali support
3. Configure Azure AI Foundry agent with Nepal documents
4. Set up proper CORS and authentication

### Production Deployment
1. Use HTTPS for microphone access
2. Set `NODE_ENV=production`
3. Configure proper CORS origins
4. Enable health monitoring
5. Set up SSL certificates

## 🤝 Contributing

Contributions are welcome! Please follow:
1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Azure Cognitive Services for speech capabilities
- Azure AI Foundry for RAG integration
- Nepal government for constitutional documents
- Open source community for dependencies

---

**Built with ❤️ for Nepal by the NRAI Team**