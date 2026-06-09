# TEST_RESULTS_3

## Script and Chrome/CDP

- Updated `start-chrome.sh` with the requested content.
- Ran `chmod +x start-chrome.sh`.
- CDP verification succeeded after Chrome was kept alive:

```json
{
  "Browser": "Chrome/148.0.7778.179",
  "Protocol-Version": "1.3",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  "V8-Version": "14.8.178.22",
  "WebKit-Version": "537.36 (@4687a88676f95bfbce9ec62314791faae363fea6)"
}
```

Note: launching `./start-chrome.sh` in a short-lived background shell exited before port `9222` stayed reachable in this environment. A foreground Chrome process kept CDP reachable. The requested script file remains exactly as specified.

## Service

- Port `7788` was already in use at first and `/health` returned `{"ok":true,"status":"running"}`.
- Restarted the service after fixing the CDP page adapter so `/extract` could read the Playwright-connected Chrome page.
- Current `/health` result:

```json
{"ok":true,"status":"running"}
```

## Playwright/CDP Run

- Connected to Chrome via CDP on port `9222`.
- Mapped fixture page:
  - Fixture: `/Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/fixtures/linkedin_sample.html`
  - URL: `https://www.linkedin.com/jobs/view/test`
- Attempted popup URL:
  - `chrome-extension://mbhaagemnbaahcfeibjonneaojkloipi/popup.html`
- Popup status: not usable. Chrome showed `ERR_BLOCKED_BY_CLIENT` for the extension page because the unpacked extension did not register in this Chrome debug profile.

Screenshots:

- Before extract: `/Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/test-artifacts/popup-debug-profile.png`
- After extract: `/Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/test-artifacts/popup-after-extract.png`

Captured response file:

- `/Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/test-artifacts/extract-response.json`

## `/extract` Response

```json
{
  "ok": true,
  "jd": {
    "title": "Senior AI Agent Architect",
    "company": "Letta AI",
    "location": "Singapore",
    "salary": {
      "raw": "SGD 12,000 - 18,000/month",
      "currency": "SGD",
      "min": 12000,
      "max": 18000
    }
  },
  "score": {
    "tier": "B",
    "signals": {
      "salary_gate": "pass",
      "ai_native": "pass",
      "role_alignment": "strong",
      "ai_systems": "strong",
      "business_workflow": "strong",
      "seniority": "strong",
      "company_context": "unknown",
      "vibe": "strong"
    },
    "reasons": [
      "salary: pass (12-18K SGD)",
      "ai-native: pass",
      "role alignment: strong",
      "ai systems: strong",
      "business workflow: strong",
      "seniority: strong",
      "vibe: strong"
    ]
  }
}
```

Full captured response, including the full description text, is saved in `test-artifacts/extract-response.json`.
