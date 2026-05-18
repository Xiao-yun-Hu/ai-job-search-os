#!/usr/bin/env python3
"""
AI Job Search OS — Distillation Pipeline (L0 → L1 → L2 → L3)

Runs nightly via cron (default: 23:30 local time).

Flow:
1. Scan today's Hermes sessions at ~/.hermes/sessions/session_YYYYMMDD_*.json
2. Extract atomic facts (L1) → append to ~/.ai-job-search/atoms.jsonl
3. Aggregate today's atoms → ~/.ai-job-search/L2_scenarios/retro_YYYY-MM-DD.md
4. Recompute funnel snapshot → overwrite ~/.ai-job-search/L3_persona/current_state.md
5. Apply promotion rules (decisions/learnings observed multiple times → L3 append)

Design choices:
- Pure file-based. No DB. No vector store. Grep-friendly.
- LLM-free fallback: if no LLM is configured, falls back to a rule-based extractor
  that only catches the most obvious atom types (application/conversation).
  LLM mode (preferred) uses any OpenAI-compatible endpoint via env vars.

Environment variables:
  AI_JOB_SEARCH_DIR       — base dir (default: ~/.ai-job-search)
  AI_JOB_SEARCH_LLM_URL   — OpenAI-compatible endpoint for extraction
  AI_JOB_SEARCH_LLM_KEY   — API key
  AI_JOB_SEARCH_LLM_MODEL — model name (default: gpt-4o-mini)
  HERMES_SESSIONS_DIR     — Hermes sessions dir (default: ~/.hermes/sessions)
  AI_JOB_SEARCH_DRY_RUN   — if set, don't write any files, just print plan
"""

import argparse
import json
import os
import sys
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional


# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

BASE = Path(os.environ.get("AI_JOB_SEARCH_DIR",
                            os.path.expanduser("~/.ai-job-search"))).resolve()
SESSIONS_DIR = Path(os.environ.get("HERMES_SESSIONS_DIR",
                                    os.path.expanduser("~/.hermes/sessions"))).resolve()
LLM_URL = os.environ.get("AI_JOB_SEARCH_LLM_URL", "").strip()
LLM_KEY = os.environ.get("AI_JOB_SEARCH_LLM_KEY", "").strip()
LLM_MODEL = os.environ.get("AI_JOB_SEARCH_LLM_MODEL", "gpt-4o-mini").strip()
DRY_RUN = bool(os.environ.get("AI_JOB_SEARCH_DRY_RUN", "").strip())

ATOMS_FILE = BASE / "atoms.jsonl"
L2_DIR = BASE / "L2_scenarios"
L3_DIR = BASE / "L3_persona"

# ─────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────


def log(msg: str) -> None:
    """Print with timestamp."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def today_local() -> datetime:
    return datetime.now()


def ts_iso(dt: Optional[datetime] = None) -> str:
    return (dt or datetime.now(timezone.utc).astimezone()).isoformat(timespec="seconds")


def ensure_dirs():
    L2_DIR.mkdir(parents=True, exist_ok=True)
    L3_DIR.mkdir(parents=True, exist_ok=True)


def read_atoms() -> list[dict]:
    if not ATOMS_FILE.exists():
        return []
    out = []
    with ATOMS_FILE.open() as f:
        for ln, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                log(f"WARN: atoms.jsonl line {ln} is not valid JSON, skipping")
    return out


def append_atoms(new_atoms: list[dict]) -> None:
    if not new_atoms:
        return
    if DRY_RUN:
        log(f"[dry-run] would append {len(new_atoms)} atoms to {ATOMS_FILE}")
        return
    with ATOMS_FILE.open("a") as f:
        for a in new_atoms:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    log(f"appended {len(new_atoms)} atoms to {ATOMS_FILE}")


def write_file(path: Path, content: str) -> None:
    if DRY_RUN:
        log(f"[dry-run] would write {len(content)} bytes to {path}")
        return
    path.write_text(content, encoding="utf-8")
    log(f"wrote {path}")


# ─────────────────────────────────────────────────────────────────────
# Session loading (L0)
# ─────────────────────────────────────────────────────────────────────

def find_sessions_for_date(date: datetime) -> list[Path]:
    """Find Hermes session files for a given date."""
    if not SESSIONS_DIR.exists():
        log(f"WARN: sessions dir not found: {SESSIONS_DIR}")
        return []
    pattern = f"session_{date:%Y%m%d}_*.json"
    return sorted(SESSIONS_DIR.glob(pattern))


def extract_text_from_session(path: Path) -> str:
    """Pull only the user+assistant text from a Hermes session file."""
    try:
        data = json.loads(path.read_text())
    except Exception as e:
        log(f"WARN: failed to read {path.name}: {e}")
        return ""

    # Hermes session format: list of message dicts with role/content
    messages = data if isinstance(data, list) else data.get("messages", [])
    chunks = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            chunks.append(f"### {role}\n{content.strip()}\n")
    return "\n".join(chunks)


# ─────────────────────────────────────────────────────────────────────
# Atom extraction (L0 → L1)
# ─────────────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """\
You are an extraction agent for a job-search memory system. Read the conversation below and output ATOMIC FACTS as JSONL — one JSON object per line.

Each fact must match this schema:
{
  "ts": "<best-effort ISO timestamp, or the session's date>",
  "source": "<session id, given to you>",
  "type": "application | conversation | decision | learning | feedback",
  "entities": { "...": "..." },
  "content": "<1-2 sentence plain-text statement>"
}

The 5 types:
- application: user applied to a specific job (entities: company, title, platform, tier?, salary?, location?, url?)
- conversation: HR/recruiter/founder interaction with stage progress (entities: company, stage [reply|deep_chat|interview|rejected], channel?, counterparty?)
- decision: user stated a HARD RULE that should be obeyed in future automation (entities: scope, rule)
- learning: a new pattern observed but not yet a rule (entities: pattern, evidence_count)
- feedback: outcome of an action (entities: company, outcome, stage)

Skip:
- Tool-call traces, search queries, page navigation
- Casual chat, greetings, thanks
- One-off context that won't matter next session
- Speculation about jobs not actually applied to

Output ONLY the JSONL lines, no commentary, no markdown fences. If nothing extractable, output an empty string.

Session id: {session_id}
Session date: {session_date}

----- CONVERSATION -----
{transcript}
----- END -----
"""


def extract_atoms_llm(session_id: str, session_date: str, transcript: str) -> list[dict]:
    """Use OpenAI-compatible API to extract atoms from a session transcript."""
    import urllib.request
    import urllib.error

    if not LLM_URL or not LLM_KEY:
        return []

    if not transcript.strip():
        return []

    prompt = EXTRACTION_PROMPT.format(
        session_id=session_id,
        session_date=session_date,
        transcript=transcript[:30000]  # cap context size
    )

    payload = json.dumps({
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
    }).encode()

    req = urllib.request.Request(
        f"{LLM_URL.rstrip('/')}/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {LLM_KEY}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            text = data["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        log(f"LLM HTTP error: {e.code} {e.reason}")
        return []
    except Exception as e:
        log(f"LLM call failed: {e}")
        return []

    # Parse JSONL output
    atoms = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("```"):
            continue
        try:
            obj = json.loads(line)
            if isinstance(obj, dict) and "type" in obj:
                # Force source field
                obj["source"] = session_id
                atoms.append(obj)
        except json.JSONDecodeError:
            continue
    return atoms


def extract_atoms_rules(session_id: str, session_date: str, transcript: str) -> list[dict]:
    """Fallback: rule-based extraction for the most obvious atoms when no LLM is configured."""
    atoms: list[dict] = []

    # Crude pattern: "applied to X" or "投了 X" — generate an application atom
    application_patterns = [
        r"(?:applied to|投了|投递了|投出去了)\s+([^\s,。.，\n]{2,30})",
        r"申请了\s+([^\s,。.，\n]{2,30})\s+的",
    ]
    for pat in application_patterns:
        for m in re.finditer(pat, transcript):
            company = m.group(1).strip(" \"'`")
            atoms.append({
                "ts": ts_iso(),
                "source": session_id,
                "type": "application",
                "entities": {"company": company},
                "content": f"User mentioned applying to {company} (rule-extracted, low confidence).",
                "confidence": 0.5,
            })

    # Crude: "X 回了" / "X replied" → conversation
    reply_patterns = [
        r"([^\s,。.，\n]{2,30})\s*(?:HR|recruiter)?\s*(?:回了|replied|got back to|reached out)",
    ]
    for pat in reply_patterns:
        for m in re.finditer(pat, transcript):
            company = m.group(1).strip()
            atoms.append({
                "ts": ts_iso(),
                "source": session_id,
                "type": "conversation",
                "entities": {"company": company, "stage": "reply"},
                "content": f"{company} sent a reply (rule-extracted, low confidence).",
                "confidence": 0.4,
            })

    return atoms


def extract_atoms_for_date(date: datetime, existing_sources: set[str]) -> list[dict]:
    """Process all sessions for a date, returning new atoms."""
    sessions = find_sessions_for_date(date)
    log(f"found {len(sessions)} sessions for {date:%Y-%m-%d}")

    new_atoms = []
    for sess in sessions:
        # Session ID = filename without extension
        sess_id = sess.stem
        if sess_id in existing_sources:
            continue  # already processed
        text = extract_text_from_session(sess)
        if not text:
            continue

        if LLM_URL and LLM_KEY:
            atoms = extract_atoms_llm(sess_id, date.strftime("%Y-%m-%d"), text)
            if not atoms:
                log(f"LLM extracted 0 atoms from {sess.name}, trying rule-based fallback")
                atoms = extract_atoms_rules(sess_id, date.strftime("%Y-%m-%d"), text)
        else:
            atoms = extract_atoms_rules(sess_id, date.strftime("%Y-%m-%d"), text)

        log(f"  {sess.name}: {len(atoms)} atoms")
        new_atoms.extend(atoms)

    return new_atoms


# ─────────────────────────────────────────────────────────────────────
# L2 retro generation (L1 → L2)
# ─────────────────────────────────────────────────────────────────────

def generate_retro(date: datetime, atoms: list[dict]) -> str:
    """Generate human-readable daily retro from atoms."""
    date_str = date.strftime("%Y-%m-%d")
    today_atoms = [a for a in atoms if a.get("ts", "").startswith(date_str)]

    applications = [a for a in today_atoms if a.get("type") == "application"]
    conversations = [a for a in today_atoms if a.get("type") == "conversation"]
    decisions = [a for a in today_atoms if a.get("type") == "decision"]
    learnings = [a for a in today_atoms if a.get("type") == "learning"]
    feedbacks = [a for a in today_atoms if a.get("type") == "feedback"]

    # Funnel from today's atoms
    stages = Counter()
    for a in today_atoms:
        if a.get("type") == "application":
            stages["sent"] += 1
        elif a.get("type") == "conversation":
            stage = a.get("entities", {}).get("stage", "reply")
            stages[stage] += 1
        elif a.get("type") == "feedback":
            outcome = a.get("entities", {}).get("outcome", "")
            if outcome:
                stages[outcome] += 1

    lines = [
        f"# Daily Retro — {date_str}",
        f"",
        f"> Auto-generated by `scripts/distill.py` from L1 atoms at {ts_iso()}.",
        f"",
        f"## Funnel (today)",
        f"",
        f"- Sent: {stages['sent']}",
        f"- Reply: {stages['reply']}",
        f"- Deep_chat: {stages['deep_chat']}",
        f"- Interview: {stages['interview']}",
        f"- Rejected: {stages['rejected']}",
        f"",
        f"## Applications ({len(applications)})",
        f"",
    ]
    if applications:
        lines.append("| Company | Title | Tier | Salary | Platform |")
        lines.append("|---|---|---|---|---|")
        for a in applications:
            e = a.get("entities", {})
            lines.append(
                f"| {e.get('company', '-')} | {e.get('title', '-')} | "
                f"{e.get('tier', '-')} | {e.get('salary', '-')} | {e.get('platform', '-')} |"
            )
    else:
        lines.append("_None today._")

    lines.extend([
        "",
        f"## Conversations ({len(conversations)})",
        "",
    ])
    if conversations:
        for a in conversations:
            e = a.get("entities", {})
            lines.append(f"- **{e.get('company', '-')}** ({e.get('stage', '-')}): {a.get('content', '')}")
    else:
        lines.append("_None today._")

    lines.extend([
        "",
        f"## Decisions stated ({len(decisions)})",
        "",
    ])
    for a in decisions:
        lines.append(f"- {a.get('content', '')}")
    if not decisions:
        lines.append("_None today._")

    lines.extend([
        "",
        f"## Learnings observed ({len(learnings)})",
        "",
    ])
    for a in learnings:
        lines.append(f"- {a.get('content', '')}")
    if not learnings:
        lines.append("_None today._")

    lines.extend([
        "",
        f"## Outcomes / feedback ({len(feedbacks)})",
        "",
    ])
    for a in feedbacks:
        e = a.get("entities", {})
        lines.append(f"- **{e.get('company', '-')}** {e.get('outcome', '-')} ({e.get('stage', '-')}): {a.get('content', '')}")
    if not feedbacks:
        lines.append("_None today._")

    lines.extend([
        "",
        "## Notes",
        "",
        "- Pattern observations here are **observation only** — they do not modify Match rules.",
        "- Promotion to `L3_persona/strategy.md` happens only when a pattern is seen 3+ times.",
        "- For active conversations needing follow-up, see `L3_persona/current_state.md`.",
    ])

    return "\n".join(lines) + "\n"


# ─────────────────────────────────────────────────────────────────────
# L3 current_state regeneration (L1 → L3)
# ─────────────────────────────────────────────────────────────────────

def generate_current_state(all_atoms: list[dict]) -> str:
    """Recompute the L3 operational snapshot from ALL atoms (last 7 days)."""
    cutoff = datetime.now() - timedelta(days=7)
    cutoff_iso = cutoff.strftime("%Y-%m-%d")

    recent = [a for a in all_atoms if a.get("ts", "") >= cutoff_iso]

    # Funnel: distinct companies per stage
    by_company_stage = defaultdict(lambda: "sent")
    stage_rank = {"sent": 1, "read": 2, "reply": 3, "deep_chat": 4, "interview": 5, "final": 6, "offer": 7}

    for a in recent:
        e = a.get("entities", {})
        company = e.get("company")
        if not company:
            continue
        if a.get("type") == "application":
            cur = by_company_stage[company]
            if stage_rank.get("sent", 0) >= stage_rank.get(cur, 0):
                by_company_stage[company] = "sent"
        elif a.get("type") == "conversation":
            stage = e.get("stage", "reply")
            cur = by_company_stage[company]
            if stage_rank.get(stage, 0) > stage_rank.get(cur, 0):
                by_company_stage[company] = stage
        elif a.get("type") == "feedback":
            outcome = e.get("outcome", "")
            if outcome in stage_rank:
                cur = by_company_stage[company]
                if stage_rank.get(outcome, 0) > stage_rank.get(cur, 0):
                    by_company_stage[company] = outcome

    stage_counts = Counter(by_company_stage.values())

    # Active conversations: anything reply or above
    active = [
        (c, s) for c, s in by_company_stage.items()
        if stage_rank.get(s, 0) >= stage_rank.get("reply", 0)
    ]

    lines = [
        "---",
        "name: job search operational snapshot",
        "description: Current operational state — overwritten nightly by distill.py.",
        "type: project",
        "---",
        "",
        "> ⚠️ This file is **overwritten** (not appended) each night.",
        "> Historical data lives in `L2_scenarios/retro_YYYY-MM-DD.md`.",
        "",
        f"## Last Updated",
        f"{ts_iso()} (by `scripts/distill.py`)",
        "",
        "## Funnel Snapshot (last 7 days, distinct companies per stage)",
        f"- Sent: {stage_counts['sent']}",
        f"- Read: {stage_counts['read']}",
        f"- Reply: {stage_counts['reply']}",
        f"- Deep_chat: {stage_counts['deep_chat']}",
        f"- Interview: {stage_counts['interview']}",
        f"- Final: {stage_counts['final']}",
        f"- Offer: {stage_counts['offer']}",
        "",
        "## Active Conversations (reply stage and above)",
        "",
    ]
    if active:
        lines.append("| Company | Stage |")
        lines.append("|---|---|")
        for c, s in sorted(active, key=lambda x: -stage_rank.get(x[1], 0)):
            lines.append(f"| {c} | {s} |")
    else:
        lines.append("_None currently active._")

    lines.extend([
        "",
        "## Pipeline Health",
        f"- Total applications (last 7 days): {stage_counts['sent']}",
        f"- Reply rate: {stage_counts['reply'] / max(stage_counts['sent'], 1) * 100:.0f}%",
        "",
        "## Source",
        f"- Atoms scanned: {len(all_atoms)}",
        f"- Atoms in window: {len(recent)}",
        f"- Cutoff: {cutoff_iso}",
    ])
    return "\n".join(lines) + "\n"


# ─────────────────────────────────────────────────────────────────────
# Promotion rules (L1 → L3 strategy.md / decision_rules.md)
# ─────────────────────────────────────────────────────────────────────

def apply_promotion_rules(all_atoms: list[dict]) -> dict[str, list[str]]:
    """
    Returns a dict of L3 files that should get appended-to (in dry-run we just report).
    """
    promotions: dict[str, list[str]] = {"strategy.md": [], "decision_rules.md": []}

    # Rule: same decision atom (by entities.rule) seen 2+ times → promote to decision_rules.md
    decision_atoms = [a for a in all_atoms if a.get("type") == "decision"]
    rule_counts = Counter(a.get("entities", {}).get("rule", "") for a in decision_atoms if a.get("entities", {}).get("rule"))
    for rule, n in rule_counts.items():
        if n >= 2:
            promotions["decision_rules.md"].append(f"- **{rule}** (observed {n}× across sessions)")

    # Rule: same learning pattern (by entities.pattern) seen 3+ times → promote to strategy.md
    learning_atoms = [a for a in all_atoms if a.get("type") == "learning"]
    pattern_counts = Counter(a.get("entities", {}).get("pattern", "") for a in learning_atoms if a.get("entities", {}).get("pattern"))
    for pat, n in pattern_counts.items():
        if n >= 3:
            promotions["strategy.md"].append(f"- **{pat}** (observed {n}× across sessions)")

    return promotions


def append_promotions(promotions: dict[str, list[str]]) -> None:
    for fname, items in promotions.items():
        if not items:
            continue
        target = L3_DIR / fname
        if not target.exists():
            log(f"WARN: {target} does not exist, skipping promotion")
            continue
        # Check existing content to avoid duplicates
        existing = target.read_text()
        new_items = [item for item in items if item not in existing]
        if not new_items:
            log(f"  no new {fname} promotions (all already present)")
            continue
        if DRY_RUN:
            log(f"[dry-run] would append {len(new_items)} items to {target}")
            for x in new_items:
                log(f"    {x}")
            continue
        with target.open("a") as f:
            f.write(f"\n## Auto-promoted ({datetime.now():%Y-%m-%d})\n\n")
            for x in new_items:
                f.write(x + "\n")
        log(f"appended {len(new_items)} items to {target}")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI Job Search OS — Distillation Pipeline")
    parser.add_argument("--date", help="date to distill (YYYY-MM-DD, default: today)",
                        default=None)
    parser.add_argument("--dry-run", action="store_true", help="don't write any files")
    args = parser.parse_args()

    global DRY_RUN
    if args.dry_run:
        DRY_RUN = True

    if args.date:
        try:
            date = datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            log(f"ERROR: bad date {args.date}, expected YYYY-MM-DD")
            sys.exit(1)
    else:
        date = today_local()

    log(f"distill.py starting — date={date:%Y-%m-%d} dry_run={DRY_RUN}")
    log(f"  base={BASE}")
    log(f"  sessions={SESSIONS_DIR}")
    log(f"  llm={'configured' if (LLM_URL and LLM_KEY) else 'NOT configured (rule-based fallback)'}")

    if not BASE.exists():
        log(f"ERROR: base dir does not exist: {BASE}")
        log("Run scripts/install.sh first to create the directory structure.")
        sys.exit(1)

    ensure_dirs()

    # L0 → L1
    existing_atoms = read_atoms()
    existing_sources = {a.get("source", "") for a in existing_atoms}
    log(f"existing atoms: {len(existing_atoms)} from {len(existing_sources)} sessions")

    new_atoms = extract_atoms_for_date(date, existing_sources)
    append_atoms(new_atoms)

    # Re-read after append (for full data when computing L2/L3)
    all_atoms = existing_atoms + new_atoms

    # L1 → L2
    retro_path = L2_DIR / f"retro_{date:%Y-%m-%d}.md"
    retro_content = generate_retro(date, all_atoms)
    write_file(retro_path, retro_content)

    # L1 → L3 current_state
    state_path = L3_DIR / "current_state.md"
    state_content = generate_current_state(all_atoms)
    write_file(state_path, state_content)

    # L1 → L3 promotions
    promotions = apply_promotion_rules(all_atoms)
    append_promotions(promotions)

    log("distill.py done.")


if __name__ == "__main__":
    main()
