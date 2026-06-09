// Content script: detect platform, extract JD, trigger score, notify background.
// Runs at document_idle on LinkedIn jobs pages and BOSS job detail pages.
// Depends on: schema.js, scorer.js, storage.js (injected before this by manifest)

(async function main() {
  const platform = detectPlatform(window.location.href);
  if (platform === 'unknown') return;

  const jd = await extractJD(platform);
  if (!jd) return;

  const score = scoreJD(jd); // scorer.js
  await saveJDAndScore(jd, score); // storage.js

  // Notify background so popup badge updates
  chrome.runtime.sendMessage({ type: 'JD_SCORED', jdId: jd.id, tier: score.tier });
})();

// ---------------------------------------------------------------------------

/**
 * Detect platform from URL.
 * @param {string} url
 * @returns {Platform}
 */
function detectPlatform(url) {
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('zhipin.com')) return 'boss';
  return 'unknown';
}

/**
 * Entry point: dispatch to platform-specific extractor.
 * Retries up to 3 times with 800ms delay if key elements not yet in DOM.
 * @param {Platform} platform
 * @returns {Promise<JD|null>}
 */
async function extractJD(platform) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let jd = null;
    if (platform === 'linkedin') {
      jd = extractLinkedIn();
    } else if (platform === 'boss') {
      jd = extractBOSS();
    } else {
      return null;
    }

    if (jd && jd.title !== '') return jd;
    if (attempt < 2) await delay(800);
  }

  return null;
}

/**
 * Extract JD from LinkedIn job detail page.
 * Target selectors (as of 2026-05):
 *   title:       h1.t-24.job-details-jobs-unified-top-card__job-title
 *   company:     .job-details-jobs-unified-top-card__company-name a
 *   location:    .job-details-jobs-unified-top-card__bullet
 *   salary:      .job-details-jobs-unified-top-card__salary-main-rail  (may be absent)
 *   description: #job-details .jobs-description__content
 * @returns {JD|null}
 */
function extractLinkedIn() {
  const title = firstText([
    'h1.t-24.job-details-jobs-unified-top-card__job-title',
    'h1.jobs-unified-top-card__job-title',
    'h1[class*="job-title"]',
  ]);
  const company = firstText([
    '.job-details-jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name a',
    'a[class*="company-name"]',
  ]);
  const location = firstText([
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
  ]);
  const salaryRaw = firstText([
    '.job-details-jobs-unified-top-card__salary-main-rail',
    '[class*="salary"]',
  ]);
  const description = firstText([
    '#job-details .jobs-description__content',
    '.jobs-description__content',
    '#job-details',
  ]).slice(0, 8000);

  if (!title || !description) return null;

  return {
    id: makeJDId(window.location.href),
    url: window.location.href,
    platform: 'linkedin',
    extractedAt: Date.now(),
    title,
    company,
    location,
    salary: parseSalary(salaryRaw, 'linkedin'),
    description,
    tags: extractTags(description),
  };
}

/**
 * Extract JD from BOSS 直聘 job detail page.
 * Target selectors (as of 2026-05):
 *   title:       .job-primary .name h1
 *   company:     .company-info .name
 *   location:    .job-primary .info-primary p  (city)
 *   salary:      .job-primary .salary
 *   description: .job-detail .text
 * @returns {JD|null}
 */
function extractBOSS() {
  const title = firstText(['.job-primary .name h1', '.job-name']);
  const company = firstText(['.company-info .name', '.company-name']);
  const location = firstText([
    '.job-primary .info-primary p:first-child',
    '.job-primary .city-name',
  ]);
  const salaryRaw = firstText(['.job-primary .salary', '.salary-range']);
  const description = firstText(['.job-detail .text', '.job-sec-text']).slice(0, 8000);

  if (!title || !description) return null;

  return {
    id: makeJDId(window.location.href),
    url: window.location.href,
    platform: 'boss',
    extractedAt: Date.now(),
    title,
    company,
    location,
    salary: parseSalary(salaryRaw, 'boss'),
    description,
    tags: extractTags(description),
  };
}

/**
 * Generate a stable JD id: first 8 hex chars of a simple hash of the URL + '-' + Date.now().
 * Not cryptographic — just collision-resistant enough for local storage.
 * @param {string} url
 * @returns {string}
 */
function makeJDId(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i += 1) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}-${Date.now()}`;
}

/**
 * Parse salary string into SalaryInfo.
 * Handles formats:
 *   CN: "25-40K·14薪", "30K以上", "面议"
 *   SG: "SGD 8,000 – 12,000/month", "Competitive"
 * @param {string} raw
 * @param {Platform} platform
 * @returns {SalaryInfo}
 */
function parseSalary(raw, platform) {
  const salaryRaw = (raw || '').trim();
  const emptySalary = {
    min: null,
    max: null,
    currency: 'unknown',
    raw: salaryRaw,
  };

  if (!salaryRaw || salaryRaw.includes('面议')) return emptySalary;

  if (platform === 'boss') {
    const aboveMatch = salaryRaw.match(/(\d[\d,]*)\s*[kK]\s*以上/);
    if (aboveMatch) {
      return {
        min: parseSalaryNumber(aboveMatch[1], true),
        max: null,
        currency: 'CNY',
        raw: salaryRaw,
      };
    }

    const rangeMatch = salaryRaw.match(/(\d[\d,]*)\s*[kK]?\s*[–\-]\s*(\d[\d,]*)\s*[kK]?/);
    if (rangeMatch) {
      return {
        min: parseSalaryNumber(rangeMatch[1], true),
        max: parseSalaryNumber(rangeMatch[2], true),
        currency: 'CNY',
        raw: salaryRaw,
      };
    }

    return emptySalary;
  }

  if (platform === 'linkedin') {
    const currency = detectCurrency(salaryRaw);
    const rangeMatch = salaryRaw.match(/(\d[\d,]*)\s*[kK]?\s*[–\-]\s*(?:S\$|SGD|USD|US\$|\$)?\s*(\d[\d,]*)\s*[kK]?/i);
    if (rangeMatch) {
      return {
        min: parseSalaryNumber(rangeMatch[1], /[kK]/.test(rangeMatch[0])),
        max: parseSalaryNumber(rangeMatch[2], /[kK]/.test(rangeMatch[0])),
        currency,
        raw: salaryRaw,
      };
    }
  }

  return emptySalary;
}

/**
 * Extract skill/keyword tags from JD description text.
 * Simple keyword scan against a fixed list. Returns matched terms deduplicated.
 * @param {string} description
 * @returns {string[]}
 */
function extractTags(description) {
  const KEYWORDS = [
    'agent', 'multi-agent', 'llm', 'rag', 'function calling', 'langchain',
    'langraph', 'autogen', 'orchestration', 'evaluation', 'eval infra',
    'memory', 'workflow', 'python', 'typescript', 'fastapi', 'kubernetes',
    'aws', 'gcp', 'azure', 'vector db', 'embedding', 'fine-tuning',
    '多智能体', 'agent框架', '大模型', 'RAG', '知识图谱',
  ];
  const text = (description || '').toLowerCase();
  const seen = new Set();
  const tags = [];

  for (const keyword of KEYWORDS) {
    const normalized = keyword.toLowerCase();
    if (text.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      tags.push(keyword);
    }
  }

  return tags;
}

function firstText(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element && element.textContent ? element.textContent.trim() : '';
    if (text) return text;
  }
  return '';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSalaryNumber(value, forceThousands) {
  const number = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;
  return forceThousands ? number * 1000 : number;
}

function detectCurrency(raw) {
  if (/SGD|S\$/i.test(raw)) return 'SGD';
  if (/USD|US\$|\$/i.test(raw)) return 'USD';
  return 'unknown';
}
