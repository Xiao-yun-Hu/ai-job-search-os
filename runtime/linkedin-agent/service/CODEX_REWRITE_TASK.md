# Codex Task: Full Rewrite — No CDP, Add Chatbot UI

## Problem with current design
The current service uses Stagehand/CDP which requires Chrome to be launched with
--remote-debugging-port=9222. Normal users never do this. Must be fixed.

## New Architecture (no CDP required)

```
User opens normal Chrome (no special flags needed)
  ↓
Extension content script reads page DOM (already has permission)
  ↓
Extension popup sends page text to local service POST /extract or POST /chat
  ↓
Service calls Qwen LLM API for scoring + chat responses
  ↓
Returns result to popup
  ↓
For Apply: popup sends POST /apply with instructions
  ↓
Service returns list of actions (click selectors)
  ↓
Extension executes clicks via chrome.scripting.executeScript
```

---

## Part 1: Rewrite the local service

### /Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/

Delete browser.ts and extract.ts. Rewrite with new files:

### llm.ts
OpenAI-compatible client pointing to DashScope:

```typescript
import OpenAI from "openai";

export const llm = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || "sk-196d90cfafa043d68fffd7fd86ff4ce4",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

export const DEFAULT_MODEL = "qwen-plus-2025-11-05";
```

Install openai package: npm install openai

### scorer.ts
Pure scoring logic (no DOM access). Copy scoring rules from:
/Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/scorer.js
Convert to TypeScript. Same evalSalaryGate, evalAINative, evalRoleAlignment, etc.
Export: scoreJD(jd: JD): Score

### server.ts — NEW endpoints

**POST /extract**
Body: { pageText: string, url: string }
- Parse JD from pageText using simple regex/string extraction
- Run scoreJD() locally (no LLM needed for scoring)
- Save to ~/.job-search/results.jsonl
- Return: { ok: true, jd, score }

**POST /chat**
Body: { message: string, pageText?: string, url?: string, history: Array<{role, content}> }
- Build system prompt:
  ```
  You are a job search assistant for Rach Hu, an AI Agent Architect with 8+ years experience.
  Target: AI-native companies, Agent OS / LLM Platform roles, remote/hybrid preferred.
  Salary: 30-50K CNY or SGD market rate.
  Current page: {url}
  Page content: {pageText first 3000 chars}
  
  You can help analyze jobs, decide whether to apply, draft messages, and guide actions.
  When user wants to apply, respond with JSON action: {"action": "apply", "selector": "..."}
  Keep responses concise and actionable.
  ```
- Call llm.chat.completions.create with history + new message
- Return: { ok: true, reply: string, action?: { type: string, selector?: string } }

**POST /apply**
Body: { pageText: string, url: string }
- Use LLM to identify apply button selector from pageText
- Return: { ok: true, actions: [{ type: "click", selector: string }] }
- The extension will execute these actions via chrome.scripting

**GET /health**
Return: { ok: true, status: "running" }

Remove all Stagehand/CDP/Playwright code from server.ts.

---

## Part 2: Rewrite Chrome Extension Popup

### /Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/

### popup.html — replace entirely:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Job Agent</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div id="service-status" class="status-bar disconnected">
    ⚡ <span id="status-text">Connecting...</span>
  </div>

  <div id="chat-container">
    <div id="chat-messages"></div>
  </div>

  <div id="quick-actions">
    <button id="btn-analyze" disabled>🔍 Analyze</button>
    <button id="btn-apply" disabled>✦ Apply</button>
  </div>

  <div id="input-area">
    <input id="chat-input" type="text" placeholder="Ask anything about this job..." disabled />
    <button id="btn-send" disabled>→</button>
  </div>

  <script src="popup-agent.js"></script>
</body>
</html>
```

### popup-agent.js — replace entirely:
```javascript
const SERVICE_URL = "http://localhost:7788";
const $ = id => document.getElementById(id);

let chatHistory = [];

// Get current tab's page text via content script
async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { text: "", url: "" };
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: document.body.innerText.slice(0, 8000),
        url: window.location.href
      })
    });
    return results[0]?.result || { text: "", url: "" };
  } catch {
    return { text: "", url: tab.url || "" };
  }
}

// Execute actions on page (for apply)
async function executeActions(actions) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  for (const action of actions) {
    if (action.type === "click" && action.selector) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const el = document.querySelector(sel);
          if (el) el.click();
        },
        args: [action.selector]
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  $("chat-messages").appendChild(div);
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
  
  if (role !== "system") {
    chatHistory.push({ role: role === "user" ? "user" : "assistant", content });
  }
}

async function sendChat(message) {
  addMessage("user", message);
  $("chat-input").value = "";
  $("btn-send").disabled = true;

  const { text, url } = await getPageText();
  
  try {
    const r = await fetch(`${SERVICE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, pageText: text, url, history: chatHistory.slice(-10) })
    });
    const data = await r.json();
    if (data.ok) {
      addMessage("assistant", data.reply);
      if (data.action?.type === "apply") {
        await handleApply();
      }
    } else {
      addMessage("system", `Error: ${data.error}`);
    }
  } catch (e) {
    addMessage("system", `Service error: ${e.message}`);
  }
  
  $("btn-send").disabled = false;
}

async function handleAnalyze() {
  const { text, url } = await getPageText();
  if (!text) { addMessage("system", "No page content found."); return; }
  
  addMessage("system", "Analyzing...");
  try {
    const r = await fetch(`${SERVICE_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageText: text, url })
    });
    const data = await r.json();
    if (data.ok) {
      const { jd, score } = data;
      const msg = `📋 ${jd.title} @ ${jd.company}\n📍 ${jd.location} | 💰 ${jd.salary?.raw || 'N/A'}\n\n⭐ Tier ${score.tier}\n${score.reasons.join('\n')}`;
      addMessage("assistant", msg);
    } else {
      addMessage("system", `Error: ${data.error}`);
    }
  } catch (e) {
    addMessage("system", `Service error: ${e.message}`);
  }
}

async function handleApply() {
  const { text, url } = await getPageText();
  addMessage("system", "Finding apply button...");
  
  try {
    const r = await fetch(`${SERVICE_URL}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageText: text, url })
    });
    const data = await r.json();
    if (data.ok && data.actions?.length) {
      await executeActions(data.actions);
      addMessage("assistant", "✓ Apply button clicked. Check the page to complete the application.");
    } else {
      addMessage("system", data.error || "Could not find apply button.");
    }
  } catch (e) {
    addMessage("system", `Service error: ${e.message}`);
  }
}

async function checkService() {
  try {
    const r = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      $("service-status").className = "status-bar connected";
      $("status-text").textContent = "Ready";
      ["btn-analyze","btn-apply","chat-input","btn-send"].forEach(id => $( id).disabled = false);
      return true;
    }
  } catch {}
  $("service-status").className = "status-bar disconnected";
  $("status-text").textContent = "Service offline — run: npm start";
  return false;
}

// Event listeners
$("btn-analyze").addEventListener("click", handleAnalyze);
$("btn-apply").addEventListener("click", () => handleApply());
$("btn-send").addEventListener("click", () => {
  const msg = $("chat-input").value.trim();
  if (msg) sendChat(msg);
});
$("chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { const msg = $("chat-input").value.trim(); if (msg) sendChat(msg); }
});

// Init
checkService();
setInterval(checkService, 8000);
addMessage("system", "Hi! Open a LinkedIn job page and click Analyze, or ask me anything.");
```

### popup.css — replace entirely with dark chat UI:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  width: 360px; height: 500px;
  background: #0f172a; color: #e2e8f0;
  display: flex; flex-direction: column;
}
.status-bar { padding: 6px 12px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.status-bar.connected { background: #14532d; color: #22c55e; }
.status-bar.disconnected { background: #1e293b; color: #f59e0b; }

#chat-container { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }
#chat-messages { display: flex; flex-direction: column; gap: 8px; }

.message { padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-width: 90%; }
.message.user { background: #1e3a5f; color: #93c5fd; align-self: flex-end; }
.message.assistant { background: #1e293b; color: #e2e8f0; align-self: flex-start; }
.message.system { background: transparent; color: #475569; font-size: 11px; align-self: center; font-style: italic; }

#quick-actions { display: flex; gap: 8px; padding: 8px; flex-shrink: 0; }
#quick-actions button {
  flex: 1; padding: 8px; border: none; border-radius: 6px;
  cursor: pointer; font-size: 12px; font-weight: 600;
}
#btn-analyze { background: #1e3a5f; color: #3b82f6; border: 1px solid #3b82f6; }
#btn-apply { background: #14532d; color: #22c55e; border: 1px solid #22c55e; }
#btn-analyze:disabled, #btn-apply:disabled { opacity: 0.4; cursor: not-allowed; }

#input-area { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #1e293b; flex-shrink: 0; }
#chat-input {
  flex: 1; background: #1e293b; border: 1px solid #334155;
  color: #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 13px;
}
#chat-input:disabled { opacity: 0.4; }
#btn-send {
  background: #3b82f6; color: white; border: none;
  border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 14px;
}
#btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
```

### manifest.json — add scripting permission if not present:
Make sure permissions array includes "scripting". Current permissions are ["storage", "activeTab", "scripting"] — already correct, do not change manifest.

---

## Part 3: Update package.json
Add openai dependency, remove @browserbasehq/stagehand if not needed elsewhere.

## Constraints
- Do NOT use CDP, Playwright, or Stagehand in server.ts
- Do NOT require --remote-debugging-port in any user-facing flow  
- npm install after changing package.json
- Service must start cleanly with npm start
