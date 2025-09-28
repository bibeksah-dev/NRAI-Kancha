/**
 * AgentService - Azure GPT Agent Interface
 * Refactored for best practices and context7 compatibility
 */
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';

export class AgentService {
  constructor() {
    this.endpoint = process.env.AZURE_AGENT_ENDPOINT ||
      'https://nepalreforms3-resource.services.ai.azure.com/api/projects/nepalreforms3';
    this.agentId = process.env.AZURE_AGENT_ID || 'asst_x2664rofNILIIG8qlG76KPMB';
    this.client = null;
    this.initialized = false;
    this.threads = new Map(); // sessionId → threadId
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.client = new AIProjectClient(this.endpoint, new DefaultAzureCredential());
      await this.checkHealth();
      this.initialized = true;
      console.log('✅ AgentService initialized');
    } catch (error) {
      console.error('❌ Initialization error:', error);
      throw error;
    }
  }

  async runAgentConversation(sessionId = null, userMessage = "Hi NRAI-Kancha") {
    await this.initialize();
    try {
      // Retrieve agent
      const agent = await this.client.agents.getAgent(this.agentId);
      console.log(`Retrieved agent: ${agent.name}`);

      // Thread by session
      let thread;
      if (sessionId && this.threads.has(sessionId)) {
        thread = { id: this.threads.get(sessionId) };
      } else {
        thread = await this.client.agents.threads.create();
        if (sessionId) this.threads.set(sessionId, thread.id);
        console.log(`Created thread, ID: ${thread.id}`);
      }

      // Post user message
      const message = await this.client.agents.messages.create(thread.id, "user", userMessage);
      console.log(`Created message, ID: ${message.id}`);

      // Create run
      let run = await this.client.agents.runs.create(thread.id, agent.id);
      // Poll run status
      while (run.status === "queued" || run.status === "in_progress") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        run = await this.client.agents.runs.get(thread.id, run.id);
      }
      if (run.status === "failed") {
        console.error(`Run failed: `, run.lastError);
        throw new Error(run.lastError?.message || 'Agent run failed');
      }
      console.log(`Run completed with status: ${run.status}`);

      // Retrieve messages in descending order to get the latest first
      const messages = await this.client.agents.messages.list(thread.id, { order: "desc" });
      console.log(`[DEBUG] Retrieving messages from thread ${thread.id}`);
      const output = [];
      let foundLatestAssistant = false;
      
      for await (const m of messages) {
        const content = m.content.find((c) => c.type === "text" && "text" in c);
        if (content) {
          // Add to output array
          output.push(`${m.role}: ${content.text.value}`);
          
          // Stop after finding the latest assistant response and user message
          if (m.role === "assistant" && !foundLatestAssistant) {
            foundLatestAssistant = true;
            // Continue to also get the user message that triggered this response
          } else if (foundLatestAssistant && m.role === "user") {
            // We've got both the latest assistant response and the user message
            break;
          }
        }
      }
      
      // Reverse the output to maintain chronological order (user first, then assistant)
      output.reverse();
      
      console.log(`[DEBUG] Latest conversation (${output.length} messages):`);
      output.forEach((msg, idx) => {
        const preview = msg.substring(0, 100) + (msg.length > 100 ? '...' : '');
        console.log(`  [${idx}] ${preview}`);
      });
      
      return {
        status: run.status,
        output,
        threadId: thread.id,
        agentId: agent.id
      };
    } catch (error) {
      console.error("Agent conversation error:", error);
      throw error;
    }
  }

  async checkHealth() {
    try {
      const agents = await this.client.agents.listAgents({ limit: 1 });
      return true;
    } catch (error) {
      console.error("Agent health check failed:", error);
      return false;
    }
  }

  clearThreadCache() {
    this.threads.clear();
    console.log('[AgentService] Thread cache cleared');
  }
}

export default AgentService;