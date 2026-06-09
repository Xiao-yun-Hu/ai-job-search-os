// MV3: importScripts is not supported in module service workers.
// Keep the small set of storage/schema values used by this worker local.

// Service Worker. Responsibilities:
//   1. Listen for JD_SCORED messages from content.js → update badge
//   2. Listen for MARK_STATUS messages from popup.js → write AppRecord via storage

// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'JD_SCORED') {
    handleJDScored(msg, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
  if (msg.type === 'MARK_STATUS') {
    handleMarkStatus(msg)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ---------------------------------------------------------------------------

/**
 * Update the action badge on the extension icon to show the tier.
 * Tier A → green '#22c55e', B → blue '#3b82f6', C → yellow '#f59e0b', D → grey '#9ca3af', pending → orange '#f97316'
 * @param {{ type: string, jdId: string, tier: Tier }} msg
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<void>}
 */
async function handleJDScored(msg, sender) {
  await chrome.action.setBadgeText({ text: msg.tier, tabId: sender.tab.id });
  await chrome.action.setBadgeBackgroundColor({ color: TIER_COLORS[msg.tier], tabId: sender.tab.id });
}

const TIER_COLORS = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#9ca3af',
  pending: '#f97316',
};

const STORAGE_KEYS = {
  LAST_SCORE: 'last_score',
  LAST_JD: 'last_jd',
  DAILY_COUNT: 'daily_count',
};

const DB_NAME = 'job-search-db';
const DB_VERSION = 1;
const STORES = {
  JDS: 'jds',
  SCORES: 'scores',
  RECORDS: 'records',
};

const DAILY_APPLY_LIMIT = 10;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.JDS)) {
        db.createObjectStore(STORES.JDS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.SCORES)) {
        db.createObjectStore(STORES.SCORES, { keyPath: 'jdId' });
      }

      if (!db.objectStoreNames.contains(STORES.RECORDS)) {
        const records = db.createObjectStore(STORES.RECORDS, { keyPath: 'id' });
        records.createIndex('jdId', 'jdId');
      } else {
        const transaction = request.transaction;
        const records = transaction.objectStore(STORES.RECORDS);
        if (!records.indexNames.contains('jdId')) {
          records.createIndex('jdId', 'jdId');
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getDailyCount() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_COUNT);
  const dailyCount = result[STORAGE_KEYS.DAILY_COUNT];
  const today = new Date().toISOString().slice(0, 10);

  if (!dailyCount || dailyCount.date !== today) {
    return 0;
  }

  return dailyCount.count;
}

async function incrementDailyCount() {
  const count = await getDailyCount();

  if (count >= DAILY_APPLY_LIMIT) {
    throw new Error('DAILY_LIMIT_REACHED');
  }

  const today = new Date().toISOString().slice(0, 10);

  await chrome.storage.local.set({
    [STORAGE_KEYS.DAILY_COUNT]: {
      date: today,
      count: count + 1,
    },
  });
}

async function getLastResult() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.LAST_JD,
    STORAGE_KEYS.LAST_SCORE,
  ]);

  return {
    jd: result[STORAGE_KEYS.LAST_JD] || null,
    score: result[STORAGE_KEYS.LAST_SCORE] || null,
  };
}

async function createRecord(jd, score, status, notes = '') {
  const record = {
    id: `rec-${Date.now()}`,
    jdId: jd.id,
    title: jd.title,
    company: jd.company,
    appliedAt: status === 'applied' ? Date.now() : null,
    status,
    notes,
    tier: score.tier,
  };

  const db = await openDB();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.RECORDS], 'readwrite');

    transaction.objectStore(STORES.RECORDS).put(record);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  db.close();

  return record;
}

/**
 * Write an AppRecord when popup user clicks "Mark as Applied / Saved / Skip".
 * Enforces daily limit before writing 'applied' status.
 * @param {{ type: string, jdId: string, status: AppStatus, notes?: string }} msg
 * @returns {Promise<void>}
 */
async function handleMarkStatus(msg) {
  const { jd, score } = await getLastResult();
  if (!jd || !score) throw new Error('NO_CURRENT_JD');
  if (msg.status === 'applied') await incrementDailyCount();
  await createRecord(jd, score, msg.status, msg.notes ?? '');
}
