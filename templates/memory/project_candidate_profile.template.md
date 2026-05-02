---
name: candidate profile snapshot
description: Complete candidate state — resume facts + compensation expectations + geographic constraints + narrative pillars + user-stated decision priority
type: project
---

> **Source of truth (SSOT)**: All candidate facts live here. Don't duplicate in feedback / decision files — they reference this.
> **Resume file**: `[/path/to/main/resume.pdf]`
> **Update cadence**: when user explicitly says so. Identity rarely changes; preferences monthly review.

## Basic Info

- Name: [Full name]
- Contact: [Email] / [Phone]
- Years experience: [N]+
- Current location: [City]
- Education:
  - Master's: [University, degree, years]
  - Bachelor's: [University, degree, years]
- Resume target city: [City] (resume default; actual acceptable list in geographic preferences below)
- Job-search direction: [e.g., AI Product Architect / AI Systems / Applied AI / AI Solutions]

## Career Timeline

| Period | Company | Role | Key outputs |
|---|---|---|---|
| YYYY.MM-YYYY.MM | [Current Company] | [Title] | [1-line summary of flagship project] |
| YYYY.MM-YYYY.MM | [Prev Company] | [Title] | [1-line key outputs / metrics] |
| ... | ... | ... | ... |

## Narrative Pillars (3-5 core stories — repeat across resume / outreach / interview)

### Pillar 1: [Claim, e.g., "Compressed end-to-end research from weeks to 1 day"]
- Number: [Multiplier or specific impact, e.g., 20× efficiency]
- Use case: [When in resume / outreach / interview to deploy this]
- TODO: client case STAR story (Situation / Task / Action / Result)

### Pillar 2: [Scale leverage, e.g., "10× analysis coverage without headcount increase"]
### Pillar 3: [Quality gating, e.g., "Production eval system: ≥95% accuracy, <2% hallucination"]
### Pillar 4: [Framework reuse, e.g., "Compressed dev cycle 3 months → 1 week"]
### Pillar 5: [Technical depth, e.g., "4-layer reasoning architecture with causal grounding"]

## Compensation Expectations (by region)

| Region | Floor (monthly or annual) | Ceiling (annual) | Note |
|---|---|---|---|
| [Home country] | [BOSS monthly K] | [Annual range with #-month bonus] | [Source / past offers] |
| [Region 2, e.g., SG/HK] | [—] | [Equivalent] | [—] |
| [Region 3, e.g., US] | [—] | [USD] | [—] |

> ⚠️ **State your decision priority below — different candidates legitimately rank these differently.** Don't leave default; the system applies your stated priority.

## Geographic Disqualifiers (hard constraint)

### [Home country]
- ✅ Accept: [List of accepted cities]
- ❌ Reject: All other cities

### Overseas
- ✅ Priority: [List of priority regions]
- See `feedback_target_strategy.md` for additional preferences (e.g., founder background, parent-company affinity)

## Decision Priority (user-stated)

> ⚠️ **Fill this in yourself — there is no universal default.** Different candidates legitimately rank these dimensions differently.

### Step 1: Rank these dimensions for yourself

Number 1-5+ in your priority order (1 = most important):

- [ ] **Vibe / culture fit** — team, founder character, working style
- [ ] **Compensation** — total comp (cash + equity + bonus)
- [ ] **Role-form fit** — does the work match what you want to do
- [ ] **Speed / timing** — need offer by specific date
- [ ] **Career trajectory** — growth, brand, scope of responsibility
- [ ] **Geographic** — already a hard gate but might be ranked in priority too
- [ ] **Other** — _______ (e.g., mission, industry, team size, equity-vs-cash mix)

### Step 2: Write your priority statement

Example formats (pick one or write your own):

**Example A — Vibe-prioritizing** (e.g., already have stable role):
> "I'm OK on money. Main thing is whether the team's vibe and taste match mine. Won't accept low vibe even with high comp."

**Example B — Comp-prioritizing** (e.g., financial milestone, dependents):
> "Comp is the binding constraint — I need ≥X total comp. Vibe matters but I'll accept vibe 3+ if comp clears my target."

**Example C — Speed-prioritizing** (e.g., visa deadline, role gap):
> "I need an offer by [date]. Optimize for time-to-offer with floor-acceptable other dimensions. Skip anything that won't move fast."

**Example D — Trajectory-prioritizing** (e.g., career pivot):
> "I'm willing to take a comp hit and accept some vibe variance for a 2-3 year setup that opens [specific career path]. Not for cash, not for prestige."

**Your priority statement**:
> [User stated YYYY-MM-DD: "_______"]

### Step 3: How this applies

The system applies your priority in:
- **Match Function tier weighting** — when evaluating an opportunity, your top-priority dimension carries more weight in tier assignment
- **Trade-off matrix** — when an opportunity is strong on some dimensions and weak on others, your priority resolves the trade-off (see `docs/SYSTEM.md` Section 5.4 for example matrices)
- **Offer evaluation** — when comparing 2 offers, your stated priority is the tiebreaker

## Known Narrative Gaps (TODO)

> What you know but haven't yet articulated as STAR stories:

- [ ] Pillar 1 specific client case
- [ ] Pillar 2 ...
- [ ] etc.

Action: Schedule a "narrative deep dive" session to fill these in.

## Job-Position Targeting

### Preferred (matches narrative pillars)
- [Title 1]
- [Title 2]
- ...

### Acceptable with caveats
- [Title 1, conditional on JD review]

### Rejected (hard filter)
- ❌ [Pure / generic / off-target titles]
- ❌ [Method-mismatch types, e.g., model training when you're applied-AI]

## Resume Version Management

| File | Use | Status |
|---|---|---|
| [main resume PDF path] | Primary applications | Main version |
| [region-specific PDF path] | Specific outreach | Variant |
| [English version path] | Overseas cold outreach | TODO if missing |
| ... historical versions | Archive | Don't maintain |

## Relationship to other memory files

- `feedback_target_strategy.md` — strategic preferences (where to target, why)
- `feedback_parallel_outreach.md` — execution rhythm
- `decision_salary_floor.md` — hard salary filter applied at job filtering
- `decision_geographic_filter.md` — hard geographic filter
- `project_target_companies.md` — concrete company list (Tiered)

This file is the **identity SSOT**. All candidate facts referenced elsewhere should point here.
