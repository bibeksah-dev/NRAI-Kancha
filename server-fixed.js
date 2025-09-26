const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    // Add your actual website domains here
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Azure OpenAI Configuration - CORRECTED FORMAT
const AZURE_CONFIG = {
  // This should be your Azure OpenAI endpoint, not AI Foundry endpoint
  endpoint: process.env.AZURE_OPENAI_ENDPOINT, // https://your-resource.openai.azure.com
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: '2024-10-21',
  deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o'
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    azure: {
      endpoint: AZURE_CONFIG.endpoint ? 'configured' : 'missing',
      apiKey: AZURE_CONFIG.apiKey ? 'configured' : 'missing',
      deployment: AZURE_CONFIG.deploymentName
    }
  });
});

// Test endpoint to verify Azure OpenAI connection
app.get('/test-azure', async (req, res) => {
  try {
    console.log('🔍 Testing Azure OpenAI connection...');
    console.log('Endpoint:', AZURE_CONFIG.endpoint);
    console.log('Deployment:', AZURE_CONFIG.deploymentName);

    const testMessage = {
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Answer briefly."
        },
        {
          role: "user", 
          content: "Say 'Connection successful!' if you can read this."
        }
      ],
      max_tokens: 50,
      temperature: 0.3
    };

    const response = await fetch(
      `${AZURE_CONFIG.endpoint}/openai/deployments/${AZURE_CONFIG.deploymentName}/chat/completions?api-version=${AZURE_CONFIG.apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_CONFIG.apiKey
        },
        body: JSON.stringify(testMessage)
      }
    );

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Azure OpenAI error:', errorText);
      
      return res.status(response.status).json({
        error: 'Azure OpenAI connection failed',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || 'No response content';

    res.json({
      success: true,
      message: 'Azure OpenAI connection successful!',
      aiResponse: aiResponse,
      usage: data.usage
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    res.status(500).json({
      error: 'Connection test failed',
      details: error.message
    });
  }
});

// Chat endpoint - Direct Azure OpenAI call
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('💬 Chat request:', message);

    const chatPayload = {
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable assistant who can help answer questions about Nepal's constitution, reforms, and governance. Provide helpful and accurate information."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      stream: false
    };

    const response = await fetch(
      `${AZURE_CONFIG.endpoint}/openai/deployments/${AZURE_CONFIG.deploymentName}/chat/completions?api-version=${AZURE_CONFIG.apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_CONFIG.apiKey
        },
        body: JSON.stringify(chatPayload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Azure OpenAI chat error:', errorText);
      
      return res.status(response.status).json({
        error: 'Chat request failed',
        details: errorText
      });
    }

    const data = await response.json();
    const aiMessage = data.choices[0]?.message?.content || 'No response received';

    res.json({
      message: aiMessage,
      usage: data.usage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💬 Chat error:', error.message);
    res.status(500).json({
      error: 'Chat processing failed',
      details: error.message
    });
  }
});

// Simple test page
app.get('/test.html', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Azure OpenAI Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .test-section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        button { padding: 10px 20px; margin: 10px 0; background: #007acc; color: white; border: none; border-radius: 3px; cursor: pointer; }
        button:hover { background: #005999; }
        .result { margin: 10px 0; padding: 15px; background: #f5f5f5; border-radius: 3px; white-space: pre-wrap; }
        .error { background: #ffe6e6; color: #cc0000; }
        .success { background: #e6ffe6; color: #006600; }
        input[type="text"] { width: 100%; padding: 8px; margin: 5px 0; }
      </style>
    </head>
    <body>
      <h1>🚀 Azure OpenAI Connection Test</h1>
      
      <div class="test-section">
        <h2>1. Health Check</h2>
        <button onclick="testHealth()">Test Health Endpoint</button>
        <div id="healthResult" class="result"></div>
      </div>

      <div class="test-section">
        <h2>2. Azure OpenAI Connection Test</h2>
        <button onclick="testAzure()">Test Azure OpenAI</button>
        <div id="azureResult" class="result"></div>
      </div>

      <div class="test-section">
        <h2>3. Chat Test</h2>
        <input type="text" id="chatInput" placeholder="Ask me about Nepal's constitution..." value="What is the structure of Nepal's government?" />
        <button onclick="testChat()">Send Chat Message</button>
        <div id="chatResult" class="result"></div>
      </div>

      <script>
        async function testHealth() {
          const resultDiv = document.getElementById('healthResult');
          resultDiv.textContent = 'Testing health endpoint...';
          
          try {
            const response = await fetch('/health');
            const data = await response.json();
            resultDiv.className = 'result success';
            resultDiv.textContent = JSON.stringify(data, null, 2);
          } catch (error) {
            resultDiv.className = 'result error';
            resultDiv.textContent = 'Health check failed: ' + error.message;
          }
        }

        async function testAzure() {
          const resultDiv = document.getElementById('azureResult');
          resultDiv.textContent = 'Testing Azure OpenAI connection...';
          
          try {
            const response = await fetch('/test-azure');
            const data = await response.json();
            
            if (data.success) {
              resultDiv.className = 'result success';
              resultDiv.textContent = 'Azure OpenAI Response: ' + data.aiResponse + '\\n\\nUsage: ' + JSON.stringify(data.usage, null, 2);
            } else {
              resultDiv.className = 'result error';
              resultDiv.textContent = 'Test failed: ' + JSON.stringify(data, null, 2);
            }
          } catch (error) {
            resultDiv.className = 'result error';
            resultDiv.textContent = 'Connection test failed: ' + error.message;
          }
        }

        async function testChat() {
          const input = document.getElementById('chatInput');
          const resultDiv = document.getElementById('chatResult');
          const message = input.value.trim();
          
          if (!message) {
            alert('Please enter a message');
            return;
          }
          
          resultDiv.textContent = 'Sending chat message...';
          
          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ message: message })
            });
            
            const data = await response.json();
            
            if (data.message) {
              resultDiv.className = 'result success';
              resultDiv.textContent = 'AI Response: ' + data.message + '\\n\\nUsage: ' + JSON.stringify(data.usage, null, 2);
            } else {
              resultDiv.className = 'result error';
              resultDiv.textContent = 'Chat failed: ' + JSON.stringify(data, null, 2);
            }
          } catch (error) {
            resultDiv.className = 'result error';
            resultDiv.textContent = 'Chat request failed: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 AI Assistant server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Test page: http://localhost:${PORT}/test.html`);
  console.log(`🤖 Using Azure OpenAI endpoint: ${AZURE_CONFIG.endpoint}`);
});
