// Shared data structures. All modules depend on this; no business logic here.

/**
 * @typedef {'linkedin' | 'boss' | 'unknown'} Platform
 * @typedef {'A' | 'B' | 'C' | 'D' | 'pending'} Tier
 * @typedef {'strong' | 'medium' | 'weak' | 'unknown'} SignalStrength
 * @typedef {'pass' | 'fail' | 'unknown'} GateResult
 * @typedef {'apply' | 'save' | 'skip' | 'review'} Action
 * @typedef {'applied' | 'saved' | 'skipped' | 'pending_review'} AppStatus
 */

/**
 * @typedef {Object} SalaryInfo
 * @property {number|null} min
 * @property {number|null} max
 * @property {string} currency   // 'CNY' | 'SGD' | 'USD' | 'unknown'
 * @property {string} raw        // original string from page
 */

/**
 * @typedef {Object} JD
 * @property {string}     id          // 8-char hex prefix of sha256(url) + '-' + timestamp
 * @property {string}     url
 * @property {Platform}   platform
 * @property {number}     extractedAt // Date.now()
 * @property {string}     title
 * @property {string}     company
 * @property {string}     location
 * @property {SalaryInfo} salary
 * @property {string}     description // full JD text, trimmed to 8000 chars max
 * @property {string[]}   tags        // skill keywords extracted from description
 */

/**
 * @typedef {Object} Signals
 * @property {GateResult}     salary_gate
 * @property {GateResult}     ai_native
 * @property {SignalStrength} role_alignment
 * @property {SignalStrength} ai_systems
 * @property {SignalStrength} business_workflow
 * @property {SignalStrength} seniority
 * @property {SignalStrength} company_context
 * @property {SignalStrength} vibe
 */

/**
 * @typedef {Object} Score
 * @property {string}   jdId
 * @property {number}   scoredAt
 * @property {Tier}     tier
 * @property {Signals}  signals
 * @property {string[]} reasons   // one human-readable line per signal
 * @property {Action}   action
 * @property {boolean}  followup  // true = requires LinkedIn DM after apply
 */

/**
 * @typedef {Object} AppRecord
 * @property {string}    id
 * @property {string}    jdId
 * @property {string}    title
 * @property {string}    company
 * @property {number|null} appliedAt
 * @property {AppStatus} status
 * @property {string}    notes
 */

// Storage key constants
const STORAGE_KEYS = {
  LAST_SCORE: 'last_score',       // Score — current tab's latest result
  LAST_JD: 'last_jd',             // JD — current tab's latest extracted JD
  SETTINGS: 'settings',           // user settings object
  DAILY_COUNT: 'daily_count',     // { date: 'YYYY-MM-DD', count: number }
};

const DB_NAME = 'job-search-db';
const DB_VERSION = 1;
const STORES = {
  JDS: 'jds',           // full JD objects, keyed by id
  SCORES: 'scores',     // Score objects, keyed by jdId
  RECORDS: 'records',   // AppRecord objects, keyed by id
};

const DAILY_APPLY_LIMIT = 10; // Tier A+B combined, per decision_task_rules.md Rule 4
