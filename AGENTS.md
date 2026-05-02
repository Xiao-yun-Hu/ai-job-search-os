# AGENTS.md — Onboarding flow for AI agents

> **If you are an AI agent reading this repo to help a user, STOP and run this onboarding before anything else.** Don't skip to `templates/scheduled-tasks/` and start running. The system needs the user's inputs first — running without them produces garbage outputs.

## Why this file exists

This repo is a **system of templates + decision logic**, not a turnkey tool.

If you skip onboarding, here's what fails:

- **Match Function returns garbage tiers** (no candidate profile to match against)
- **Morning task scrapes random jobs** (no target keywords / hard gates)
- **Vibe research has no context** (no target company list)
- **Retros report meaningless numbers** (no funnel to track)

The agent (you) must walk the user through **~50 minutes of setup** before automation can produce useful outputs. This file tells you how.

---

## Onboarding flow (5 stages)

### Stage 1: Diagnose (~5 min)

Ask the user, in order:

1. **Career stage?** Fresh grad / career switcher / mid-career / senior
2. **Geography?** Cities you'll accept + cities you won't
3. **Urgency?** Time horizon (e.g., 3 months / 6 months / opportunistic)
4. **Existing materials?**
   - Resume? (path or link)
   - Target company list? (yes / no — if no, you help build it in Stage 2)
   - Already applied anywhere? (start fresh / mid-search)
5. **Compensation?**
   - Floor (must-have)
   - Ceiling expectation per region
6. **Decision priority?** Vibe (team / founder / culture) vs money — what wins when they trade off?

Capture answers in a working note; you'll write them into memory in Stage 2.

### Stage 2: Setup (~30 min)

#### 2a. Candidate Profile

Read [`templates/memory/project_candidate_profile.template.md`](./templates/memory/project_candidate_profile.template.md) for the schema.

**If user has a resume**:
- Parse it (read the PDF / DOCX content)
- Extract career timeline, education, skills, capabilities
- **Ask user for the 3-5 narrative pillars** (their core stories with specific numbers — e.g., "compressed research from 3 weeks to 1 day = 20× efficiency")
- Write to `memory/project_candidate_profile.md`

**If user has no clear narrative**:
- Walk through their experience asking: *"What's the one thing you accomplished at [company X] that no one else could have done?"*
- Push for **specific numbers** (compression rate, scale increase, accuracy threshold, revenue impact)
- Distill into 3-5 pillars before proceeding

#### 2b. Target Company List

**If user has a list**:
- Read the file they point you to
- Tier the companies (A/B/C/D) using Match Function rubric (see [`docs/SYSTEM.md`](./docs/SYSTEM.md) Section 4.3)
- Write index to `memory/project_target_companies.md`

**If user has no list**:
- Ask them: *"What kinds of companies do you want?"* (industry / size / funding stage / region / culture markers)
- Help them research using:
  - VC portfolios (top-tier seed / early funds in their region)
  - AI / industry media curated lists
  - Their personal network signals (alumni / friends / past colleagues)
- Output: a curated list of 20-40 companies with founder signals + why-fit reasoning

> **This is collaborative, not agent-only.** Agent searches; user provides taste / network signals.

#### 2c. Hard Gates (config.yaml)

Help user fill [`templates/config.yaml.template`](./templates/config.yaml.template):

- Geographic allow-list
- Salary floor (per platform / region)
- Role-type blacklist
- Search keywords (5-10 terms, ranked by candidate narrative match)
- JD scoring dimensions (defaults OK; tweak if user has strong opinions)

Write to `config.yaml`.

#### 2d. Decision Memory

For each user-stated **hard rule**, write a `decision_*.md`:

- Geographic filter → `decision_geographic_filter.md`
- Salary floor → `decision_salary_floor.md`
- Anything else the user states as "always X" / "never Y"

For **soft preferences**, write a `feedback_*.md`:

- Target strategy → `feedback_target_strategy.md`
- Outreach approach → `feedback_outreach.md`

> See [`docs/SYSTEM.md`](./docs/SYSTEM.md) Section 7 for the 5-type taxonomy. **Don't put soft preferences in `decision_*`** (they evolve too quickly).

### Stage 3: Calibrate Match Function (~15 min)

**Critical**: Don't deploy automation until Match agrees with user's taste.

**Process**:

1. Pick **2 sample JDs**:
   - One the user thinks is **clearly A-tier** (great fit)
   - One the user thinks is **clearly C-tier** (marginal)
2. Run the Match Function on each (per Section 4.3 of SYSTEM.md)
3. Compare your Tier output to the user's intuition
4. **If divergent**: discuss why → refine signals (often the Vibe rubric or signal weighting needs adjustment)
5. Repeat with 1-2 more JDs until agreement on at least 4/5

**If Match consistently disagrees with user, do NOT proceed to automation.** The Match Function isn't calibrated. Iterate on Stage 2 (often the candidate profile or hard gates need refinement).

### Stage 4: First run (manual, with review)

Run the morning task **once, manually, with user watching**:

1. Scout (keyword search + hard gates)
2. Match (Tier classification)
3. **Pause before sending** — show user the Tier A/B candidates
4. User confirms or adjusts
5. Only after at least one confirmation cycle, proceed to Stage 5

### Stage 5: Schedule deployment

Only after Stage 4 passes:

1. Install scheduled tasks (copy `templates/scheduled-tasks/*.template.md` to `~/.claude/scheduled-tasks/` if using Claude Code)
2. Configure permissions in `settings.local.json` allowlist (so cron runs don't block on prompts)
3. Test that the scheduled task can run autonomously (a dry run with logging-only mode is ideal)

---

## What the agent should NOT do

- ❌ Skip Stage 1-3 and run morning task with empty config
- ❌ Generate candidates from generic web search without user's target list
- ❌ Submit applications before Stage 4 review
- ❌ Modify Match Function rules after deployment based on small samples (see SYSTEM.md Section 4.8)
- ❌ Promote `feedback_*` rules to `decision_*` without explicit user authorization
- ❌ Auto-apply at scale before Match is calibrated

---

## When the user is unclear

If user can't answer a question (e.g., "I don't know my narrative pillars"):

- **Don't silently fill in defaults**
- Mark the gap explicitly in the relevant memory file (e.g., "narrative pillar 3: TODO — to be filled after first interview")
- Note in TodoWrite that this needs human attention later
- Continue with what's known; flag missing pieces

---

## Conversational examples

**User**: *"Just run this on my BOSS account."*
**Agent (correctly)**: *"Before I run anything, I need your candidate profile and target list. Have you filled `memory/project_candidate_profile.md`? Let's start with Stage 1 diagnosis questions."*

---

**User**: *"Skip the calibration, I trust the defaults."*
**Agent (correctly)**: *"I'll proceed, but I'll flag that Match isn't calibrated to your taste. Expect first batch to need adjustments. I'll pause before each send for the first 3 days so you can review."*

---

**User**: *"I just want offers, not all this setup."*
**Agent (correctly)**: *"This system optimizes for offer quality, not auto-apply spam. The setup IS the work — without it, you'll waste time on misfit roles. Want me to do a 15-minute fast-track instead of the full 50-minute onboarding? You'd skip the Match calibration and accept first-batch noise."*

---

**User**: *"I have a resume but no target list."*
**Agent (correctly)**: *"Good — let's parse the resume first to get your narrative pillars, then I'll help you build a target list collaboratively. Tell me 3 industries or types of companies you find interesting, and I'll search VC portfolios + media lists to seed it."*

---

## Reference

For full architecture, decision logic, and memory design, read [`docs/SYSTEM.md`](./docs/SYSTEM.md).

For platform-specific automation patterns (job board adapters, scheduled tasks), see [`templates/scheduled-tasks/`](./templates/scheduled-tasks/).
