import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import multer from 'multer';
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3001;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 8080;

// Azure AI Foundry setup (using your working method)
const endpoint = process.env.AZURE_AGENT_ENDPOINT;
const agentId = process.env.AZURE_AGENT_ID;
const speechKey = process.env.AZURE_API_KEY;
const speechRegion = 'swedencentral'; // Your region

if (!endpoint || !agentId || !speechKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const project = new AIProjectClient(endpoint, new DefaultAzureCredential());

// Speech configuration
const speechConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
speechConfig.speechSynthesisVoiceName = "en-US-AriaNeural"; // High-quality voice
speechConfig.speechRecognitionLanguage = "en-US";

// Thread management for conversation continuity
const conversationThreads = new Map(); // sessionId -> threadId

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://your-website1.com',
    'https://your-website2.com',
    'https://your-website3.com'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Helper function to get or create thread for a session
async function getOrCreateThread(sessionId) {
  if (!conversationThreads.has(sessionId)) {
    const thread = await project.agents.threads.create();
    conversationThreads.set(sessionId, thread.id);
    console.log(`🆕 Created new thread ${thread.id} for session ${sessionId}`);
  }
  return conversationThreads.get(sessionId);
}

// Helper function to run agent and get response
async function runAgentWithMessage(threadId, message) {
  // Don't process empty messages
  if (!message || message.trim() === '') {
    console.log('⚠️ Skipping empty message');
    return 'I didn\'t catch that. Could you please repeat?';
  }

  const agent = await project.agents.getAgent(agentId);
  
  // Add user message to thread
  await project.agents.messages.create(threadId, "user", message);
  
  // Create and run the agent
  let run = await project.agents.runs.create(threadId, agent.id);
  
  // Poll for completion
  while (run.status === "queued" || run.status === "in_progress") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await project.agents.runs.get(threadId, run.id);
  }
  
  if (run.status === "failed") {
    console.error(`Run failed: `, run.lastError);
    throw new Error(run.lastError?.message || 'Agent run failed');
  }

  // Get the response messages
  const messages = await project.agents.messages.list(threadId, { order: "desc", limit: 1 });
  let assistantResponse = '';
  
  for await (const m of messages) {
    if (m.role === 'assistant') {
      const content = m.content.find((c) => c.type === "text" && "text" in c);
      if (content) {
        assistantResponse = content.text.value;
        break;
      }
    }
  }
  
  return assistantResponse || 'I\'m sorry, I couldn\'t generate a response.';
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const agent = await project.agents.getAgent(agentId);
    res.json({ 
      status: 'ok', 
      foundry: 'connected',
      agent: agent.name,
      voice: 'enabled',
      timestamp: new Date() 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date() 
    });
  }
});

// Session endpoint - creates or retrieves a session
app.post('/api/session', (req, res) => {
  const sessionId = req.body.sessionId || uuidv4();
  res.json({ sessionId });
});

// Text chat endpoint with session support
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = uuidv4() } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`💬 Text chat - Session: ${sessionId}, Message: ${message}`);

    const threadId = await getOrCreateThread(sessionId);
    const response = await runAgentWithMessage(threadId, message);

    res.json({
      message: response,
      sessionId,
      threadId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat unavailable', 
      details: error.message 
    });
  }
});

// Voice transcription using SDK with file save
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const audioBuffer = req.file.buffer;
    const sessionId = req.body.sessionId || uuidv4();
    // Support dynamic language selection (en-US, ne-NP, etc.)
    const language = req.body.language || 'en-US';

    console.log(`🎤 Transcribing audio for session ${sessionId} (${audioBuffer.length} bytes), language: ${language}`);

    // Save audio temporarily
    const tempFile = path.join(__dirname, `temp_${uuidv4()}.wav`);
    
    // If audio is not WAV, save as-is and let Azure handle it
    await fs.writeFile(tempFile, audioBuffer);

    try {
      // Read the file into a buffer
      const fileBuffer = await fs.readFile(tempFile);
      const audioConfig = speechsdk.AudioConfig.fromWavFileInput(fileBuffer);
      // Create a new speech config for this request to avoid mutation bugs
      const tempSpeechConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      tempSpeechConfig.speechRecognitionLanguage = language;
      const recognizer = new speechsdk.SpeechRecognizer(tempSpeechConfig, audioConfig);

      // Perform recognition
      const result = await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          result => {
            recognizer.close();
            resolve(result);
          },
          error => {
            recognizer.close();
            reject(error);
          }
        );
      });

      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});

      // Check result
      let transcription = '';
      
      if (result.reason === speechsdk.ResultReason.RecognizedSpeech) {
        transcription = result.text;
        console.log(`📝 Transcription: ${transcription}`);
      } else if (result.reason === speechsdk.ResultReason.NoMatch) {
        console.log('⚠️ No speech recognized');
        transcription = '';
      } else {
        console.log(`⚠️ Recognition failed: ${speechsdk.ResultReason[result.reason]}`);
        transcription = '';
      }

      res.json({
        transcription,
        sessionId,
        reason: speechsdk.ResultReason[result.reason]
      });

    } catch (error) {
      // Clean up temp file on error
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ 
      error: 'Transcription failed', 
      details: error.message 
    });
  }
});

// Voice synthesis endpoint (Text-to-Speech)
// Already allows dynamic 'voice' field per request (see parameter in req.body)
app.post('/api/voice/synthesize', async (req, res) => {
  try {
    const { text, voice = 'en-US-AriaNeural' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`🔊 Synthesizing speech: "${text.substring(0, 50)}..."`);

    // Configure voice
    const tempConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    tempConfig.speechSynthesisVoiceName = voice;
    
    // Create file to save audio
    const tempFile = path.join(__dirname, `tts_${uuidv4()}.wav`);
    const audioConfig = speechsdk.AudioConfig.fromAudioFileOutput(tempFile);
    const synthesizer = new speechsdk.SpeechSynthesizer(tempConfig, audioConfig);

    // Synthesize
    await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        result => {
          synthesizer.close();
          if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result);
          } else {
            reject(new Error(`Synthesis failed: ${result.errorDetails}`));
          }
        },
        error => {
          synthesizer.close();
          reject(error);
        }
      );
    });

    // Read the file and send it
    const audioData = await fs.readFile(tempFile);
    
    // Clean up
    await fs.unlink(tempFile).catch(() => {});

    // Send audio data as response
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioData.length
    });
    res.send(audioData);

  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({ 
      error: 'Synthesis failed', 
      details: error.message 
    });
  }
});

// Combined voice endpoint (full pipeline: STT -> Agent -> TTS)
app.post('/api/voice', upload.single('audio'), async (req, res) => {
  let tempAudioFile = null;
  let tempTTSFile = null;
  
  try {
    const audioBuffer = req.file.buffer;
    const sessionId = req.body.sessionId || uuidv4();
    const returnAudio = req.body.returnAudio !== 'false';
    const selectedVoice = req.body.voice || 'en-US-AriaNeural';
    
    console.log(`🎙️ Voice pipeline started for session ${sessionId}`);

    // Step 1: Speech-to-Text using SDK
    tempAudioFile = path.join(__dirname, `stt_${uuidv4()}.wav`);
    await fs.writeFile(tempAudioFile, audioBuffer);

    // Read into buffer for AudioConfig
    const sttFileBuffer = await fs.readFile(tempAudioFile);
    const audioConfig = speechsdk.AudioConfig.fromWavFileInput(sttFileBuffer);
    const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

    const result = await new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        result => {
          recognizer.close();
          resolve(result);
        },
        error => {
          recognizer.close();
          reject(error);
        }
      );
    });

    // Clean up STT temp file
    await fs.unlink(tempAudioFile).catch(() => {});
    tempAudioFile = null;

    // Check transcription result
    let transcription = '';
    
    if (result.reason === speechsdk.ResultReason.RecognizedSpeech) {
      transcription = result.text;
    } else if (result.reason === speechsdk.ResultReason.NoMatch) {
      console.log('⚠️ No speech detected in audio');
      return res.json({
        transcription: '',
        text: 'I didn\'t hear anything. Please try speaking again.',
        audio: null,
        sessionId,
        reason: 'NoMatch'
      });
    } else {
      console.log(`⚠️ Recognition failed: ${speechsdk.ResultReason[result.reason]}`);
      return res.json({
        transcription: '',
        text: 'Sorry, I couldn\'t understand that. Please try again.',
        audio: null,
        sessionId,
        reason: speechsdk.ResultReason[result.reason]
      });
    }

    console.log(`📝 Transcribed: ${transcription}`);

    // Step 2: Process with Agent (using same thread for continuity)
    const threadId = await getOrCreateThread(sessionId);
    const agentResponse = await runAgentWithMessage(threadId, transcription);
    console.log(`🤖 Agent response: ${agentResponse.substring(0, 50)}...`);

    // Step 3: Text-to-Speech (if requested)
    let audioData = null;
    if (returnAudio && agentResponse) {
      const tempConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      tempConfig.speechSynthesisVoiceName = selectedVoice;
      
      tempTTSFile = path.join(__dirname, `tts_${uuidv4()}.wav`);
      const ttsAudioConfig = speechsdk.AudioConfig.fromAudioFileOutput(tempTTSFile);
      const synthesizer = new speechsdk.SpeechSynthesizer(tempConfig, ttsAudioConfig);

      await new Promise((resolve, reject) => {
        synthesizer.speakTextAsync(
          agentResponse,
          result => {
            synthesizer.close();
            if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
              resolve(result);
            } else {
              reject(new Error(`Synthesis failed: ${result.errorDetails}`));
            }
          },
          error => {
            synthesizer.close();
            reject(error);
          }
        );
      });

      // Read the audio file
      const audioBuffer = await fs.readFile(tempTTSFile);
      audioData = audioBuffer.toString('base64');
      
      // Clean up TTS temp file
      await fs.unlink(tempTTSFile).catch(() => {});
      tempTTSFile = null;
      
      console.log(`🔊 Synthesized audio response (${audioBuffer.length} bytes)`);
    }

    res.json({
      transcription,
      text: agentResponse,
      audio: audioData,
      sessionId,
      threadId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Voice pipeline error:', error);
    
    // Clean up any remaining temp files
    if (tempAudioFile) await fs.unlink(tempAudioFile).catch(() => {});
    if (tempTTSFile) await fs.unlink(tempTTSFile).catch(() => {});
    
    res.status(500).json({ 
      error: 'Voice processing failed', 
      details: error.message 
    });
  }
});

// WebSocket server for real-time voice streaming
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

wss.on('connection', (ws) => {
  console.log('🎙️ Voice streaming client connected');
  
  const sessionId = uuidv4();
  let threadId = null;
  let audioChunks = [];

  ws.on('message', async (data) => {
    let tempFile = null;
    
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'start_session') {
        threadId = await getOrCreateThread(sessionId);
        ws.send(JSON.stringify({
          type: 'session_created',
          sessionId,
          threadId
        }));
      }
      
      else if (message.type === 'audio_chunk') {
        // Accumulate audio chunks
        audioChunks.push(Buffer.from(message.data, 'base64'));
      }
      
      else if (message.type === 'audio_complete') {
        if (audioChunks.length === 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'No audio data' }));
          return;
        }

        // Combine audio chunks
        const audioBuffer = Buffer.concat(audioChunks);
        audioChunks = [];

        console.log(`🎤 Processing ${audioBuffer.length} bytes of audio`);

        // Save audio to temp file for SDK
        tempFile = path.join(__dirname, `stream_${uuidv4()}.wav`);
        await fs.writeFile(tempFile, audioBuffer);

        const streamFileBuffer = await fs.readFile(tempFile);
        const audioConfig = speechsdk.AudioConfig.fromWavFileInput(streamFileBuffer);
        const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

        const result = await new Promise((resolve, reject) => {
          recognizer.recognizeOnceAsync(
            result => {
              recognizer.close();
              resolve(result);
            },
            error => {
              recognizer.close();
              reject(error);
            }
          );
        });

        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});
        tempFile = null;

        // Check result
        if (result.reason === speechsdk.ResultReason.RecognizedSpeech) {
          const transcription = result.text;
          
          // Send transcription
          ws.send(JSON.stringify({
            type: 'transcription',
            text: transcription
          }));

          // Get agent response
          threadId = threadId || await getOrCreateThread(sessionId);
          const agentResponse = await runAgentWithMessage(threadId, transcription);

          // Send text response
          ws.send(JSON.stringify({
            type: 'response_text',
            text: agentResponse
          }));

          // Synthesize and send audio
          const tempConfig = speechsdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
          tempConfig.speechSynthesisVoiceName = 'en-US-AriaNeural';
          
          const ttsFile = path.join(__dirname, `stream_tts_${uuidv4()}.wav`);
          const ttsAudioConfig = speechsdk.AudioConfig.fromAudioFileOutput(ttsFile);
          const synthesizer = new speechsdk.SpeechSynthesizer(tempConfig, ttsAudioConfig);

          await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(
              agentResponse,
              result => {
                synthesizer.close();
                if (result.reason === speechsdk.ResultReason.SynthesizingAudioCompleted) {
                  resolve(result);
                } else {
                  reject(new Error('Synthesis failed'));
                }
              },
              error => {
                synthesizer.close();
                reject(error);
              }
            );
          });

          // Read and send audio
          const audioData = await fs.readFile(ttsFile);
          await fs.unlink(ttsFile).catch(() => {});
          
          ws.send(JSON.stringify({
            type: 'response_audio',
            audio: audioData.toString('base64')
          }));
        } else {
          ws.send(JSON.stringify({ 
            type: 'transcription_failed',
            message: 'Could not understand audio',
            reason: speechsdk.ResultReason[result.reason]
          }));
        }
      }

    } catch (error) {
      console.error('WebSocket error:', error);
      
      // Clean up temp file on error
      if (tempFile) await fs.unlink(tempFile).catch(() => {});
      
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message 
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Voice streaming client disconnected');
  });
});

// Start servers
app.listen(PORT, () => {
  console.log(`🚀 AI Assistant server running on port ${PORT}`);
  console.log(`🤖 Connected to Azure AI Foundry agent: ${agentId}`);
  console.log(`🎤 Voice features enabled with Whisper STT and Azure TTS`);
});

console.log(`🎙️ WebSocket server for voice streaming on port ${WEBSOCKET_PORT}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  conversationThreads.clear();
  process.exit(0);
});
