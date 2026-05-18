#!/usr/bin/env bash
#
# AI Job Search OS — Installer
#
# Sets up:
#   ~/.ai-job-search/                       (data dir with L1/L2/L3 layers)
#   ~/.hermes/skills/ai-job-search/         (Hermes skill — symlinked to repo)
#   crontab entry for nightly distillation  (optional, asks before adding)
#
# Re-run safe: skips existing files unless --force.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${AI_JOB_SEARCH_DIR:-$HOME/.ai-job-search}"
HERMES_SKILL_DIR="${HERMES_SKILL_DIR:-$HOME/.hermes/skills/ai-job-search}"

FORCE=0
NO_CRON=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --no-cron) NO_CRON=1 ;;
    -h|--help)
      cat <<EOF
Usage: bash scripts/install.sh [--force] [--no-cron]

  --force     Overwrite existing files in ~/.ai-job-search/ (default: skip)
  --no-cron   Skip crontab setup (default: ask interactively)

Env vars:
  AI_JOB_SEARCH_DIR    override data dir (default: ~/.ai-job-search)
  HERMES_SKILL_DIR     override skill install path (default: ~/.hermes/skills/ai-job-search)
EOF
      exit 0
      ;;
  esac
done

say()  { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
skip() { printf "  \033[33m·\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m⚠\033[0m %s\n" "$*"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$*"; }

# ─── 1. Sanity ────────────────────────────────────────────────────────────────

say "Pre-flight checks"

if ! command -v python3 >/dev/null 2>&1; then
  err "python3 not found in PATH — install Python 3.9+ first."
  exit 1
fi
ok "python3: $(python3 --version)"

if [ ! -d "$REPO_DIR/templates" ] || [ ! -d "$REPO_DIR/skills" ]; then
  err "Repo structure missing: $REPO_DIR — are you running from a checkout?"
  exit 1
fi
ok "repo: $REPO_DIR"

# ─── 2. Create data dir layout ────────────────────────────────────────────────

say "Setting up data dir: $DATA_DIR"

mkdir -p "$DATA_DIR/L2_scenarios/archive"
mkdir -p "$DATA_DIR/L3_persona"
mkdir -p "$DATA_DIR/operational"
ok "created directory tree"

# Touch atoms.jsonl
if [ ! -f "$DATA_DIR/atoms.jsonl" ]; then
  : > "$DATA_DIR/atoms.jsonl"
  ok "created atoms.jsonl (empty)"
else
  skip "atoms.jsonl exists (preserving existing data)"
fi

# Copy L3 templates if not present (or --force)
copy_template() {
  local src="$1"
  local dst="$2"
  if [ -f "$dst" ] && [ "$FORCE" -eq 0 ]; then
    skip "$(basename "$dst") exists — skipping (use --force to overwrite)"
  else
    cp "$src" "$dst"
    ok "$(basename "$dst") installed"
  fi
}

copy_template "$REPO_DIR/templates/memory/project_candidate_profile.template.md" \
              "$DATA_DIR/L3_persona/candidate_profile.md"
copy_template "$REPO_DIR/templates/memory/project_company_targets.template.md" \
              "$DATA_DIR/L3_persona/company_targets.md"
copy_template "$REPO_DIR/templates/memory/project_job_search_current_state.template.md" \
              "$DATA_DIR/L3_persona/current_state.md"
copy_template "$REPO_DIR/templates/memory/feedback_job_search_strategy.template.md" \
              "$DATA_DIR/L3_persona/strategy.md"
copy_template "$REPO_DIR/templates/memory/decision_task_rules.template.md" \
              "$DATA_DIR/L3_persona/decision_rules.md"

# Operational defaults
if [ ! -f "$DATA_DIR/operational/search_config.json" ]; then
  cat > "$DATA_DIR/operational/search_config.json" <<'JSON'
{
  "keywords": [],
  "platforms": ["linkedin"],
  "daily_cap": 10,
  "score_threshold": 6
}
JSON
  ok "search_config.json (defaults)"
else
  skip "search_config.json exists"
fi

if [ ! -f "$DATA_DIR/operational/company_blacklist.json" ]; then
  echo "[]" > "$DATA_DIR/operational/company_blacklist.json"
  ok "company_blacklist.json (empty)"
else
  skip "company_blacklist.json exists"
fi

if [ ! -f "$DATA_DIR/operational/applications.jsonl" ]; then
  : > "$DATA_DIR/operational/applications.jsonl"
  ok "applications.jsonl (empty)"
else
  skip "applications.jsonl exists"
fi

# ─── 3. Install Hermes skill (symlink to repo) ────────────────────────────────

say "Installing Hermes skill: $HERMES_SKILL_DIR"

mkdir -p "$(dirname "$HERMES_SKILL_DIR")"

if [ -L "$HERMES_SKILL_DIR" ]; then
  rm "$HERMES_SKILL_DIR"
  ok "removed existing symlink"
elif [ -d "$HERMES_SKILL_DIR" ]; then
  if [ "$FORCE" -eq 1 ]; then
    rm -rf "$HERMES_SKILL_DIR"
    ok "removed existing directory (--force)"
  else
    warn "$HERMES_SKILL_DIR is a directory (not symlink) — leaving it. Use --force to replace."
  fi
fi

if [ ! -e "$HERMES_SKILL_DIR" ]; then
  ln -s "$REPO_DIR/skills/ai-job-search" "$HERMES_SKILL_DIR"
  ok "symlinked: $HERMES_SKILL_DIR → $REPO_DIR/skills/ai-job-search"
fi

# ─── 4. Optional: install nightly cron ────────────────────────────────────────

if [ "$NO_CRON" -eq 1 ]; then
  skip "cron setup skipped (--no-cron)"
else
  say "Optional: nightly distillation cron"
  echo "  Distillation pipeline runs L0 → L1 → L2 → L3 each night."
  echo "  Default schedule: 23:30 daily."
  echo ""
  read -r -p "  Install cron entry now? [y/N] " resp
  if [[ "$resp" =~ ^[Yy]$ ]]; then
    CRON_LINE="30 23 * * * /usr/bin/env python3 $REPO_DIR/scripts/distill.py >> $DATA_DIR/distill.log 2>&1"
    current_cron=$(crontab -l 2>/dev/null || true)
    if echo "$current_cron" | grep -q "ai-job-search-os.*distill.py\|distill.py.*ai-job-search"; then
      skip "cron entry for distill.py already present"
    else
      (echo "$current_cron"; echo "# ai-job-search-os distillation (added by install.sh)"; echo "$CRON_LINE") \
        | grep -v '^$' | crontab -
      ok "added cron entry: $CRON_LINE"
    fi
  else
    skip "no cron entry added — you can run manually: python3 $REPO_DIR/scripts/distill.py"
  fi
fi

# ─── 5. Final summary ─────────────────────────────────────────────────────────

say "Setup complete."
echo
echo "Next steps:"
echo "  1. Fill in your profile:  \$EDITOR $DATA_DIR/L3_persona/candidate_profile.md"
echo "  2. List target companies: \$EDITOR $DATA_DIR/L3_persona/company_targets.md"
echo "  3. Configure LLM for distillation (optional but recommended):"
echo "       export AI_JOB_SEARCH_LLM_URL=https://api.openai.com/v1"
echo "       export AI_JOB_SEARCH_LLM_KEY=sk-..."
echo "       export AI_JOB_SEARCH_LLM_MODEL=gpt-4o-mini"
echo "  4. Run a dry-run distillation to verify the pipeline:"
echo "       python3 $REPO_DIR/scripts/distill.py --dry-run"
echo "  5. In Hermes:  /skills run ai-job-search \"morning outreach\""
echo
