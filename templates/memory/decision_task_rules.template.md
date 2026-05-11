---
name: Automated Task Hard Rules
description: Rules that all scheduled/automated tasks must follow unconditionally at runtime
type: decision
---

## Rule 1: Job Board Pre-Flight Check

Before each job board outreach task starts (after reading config, before any browsing):
1. Run a connectivity + login-state check on the browser extension
2. Report result to user (connected: ✅/❌, logged-in account: [ACCOUNT])
3. If either check fails → PushNotification immediately + stop task, do not continue

**Why:** A missed click because of a disconnected browser costs more than any other failure mode.
Verify upfront, not mid-task.

---

## Rule 2: Scheduled Task Permissions Must Be Pre-Approved

- Every time a new tool call or Bash command is added to a scheduled task, immediately write the
  corresponding permission rule into the allowlist (e.g., `settings.local.json`)
- Use wildcards to cover future variants (dates, filename suffixes) — do not hardcode specific values
- Cover: file Edit/Write target directories, Bash command prefixes, MCP tool names, push notification, ToolSearch
- Tasks must never pop a permission dialog during unattended runtime

**Why:** Scheduled tasks run without the user present. A dialog = task hangs silently until timeout.

---

## Rule 3: Compensation Hard Gate (Match Function)

- Evaluate compensation against the floor using the **maximum** of the posted range
- [RANGE_MIN]-[RANGE_MAX] → use [RANGE_MAX] for the gate check
- If max < floor → Tier D, skip
- If compensation is not posted but company quality is high → do not gate; negotiate post-offer
- If both compensation and company are unknown → apply one-tier penalty, continue Match

**Why:** [Add your own calibration note — e.g., "User corrected: always use the high end of range."]
