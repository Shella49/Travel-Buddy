import { Router, type IRouter } from "express";
import { runAgent, AgentMessage } from "../lib/agent";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// In-memory session store (simple, no DB needed)
const sessions = new Map<string, AgentMessage[]>();

router.post("/chat", async (req, res): Promise<void> => {
  const { message, sessionId } = req.body as { message?: string; sessionId?: string };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const sid = sessionId ?? "default";
  const history = sessions.get(sid) ?? [];

  const userMsg: AgentMessage = { role: "user", content: message };
  history.push(userMsg);

  req.log.info({ sessionId: sid, message: message.slice(0, 100) }, "Chat message received");

  const foursquareApiKey = process.env.FOURSQUARE_API_KEY ?? "";

  try {
    const result = await runAgent(history, foursquareApiKey);

    const assistantMsg: AgentMessage = { role: "assistant", content: result.content };
    history.push(assistantMsg);
    sessions.set(sid, history);

    const responseMessage = {
      id: randomUUID(),
      role: "assistant" as const,
      content: result.content,
      timestamp: new Date().toISOString(),
      mcpLogs: result.mcpLogs,
    };

    res.json({ message: responseMessage, mcpLogs: result.mcpLogs });
  } catch (err) {
    req.log.error({ err }, "Error running agent");
    res.status(500).json({ error: "Ошибка при обработке запроса. Попробуйте ещё раз." });
  }
});

router.get("/chat/history", async (req, res): Promise<void> => {
  const sessionId = (req.query.sessionId as string | undefined) ?? "default";
  const history = sessions.get(sessionId) ?? [];

  const messages = history.map((m) => ({
    id: randomUUID(),
    role: m.role,
    content: m.content,
    timestamp: new Date().toISOString(),
    mcpLogs: [],
  }));

  res.json(messages);
});

router.delete("/chat/history", async (req, res): Promise<void> => {
  const sessionId = (req.query.sessionId as string | undefined) ?? "default";
  sessions.delete(sessionId);
  req.log.info({ sessionId }, "Chat history cleared");
  res.json({ success: true, message: "История чата очищена" });
});

export default router;
