import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import dotenv from "dotenv";

dotenv.config();

async function runAgentConversation() {
  const endpoint = process.env.AZURE_AGENT_ENDPOINT;
  const agentId = process.env.AZURE_AGENT_ID;
  if (!endpoint || !agentId) {
    console.error("Missing endpoint or agent ID in .env");
    process.exit(1);
  }
  try {
    const project = new AIProjectClient(endpoint, new DefaultAzureCredential());
    const agent = await project.agents.getAgent(agentId);
    console.log(`Retrieved agent: ${agent.name}`);
    const thread = await project.agents.threads.create();
    console.log(`Created thread, ID: ${thread.id}`);
    const message = await project.agents.messages.create(thread.id, "user", "Hi NRAI-Kancha");
    console.log(`Created message, ID: ${message.id}`);
    let run = await project.agents.runs.create(thread.id, agent.id);
    while (run.status === "queued" || run.status === "in_progress") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await project.agents.runs.get(thread.id, run.id);
    }
    if (run.status === "failed") {
      console.error(`Run failed: `, run.lastError);
    }
    console.log(`Run completed with status: ${run.status}`);
    const messages = await project.agents.messages.list(thread.id, { order: "asc" });
    for await (const m of messages) {
      const content = m.content.find((c) => c.type === "text" && "text" in c);
      if (content) {
        console.log(`${m.role}: ${content.text.value}`);
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

runAgentConversation();
