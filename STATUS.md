# Build Status — v1.0 SHIPPED ✅

**Repo**: https://github.com/Xiao-yun-Hu/ai-job-search-os
**License**: MIT (public)

## Release log

### v1.0 — 2026-05-02 (commit `f448e09`)
Initial release. 27 files, 2768 lines.

- 6-layer system architecture (`docs/SYSTEM.md`)
- 12 memory templates (5-type taxonomy)
- 5 scheduled task templates
- `config.yaml.template`
- 3 anonymized example outputs
- Bilingual README

### v1.0.1 — 2026-05-03 (commit `87095d8`)
README repositioning per maintainer feedback.

- Generalized positioning from "AI / Applied AI / Solutions" specialist to universal job-search OS
- New subtitle: "An AI-powered operating system for improving job-search conversion rates"
- Broadened "Who Is This For": fresh grads / career switchers / mid-career / senior
- Added "What Makes This Different" section
- Added Roadmap (v1.0 / v1.1 / v2.0)
- Moved AI-specialist origin story to bottom section

### v1.0.2 — 2026-05-03
Agent onboarding flow added.

- New `AGENTS.md` at repo root — 5-stage onboarding flow (~50 min) for AI agents helping users
  - Stage 1: Diagnose (career stage, geography, urgency, materials, comp, vibe>money)
  - Stage 2: Setup (candidate profile, target list, hard gates, decision memory)
  - Stage 3: Calibrate Match Function (compare Tier output to user intuition)
  - Stage 4: First run (manual review before auto-deploy)
  - Stage 5: Schedule deployment
- README adds "Using with an AI Agent" section pointing to AGENTS.md
- Closes UX gap: previously agents would skip onboarding and run morning task with empty config

## Stats

| Metric | Value |
|---|---|
| Files | 27 |
| Lines | ~3000 |
| PII leaks | 0 (verified) |
| Languages | EN + CN |
| License | MIT |

## Suggested next steps (optional, for v1.1+)

- `gh repo edit Xiao-yun-Hu/ai-job-search-os --add-topic ai-agents,job-search,claude-code,career-tools`
- `gh release create v1.0.1` to tag the repositioning
- Pin to GitHub profile
- Announcement post on LinkedIn / X
- v1.1 work: job-board adapters (LinkedIn / SEEK / Indeed), resume parsing pipeline
