---
name: pre-test browser connectivity before automation
description: Before any browser-automation task, verify Chrome MCP and target site login state, surface result to user proactively
type: decision
---

Before running batch browser-automation tasks (job-board outreach, mass page scrape, etc.), do a complete connectivity test and surface result **before** starting the actual workflow.

**Why**: If browser disconnects mid-task, partial state can cause retries, dupes, or silent failures. Front-loading the check prevents wasted runs.

**How to apply**: At the start of any browser-automation task:
1. Verify MCP browser connection (`tabs_context_mcp` or equivalent)
2. Navigate to a known login-checking URL on target site
3. Verify login state via JS DOM inspection
4. **Tell the user proactively**: "Browser: ✅/❌, login: ✅ as `<account_name>`"
5. Only proceed if both green

If anything red, push notification + halt; do **not** silently retry.
