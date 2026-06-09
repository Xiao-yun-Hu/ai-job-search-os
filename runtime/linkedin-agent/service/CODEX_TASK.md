# Codex Task: Job Search Agent Service + Extension Popup Update

## Goal
Build a local Node.js service that attaches to the user's running Chrome via CDP,
uses Stagehand to read and interact with LinkedIn job pages, and auto-applies via Easy Apply.
Also update the Chrome extension popup to send commands to this service.

---

## Part 1: Local Service

### Directory: /Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/

### package.json
```json
{
  "name": "job-search-agent-service",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "tsx server.ts"
  },
  "dependencies": {
    "@browserbasehq/stagehand": "latest",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/node": "^20.0.0"
  }
}
```

### server.ts
Express HTTP server on port 7788. Two endpoints:

**GET /health**
Returns `{ ok: true, status: "running" }`

**POST /extract**
Body: `{}` (no params needed, reads current active tab)
- Calls `extractCurrentPage()`
- Returns: `{ ok: true, jd: { title, company, location, salary, description }, score: { tier, reasons } }`
- On error: `{ ok: false, error: string }`

**POST /apply**
Body: `{}` (applies to job on current tab)
- Calls `applyCurrentPage()`
- Returns: `{ ok: true, applied: true, title, company }` on success
- On error: `{ ok: false, error: string }`

Add CORS headers allowing `chrome-extension://*` origin.
Log every request with timestamp to stdout.

### browser.ts
Stagehand initialization with CDP connection to existing Chrome.

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

let stagehand: Stagehand | null = null;

export async function getStagehand(): Promise<Stagehand> {
  if (stagehand) return stagehand;
  
  stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      // Connect to already-running Chrome via CDP
      // User must have started Chrome with: --remote-debugging-port=9222
      cdpUrl: "http://localhost:9222",
    },
    verbose: 1,
  });
  
  await stagehand.init();
  return stagehand;
}

export async function getCurrentPageUrl(): Promise<string> {
  const sh = await getStagehand();
  return sh.page.url();
}
```

### extract.ts
Two functions:

**`extractCurrentPage()`**
1. `getStagehand()` to get the Stagehand instance
2. Use `stagehand.page.evaluate()` to read DOM directly (faster than LLM extract for structured data):
   - LinkedIn selectors (try each, use first non-empty):
     - title: `h1.t-24`, `h1[class*="job-title"]`
     - company: `.job-details-jobs-unified-top-card__company-name a`, `[class*="company-name"] a`
     - location: `[class*="top-card__bullet"]`
     - salary: `[class*="salary"]` (optional)
     - description: `#job-details`, `.jobs-description`
3. Run scoring logic inline (copy the keyword-based scoring from scorer.js — same rules):
   - evalSalaryGate, evalAINative, evalRoleAlignment, evalAISystems → assignTier
   - Return tier + reasons array
4. Save to `~/.job-search/results.jsonl` (append, one JSON per line)
5. Return `{ jd, score }`

**`applyCurrentPage()`**
1. `extractCurrentPage()` first — get jd + score
2. Use Stagehand `act` to apply:
```typescript
const sh = await getStagehand();

// Click Easy Apply button
await sh.act({ action: "click the Easy Apply button" });

// Wait for form to appear
await sh.page.waitForTimeout(1500);

// Fill form fields using act
await sh.act({ action: "fill in the phone number field with +17815399425 if it is empty" });
await sh.act({ action: "if there is a resume upload field and no resume is selected, skip it" });
await sh.act({ action: "click Next or Continue if there is such a button, otherwise click Submit" });

// Handle multi-step form — repeat up to 5 times
for (let i = 0; i < 5; i++) {
  const done = await sh.extract({
    instruction: "has the application been submitted successfully?",
    schema: z.object({ submitted: z.boolean() })
  });
  if (done.submitted) break;
  await sh.act({ action: "click Next or Submit to proceed" });
  await sh.page.waitForTimeout(1000);
}
```
3. Save application record to `~/.job-search/applications.jsonl`
4. Return `{ applied: true, title: jd.title, company: jd.company }`

### storage.ts
```typescript
import fs from "fs";
import path from "path";
import os from "os";

const DIR = path.join(os.homedir(), ".job-search");

export function appendResult(data: object) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(path.join(DIR, "results.jsonl"), JSON.stringify({ ...data, savedAt: new Date().toISOString() }) + "\n");
}

export function appendApplication(data: object) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(path.join(DIR, "applications.jsonl"), JSON.stringify({ ...data, appliedAt: new Date().toISOString() }) + "\n");
}
```

---

## Part 2: Chrome Extension Popup Update

### File: /Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/popup.html

Replace the current popup UI with a new layout:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Job Agent</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <!-- Status bar -->
  <div id="service-status" class="status-bar disconnected">
    ⚡ Service: <span id="status-text">Checking...</span>
  </div>

  <!-- Main action area -->
  <div id="main" class="main">
    <button id="btn-extract" class="btn-primary" disabled>
      🔍 Analyze Current Page
    </button>
    <button id="btn-apply" class="btn-apply" disabled>
      ✦ Apply to This Job
    </button>
  </div>

  <!-- Result panel -->
  <div id="result-panel" class="hidden">
    <div id="result-tier" class="tier-badge"></div>
    <div id="result-title" class="result-title"></div>
    <div id="result-company" class="result-meta"></div>
    <ul id="result-reasons" class="reasons-list"></ul>
  </div>

  <!-- Log -->
  <div id="log" class="log"></div>

  <script src="popup-agent.js"></script>
</body>
</html>
```

### File: /Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/popup-agent.js

New popup controller. Replaces old popup.js logic.

```javascript
const SERVICE_URL = "http://localhost:7788";

const $ = id => document.getElementById(id);

async function checkService() {
  try {
    const r = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      $("service-status").className = "status-bar connected";
      $("status-text").textContent = "Connected";
      $("btn-extract").disabled = false;
      $("btn-apply").disabled = false;
      return true;
    }
  } catch {
    $("service-status").className = "status-bar disconnected";
    $("status-text").textContent = "Not running — start the service first";
  }
  return false;
}

function log(msg) {
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
  $("log").prepend(line);
}

function showResult(data) {
  const { jd, score } = data;
  $("result-panel").classList.remove("hidden");
  
  const tierColors = { A: "#22c55e", B: "#3b82f6", C: "#f59e0b", D: "#9ca3af", pending: "#f97316" };
  $("result-tier").textContent = `Tier ${score.tier}`;
  $("result-tier").style.color = tierColors[score.tier] || "#fff";
  $("result-title").textContent = jd.title;
  $("result-company").textContent = `${jd.company} · ${jd.location}`;
  
  $("result-reasons").innerHTML = "";
  (score.reasons || []).forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    $("result-reasons").appendChild(li);
  });
}

$("btn-extract").addEventListener("click", async () => {
  log("Analyzing page...");
  $("btn-extract").disabled = true;
  try {
    const r = await fetch(`${SERVICE_URL}/extract`, { method: "POST" });
    const data = await r.json();
    if (data.ok) {
      showResult(data);
      log(`✓ ${data.jd.title} → Tier ${data.score.tier}`);
    } else {
      log(`✗ ${data.error}`);
    }
  } catch (e) {
    log(`✗ ${e.message}`);
  }
  $("btn-extract").disabled = false;
});

$("btn-apply").addEventListener("click", async () => {
  log("Applying...");
  $("btn-apply").disabled = true;
  try {
    const r = await fetch(`${SERVICE_URL}/apply`, { method: "POST" });
    const data = await r.json();
    if (data.ok) {
      log(`✓ Applied to ${data.title} at ${data.company}`);
    } else {
      log(`✗ ${data.error}`);
    }
  } catch (e) {
    log(`✗ ${e.message}`);
  }
  $("btn-apply").disabled = false;
});

// Check service on open, recheck every 5s
checkService();
setInterval(checkService, 5000);
```

### popup.css additions (append to existing popup.css):
```css
.status-bar { padding: 6px 12px; font-size: 11px; font-weight: 600; }
.status-bar.connected { background: #14532d; color: #22c55e; }
.status-bar.disconnected { background: #1e293b; color: #f59e0b; }

.main { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.btn-primary { background: #1e3a5f; color: #3b82f6; border: 1px solid #3b82f6; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
.btn-apply { background: #14532d; color: #22c55e; border: 1px solid #22c55e; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
.btn-primary:disabled, .btn-apply:disabled { opacity: 0.4; cursor: not-allowed; }

.result-title { font-size: 14px; font-weight: 600; color: #f1f5f9; margin: 4px 12px; }
.result-meta { font-size: 12px; color: #64748b; margin: 0 12px 8px; }
.tier-badge { font-size: 18px; font-weight: 700; margin: 12px 12px 4px; }

.log { padding: 8px 12px; max-height: 80px; overflow-y: auto; font-size: 11px; color: #475569; font-family: monospace; border-top: 1px solid #1e293b; }
```

---

## Constraints
- Do NOT modify manifest.json
- popup-agent.js is a new file — do not delete the old popup.js
- The service must run standalone with `npm start` from the service directory
- No auth tokens or API keys hardcoded — Stagehand LOCAL mode uses no external API
- Install dependencies with `npm install` before finishing
