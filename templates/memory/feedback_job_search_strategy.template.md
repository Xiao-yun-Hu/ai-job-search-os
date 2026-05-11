---
name: Job Search Strategy Preferences
description: Soft strategy for Rachel's job search — target company criteria, culture filter, uncertain signal handling, outreach principles. Can evolve with evidence.
type: feedback
---

## 1. Target Company Criteria

### Strong Match Signals
- [PRIMARY_FOCUS]: e.g., AI operating substrate / agent orchestration / evaluation infra / decision systems
- Company publicly discusses evaluation / observability / reliability
- Founder has research DNA or technically honest operator background
- Product core is [YOUR_DOMAIN], not "[AI as a bolt-on]"
- Team size [MIN]-[MAX] people, [FUNDING_STAGE] funding

### Boost Signals (helpful, not required)
- [e.g., founder background affinity]
- [e.g., geographic footprint matching your preference]
- [e.g., JD mentions flexible / remote work]

### Hard Filter (exclude)
- [EXCLUDED_COMPANY_TYPE_1]: e.g., traditional enterprise with AI as tooling layer only
- [EXCLUDED_COMPANY_TYPE_2]: e.g., pure foundation model research lab
- [EXCLUDED_ROLE_TYPE]: e.g., LLM training, robotics, content moderation

---

## 2. Culture Filter (vibe check)

Even when compensation and JD requirements are met, flag as high-vibe-risk and require explicit user confirmation before applying if:
- [RISK_SIGNAL_1]: e.g., deep hierarchy, traditional industry, AI positioned as "digital transformation"
- [RISK_SIGNAL_2]: e.g., recruiter questions focus on analytics output, not system design

**Exception:** [e.g., large but AI-native companies like X/Y are exempt — scale ≠ culture mismatch]

**Why:** [Add your own calibration note here — e.g., "Interview at Company X confirmed vibe misalign despite strong JD."]

---

## 3. Uncertain Signal Handling (Match Function)

When evaluating a JD and ≥3 signals are `unknown`:

- **Interactive session (user present):** Ask directly — "Have you heard of this company? Know anything about the founder?" — finalize tier after answer
- **Autonomous task (morning batch):** Do NOT interrupt. Mark as `tier: pending_user_input`, queue for evening retro review
- **After user responds:**
  - Provides info → re-run match, output new tier
  - Says "deprioritize" → apply with reason
  - Says "trust default" → keep tier as-is
- **User silent >48h:** Downgrade one tier silently; reason = "user did not provide signal within 48h"

**Exception (do not trigger ask protocol):**
- ≤2 unknowns and the primary axes (role alignment + domain relevance) are both visible → hold tier, no ask
- 1 unknown → no effect on tier

---

## 4. Outreach Execution Principles

### Parallel, not sequential
- Run Track A (overseas / founder outreach) and Track B (domestic / job board) simultaneously
- Do not batch by tier — tier determines follow-up priority, not send order
- **Do not suggest reducing daily job board activity** — it sustains inbound visibility on top of outbound

### Job board activity is bidirectional
- Outbound: daily morning outreach (you reach out)
- Inbound: recruiters see your active profile and message you (algorithmic visibility)
- Both matter. Missing one day drops the signal.

### Track A outreach principles
- Channel priority: direct DM to founder/hiring manager → community / mutual → job portal (last resort)
- Do not mass-apply to JD portals for Track A targets
- Pre-requisite: English cold outreach narrative + English resume (confirm ready before launching)

### Interview feedback loop
- After 1-2 interviews: produce a vibe + JD-accuracy note
- Use that to refine outreach copy for the next wave
- Real interview signal > paper analysis
