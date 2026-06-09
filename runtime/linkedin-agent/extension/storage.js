// Storage layer. Two tiers:
//   chrome.storage.local — small, fast: last_score, last_jd, settings, daily_count
//   IndexedDB (job-search-db) — full JD text + score history + app records

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
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

/**
 * @param {JD} jd
 * @param {Score} score
 * @returns {Promise<void>}
 */
async function saveJDAndScore(jd, score) {
  const db = await openDB();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.JDS, STORES.SCORES], 'readwrite');

    transaction.objectStore(STORES.JDS).put(jd);
    transaction.objectStore(STORES.SCORES).put(score);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  db.close();

  await chrome.storage.local.set({
    [STORAGE_KEYS.LAST_JD]: jd,
    [STORAGE_KEYS.LAST_SCORE]: score,
  });
}

/**
 * @param {JD} jd
 * @param {Score} score
 * @param {AppStatus} status
 * @param {string} [notes='']
 * @returns {Promise<AppRecord>}
 */
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
 * @returns {Promise<AppRecord[]>}
 */
async function listRecords() {
  const db = await openDB();

  const records = await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.RECORDS], 'readonly');
    const request = transaction.objectStore(STORES.RECORDS).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  db.close();

  return records.sort((a, b) => {
    if (a.appliedAt === b.appliedAt) return 0;
    if (a.appliedAt === null) return 1;
    if (b.appliedAt === null) return -1;
    return b.appliedAt - a.appliedAt;
  });
}

/**
 * @returns {Promise<number>}
 */
async function getDailyCount() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_COUNT);
  const dailyCount = result[STORAGE_KEYS.DAILY_COUNT];
  const today = new Date().toISOString().slice(0, 10);

  if (!dailyCount || dailyCount.date !== today) {
    return 0;
  }

  return dailyCount.count;
}

/**
 * @returns {Promise<void>}
 */
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

/**
 * @returns {Promise<{jd: JD|null, score: Score|null}>}
 */
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
