import fs from "fs";
import path from "path";
import os from "os";

const LOG_PATH = path.join(os.homedir(), ".job-search", "agent-log.jsonl");

export interface LogEvent {
  ts: string;
  agent: "Extension";
  type: "extract" | "chat" | "rank" | "apply" | "error";
  task: string;
  status: "done" | "failed";
  details: {
    url?: string;
    tier?: string;
    tokens_used?: number;
    cost_usd?: number;
    error?: string | null;
    message?: string;
  };
}

export function writeLog(event: Omit<LogEvent, "ts">) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, line + "\n");
}
