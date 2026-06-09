// Popup UI controller. Reads from chrome.storage.local (fast path).
// No scoring logic here — display only.

const $ = (id) => document.getElementById(id);

const TIER_LABELS = {
  A: 'Tier A — Apply + DM followup',
  B: 'Tier B — Apply',
  C: 'Tier C — Save for later',
  D: 'Tier D — Skip',
  pending: 'Pending — needs manual review',
};

// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await renderCurrentTab();
  setupTabs();
  setupMarkButtons();
});

// ---------------------------------------------------------------------------

/**
 * Load last_jd + last_score from storage and render the result panel.
 * Falls back to loading / empty state if not available.
 */
async function renderCurrentTab() {
  showState('loading');

  const { jd, score } = await getLastResult();

  if (!jd) {
    showState('empty');
    return;
  }

  $('jd-title').textContent = jd.title;
  $('jd-company').textContent = jd.company;
  $('jd-location').textContent = jd.location;
  $('jd-salary').textContent = jd.salary.raw || 'Salary not listed';

  $('tier-badge').setAttribute('data-tier', score.tier);
  $('tier-label').textContent = score.tier;

  const reasonsList = $('reasons-list');
  reasonsList.textContent = '';
  score.reasons.forEach((reason) => {
    const item = document.createElement('li');
    item.textContent = reason;
    reasonsList.appendChild(item);
  });

  $('action-banner').textContent = TIER_LABELS[score.tier];

  showState('result');
}

/**
 * @param {'empty'|'loading'|'result'|'error'} name
 * @param {string} [errorMsg]
 */
function showState(name, errorMsg) {
  ['empty', 'loading', 'result', 'error'].forEach((stateName) => {
    $(`state-${stateName}`).classList.add('hidden');
  });

  $(`state-${name}`).classList.remove('hidden');

  if (name === 'error' && errorMsg) {
    $('error-text').textContent = errorMsg;
  }
}

// ---------------------------------------------------------------------------

function setupTabs() {
  $('tab-current').addEventListener('click', () => {
    $('tab-current').classList.add('active');
    $('tab-history').classList.remove('active');
    $('history-panel').classList.add('hidden');
    renderCurrentTab();
  });

  $('tab-history').addEventListener('click', () => {
    $('tab-history').classList.add('active');
    $('tab-current').classList.remove('active');
    $('history-panel').classList.remove('hidden');
    renderHistory();
  });
}

/**
 * Render AppRecord list in #history-list.
 */
async function renderHistory() {
  const records = await listRecords();
  const historyList = $('history-list');
  historyList.textContent = '';

  if (records.length === 0) {
    const item = document.createElement('li');
    item.className = 'muted';
    item.textContent = 'No history yet.';
    historyList.appendChild(item);
    return;
  }

  records.forEach((record) => {
    const date = record.appliedAt
      ? new Date(record.appliedAt).toLocaleDateString()
      : '—';

    const item = document.createElement('li');
    item.className = 'history-item';

    const tier = document.createElement('span');
    tier.className = 'history-tier';
    tier.textContent = record.tier ?? '?';

    const info = document.createElement('div');
    info.className = 'history-info';

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = record.title;

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = `${record.company} · ${date} · ${record.status}`;

    info.append(title, meta);
    item.append(tier, info);
    historyList.appendChild(item);
  });
}

// ---------------------------------------------------------------------------

function setupMarkButtons() {
  document.querySelectorAll('.mark-buttons button').forEach((btn) => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage(
        { type: 'MARK_STATUS', status: btn.dataset.status },
        (resp) => {
          if (!resp || !resp.ok) {
            showState(
              'error',
              resp?.error === 'DAILY_LIMIT_REACHED'
                ? 'Daily limit (10) reached.'
                : 'Failed to save.'
            );
            return;
          }

          document.querySelectorAll('.mark-buttons button').forEach((button) => {
            button.classList.remove('active');
          });
          btn.classList.add('active');
        }
      );
    });
  });
}
