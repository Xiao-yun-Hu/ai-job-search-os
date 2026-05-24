# AI Job Search OS — Agent Protocol (v3.1)

> **Agent-agnostic operating specification.**
> Runtime adapters (e.g., [`skills/ai-job-search/SKILL.md`](../skills/ai-job-search/SKILL.md) for Hermes) implement this spec and only document what differs from it.
> For agent onboarding guidance, see [`AGENTS.md`](../AGENTS.md).

---

## Overview

This document is the canonical runtime spec for the AI Job Search OS. Any agent (Claude Code, Hermes, Cursor, etc.) must follow this spec when operating the system. Runtime-specific skill files should reference this document and only add their own tool-name mappings or execution constraints on top.

**Related docs:**

| Doc | Purpose |
|---|---|
| [`docs/SYSTEM.md`](./SYSTEM.md) | 6-layer architecture, Match Function, funnel design |
| [`docs/MEMORY_LAYERS.md`](./MEMORY_LAYERS.md) | 4-tier persistent memory (L0/L1/L2/L3) |
| [`docs/RUNTIME_GOVERNOR.md`](./RUNTIME_GOVERNOR.md) | Action Governor policy model |
| [`docs/BROWSER_BACKEND.md`](./BROWSER_BACKEND.md) | chrome-devtools-mcp integration |
| [`AGENTS.md`](../AGENTS.md) | Onboarding flow for agents helping a user set up for the first time |

---

## Tool name conventions

This protocol uses abstract tool references. Runtime adapters map these to their runtime-specific names:

| Abstract | Hermes (`chrome-devtools-mcp`) | Other MCP clients |
|---|---|---|
| `browser.navigate(url)` | `mcp_chrome_devtools_navigate_page(url=url)` | `mcp__chrome-devtools__navigate_page` |
| `browser.snapshot()` | `mcp_chrome_devtools_take_snapshot()` | `mcp__chrome-devtools__take_snapshot` |
| `browser.screenshot()` | `mcp_chrome_devtools_take_screenshot()` | `mcp__chrome-devtools__take_screenshot` |
| `browser.click(uid)` | `mcp_chrome_devtools_click(uid=uid)` | `mcp__chrome-devtools__click` |
| `browser.fill(uid, value)` | `mcp_chrome_devtools_fill(uid=uid, value=value)` | `mcp__chrome-devtools__fill` |
| `browser.scroll()` | `mcp_chrome_devtools_scroll_page()` | `mcp__chrome-devtools__scroll_page` |
| `browser.press(key)` | `mcp_chrome_devtools_press_key(key=key)` | `mcp__chrome-devtools__press_key` |
| `browser.eval(code)` | `mcp_chrome_devtools_evaluate_script(code=code)` | `mcp__chrome-devtools__evaluate_script` |
| `browser.new_page()` | `mcp_chrome_devtools_new_page()` | `mcp__chrome-devtools__new_page` |

For file operations use the agent runtime's native read/write tools (e.g., `read_file`, `write_file`, or shell `cat`/`echo`).

---

## Step 0 — Bootstrap

**This must complete before responding to any user request. No exceptions.**

```
1. Load L3 persona (full persistent context):
   read_file("~/.ai-job-search/L3_persona/candidate_profile.md")
   read_file("~/.ai-job-search/L3_persona/current_state.md")
   read_file("~/.ai-job-search/L3_persona/strategy.md")
   read_file("~/.ai-job-search/L3_persona/decision_rules.md")
   read_file("~/.ai-job-search/L3_persona/company_targets.md")

2. Load recent L2 retros (recent context — last 3 days):
   list ~/.ai-job-search/L2_scenarios/retro_*.md | tail -3 | read each

3. Load operational config:
   read_file("~/.ai-job-search/operational/search_config.json")
   read_file("~/.ai-job-search/operational/company_blacklist.json")

4. Load Action Governor policy:
   read_file("<repo_root>/runtime/policy.yaml")
   → parse per-platform policy into session variable: platform_policy[domain]
   → fields to capture per platform: mode / inter_action_min_ms / autonomous_navigate /
     autonomous_submit / security_check_patterns / security_check_cooldown_minutes

5. Output one-line status, then respond to user:
   "Loaded: profile (resume vN), funnel (X sent / Y replied this week), N pending. Ready."
```

**If any L3 file is missing** → tell user, suggest running `scripts/install.sh`.  
**If `candidate_profile.md` is still a template placeholder** → enter ONBOARDING mode automatically.

> This step solves the "conversation interrupted → lost context on restart" problem. L3 files are reloaded at every session start. Recent L2 retros fill in the short-term context.

---

## Mode detection

After bootstrap, detect the operating mode in this priority order:

```
1. Is candidate_profile.md filled with real data (not the template placeholder)?
   → still template → ONBOARDING mode

2. Prompt contains "morning" / "outreach" / "投递"  → MORNING mode
3. Prompt contains "evening" / "retro" / "复盘"      → EVENING mode
4. Prompt contains "match" / "tier" / "评分"          → MATCH mode (single JD eval)
5. Prompt contains "draft" / "write copy" / "写文案" → DRAFT mode
6. Prompt contains "setup" / "onboarding" / "重新配置" → ONBOARDING mode
7. Prompt contains "add platform" / "添加平台"        → ADD-PLATFORM mode
8. No keyword match                                    → CONVERSATIONAL mode
```

---

## ONBOARDING mode

> Triggered when `candidate_profile.md` is still a template, or user explicitly requests setup.
> After completion, future sessions skip directly to mode detection.

**Rule: wait for explicit user reply at each step before proceeding. Never skip steps. Steps 1–4 must not use any browser tools.**

For the full onboarding philosophy and stage-by-stage guidance for the agent, see [`AGENTS.md`](../AGENTS.md). The steps below are the automated execution procedure.

---

### Step 1: Confirm data directory

Output and stop, wait for user reply:

```
📁 Step 1/7: Data directory

Where should your job search data be stored?
Default: ~/.ai-job-search/

Reply "ok" for the default path, or enter a custom absolute path.
```

On reply: run `scripts/install.sh` to create the full directory structure (L2/L3/operational + atoms.jsonl).

---

### Step 2: Collect resume

Output and stop, wait for user reply:

```
📄 Step 2/7: Resume

Please provide your resume:
A. File path (PDF / Word / Markdown / TXT)
B. Paste text directly

Reply A+path or B+text.
```

On reply:
- Option A: read the file; for PDF/DOCX extract text programmatically
- Option B: use the pasted content

Parse resume and extract structured fields, then write to `L3_persona/candidate_profile.md`:

```yaml
identity: name, contact, current_location, total_years
experience: timeline (companies × roles)
education: masters, bachelors
technical_capabilities: [list]
business_capabilities: [list]
proof_of_work: flagship_project + impact_metrics
```

Show parsed result and ask user to confirm before writing.

---

### Step 3: Collect preferences

Output all questions at once and wait for a single unified reply:

```
🎯 Step 3/7: Job search preferences

Answer any or all (skip what doesn't apply):
1. Target role types? (e.g., AI architect, algorithm engineer)
2. Expected salary? (e.g., 30–60K, or "minimum 40K")
3. Target cities? (e.g., Shanghai, remote)
4. Decision priority? (vibe / comp / role-form / speed / trajectory / geography — rank by actual preference)
5. Preferred company type?
   A. AI-native startup  B. Big-tech AI division  C. Foreign company  D. Traditional + AI  E. No preference
6. Preferred company size?
   A. <100  B. 100–500  C. 500–2000  D. >2000  E. No preference
7. Hard exclusions? (e.g., outsourcing, on-site placement, sales roles)
8. Bonus signals? (e.g., overseas founding team, flexible hours, equity)
```

On reply: write to `L3_persona/candidate_profile.md` `preferences` and `decision_priority` fields.

---

### Step 4: Generate search keywords

Based on candidate profile, generate 5–10 keywords. Output and wait for confirmation.

On confirmation: write to `operational/search_config.json`:
```json
{"keywords": [], "platforms": [], "daily_cap": 10, "score_threshold": 6}
```

---

### Step 5: Configure platforms

**This step starts using browser tools — requires visual login confirmation.**

Output and stop, wait for user reply:

```
🌐 Step 5/7: Job platforms

Select platforms to enable (e.g., "A C"):
A. BOSS Zhipin (zhipin.com)
B. Liepin (liepin.com)
C. Zhaopin (zhaopin.com)
D. 51job (51job.com)
E. LinkedIn (linkedin.com)
F. Other (provide URL)
```

For each selected platform:
1. `browser.navigate(login_url)`
2. `browser.screenshot()` + vision model: "Is the user logged in? Look for profile avatar/display name in top-right."
3. Ask user explicitly: "Are you logged in? Reply yes or no."
4. If yes → write platform to `operational/search_config.json`; proceed.
5. If no → prompt manual login, retry steps 2–3 up to 2 times. If still failing → skip platform with warning: "Login failed — skipped [platform]."

After all platforms processed: ensure files are written (not just in memory).

---

### Step 6: Generate outreach template

Based on candidate profile, generate a greeting message template. Output and wait for confirmation or edits.

On confirmation: write to `L3_persona/candidate_profile.md` `outreach_message` field.

---

### Step 7: Onboarding complete

```
✅ Step 7/7: Setup complete!

Candidate:     [name] ([seniority_level])
Target roles:  [target_roles]
Platforms:     [platforms]
Keywords:      [keywords]
Daily cap:     [daily_cap]

Run morning mode to start automated outreach. Want a test run now? (yes/no)
```

---

## MORNING mode

### Pre-flight: load operational data

Bootstrap already loaded L3 persona. Only load operational data here:

```python
applications = read_jsonl("~/.ai-job-search/operational/applications.jsonl")
blacklist    = read_json("~/.ai-job-search/operational/company_blacklist.json")
search_cfg   = read_json("~/.ai-job-search/operational/search_config.json")

# No automatic login verification — user must ensure browser is ready.
```

---

### Phase 1: Scout

For each enabled platform in `search_cfg.platforms`, search using `search_cfg.keywords`.

**Action Governor check**: look up `platform_policy[domain]`
- `mode == "beside_user"` → skip autonomous navigation, enter semi-automatic mode (see §Semi-automatic mode)
- `mode == "ai_driven"` → proceed with browser automation; respect `inter_action_min_ms` between every action

**1.1 Search and extract listings**

```
# Step 1: read current page (user has navigated to search results page)
browser.snapshot()
# → extract job cards: title / company / salary / location / detail_url

# Step 2: paginate (only when autonomous_navigate == true in policy)
browser.scroll()
browser.snapshot()               # confirm scroll result
browser.click(next_page_uid)
browser.snapshot()               # confirm page number changed before continuing

# Step 3: job detail page
browser.navigate(detail_url)
browser.snapshot()               # wait for detail to load
```

**Security check handling**:
- After every `browser.snapshot()`, check if URL matches `policy.security_check_patterns`
- Match → stop immediately: `[SECURITY CHECK] Please complete verification manually in Chrome, then reply "continue"`
- Never auto-click CAPTCHA or verification components
- After user replies "continue": pause `security_check_cooldown_minutes` before resuming

Extract per job card: `title / company / salary_range / location / experience / detail_url`

---

**1.2 Gate 1 — list-page quick filter**

Skip any job where one of the following conditions matches:

| Condition | Source |
|---|---|
| Anonymous company name (e.g., "某大型/某知名/某上市") | Universal rule |
| Internship or part-time (title or pay description) | Universal rule |
| Already applied (record exists in applications.jsonl) | Deduplication |
| Company in company_blacklist.json | User blacklist |
| Job experience ceiling < candidate_years × 0.6 | candidate_profile |
| Title contains hard_excludes keywords | candidate_profile.preferences |
| Company name contains headhunter/outsourcing markers | Universal rule |
| Matches any rule in decision_rules.md | L3 rules (distill.py-promoted) |

---

**1.3 Detail page read**

```
browser.navigate(detail_url)
browser.snapshot()
```

Extract: `funding_stage / company_size / jd_text / is_headhunter / company_description`

---

**1.4 Gate 2 — detail-page filter**

| Condition | Source |
|---|---|
| Headhunter role marker | Universal rule |
| JD text contains hard_excludes keywords | candidate_profile |
| Funding stage too early (angel/seed/pre-A) | If user preference requires A/B round+ |
| Company size outside preference | candidate_profile.preferences.company_size |
| Max salary < user floor | candidate_profile.preferences.salary_min_k |

---

**1.5 JD scoring (personalized)**

Score 0–10 based on candidate profile:
- Core skill overlap (`candidate_profile.core_skills` vs JD requirements)
- Target role alignment (`target_roles` vs JD title/responsibilities)
- Company type preference match
- Bonus signal hits (`preferences.boost_signals` vs JD text)

Score ≥ `search_cfg.score_threshold` (default 6) → advance to Phase 2.

---

### Phase 2: Match

For each gate-passing candidate, deep evaluation against candidate profile.

**Evaluation dimensions** (weights derived dynamically from candidate profile + `L3_persona/strategy.md` — never hardcode):

| Dimension | Logic |
|---|---|
| Role alignment | Semantic similarity: JD responsibilities ↔ candidate target roles |
| Skill coverage | Coverage of candidate core skills in JD requirements |
| Domain fit | Candidate domain experience ↔ company industry |
| Seniority fit | JD seniority requirement ↔ candidate actual seniority |
| Company fit | Company type/size/stage ↔ candidate preferences |
| Vibe fit | JD working-style signals ↔ candidate preferences |

**Tier assignment**:

```
Tier A: all core dimensions strong, no significant risks
Tier B: most dimensions medium+, 1-2 positive signals
Tier C: partially relevant but has clear gaps → archive, do not apply
Tier D: multiple core dimensions weak/negative → skip
pending: ≥3 dimensions with insufficient info → wait for user input
```

**Output per job**:

```json
{
  "tier": "A|B|C|D|pending",
  "match_scores": {
    "role_alignment": 0.0,
    "skill_coverage": 0.0,
    "domain_fit": 0.0,
    "seniority_fit": 0.0,
    "company_fit": 0.0,
    "vibe_fit": 0.0
  },
  "main_strengths": ["..."],
  "main_gaps": ["..."],
  "outreach_angle": "one-line personalized hook based on most relevant project/skill vs this JD",
  "missing_info": ["..."]
}
```

See [`docs/SYSTEM.md`](./SYSTEM.md) §4 for the full Match Function specification.

---

### Phase 3: Sender

| Tier | Action |
|---|---|
| A | Apply + mark high-priority follow-up |
| B | Apply |
| C | Do not apply; save to `L2_scenarios/candidates_saved_YYYY-MM-DD.md` |
| D | Skip; log reason |
| pending | Do not apply; save to `L2_scenarios/pending_review_YYYY-MM-DD.md` |

**Application flow (generic)**:

> Action Governor check: look up `platform_policy[domain]`
> - `autonomous_submit == false` → step 7 requires `[CONFIRM REQUIRED]` user confirmation before sending
> - `mode == "beside_user"` → do not call this flow; use semi-automatic mode instead

```
1. browser.navigate(detail_url)
2. browser.screenshot()
   → vision: find "apply" / "connect" / "message" action button; return its UID
3. browser.click(action_button_uid)
4. browser.snapshot()
   → confirm dialog or input box appeared
   → if not: retry once → if still not: skip job, log "button_not_found"
5. browser.fill(input_uid, personalized_message)
   # personalized_message = candidate_profile.outreach_message
   #                        + outreach_angle from Phase 2
6. browser.snapshot()               # confirm full message content is present
7. [CONFIRM REQUIRED] show message preview to user, wait for "yes"
   → on "yes": browser.press("Enter")  or  browser.click(send_button_uid)
8. browser.snapshot()               # confirm message was sent
9. write record to operational/applications.jsonl AND atoms.jsonl
```

**Daily cap**: `search_cfg.daily_cap` (default 10, combined Tier A + B)

**Every application must write two files**:
- `operational/applications.jsonl` (legacy compatibility)
- `atoms.jsonl` (L1 atom, `type:application` — see [`templates/L1_atoms_schema.md`](../templates/L1_atoms_schema.md))

---

### Phase 4: Mini Report

Write to `L2_scenarios/morning_YYYY-MM-DD.md`.

Output terminal summary (≤200 words):

```
[Platform] Applied: N (A:x B:y) | Saved: z | Pending: m | Skipped: n
[High-priority companies if any]
```

---

## EVENING mode

### Phase 1: Collect conversation status per platform

For each enabled platform:

```
browser.navigate(platform.chat_url)
browser.snapshot()
```

Extract each conversation: `hr_name / company / role / last_message / read_status / timestamp`

Map to records in `operational/applications.jsonl`; tag current Funnel Stage:

```
sent → read → reply → deep_chat → interview → offer
```

Write each new conversation update as a `type:conversation` atom to `atoms.jsonl`.

---

### Phase 2: Pattern observation (observe only — do not modify Match rules)

Record dimension distributions with `(count, ratio, sample_size)`.

> ⚠️ sample < 10 → mark "noisy", draw no conclusions.  
> ⚠️ sample < 50 → do not adjust keyword weights.

**Strict Match-vs-Reward separation** (from [`docs/SYSTEM.md`](./SYSTEM.md) §4.7–4.8):
- **Match** = strategic judgment (from candidate profile + market signals) — only modified via L3 promotion
- **Reward** = observed funnel outcomes — does **not** directly modify Match rules
- This retro session may **observe** patterns but will **not** write to `strategy.md`. Only `scripts/distill.py`'s promotion rules (e.g., "same pattern appears 3+ times → promote to strategy") may update L3.

---

### Phase 3: Search efficiency optimization

Only allowed: reorder keywords by search-side signals.  
Not allowed: modify Match logic based on reply rates or deep-chat conversion rates.

---

### Phase 4: Write retro file

Write to `L2_scenarios/retro_YYYY-MM-DD.md`.

---

### Phase 5: Push summary (≤200 words)

---

### Phase 6: Update operational snapshot

Overwrite `L3_persona/current_state.md`:

```markdown
## Updated
{YYYY-MM-DD HH:MM}

## Funnel snapshot (last 7 days)
- Applied: N | sent N → read N → reply N → deep_chat N → interview N

## Active conversations (reply and above)
| Platform | Company | Stage | Latest update | Next action |

## Pending queue (awaiting user decision)
| Company | Missing info | Deadline |

## Needs user attention
```

> Note: this step is usually automated by `scripts/distill.py` at 23:30. Manual EVENING mode may also overwrite it directly.

---

## MATCH mode (single JD evaluation)

When user pastes a JD and asks "how is this?":

1. Apply Gate 1 — if any rule matches → report `Tier D, skip, reason: ...` and stop
2. Score all 6 dimensions, output:

   ```
   Tier: B
   Strong: role-form fit, compensation, AI-native signals
   Weak: vibe (unknown founder), geographic (city-only)
   Unknown: trajectory signals
   Recommendation: apply. Outreach:
   [personalized message]
   ```

3. Write one `type:learning` atom (if new company) or `type:conversation` atom (if user asks follow-up questions)

---

## DRAFT mode (direct outreach generation)

User says "write outreach for this JD" → skip Gates, generate directly.  
State explicitly which `candidate_profile` narrative pillar was used and why.

---

## CONVERSATIONAL mode

User question does not match any other mode (e.g., "What's the status on the Anthropic conversation?").

Answer using Step 0's loaded L3 context + recent L2 retros.  
**If data is not in L3/L2, say so explicitly — do not fabricate.** This is the core problem v3 bootstrap solves.

---

## ADD-PLATFORM mode

```
Which platform would you like to add?
A. Liepin (liepin.com)
B. Zhaopin (zhaopin.com)
C. 51job (51job.com)
D. LinkedIn (linkedin.com)
E. Other (enter URL)
```

Guide user through login → verify login state with screenshot → write platform to `operational/search_config.json`.

---

## Semi-automatic mode (fallback for anti-bot platforms)

Use when browser automation fails due to anti-scraping protections.

**Flow**:
1. **User manually opens the target platform** (in their already-logged-in browser)
2. **User pastes job info to agent**: company / role / salary / full JD text
3. **Agent evaluates and generates outreach**: tier the job using L3 profile; generate personalized message using `strategy.md` patterns
4. **User applies manually**: copies message and sends
5. **Agent writes atom**: even for manual applications, append a `type:application` atom to `atoms.jsonl` so `distill.py` can compute the funnel correctly

**When to use**:
- Platform triggers anti-scraping verification repeatedly
- External ATS (Avature, Greenhouse, Workday) redirects return blank pages
- Any platform where automated navigation is unreliable

---

## Atom writing rules (v3)

Every meaningful action must append one atom to `~/.ai-job-search/atoms.jsonl`:

| Event | Atom type |
|---|---|
| Applied to a job | `application` |
| HR replied / conversation updated | `conversation` |
| User stated a new rule | `decision` |
| Agent observed a pattern (≥1 evidence) | `learning` |
| Interview result received | `feedback` |

Schema and field definitions: [`templates/L1_atoms_schema.md`](../templates/L1_atoms_schema.md).

```bash
echo '{"ts":"...","source":"<session_id>","type":"application","entities":{...},"content":"..."}' \
  >> ~/.ai-job-search/atoms.jsonl
```

At 23:30, `scripts/distill.py` reads atoms, auto-generates L2 retro, and applies promotion rules to update L3.

---

## Absolute prohibitions

- ❌ **Skip Step 0 bootstrap** — even if user says "be quick"
- ❌ Apply to Tier C / D / pending jobs
- ❌ Re-apply to companies already in `operational/applications.jsonl`
- ❌ Auto-click CAPTCHA / slider verification — stop and surface to user
- ❌ Auto-reply to HR messages — read-only during retro
- ❌ Modify Match logic directly from funnel outcomes — must go through L3 promotion via `distill.py`
- ❌ Modify existing records in `operational/applications.jsonl` — append-only
- ❌ Directly edit `L3_persona/strategy.md` or `decision_rules.md` — only `distill.py` promotion
- ❌ Run any application operations before onboarding completes
- ❌ Fabricate data when L3/L2 has none — state missing data explicitly

---

## Runtime adapter contract

A runtime-specific skill adapter (like `skills/ai-job-search/SKILL.md`) MUST:

1. **Map tool names** — declare the mapping from abstract `browser.*` to runtime-specific tool calls
2. **Declare additional constraints** — any execution constraints specific to the runtime (e.g., tool whitelist, paging throttle rules)
3. **Reference this spec** — point to this document as the authoritative source
4. **Override only what differs** — only document runtime-specific deviations; do not duplicate the abstract protocol

Adapters should NOT re-state the workflow logic, mode definitions, tier rules, atom schema, or prohibitions already defined here.
