const DEFAULT_SERVICE_URL = "http://localhost:7788";
const $ = id => document.getElementById(id);

// ─── Agent Settings (loaded from chrome.storage.local) ────────────────────────
let agentSettings = {
  serviceUrl: DEFAULT_SERVICE_URL,
  apiKey: "",
  model: "",
  baseUrl: "",
  candidateName: "",
  resume: "",
  targetTitle: "",
  location: "",
  preferences: "",
};

function getServiceUrl() {
  return (agentSettings.serviceUrl || DEFAULT_SERVICE_URL).trim().replace(/\/$/, "");
}

function getUserProfile() {
  return {
    name: agentSettings.candidateName || "",
    resume: agentSettings.resume || "",
    targetTitle: agentSettings.targetTitle || "",
    location: agentSettings.location || "",
    preferences: agentSettings.preferences || "",
    apiKey: agentSettings.apiKey || "",
    model: agentSettings.model || "",
    baseUrl: agentSettings.baseUrl || "",
  };
}

function loadSettingsIntoForm() {
  const s = agentSettings;
  if ($("setting-service-url")) $("setting-service-url").value = s.serviceUrl || DEFAULT_SERVICE_URL;
  if ($("setting-api-key")) $("setting-api-key").value = s.apiKey || "";
  if ($("setting-model")) $("setting-model").value = s.model || "";
  if ($("setting-base-url")) $("setting-base-url").value = s.baseUrl || "";
  if ($("setting-name")) $("setting-name").value = s.candidateName || "";
  if ($("setting-title")) $("setting-title").value = s.targetTitle || "";
  if ($("setting-location")) $("setting-location").value = s.location || "";
  if ($("setting-prefs")) $("setting-prefs").value = s.preferences || "";
  if ($("setting-resume")) $("setting-resume").value = s.resume || "";
}

function collectSettingsFromForm() {
  return {
    serviceUrl: ($("setting-service-url")?.value || DEFAULT_SERVICE_URL).trim(),
    apiKey: ($("setting-api-key")?.value || "").trim(),
    model: ($("setting-model")?.value || "").trim(),
    baseUrl: ($("setting-base-url")?.value || "").trim(),
    candidateName: ($("setting-name")?.value || "").trim(),
    targetTitle: ($("setting-title")?.value || "").trim(),
    location: ($("setting-location")?.value || "").trim(),
    preferences: ($("setting-prefs")?.value || "").trim(),
    resume: ($("setting-resume")?.value || "").trim(),
  };
}

function persistSettings(settings) {
  agentSettings = { ...agentSettings, ...settings };
  chrome.storage.local.set({ agentSettings });
}

/** Returns true if the user has set up a resume — used for onboarding nudge. */
function hasProfile() {
  return !!(agentSettings.resume && agentSettings.resume.trim().length > 50);
}

let chatHistory = [];
let currentTabId = null;
let searchTabId = null;
let appliedJobs = [];
let currentTaskConfig = null; // { keyword, targetCount, minScore, applyMode, step, extractedCards, rankedJobs }
let pendingSubmitConfirm = false; // true when waiting for user to "confirm submit" or "cancel"
let lastApplyJobTitle = "";
let lastApplyJobCompany = "";
let chatBusy = false;

function setChatBusy(busy) {
  chatBusy = busy;
  const sendButton = $("btn-send");
  if (sendButton) sendButton.disabled = busy;
}

function isLinkedInSearchUrl(url) {
  return /linkedin\.com\/jobs\/search/i.test(url || "");
}

async function resolveSearchTabId() {
  if (searchTabId) {
    try {
      const tab = await chrome.tabs.get(searchTabId);
      if (isLinkedInSearchUrl(tab.url)) return searchTabId;
    } catch { /* tab may have closed */ }
  }

  try {
    const current = currentTabId ? await chrome.tabs.get(currentTabId) : null;
    if (current?.id && isLinkedInSearchUrl(current.url)) {
      searchTabId = current.id;
      return searchTabId;
    }
  } catch { /* tab may have closed */ }

  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const searchTab = tabs.find((tab) => tab?.id && isLinkedInSearchUrl(tab.url));
      if (searchTab?.id) {
        searchTabId = searchTab.id;
        resolve(searchTab.id);
        return;
      }
      resolve(null);
    });
  });
}

// ─── Feature 1: parseUserIntent ──────────────────────────────────────────────
/**
 * Parses user message for job search intent.
 * Returns null if message is not a job search command.
 */
function parseUserIntent(message) {
  if (!message || typeof message !== "string") return null;
  const msg = message.trim().toLowerCase();

  // Must contain a search-trigger keyword
  const searchTriggers = ["search", "find", "look for", "apply"];
  const hasSearchTrigger = searchTriggers.some(t => msg.includes(t));
  if (!hasSearchTrigger) return null;

  // Extract keyword: everything between the trigger verb and "top N" / "apply" / "above score"
  // e.g. "search AI Agent Architect top 5" → "AI Agent Architect"
  // e.g. "find top 3 AI jobs" → "AI jobs"
  let keyword = null;
  const keywordMatch =
    message.match(/(?:search|look\s+for)\s+(.+?)(?:\s+(?:top|find|apply|above\s+score)\b|$)/i) ||
    message.match(/find\s+(?:top\s+\d+\s+)?(.+?)(?:\s+(?:apply|above\s+score)\b|$)/i);
  if (keywordMatch) {
    keyword = keywordMatch[1].trim();
    // Strip trailing "and" or "jobs" noise only if preceded by actual keyword text
    keyword = keyword.replace(/\s+and\s*$/i, "").trim();
  }

  // "apply to all" with no search keyword → it's meant for existing state, not a fresh search
  if (!keyword) return null;
  // If keyword is just whitespace or very short generic word with no content, bail
  if (keyword.length < 2) return null;

  // Extract targetCount — number after "top" or "find"
  let targetCount = parseTargetCount(message, 3);

  // Extract minScore
  let minScore = 70; // default
  const scoreMatch = message.match(/(?:above\s+score|score\s+above)\s+(\d+)/i);
  if (scoreMatch) minScore = parseInt(scoreMatch[1], 10);

  // Detect whether this search request also asks to apply. Plain "find/search top N"
  // only ranks and saves candidates for follow-up commands.
  const applyRequested = /\bapply\b|申请|投递|投一下|帮我投/i.test(message);
  const applyMode = /\bauto\b|自动提交/i.test(message) ? "auto_submit" : "review";

  return { keyword, targetCount, minScore, applyMode, applyRequested };
}

function parseTargetCount(message, fallback = 3) {
  const topMatch =
    message.match(/\btop\s+(\d+)\b/i) ||
    message.match(/\bfind\s+(\d+)\b/i) ||
    message.match(/前\s*(\d+)\s*个?/) ||
    message.match(/([一二三四五六七八九十])\s*个?(?:\s*best|\s*最|\s*匹配|\s*工作|\s*职位)?/i);
  if (!topMatch) return fallback;
  return chineseNumberToInt(topMatch[1]) || parseInt(topMatch[1], 10) || fallback;
}

function parseRankVisibleIntent(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.trim().toLowerCase();
  const wantsRanking = /best\s*match|top\s*\d+|match|rank|compare|推荐|匹配|最合适|最佳|最好的|前三|前五|找.*工作|找.*职位/.test(text);
  if (!wantsRanking) return null;
  return {
    keyword: "",
    targetCount: parseTargetCount(message, 3),
    minScore: 0,
    applyMode: /\bauto\b|自动提交/i.test(message) ? "auto_submit" : "review",
    applyRequested: /\bapply\b|申请|投递|投一下|帮我投/i.test(message),
    useCurrentPage: true,
  };
}

// ─── Feature 2: handleSearch ──────────────────────────────────────────────────
async function handleSearch(keyword, targetCount = 3) {
  const encoded = encodeURIComponent(keyword);
  const url = `https://www.linkedin.com/jobs/search/?keywords=${encoded}&refresh=true`;
  addMessage("system", `Searching LinkedIn for: ${keyword}`);
  await navigateTab(url);
  searchTabId = currentTabId;
  addMessage("system", "Search loaded. Extracting job cards...");
  const cards = await extractJobCards(searchTabId, targetCount);
  addMessage("system", `Found ${cards.length} job cards.`);
  if (currentTaskConfig) {
    currentTaskConfig.extractedCards = cards;
    currentTaskConfig.step = "extracted";
    chrome.storage.local.set({ currentTaskConfig });
  }
  return cards;
}

// ─── Feature 3: extractJobCards ───────────────────────────────────────────────
/**
 * Returns array of job card objects from the current LinkedIn search results page.
 * Returns [] if not on a search results page or no cards found.
 */
async function extractVisibleJobCards(tabId = currentTabId) {
  if (!tabId) return [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
        const absoluteUrl = (href) => {
          try {
            return new URL(href || "", window.location.href).href
              .split("?")[0]
              .replace(/\/+$/, "") + "/";
          } catch {
            return "";
          }
        };
        const inferFromAnchor = (anchor) => {
          const href = absoluteUrl(anchor.getAttribute("href") || anchor.href || "");
          const card = anchor.closest([
            '.job-card-container',
            '.jobs-search-results__list-item',
            '[data-job-id]',
            '[data-occludable-job-id]',
            '.scaffold-layout__list-item',
            'li',
            'article',
            '[role="listitem"]'
          ].join(', ')) || anchor.parentElement;
          const title = clean(
            anchor.getAttribute("aria-label")?.replace(/\s+at\s+.+$/i, "") ||
            anchor.querySelector('strong, span[aria-hidden="true"]')?.textContent ||
            anchor.textContent
          );
          const company = clean(
            card?.querySelector('.job-card-container__company-name')?.textContent ||
            card?.querySelector('.artdeco-entity-lockup__subtitle')?.textContent ||
            card?.querySelector('[class*="company-name"]')?.textContent ||
            card?.querySelector('[class*="subtitle"]')?.textContent ||
            anchor.getAttribute("aria-label")?.match(/\sat\s+(.+)$/i)?.[1] ||
            ""
          );
          const location = clean(
            card?.querySelector('.job-card-container__metadata-item')?.textContent ||
            card?.querySelector('.artdeco-entity-lockup__caption')?.textContent ||
            card?.querySelector('[class*="metadata"]')?.textContent ||
            card?.querySelector('[class*="caption"]')?.textContent ||
            ""
          );
          const easyApply = /easy\s*apply/i.test(card?.textContent || "");
          return { title, company, location, url: href, easyApply };
        };

        const cardSelectors = [
          '.job-card-container',
          '.jobs-search-results__list-item',
          '[data-job-id]',
          '[data-occludable-job-id]',
          '.job-card-job-posting-card-wrapper',
          '.job-card-list',
          '.scaffold-layout__list-item',
        ];

        let containers = [];
        for (const sel of cardSelectors) {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length > 0) { containers = found; break; }
        }

        const pageOrigin = window.location.origin || "https://www.linkedin.com";

        const cards = containers.slice(0, 50).map(card => {
          const anchor = card.querySelector('a[href*="/jobs/view/"]');
          const title = clean(
            card.querySelector('.job-card-container__primary-description')?.textContent ||
            card.querySelector('.job-card-list__title--link')?.textContent ||
            card.querySelector('.job-card-list__title')?.textContent ||
            card.querySelector('a[href*="/jobs/view/"] strong')?.textContent ||
            card.querySelector('a[href*="/jobs/view/"] span[aria-hidden="true"]')?.textContent ||
            card.querySelector('h3')?.textContent ||
            card.querySelector('h2')?.textContent ||
            card.querySelector('strong')?.textContent ||       // LinkedIn renders titles in <strong>
            card.getAttribute('aria-label') ||
            anchor?.textContent ||
            ""
          );

          const company = clean(
            card.querySelector('.job-card-container__company-name')?.textContent ||
            card.querySelector('.artdeco-entity-lockup__subtitle')?.textContent ||
            card.querySelector('[class*="company-name"]')?.textContent ||
            card.querySelector('[class*="subtitle"]')?.textContent ||
            anchor?.getAttribute("aria-label")?.match(/\sat\s+(.+)$/i)?.[1] ||
            ""
          );

          const location = clean(
            card.querySelector('.job-card-container__metadata-item')?.textContent ||
            card.querySelector('.artdeco-entity-lockup__caption')?.textContent ||
            card.querySelector('[class*="metadata"]')?.textContent ||
            card.querySelector('[class*="caption"]')?.textContent ||
            ""
          );

          let url = "";
          if (anchor) {
            const href = anchor.getAttribute("href") || "";
            url = href.startsWith("http") ? href : pageOrigin + href;
            url = url.split("?")[0].replace(/\/+$/, "") + "/";
          }

          const easyApply = /easy\s*apply/i.test(card.textContent || "");

          return { title, company, location, url, easyApply };
        }).filter(c => c.title || c.url);

        if (cards.length > 0) return cards;

        const seen = new Set();
        return Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
          .map(inferFromAnchor)
          .filter((card) => {
            if (!card.url || seen.has(card.url)) return false;
            seen.add(card.url);
            return true;
          })
          .slice(0, 50);
      }
    });
    return results[0]?.result || [];
  } catch {
    return [];
  }
}

async function scrollJobResults(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const candidates = [
          document.querySelector('.jobs-search-results-list'),
          document.querySelector('.scaffold-layout__list'),
          document.querySelector('[class*="jobs-search-results-list"]'),
        ].filter(Boolean);
        const scroller = candidates.find((element) => element.scrollHeight > element.clientHeight) ||
          document.scrollingElement;
        if (!scroller) return false;

        const before = scroller.scrollTop;
        const distance = Math.max(scroller.clientHeight * 0.8, 600);
        scroller.scrollTop = Math.min(scroller.scrollTop + distance, scroller.scrollHeight);
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        return scroller.scrollTop > before;
      }
    });
    return Boolean(results[0]?.result);
  } catch {
    return false;
  }
}

async function extractJobCards(tabId = currentTabId, targetCount = 3) {
  if (!tabId) return [];

  const cardsByUrl = new Map();
  const desiredPoolSize = Math.max(targetCount * 3, targetCount + 5);
  let stagnantRounds = 0;

  for (let round = 0; round < 10; round += 1) {
    const visibleCards = await extractVisibleJobCards(tabId);
    const previousSize = cardsByUrl.size;
    visibleCards.forEach((card) => {
      const key = getLinkedInJobId(card.url) || card.url || `${card.title}|${card.company}`;
      if (key) cardsByUrl.set(key, card);
    });

    if (cardsByUrl.size >= desiredPoolSize) break;
    stagnantRounds = cardsByUrl.size === previousSize ? stagnantRounds + 1 : 0;
    if (stagnantRounds >= 2) break;

    const moved = await scrollJobResults(tabId);
    if (!moved && round > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  return Array.from(cardsByUrl.values());
}

// ─── Feature 4: rankJobs ──────────────────────────────────────────────────────
async function rankJobs(cards, config) {
  const r = await fetch(`${getServiceUrl()}/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cards, config, profile: getUserProfile() })
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error);
  return data.ranked; // [{title, company, url, score, fitReason, risk}]
}

function displayRankedJobs(ranked) {
  if (!ranked || ranked.length === 0) {
    addMessage("system", "No ranked jobs to display.");
    return;
  }
  const keyword = currentTaskConfig?.keyword || "";
  let msg = `📊 Top ${ranked.length} matches${keyword ? ` for "${keyword}"` : ""}:\n\n`;
  ranked.forEach((job, i) => {
    msg += `${i + 1}. ⭐ ${job.score} — ${job.title} @ ${job.company}${job.location ? ` (${job.location})` : ""}\n`;
    if (job.fitReason) msg += `   ✅ Fit: ${job.fitReason}\n`;
    if (job.risk) msg += `   ⚠️ Risk: ${job.risk}\n`;
    msg += "\n";
  });
  addMessage("assistant", msg.trim());
}

function hasRankedJobs(ranked) {
  return Array.isArray(ranked) && ranked.some((job) => job?.url);
}

function saveRankedJobs(ranked, cards, config) {
  currentTaskConfig = {
    ...(currentTaskConfig || {}),
    ...config,
    step: "ranked",
    requestedCount: config.targetCount ?? 3,
    deliveredCount: ranked.length,
    source: config.useCurrentPage ? "current_page" : "search",
    extractedCards: cards,
    rankedJobs: ranked,
  };
  chrome.storage.local.set({ currentTaskConfig, lastRankedJobs: ranked });
}

function handleEmptyRanking() {
  displayRankedJobs([]);
  addMessage("system", "No jobs met the ranking criteria. I kept the previous saved ranking unchanged.");
}

function getRankedJobs() {
  return Array.isArray(currentTaskConfig?.rankedJobs) ? currentTaskConfig.rankedJobs : [];
}

function ensureRankedJobsLoaded() {
  if (getRankedJobs().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    chrome.storage.local.get(["currentTaskConfig", "lastRankedJobs"], ({ currentTaskConfig: saved, lastRankedJobs }) => {
      const rankedJobs = Array.isArray(saved?.rankedJobs) && saved.rankedJobs.length > 0
        ? saved.rankedJobs
        : lastRankedJobs;
      if (Array.isArray(rankedJobs) && rankedJobs.length > 0) {
        currentTaskConfig = { ...(saved || currentTaskConfig || {}), step: saved?.step || "ranked", rankedJobs };
      }
      resolve();
    });
  });
}

function parseContinuationIntent(message) {
  if (!message || typeof message !== "string") return null;
  const text = message.trim().toLowerCase();
  const continuation = /(接下来|剩下|剩余|余下|另外|其他|后面|还有呢|然后呢|next|remaining|rest|others?)/i.test(text);
  if (!continuation) return null;
  const referencesRankedResults = /(工作|职位|机会|结果|匹配|候选|job|role|result|match|candidate)/i.test(text);
  if (!referencesRankedResults && text.length > 24) return null;

  const count = parseTargetCount(message, null);
  return { count };
}

function parseCurrentPageApplyIntent(message) {
  if (!message || typeof message !== "string") return false;
  if (!shouldApplyRankedReference(message) && !/\bapply\b|submit|继续申请|现在申请|申请这个|申请当前|投这个|投当前/i.test(message)) {
    return false;
  }
  return /(这个工作|当前工作|当前页面|this job|current job|this one|当前职位|这个职位|这个岗位|go ahead|继续申请|现在申请)/i.test(message);
}

async function handleCurrentPageApply(message) {
  addMessage("assistant", "Applying to the currently selected job on the page.");
  const result = await handleEasyApplyFlow(null, resolveApplyMode(message));
  if (result.jobTitle)   lastApplyJobTitle   = result.jobTitle;
  if (result.jobCompany) lastApplyJobCompany = result.jobCompany;
  if (result.status === "submitted") {
    addMessage("assistant", "Application submitted.");
    return;
  }
  if (result.reason === "review_mode_stop") {
    const title = result.jobTitle || lastApplyJobTitle || "";
    const company = result.jobCompany || lastApplyJobCompany || "";
    const jobLine = (title || company) ? `**${title}${company ? " @ " + company : ""}**\n` : "";
    addMessage("assistant",
      `✅ Application ready to submit:\n${jobLine}\n` +
      `Please review the form, then reply:\n` +
      `• **"confirm submit"** — 提交\n` +
      `• **"cancel"** — 放弃`
    );
    pendingSubmitConfirm = true;
    return;
  }
  if (result.reason === "openSDUI_apply_redirect") {
    addMessage("system", "This Easy Apply button opens LinkedIn's full-page apply flow instead of the in-page modal. I reached the redirect path, but this flow still needs separate automation support.");
    return;
  }
  if (result.reason && !["external_apply_opened"].includes(result.reason)) {
    addMessage("system", `Easy Apply stopped: ${result.reason}`);
  }
}

async function continueRankedTask(continuation) {
  const requestedCount = currentTaskConfig?.requestedCount || currentTaskConfig?.targetCount || 0;
  const rankedJobs = getRankedJobs();
  const explicitCount = continuation?.count || 0;
  const targetCount = Math.max(requestedCount, rankedJobs.length + explicitCount);

  if (!targetCount || !currentTaskConfig) {
    addMessage("system", "There is no active ranked job search to continue. Ask me to find the best matches first.");
    return;
  }

  if (rankedJobs.length >= targetCount) {
    addMessage("assistant", `The requested ${targetCount} matches are already listed above. Tell me which number, title, or company you want to inspect or apply to.`);
    return;
  }

  addMessage("system", `Continuing the current search to complete ${targetCount} matches...`);
  await runCurrentPageRankingWorkflow({
    ...currentTaskConfig,
    targetCount,
    minScore: 0,
    useCurrentPage: true,
    continuation: true,
    applyRequested: false,
  });
}

function normalizeJobReference(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRankedJobDetailRequest(message) {
  return /(详情|详细|具体|完整|职位描述|工作描述|岗位描述|看一下|看看|想看|了解|分析|适合|匹配|要求|职责|技能|tech stack|job description|\bjd\b|details?|analy[sz]e|review|read|tell me about|what does|what is this role)/i.test(message || "");
}

function getRankedJobAction(message) {
  if (shouldApplyRankedReference(message)) return "apply";
  if (isRankedJobDetailRequest(message)) return "analyze";
  return "open";
}

function parseOrdinalIndex(message) {
  const text = String(message || "").trim().toLowerCase();
  const digitMatch = text.match(/第\s*(\d+)\s*(?:个|份|条|项|工作|职位|机会)?/) ||
    text.match(/\b(?:number|no\.?|#)\s*(\d+)\b/) ||
    text.match(/\b(\d+)(?:st|nd|rd|th)\b/);
  if (digitMatch) return Math.max(0, parseInt(digitMatch[1], 10) - 1);

  const chineseMatch = text.match(/第\s*([一二三四五六七八九十])\s*(?:个|份|条|项|工作|职位|机会)?/);
  if (chineseMatch) {
    const value = chineseNumberToInt(chineseMatch[1]);
    return value ? value - 1 : null;
  }

  const englishOrdinals = [
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  const englishIndex = englishOrdinals.findIndex((ordinal) => new RegExp(`\\b${ordinal}\\b`).test(text));
  return englishIndex >= 0 ? englishIndex : null;
}

function findRankedJobByText(message) {
  const normalizedMessage = normalizeJobReference(message);
  if (!normalizedMessage) return null;

  let best = null;
  getRankedJobs().forEach((job, index) => {
    const title = normalizeJobReference(job?.title);
    const company = normalizeJobReference(job?.company);
    const titleMatch = title.length >= 4 && normalizedMessage.includes(title);
    const companyMatch = company.length >= 3 && normalizedMessage.includes(company);
    if (!titleMatch && !companyMatch) return;

    const score = (titleMatch ? 1000 + title.length : 0) + (companyMatch ? 500 + company.length : 0);
    if (!best || score > best.score) best = { index, score };
  });
  return best?.index ?? null;
}

function parseRankedJobReference(message) {
  if (!message || typeof message !== "string") return null;
  const hasAction = /(apply|申请|投|去|打开|帶|带|navigate|open|page|页面|工作|职位|岗位|机会|job|role|详情|详细|具体|完整|描述|看看|看一下|想看|了解|分析|要求|职责|技能|review|read|\bjd\b|details?)/i.test(message);
  if (!hasAction) return null;

  const ordinalIndex = parseOrdinalIndex(message);
  const index = ordinalIndex ?? findRankedJobByText(message);
  if (index === null) return null;
  return { index, action: getRankedJobAction(message) };
}

function shouldApplyRankedReference(message) {
  return /(apply|申请|投递|投一下|帮我投|去申请)/i.test(message || "");
}

function resolveApplyMode(message, fallbackMode = currentTaskConfig?.applyMode || "review") {
  if (/(review|检查|确认|先别提交|不要提交|just review)/i.test(message || "")) return "review";
  if (shouldApplyRankedReference(message) || /\bsubmit\b|自动提交|直接投|直接申请/i.test(message || "")) return "auto_submit";
  return fallbackMode;
}

function parseRankedJobBatch(message) {
  if (!message || typeof message !== "string") return null;
  if (!/(apply|申请|投递|投一下|帮我投|打开|open|带我去|帶我去)/i.test(message)) return null;

  const text = message.trim().toLowerCase();
  const allCount = getRankedJobs().length;
  if (allCount === 0) return null;

  let count = null;
  if (/全部|所有|all/.test(text)) count = allCount;
  const topMatch = text.match(/\btop\s+(\d+)\b/) || text.match(/前\s*(\d+)\s*个?/) || text.match(/前\s*([一二三四五六七八九十])\s*个?/);
  if (topMatch) count = chineseNumberToInt(topMatch[1]) || parseInt(topMatch[1], 10);
  if (!count || count <= 1) return null;

  const apply = shouldApplyRankedReference(message);
  return {
    indexes: Array.from({ length: Math.min(count, allCount) }, (_, index) => index),
    apply,
  };
}

function chineseNumberToInt(value) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return map[value] || null;
}

async function runRankedJobSelection(indexes, apply, applyMode = currentTaskConfig?.applyMode || "review") {
  const rankedJobs = getRankedJobs();
  const validIndexes = indexes.filter((index) => rankedJobs[index]?.url);
  if (validIndexes.length === 0) {
    addMessage("system", "I don't have saved ranked jobs from the last search. Ask me to find the best matches again.");
    return;
  }

  for (const index of validIndexes) {
    const job = rankedJobs[index];
    addMessage("assistant", `${apply ? "Applying to" : "Opening"} #${index + 1}: ${job.title} @ ${job.company}`);
    await handleNavigate(job.url, apply, { applyMode });
    if (validIndexes.length > 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function analyzeRankedJob(index) {
  const job = getRankedJobs()[index];
  if (!job?.url) {
    addMessage("system", `I don't have a saved #${index + 1} job from the last ranking. Ask me to find the best matches again.`);
    return;
  }

  addMessage("assistant", `Opening and analyzing #${index + 1}: ${job.title} @ ${job.company}`);
  const tabId = await handleNavigate(job.url, false);
  if (!tabId) return;
  await handleAnalyze(tabId, job);
}

// ─── Feature 6: Easy Apply state machine ─────────────────────────────────────

async function detectModalState() {
  if (!currentTabId) return "closed";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: () => {
        // LinkedIn renders Easy Apply inside Shadow DOM (#interop-outlet).
        // IMPORTANT: Do NOT fall back to document.querySelector('[role="dialog"]') —
        // LinkedIn's chat overlay also has role="dialog" in the regular document and
        // would cause false-positive "already open" detection.
        const interopOutlet = document.querySelector('#interop-outlet');
        const shadowRoot = interopOutlet?.shadowRoot;
        const modal = shadowRoot
          ? (shadowRoot.querySelector('.jobs-easy-apply-content') ||
             shadowRoot.querySelector('[aria-labelledby*="easy-apply"], [aria-label*="Easy Apply"]') ||
             shadowRoot.querySelector('[role="dialog"]'))
          : null;
        if (!modal) return "closed";

        // Extra guard: verify this is actually an Easy Apply modal, not some other dialog
        const modalText = (modal.textContent || '').toLowerCase();
        const isEasyApplyModal = modalText.includes('easy apply') ||
          modal.querySelector('.jobs-easy-apply-content, .jobs-easy-apply-form-section, [data-test-easy-apply]') ||
          modal.querySelector('button[aria-label*="Submit application"]') ||
          modal.querySelector('.jobs-document-upload-redesign-card__container') ||
          modal.querySelectorAll('input, select, textarea').length > 0;
        if (!isEasyApplyModal) return "closed";

        // Get step heading — prefer specific step elements over the modal title
        const stepHeading = (
          modal.querySelector('h3')?.textContent ||
          modal.querySelector('.jobs-easy-apply-form-section__grouping h4')?.textContent ||
          modal.querySelector('legend')?.textContent ||
          modal.querySelector('h2')?.textContent ||
          ''
        ).toLowerCase();
        const primaryAction = Array.from(modal.querySelectorAll('button'))
          .find((button) => !button.disabled && !/(dismiss|close|back|cancel|discard)/i.test(
            `${button.textContent || ""} ${button.getAttribute('aria-label') || ""}`
          ));
        const primaryActionText = `${primaryAction?.textContent || ""} ${primaryAction?.getAttribute('aria-label') || ""}`.toLowerCase();
        const resumeOptions = modal.querySelectorAll(
          '.jobs-document-upload-redesign-card__container, [data-test-document-upload-list-item], input[type="radio"][name*="resume"]'
        ).length;

        const submitBtn = modal.querySelector('button[aria-label*="Submit application"]');
        if (submitBtn || /submit application/.test(primaryActionText)) return "submit";
        if (resumeOptions > 0) return "resume";
        if (/review your application/.test(stepHeading)) return "review";
        if (/contact info|phone number|email address/.test(stepHeading)) return "contact_info";
        if (/resume|cv/.test(stepHeading)) return "resume";
        if (/additional questions|screening|work authorization|sponsorship/.test(stepHeading)) return "screening";
        if (modal.querySelectorAll('input, select, textarea').length > 0) return "additional_questions";
        if (/continue|next|review/.test(primaryActionText)) return "additional_questions";
        return "unknown";
      }
    });
    return results[0]?.result || "closed";
  } catch {
    return "closed";
  }
}

async function handleModalState(state) {
  if (!currentTabId) return { advanced: false, reason: "no_tab" };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: (modalState) => {
        // LinkedIn renders Easy Apply inside Shadow DOM (#interop-outlet).
        // Do NOT fall back to document.querySelector — LinkedIn's chat overlay
        // also has role="dialog" and would cause false-positive matches.
        const interopOutlet = document.querySelector('#interop-outlet');
        const shadowRoot = interopOutlet?.shadowRoot;
        const modal = shadowRoot
          ? (shadowRoot.querySelector('.jobs-easy-apply-content') ||
             shadowRoot.querySelector('[aria-labelledby*="easy-apply"], [aria-label*="Easy Apply"]') ||
             shadowRoot.querySelector('[role="dialog"]'))
          : null;
        if (!modal) return { advanced: false, reason: "modal_closed" };

        function clickNext() {
          // Try aria-label selectors first (LinkedIn uses "Continue to next step", "Review your application", etc.)
          const byAriaLabel = modal.querySelector(
            'button[aria-label*="Continue"], button[aria-label*="Next step"], button[aria-label*="Review your"], button[aria-label="Next"]'
          );
          if (byAriaLabel && !byAriaLabel.disabled) { byAriaLabel.click(); return true; }

          // Text-content fallback — partial match, not exact (handles "Next", "Continue", "Continue to next step")
          const byText = Array.from(modal.querySelectorAll('button')).find(b => {
            const text = (b.textContent || '').trim().toLowerCase();
            return !b.disabled && (text === 'next' || text === 'continue' || text === 'review' ||
              text.startsWith('next') || text.startsWith('continue') || text.startsWith('review'));
          });
          if (byText) { byText.click(); return true; }

          // Last-resort: primary action button in the modal footer (LinkedIn always puts the forward button last)
          const allBtns = Array.from(modal.querySelectorAll('footer button, .jobs-easy-apply-footer button, .artdeco-modal__actionbar button'));
          const primaryBtn = allBtns.reverse().find(b => !b.disabled &&
            !/(dismiss|close|back|cancel|discard)/i.test(b.textContent + (b.getAttribute('aria-label') || '')));
          if (primaryBtn) { primaryBtn.click(); return true; }

          return false;
        }

        function hasEmptyRequiredFields() {
          const required = Array.from(modal.querySelectorAll('input[required], select[required], textarea[required]'));
          return required.some((element) => !(element.value || '').trim());
        }

        // Fill numeric "years of experience" / skill-level questions with a safe default.
        // Uses the React-compatible nativeInputValueSetter so React re-renders the field.
        function fillNumericExperienceFields() {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          const inputs = Array.from(modal.querySelectorAll('input[required], input[type="number"]'));
          for (const input of inputs) {
            if ((input.value || '').trim() !== '') continue; // already filled
            const labelEl = input.id ? modal.querySelector(`label[for="${input.id}"]`) : null;
            const labelText = (labelEl?.textContent || input.getAttribute('aria-label') || input.getAttribute('placeholder') || '').toLowerCase();
            if (/years|experience|how many|proficiency|skill/i.test(labelText)) {
              const val = '1';
              if (nativeSetter) {
                nativeSetter.call(input, val);
              } else {
                input.value = val;
              }
              input.dispatchEvent(new Event('input',  { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }

        function answerSimpleRadios() {
          const fieldsets = Array.from(modal.querySelectorAll('fieldset'));
          for (const fs of fieldsets) {
            const radios = Array.from(fs.querySelectorAll('input[type="radio"]'));
            const yesRadio = radios.find((r) => /^yes$/i.test((r.value || r.nextSibling?.textContent || '').trim()));
            if (yesRadio && !fs.querySelector('input[type="radio"]:checked')) yesRadio.click();
          }
        }

        // Fill <select> dropdowns based on question label content.
        // Rules (per linkedin-easy-apply skill):
        //   - citizenship / work authorization / visa / PR / permanent resident → "No" (Rachel is US-based, not SG citizen)
        //   - experience / proficiency / hands-on / familiar with any tech → "Yes"
        //   - anything else → skip (leave for user)
        function fillSelectDropdowns() {
          const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
          const selects = Array.from(modal.querySelectorAll('select[required], select'));
          for (const sel of selects) {
            if (sel.value && sel.value !== '' && !sel.value.toLowerCase().includes('select')) continue; // already chosen
            const labelEl = sel.id ? modal.querySelector(`label[for="${sel.id}"]`) : null;
            const labelText = (labelEl?.textContent || sel.getAttribute('aria-label') || '').toLowerCase();

            // Determine target value
            let target = null;
            if (/citizen|permanent.?resident|pr\b|work.?authoriz|visa|eligible.?to.?work|right.?to.?work/i.test(labelText)) {
              target = 'No'; // Rachel is Chinese, not a Singapore citizen/PR
            } else if (/experience|proficien|hands.?on|familiar|knowledge|skill|develop|build|built|work.?with|use.?of/i.test(labelText)) {
              target = 'Yes';
            }
            if (!target) continue;

            // Find matching option (case-insensitive)
            const opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === target.toLowerCase() || o.value.toLowerCase() === target.toLowerCase());
            if (!opt) continue;

            if (nativeSelectSetter) {
              nativeSelectSetter.call(sel, opt.value);
            } else {
              sel.value = opt.value;
            }
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        if (modalState === "contact_info") {
          if (hasEmptyRequiredFields()) return { advanced: false, reason: "required_field_empty" };
          return clickNext() ? { advanced: true } : { advanced: false, reason: "next_button_not_found" };
        }

        if (modalState === "resume") {
          const resumes = modal.querySelectorAll(
            '.jobs-document-upload-redesign-card__container, [data-test-document-upload-list-item]'
          );
          if (resumes.length === 0) return { advanced: false, reason: "resume_not_selectable" };
          // Select first resume (click or check its radio)
          const firstResume = resumes[0];
          const radio = firstResume.querySelector('input[type="radio"]');
          if (radio) { radio.click(); }
          else { firstResume.click(); }
          const advanced = clickNext();
          return advanced ? { advanced: true } : { advanced: false, reason: "next_button_not_found" };
        }

        if (modalState === "screening" || modalState === "additional_questions") {
          // Fill salary/compensation fields with default 10000
          const nativeSetter2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          const allInputs = Array.from(modal.querySelectorAll('input, textarea'));
          for (const input of allInputs) {
            const label = modal.querySelector(`label[for="${input.id}"]`)?.textContent?.toLowerCase() || "";
            const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
            const dataType = (input.getAttribute('data-field-type') || '').toLowerCase();
            if (/salary|compensation|pay\b|wage/i.test(label) ||
                /salary|compensation/i.test(placeholder) ||
                /salary|compensation/.test(dataType)) {
              if (!(input.value || '').trim()) {
                if (nativeSetter2) nativeSetter2.call(input, '10000');
                else input.value = '10000';
                input.dispatchEvent(new Event('input',  { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }

          // Auto-fill numeric experience/skill fields and dropdowns before checking for empties
          fillNumericExperienceFields();
          fillSelectDropdowns();

          // Handle yes/no radio groups
          answerSimpleRadios();

          const advanced = clickNext();
          return advanced ? { advanced: true } : { advanced: false, reason: "next_button_not_found" };
        }

        if (modalState === "unknown") {
          const resumes = modal.querySelectorAll(
            '.jobs-document-upload-redesign-card__container, [data-test-document-upload-list-item]'
          );
          if (resumes.length > 0) {
            const firstResume = resumes[0];
            const radio = firstResume.querySelector('input[type="radio"]');
            if (radio) radio.click();
            else firstResume.click();
          }

          fillNumericExperienceFields();
          fillSelectDropdowns();
          answerSimpleRadios();

          if (hasEmptyRequiredFields()) {
            return { advanced: false, reason: "required_field_empty" };
          }

          const advanced = clickNext();
          return advanced ? { advanced: true } : { advanced: false, reason: "unknown_modal_no_forward_button" };
        }

        return { advanced: false, reason: "unhandled_state" };
      },
      args: [state]
    });
    return results[0]?.result || { advanced: false, reason: "script_error" };
  } catch (e) {
    return { advanced: false, reason: `exception: ${e.message}` };
  }
}

async function runPreSubmitValidation() {
  if (!currentTabId) return { passed: false, failures: ["no_tab"] };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: () => {
        const interopOutlet = document.querySelector('#interop-outlet');
        const modal = (interopOutlet?.shadowRoot?.querySelector('[role="dialog"], .jobs-easy-apply-content')) ||
                      document.querySelector('[role="dialog"], .jobs-easy-apply-content');
        if (!modal) return { passed: false, failures: ["modal_not_found"] };
        const required = Array.from(modal.querySelectorAll('[required], [aria-required="true"]'));
        const failures = required
          .filter(el => !el.value?.trim())
          .map(el => el.id || el.name || el.getAttribute('aria-label') || 'unknown field');
        return { passed: failures.length === 0, failures };
      }
    });
    return results[0]?.result || { passed: false, failures: ["no_result"] };
  } catch (e) {
    return { passed: false, failures: [`exception: ${e.message}`] };
  }
}

async function clickSubmit() {
  if (!currentTabId) return;
  await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: () => {
      const interopOutlet = document.querySelector('#interop-outlet');
      const modal = (interopOutlet?.shadowRoot?.querySelector('[role="dialog"], .jobs-easy-apply-content')) ||
                    document.querySelector('[role="dialog"], .jobs-easy-apply-content');
      if (!modal) return;
      const submitBtn = modal.querySelector('button[aria-label*="Submit application"]');
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    }
  });
}

/**
 * Drives the LinkedIn Easy Apply modal through all steps.
 * mode: "review" (stop before submit) | "auto_submit" (submit if validation passes)
 */
async function handleEasyApplyFlow(jobUrl, mode = "review") {
  // Step 1: Navigate to job URL if needed
  if (jobUrl) {
    try {
      const tab = await chrome.tabs.get(currentTabId);
      if (!tab.url || !tab.url.includes(jobUrl.replace(/https?:\/\/[^/]+/, ""))) {
        await navigateTab(jobUrl);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch { /* tab may not be readable */ }
  }

  // Click Easy Apply only when the modal is not already open. This lets a
  // follow-up "apply" command continue an existing Contact info step.
  let initialState = await detectModalState();
  if (initialState === "closed") {
    addMessage("system", "Opening Easy Apply modal...");
    const applyResult = await handleApply();
    if (applyResult?.external) {
      return {
        status: "stopped",
        finalState: "external_apply",
        reason: "external_apply_opened",
        transitions: [],
      };
    }
    if (!applyResult?.clicked) {
      return {
        status: "failed",
        finalState: "closed",
        reason: "apply_button_not_found",
        transitions: [],
      };
    }
  } else {
    addMessage("system", `Easy Apply form already open (${initialState}). Continuing...`);
  }

  // Detect OpenSDUI full-page redirect (~28% of LinkedIn Easy Apply jobs)
  // These navigate to /apply/?openSDUIApplyFlow=true instead of opening a modal
  await new Promise(r => setTimeout(r, 1000));
  try {
    const tab = await chrome.tabs.get(currentTabId);
    if (tab.url && /\/apply\/\?openSDUIApplyFlow=true/i.test(tab.url)) {
      addMessage("system", "⚠️ This job uses LinkedIn's external apply flow. Application opened in browser — please complete manually.");
      return { status: "stopped", finalState: "openSDUI_redirect", reason: "openSDUI_apply_redirect", transitions: [] };
    }
  } catch { /* tab may not be readable */ }

  // Wait for modal to appear (poll up to 5s); re-check for OpenSDUI redirect on each tick
  let modalFound = false;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));

    try {
      const tab = await chrome.tabs.get(currentTabId);
      if (tab.url && /\/apply\/\?openSDUIApplyFlow=true/i.test(tab.url)) {
        addMessage("system", "⚠️ This job uses LinkedIn's external apply flow. Application opened in browser — please complete manually.");
        return { status: "stopped", finalState: "openSDUI_redirect", reason: "openSDUI_apply_redirect", transitions: [] };
      }
    } catch { /* tab may not be readable */ }

    const state = await detectModalState();
    if (state !== "closed") { modalFound = true; break; }
  }
  if (!modalFound) {
    return { status: "failed", finalState: "closed", reason: "modal_never_appeared", transitions: [] };
  }

  // Step 2: State machine loop
  const MAX_STEPS = 10;
  const transitions = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const state = await detectModalState();
    transitions.push({ step, state, ts: Date.now() });

    if (state === "closed") {
      return { status: "failed", finalState: "closed", reason: "modal_closed_unexpectedly", transitions };
    }

    if (state === "submit") {
      if (mode === "review") {
        return { status: "stopped", finalState: "submit", reason: "review_mode_stop", transitions };
      }
      // Mode B: validate then submit
      const validation = await runPreSubmitValidation();
      if (!validation.passed) {
        return { status: "stopped", finalState: "submit", reason: "validation_failed", validation, transitions };
      }
      await clickSubmit();
      return { status: "submitted", finalState: "submit", transitions };
    }

    if (state === "review") {
      return { status: "stopped", finalState: "review", reason: "review_mode_stop", transitions };
    }

    const result = await handleModalState(state);
    if (!result.advanced) {
      return { status: "stopped", finalState: state, reason: result.reason, transitions };
    }

    addMessage("system", `Completed ${state.replace(/_/g, " ")}. Moving to the next step...`);

    // Small delay between steps for page to update
    await new Promise(r => setTimeout(r, 800));
  }

  return { status: "failed", finalState: "unknown", reason: "max_steps_exceeded", transitions };
}

// ─── Feature 7: runJobSearchWorkflow ──────────────────────────────────────────
async function runJobSearchWorkflow(config) {
  addMessage("system", `Starting job search: "${config.keyword}", top ${config.targetCount ?? 3}...`);

  // Step 1: Search
  const cards = await handleSearch(config.keyword, config.targetCount ?? 3);
  if (cards.length === 0) {
    addMessage("system", "❌ No job cards found. Check LinkedIn is loaded and try again.");
    if (currentTaskConfig) {
      currentTaskConfig.step = "done";
      chrome.storage.local.set({ currentTaskConfig });
    }
    return;
  }

  // Step 2: Rank
  addMessage("system", `Ranking ${cards.length} jobs...`);
  let ranked;
  try {
    ranked = await rankJobs(cards, config);
  } catch (e) {
    addMessage("system", `Ranking failed: ${e.message}`);
    if (currentTaskConfig) {
      currentTaskConfig.step = "done";
      chrome.storage.local.set({ currentTaskConfig });
    }
    return;
  }

  if (!hasRankedJobs(ranked)) {
    if (currentTaskConfig) {
      currentTaskConfig.step = "done";
      chrome.storage.local.set({ currentTaskConfig });
    }
    handleEmptyRanking();
    return;
  }

  saveRankedJobs(ranked, cards, config);
  displayRankedJobs(ranked);
  if (!config.applyRequested) {
    addMessage("system", "Ranked jobs saved. Opening the top matches in separate tabs for review.");
    await runRankedJobSelection(
      Array.from({ length: Math.min(config.targetCount ?? 3, ranked.length) }, (_, index) => index),
      false
    );
  } else {
    await runRankedJobSelection(
      Array.from({ length: Math.min(config.targetCount ?? 3, ranked.length) }, (_, index) => index),
      true
    );
  }

  if (currentTaskConfig) {
    currentTaskConfig.step = "done";
    chrome.storage.local.set({ currentTaskConfig });
  }
}

async function runCurrentPageRankingWorkflow(config) {
  addMessage("system", `Ranking visible jobs on this page, top ${config.targetCount ?? 3}...`);
  const tabId = await resolveSearchTabId();
  if (!tabId) {
    // Check if user is on a non-LinkedIn site
    try {
      const currentTab = currentTabId ? await chrome.tabs.get(currentTabId) : null;
      const host = currentTab?.url ? new URL(currentTab.url).hostname : "";
      if (host && !host.includes("linkedin.com")) {
        addMessage("system", `⚠️ Current page is ${host} — only LinkedIn is supported for job ranking. Please open a LinkedIn jobs search page.`);
      } else {
        addMessage("system", "No LinkedIn search results tab found. Open a LinkedIn jobs search page first.");
      }
    } catch {
      addMessage("system", "No LinkedIn search results tab found. Open a LinkedIn jobs search page first.");
    }
    return;
  }

  const newlyExtractedCards = await extractJobCards(tabId, config.targetCount ?? 3);
  const cardsByUrl = new Map();
  const cardSources = config.continuation
    ? [...(currentTaskConfig?.extractedCards || []), ...newlyExtractedCards]
    : newlyExtractedCards;
  cardSources.forEach((card) => {
    const key = getLinkedInJobId(card.url) || card.url || `${card.title}|${card.company}`;
    if (key) cardsByUrl.set(key, card);
  });
  const cards = Array.from(cardsByUrl.values());
  if (cards.length === 0) {
    addMessage("system", "No job cards found on the current page. Make sure the LinkedIn search results list is visible.");
    return;
  }

  addMessage("system", `Found ${cards.length} visible job cards. Ranking...`);
  let ranked;
  try {
    ranked = await rankJobs(cards, config);
  } catch (e) {
    addMessage("system", `Ranking failed: ${e.message}`);
    return;
  }

  if (!hasRankedJobs(ranked)) {
    handleEmptyRanking();
    return;
  }

  saveRankedJobs(ranked, cards, config);
  displayRankedJobs(ranked);

  if (!config.applyRequested) {
    addMessage("system", "Ranked jobs saved. Opening the top matches in separate tabs for review.");
    await runRankedJobSelection(
      Array.from({ length: Math.min(config.targetCount ?? 3, ranked.length) }, (_, index) => index),
      false
    );
    return;
  }

  await runRankedJobSelection(
    Array.from({ length: Math.min(config.targetCount ?? 3, ranked.length) }, (_, index) => index),
    true
  );
}

// Load applied jobs from storage
chrome.storage.local.get("appliedJobs", (result) => {
  appliedJobs = result.appliedJobs || [];
  updateAppliedCount();
});

// Get current tab's page text via content script
async function getPageText(tabId = currentTabId) {
  if (!tabId) return { text: "", url: "" };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const description = document.querySelector(
          '#job-details, .jobs-description__content, .jobs-box__html-content, [class*="jobs-description"]'
        );
        const pageText = document.body?.innerText || document.body?.textContent || "";
        const descriptionText = description?.innerText || description?.textContent || "";
        return {
          text: (descriptionText.length >= 200 ? `${pageText.slice(0, 4000)}\n\nJOB DESCRIPTION:\n${descriptionText}` : pageText).slice(0, 20000),
          descriptionText: descriptionText.slice(0, 16000),
          url: window.location.href,
          links: Array.from(document.querySelectorAll('a[href]'))
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const absoluteHref = new URL(href, window.location.href).href;
            const text = (a.textContent || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            return { href: absoluteHref, text };
          })
          .filter((link) => /linkedin\.com\/jobs\/view\/|\/jobs\/view\//i.test(link.href))
          .filter((link, index, all) => all.findIndex((candidate) => candidate.href === link.href) === index)
          .slice(0, 40)
        };
      }
    });
    return results[0]?.result || { text: "", url: "" };
  } catch {
    return { text: "", url: "" };
  }
}

async function waitForJobDetailText(tabId) {
  let page = { text: "", descriptionText: "", url: "" };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    page = await getPageText(tabId);
    if (page.descriptionText?.length >= 200 || page.text?.length >= 500) return page;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return page;
}

// Execute actions on page (for apply)
async function executeActions(actions) {
  if (!currentTabId) return;

  for (const action of actions) {
    if (action.type === "click" && action.selector) {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: (sel) => {
          const el = document.querySelector(sel);
          if (el) el.click();
        },
        args: [action.selector]
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Navigate the locked tab to a new URL and wait for it to finish loading
function navigateTab(url) {
  return new Promise((resolve, reject) => {
    if (!currentTabId) { reject(new Error("No tab connected")); return; }

    const onUpdated = (tabId, changeInfo) => {
      if (tabId === currentTabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        // Feature 8: update task step on page load
        chrome.storage.local.get("currentTaskConfig", ({ currentTaskConfig: saved }) => {
          if (saved && saved.step === "searching") {
            saved.step = "extracting";
            chrome.storage.local.set({ currentTaskConfig: saved });
          }
        });
        // Extra delay for SPA content to render (LinkedIn is a SPA)
        setTimeout(resolve, 2000);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(currentTabId, { url });
    if (isLinkedInSearchUrl(url)) searchTabId = currentTabId;

    // Timeout after 15s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(); // resolve anyway, page might be usable
    }, 15000);
  });
}

function openJobTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const existing = tabs.find((tab) => tab.id && sameJobUrl(tab.url, url));
      if (existing?.id) {
        resolve(existing.id);
        return;
      }

      const createProps = { url, active: false };
      if (currentTabId) createProps.openerTabId = currentTabId;

      chrome.tabs.create(createProps, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!tab?.id) {
          reject(new Error("Could not open job tab"));
          return;
        }

        const openedTabId = tab.id;
        let settled = false;
        let pollTimer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          if (pollTimer) clearInterval(pollTimer);
          setTimeout(() => resolve(openedTabId), 2000);
        };
        const onUpdated = (tabId, changeInfo) => {
          if (tabId === openedTabId && changeInfo.status === "complete") {
            finish();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        pollTimer = setInterval(() => {
          chrome.tabs.get(openedTabId, (latestTab) => {
            if (chrome.runtime.lastError) return;
            if (latestTab?.status === "complete") finish();
          });
        }, 250);

        setTimeout(() => {
          finish();
        }, 15000);
      });
    });
  });
}

async function handleNavigate(url, thenApply = false, options = {}) {
  if (!url.startsWith('https://www.linkedin.com/')) {
    addMessage("system", "Navigation blocked — only LinkedIn URLs are allowed.");
    return null;
  }

  const openInNewTab = options.openInNewTab !== false;
  addMessage("system", `${openInNewTab ? "Opening new tab" : "Navigating"}: ${url}`);
  try {
    if (openInNewTab) {
      currentTabId = await openJobTab(url);
    } else {
      await navigateTab(url);
    }
    addMessage("system", "Page loaded.");

    // Always bring the new tab into focus (unless caller opts out for background use)
    if (openInNewTab && currentTabId && options.activateAfter !== false) {
      chrome.tabs.update(currentTabId, { active: true });
    }

    if (thenApply) {
      // Small extra wait, then drive the complete Easy Apply flow.
      await new Promise(r => setTimeout(r, 1000));
      const result = await handleEasyApplyFlow(null, options.applyMode || currentTaskConfig?.applyMode || "review");
      if (result.status === "submitted") {
        addMessage("assistant", "Application submitted.");
      } else if (result.reason === "review_mode_stop") {
        addMessage("assistant", "Application is ready for review. Please verify it before submitting.");
      } else if (result.reason && !["external_apply_opened", "openSDUI_apply_redirect"].includes(result.reason)) {
        addMessage("system", `Easy Apply stopped: ${result.reason}`);
      }
    }

    return currentTabId;
  } catch (e) {
    addMessage("system", `Navigation error: ${e.message}`);
    return null;
  }
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  $("chat-messages").appendChild(div);
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;

  // Always push to chatHistory (including system messages for context)
  chatHistory.push({ role: role === "user" ? "user" : (role === "system" ? "system" : "assistant"), content, ts: Date.now() });

  // Persist to storage (keep last 50 messages to avoid storage bloat)
  chrome.storage.local.set({ chatHistory: chatHistory.slice(-50) });

  const historyPanel = $("history-panel");
  if (historyPanel && historyPanel.style.display !== "none") {
    renderHistoryPanel();
  }
}

function updateAppliedCount() {
  const countEl = $("applied-count");
  if (countEl) {
    countEl.textContent = appliedJobs.length > 0 ? appliedJobs.length : "";
  }
}

function getLinkedInJobId(url) {
  const raw = String(url || "");
  const pathId = raw.match(/\/jobs\/view\/(\d+)/i)?.[1];
  if (pathId) return pathId;
  try {
    return new URL(raw).searchParams.get("currentJobId") || "";
  } catch {
    return raw.match(/[?&]currentJobId=(\d+)/i)?.[1] || "";
  }
}

function sameJobUrl(a, b) {
  const aId = getLinkedInJobId(a);
  const bId = getLinkedInJobId(b);
  if (aId && bId) return aId === bId;
  return String(a || "").split("?")[0] === String(b || "").split("?")[0];
}

function findRankedJobByUrl(url) {
  return getRankedJobs().find((job) => sameJobUrl(job.url, url)) || null;
}

function isPlaceholderJobTitle(title) {
  return !title || /^(unknown(?: job)?|easy apply|apply|applied|apply on company website)$/i.test(title.trim());
}

function isPlaceholderCompany(company) {
  return !company || /^unknown$/i.test(company.trim());
}

function canonicalLinkedInJobUrl(url) {
  const jobId = getLinkedInJobId(url);
  return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : (url || "");
}

function enrichAppliedJob(job) {
  const ranked = findRankedJobByUrl(job.url);
  return {
    ...job,
    title: !isPlaceholderJobTitle(job.title) ? job.title : (ranked?.title || "Unknown Job"),
    company: !isPlaceholderCompany(job.company) ? job.company : (ranked?.company || "Unknown Company"),
    url: canonicalLinkedInJobUrl(job.url),
  };
}

function recordAppliedJob(title, company, url, external = false) {
  const ranked = findRankedJobByUrl(url);
  const resolvedTitle = !isPlaceholderJobTitle(title) ? title : (ranked?.title || "Unknown Job");
  const resolvedCompany = !isPlaceholderCompany(company) ? company : (ranked?.company || "Unknown Company");
  const canonicalUrl = canonicalLinkedInJobUrl(url);
  const job = {
    title: resolvedTitle,
    company: resolvedCompany,
    url: canonicalUrl,
    external,
    ts: Date.now()
  };
  const existingIndex = appliedJobs.findIndex((existing) => sameJobUrl(existing.url, canonicalUrl));
  if (existingIndex >= 0) {
    appliedJobs[existingIndex] = { ...appliedJobs[existingIndex], ...job };
  } else {
    appliedJobs.push(job);
  }
  chrome.storage.local.set({ appliedJobs });
  updateAppliedCount();
}

function renderAppliedPanel() {
  const list = $("applied-list");
  if (!list) return;
  
  if (appliedJobs.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#64748b;padding:12px;">No jobs applied yet</div>';
    return;
  }
  
  // Show newest first
  const enrichedJobs = appliedJobs.map(enrichAppliedJob);
  const changed = enrichedJobs.some((job, index) =>
    job.title !== appliedJobs[index]?.title ||
    job.company !== appliedJobs[index]?.company ||
    job.url !== appliedJobs[index]?.url
  );
  if (changed) {
    appliedJobs = enrichedJobs;
    chrome.storage.local.set({ appliedJobs });
  }

  const sorted = [...enrichedJobs].reverse();
  list.innerHTML = sorted.map(job => {
    const date = new Date(job.ts).toLocaleDateString();
    const cls = job.external ? 'applied-item external' : 'applied-item';
    return `<div class="${cls}">
      <div class="job-title">${escapeHtml(job.title)}</div>
      <div class="job-meta">${escapeHtml(job.company)} · ${date}${job.external ? ' · External' : ' · Easy Apply'}</div>
      ${job.url ? `<div class="job-meta">${escapeHtml(job.url)}</div>` : ""}
    </div>`;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderHistoryPanel() {
  const list = $("history-list");
  if (!list) return;
  if (chatHistory.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#64748b;padding:12px;">No chat history</div>';
    return;
  }
  list.innerHTML = chatHistory.map((msg) => {
    const time = msg.ts ? new Date(msg.ts).toLocaleString() : "";
    return `<div class="history-item">
      <div class="history-meta">${escapeHtml(msg.role)}${time ? ` · ${escapeHtml(time)}` : ""}</div>
      <div class="history-text">${escapeHtml(msg.content)}</div>
    </div>`;
  }).join('');
}

async function sendChat(message) {
  addMessage("user", message);
  $("chat-input").value = "";
  setChatBusy(true);

  // Feature 8: clear task config on "clear" or "cancel"
  if (/^\s*(clear|cancel)\s*$/i.test(message)) {
    currentTaskConfig = null;
    pendingSubmitConfirm = false;
    chrome.storage.local.remove("currentTaskConfig");
    addMessage("system", "Task cleared.");
    setChatBusy(false);
    return;
  }

  // [CONFIRM REQUIRED] submit confirmation gate
  if (pendingSubmitConfirm) {
    if (/confirm\s*submit|确认提交|提交|submit now/i.test(message)) {
      pendingSubmitConfirm = false;
      addMessage("system", "Submitting application...");
      await clickSubmit();
      addMessage("assistant", `✅ Application submitted: ${lastApplyJobTitle}${lastApplyJobCompany ? " @ " + lastApplyJobCompany : ""}`);
    } else {
      pendingSubmitConfirm = false;
      addMessage("system", "Submission cancelled.");
    }
    setChatBusy(false);
    return;
  }

  await ensureRankedJobsLoaded();

  const continuation = parseContinuationIntent(message);
  if (continuation) {
    await continueRankedTask(continuation);
    setChatBusy(false);
    return;
  }

  if (parseCurrentPageApplyIntent(message)) {
    await handleCurrentPageApply(message);
    setChatBusy(false);
    return;
  }

  const rankedJobBatch = parseRankedJobBatch(message);
  if (rankedJobBatch) {
    await runRankedJobSelection(rankedJobBatch.indexes, rankedJobBatch.apply, resolveApplyMode(message));
    setChatBusy(false);
    return;
  }

  const rankedJobReference = parseRankedJobReference(message);
  if (rankedJobReference !== null) {
    const { index: rankedJobIndex, action } = rankedJobReference;
    const rankedJobs = getRankedJobs();
    const job = rankedJobs[rankedJobIndex];
    if (!job?.url) {
      addMessage("system", `I don't have a saved #${rankedJobIndex + 1} job from the last ranking. Ask me to find the best matches again.`);
      setChatBusy(false);
      return;
    }

    if (action === "analyze") {
      await analyzeRankedJob(rankedJobIndex);
    } else {
      await runRankedJobSelection([rankedJobIndex], action === "apply", resolveApplyMode(message));
    }
    setChatBusy(false);
    return;
  }

  const visibleRanking = parseRankVisibleIntent(message);
  if (visibleRanking) {
    try {
      await runCurrentPageRankingWorkflow(visibleRanking);
    } catch (e) {
      addMessage("system", `Ranking error: ${e.message}`);
    }
    setChatBusy(false);
    return;
  }

  // Feature 1+7: check for job search intent before sending to LLM
  const parsed = parseUserIntent(message);
  if (parsed) {
    currentTaskConfig = { ...parsed, step: "starting" };
    chrome.storage.local.set({ currentTaskConfig });
    try {
      await runJobSearchWorkflow(currentTaskConfig);
    } catch (e) {
      addMessage("system", `Workflow error: ${e.message}`);
    }
    setChatBusy(false);
    return; // don't send to LLM
  }

  const { text, url, links } = await getPageText();

  try {
    const r = await fetch(`${getServiceUrl()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, pageText: text, url, links, history: chatHistory.slice(-10), profile: getUserProfile() })
    });
    const data = await r.json();
    console.log("[POPUP DEBUG] Server response:", JSON.stringify({ intent: data.intent, navigateUrl: data.navigateUrl, ok: data.ok }));
    if (data.ok) {
      // Clean navigation tags from displayed message
      const cleanReply = data.reply
        .replace(/\[NAVIGATE_AND_APPLY:\s*[^\]]+\]/gi, '')
        .replace(/\[NAVIGATE:\s*[^\]]+\]/gi, '')
        .trim();
      if (cleanReply) addMessage("assistant", cleanReply);
      if (data.intent === "navigate_and_apply" && data.navigateUrl) {
        await handleNavigate(data.navigateUrl, true);
      } else if (data.intent === "navigate" && data.navigateUrl) {
        await handleNavigate(data.navigateUrl, false);
      } else if (data.intent === "apply") {
        const result = await handleEasyApplyFlow(null, currentTaskConfig?.applyMode || "review");
        if (result.reason === "review_mode_stop") {
          addMessage("assistant", "Application is ready for review. Please verify it before submitting.");
        } else if (result.reason && !["external_apply_opened", "openSDUI_apply_redirect"].includes(result.reason)) {
          addMessage("system", `Easy Apply stopped: ${result.reason}`);
        }
      } else if (data.intent === "analyze") {
        await handleAnalyze();
      }
    } else {
      addMessage("system", `Error: ${data.error}`);
    }
  } catch (e) {
    addMessage("system", `Service error: ${e.message}`);
  }

  setChatBusy(false);
}

async function handleAnalyze(tabId = currentTabId, fallbackJob = null) {
  const { text, descriptionText, url } = await waitForJobDetailText(tabId);
  if (!text) { addMessage("system", "No page content found."); return; }

  addMessage("system", "Analyzing...");
  try {
    const r = await fetch(`${getServiceUrl()}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageText: text, url })
    });
    const data = await r.json();
    if (data.ok) {
      const { jd, score } = data;
      const title = isPlaceholderJobTitle(jd.title) ? fallbackJob?.title || jd.title : jd.title;
      const company = isPlaceholderCompany(jd.company) ? fallbackJob?.company || jd.company : jd.company;
      const reasons = Array.isArray(score?.reasons) ? score.reasons : [];
      const description = String(descriptionText || jd.description || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2400);
      const msg = `📋 ${title} @ ${company}\n📍 ${jd.location || fallbackJob?.location || 'N/A'} | 💰 ${jd.salary?.raw || 'N/A'}\n\n⭐ Tier ${score?.tier || 'N/A'}\n${reasons.join('\n')}${description ? `\n\nJD:\n${description}${description.length >= 2400 ? "..." : ""}` : ""}`;
      addMessage("assistant", msg);
    } else {
      addMessage("system", `Error: ${data.error}`);
    }
  } catch (e) {
    addMessage("system", `Service error: ${e.message}`);
  }
}

async function handleApply() {
  addMessage("system", "Looking for Apply button on page...");

  if (!currentTabId) {
    addMessage("system", "No tab connected.");
    return { clicked: false, reason: "no_tab" };
  }
  let tabUrl = "";
  try {
    const tab = await chrome.tabs.get(currentTabId);
    tabUrl = tab.url || "";
  } catch { /* tab may have closed */ }
  addMessage("system", `Operating on: ${tabUrl}`);

  // Retry up to 3 times (detail panel can take seconds to load on search results page)
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  let lastPageUrl = tabUrl;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Find and click apply button directly in the DOM — no LLM needed
      // Covers both search-results page (button.jobs-apply-button) and
      // standalone job view page (a[aria-label*="Easy Apply"])
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => {
          const pageUrl = window.location.href;
          const isUsableClickTarget = (el) => {
            if (!el) return false;
            if (el.disabled) return false;
            if (el.getAttribute('aria-hidden') === 'true') return false;
            if (el.getAttribute('aria-disabled') === 'true') return false;
            return true;
          };
          const getJobMeta = () => {
            const title = document.querySelector(
              [
                'h1.t-24.job-details-jobs-unified-top-card__job-title',
                'h1.jobs-unified-top-card__job-title',
                '.job-details-jobs-unified-top-card__job-title h1',
                '.job-details-jobs-unified-top-card__job-title h2',
                '.job-details-jobs-unified-top-card__job-title',
                '.jobs-unified-top-card__job-title',
                'a.job-details-jobs-unified-top-card__job-title-link',
                '[data-test-job-title]',
                '[class*="job-title"] h1',
                '[class*="job-title"] h2',
                'h1[class*="job-title"]',
                'main h1',
                'main h2'
              ].join(', ')
            )?.textContent?.replace(/\s+/g, ' ').trim() || "";
            let company = document.querySelector(
              [
                '.job-details-jobs-unified-top-card__company-name a',
                '.jobs-unified-top-card__company-name a',
                '.job-details-jobs-unified-top-card__company-name',
                '.jobs-unified-top-card__company-name',
                'a[class*="company-name"]',
                '[class*="company-name"] a',
                '[class*="company-name"]'
              ].join(', ')
            )?.textContent?.replace(/\s+/g, ' ').trim() || "";
            if (!company) {
              const interopOutlet = document.querySelector('#interop-outlet');
              const modal = (interopOutlet?.shadowRoot?.querySelector('[role="dialog"], .jobs-easy-apply-content')) ||
                document.querySelector('[role="dialog"], .jobs-easy-apply-content');
              const modalHeading = modal?.querySelector('h1, h2, [class*="modal__title"]')?.textContent
                ?.replace(/\s+/g, ' ').trim() || "";
              company = modalHeading.match(/^Apply to\s+(.+)$/i)?.[1]?.trim() || "";
            }
            return { title, company };
          };

          // Shadow-DOM-aware query: LinkedIn renders job detail inside #interop-outlet shadowRoot
          const interopShadow = document.querySelector('#interop-outlet')?.shadowRoot;
          function sdQuery(sel) {
            return document.querySelector(sel) ||
                   (interopShadow ? interopShadow.querySelector(sel) : null);
          }
          function sdQueryAll(sel) {
            const fromDoc = Array.from(document.querySelectorAll(sel));
            const fromShadow = interopShadow ? Array.from(interopShadow.querySelectorAll(sel)) : [];
            return [...fromDoc, ...fromShadow];
          }

          // Phase 1: CSS selectors (buttons AND links) in priority order
          const SELECTORS = [
            // Search results page — detail panel
            'button.jobs-apply-button',
            'button#jobs-apply-button-id',
            '.jobs-s-apply button',
            '.jobs-apply-button--top-card button',
            // Standalone job view page — uses <a> tag, not <button>
            'a[aria-label*="Easy Apply"]',
            'a[aria-label*="Apply to"]',
            // Generic aria-label matches (button or link)
            // NOTE: skip generic button[aria-label*="Easy Apply"] — it can match the filter pill
            '[data-control-name="jobdetails_topcard_inapply"]',
          ];
          // LinkedIn uses React synthetic events — bare el.click() silently fails on <a> tags.
          // Must dispatch a full MouseEvent with bubbles:true so React's event delegation fires.
          function nativeClick(el) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
          }

          for (const sel of SELECTORS) {
            const el = sdQuery(sel);
            if (isUsableClickTarget(el)) {
              const label = el.textContent?.trim() || el.getAttribute('aria-label') || sel;
              nativeClick(el);
              return { clicked: true, label, method: 'selector: ' + sel, pageUrl, ...getJobMeta() };
            }
          }

          // Phase 1.5: "Apply on company website" link (external apply)
          const externalApply = sdQuery('a[aria-label*="Apply on company"]') ||
            sdQueryAll('a').find(a => {
              const t = (a.textContent || '').trim().toLowerCase();
              return t.includes('apply on company') || t.includes('apply on employer');
            });
          if (isUsableClickTarget(externalApply)) {
            const label = externalApply.textContent?.trim() || 'Apply on company website';
            nativeClick(externalApply);
            return { clicked: true, label, method: 'external-apply', external: true, pageUrl, ...getJobMeta() };
          }

          // Phase 2: Fallback — any visible clickable element containing "easy apply" or exactly "apply"
          // Exclude filter pills by checking element is not inside a filter bar
          const clickables = sdQueryAll('button, a, div[role="button"]');
          const applyEl = clickables.find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            const isFilter = el.getAttribute('role') === 'radio' ||
                             el.closest('[class*="search-reusables"]') ||
                             (el.getAttribute('aria-label') || '').includes('filter');
            return !isFilter &&
                   (text.includes('easy apply') || text === 'apply') &&
                   el.offsetParent !== null &&
                   el.getBoundingClientRect().width > 20;
          });
          if (applyEl) {
            const label = applyEl.textContent?.trim() || 'Apply';
            nativeClick(applyEl);
            return { clicked: true, label, method: 'text-fallback', pageUrl, ...getJobMeta() };
          }
          return { clicked: false, label: null, method: null, pageUrl };
        }
      });

      const result = results[0]?.result;
      if (result?.pageUrl) lastPageUrl = result.pageUrl;
      if (result?.clicked) {
        if (result.external) {
          addMessage("assistant", `✓ Clicked「${result.label}」— redirecting to company website. Please complete the application there. Page: ${result.pageUrl}`);
        } else {
          addMessage("assistant", `✓ Clicked「${result.label}」— check the page to complete the form. Page: ${result.pageUrl}`);
        }
        // Record the application
        recordAppliedJob(result.title || result.label || "Unknown Job", result.company || "", result.pageUrl, !!result.external);
        return result;
      }

      // Not found yet — wait and retry (page might still be loading)
      if (attempt < MAX_RETRIES - 1) {
        addMessage("system", `Button not found yet, retrying in ${RETRY_DELAY/1000}s...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    } catch (e) {
      addMessage("system", `Error: ${e.message}`);
      return { clicked: false, reason: "exception", error: e.message };
    }
  }

  addMessage("system", `Could not find an Apply button on this page after retries. Last page checked: ${lastPageUrl}. Make sure you're on a LinkedIn job detail page.`);
  return { clicked: false, reason: "apply_button_not_found", pageUrl: lastPageUrl };
}

async function checkService() {
  const chatInput = $("chat-input");
  const sendButton = $("btn-send");
  try {
    const r = await fetch(`${getServiceUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      $("service-status").className = "status-bar connected";
      $("status-text").textContent = "Ready";
      if (chatInput) chatInput.disabled = false;
      if (sendButton && !chatBusy) sendButton.disabled = false;
      return true;
    }
  } catch {}
  $("service-status").className = "status-bar disconnected";
  $("status-text").textContent = "Service offline — run: npm start";
  if (chatInput) chatInput.disabled = false;
  if (sendButton && !chatBusy) sendButton.disabled = false;
  return false;
}

// Event listeners
// History panel toggle
const historyBtn = $("btn-history");
if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    const panel = $("history-panel");
    const appliedPanel = $("applied-panel");
    if (!panel) return;
    const isVisible = panel.style.display !== "none";
    if (isVisible) {
      panel.style.display = "none";
      historyBtn.classList.remove("active");
    } else {
      renderHistoryPanel();
      panel.style.display = "block";
      historyBtn.classList.add("active");
      if (appliedPanel) appliedPanel.style.display = "none";
      if (appliedBtn) appliedBtn.classList.remove("active");
    }
  });
}

// Applied jobs panel toggle
const appliedBtn = $("btn-applied");
if (appliedBtn) {
  appliedBtn.addEventListener("click", () => {
    const panel = $("applied-panel");
    if (!panel) return;
    const isVisible = panel.style.display !== "none";
    if (isVisible) {
      panel.style.display = "none";
      appliedBtn.classList.remove("active");
    } else {
      renderAppliedPanel();
      panel.style.display = "block";
      appliedBtn.classList.add("active");
      const historyPanel = $("history-panel");
      if (historyPanel) historyPanel.style.display = "none";
      if (historyBtn) historyBtn.classList.remove("active");
    }
  });
}

$("btn-send").addEventListener("click", () => {
  const msg = $("chat-input").value.trim();
  if (msg) sendChat(msg);
});
$("chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { const msg = $("chat-input").value.trim(); if (msg) sendChat(msg); }
});

// Clear chat button (if exists in HTML)
const clearBtn = $("btn-clear");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    chatHistory = [];
    chrome.storage.local.remove("chatHistory");
    $("chat-messages").innerHTML = "";
    const historyPanel = $("history-panel");
    if (historyPanel) historyPanel.style.display = "none";
    if (historyBtn) historyBtn.classList.remove("active");
    addMessage("system", "Chat cleared. Hi! Open a LinkedIn job page and ask me anything.");
  });
}

// ─── Settings panel ───────────────────────────────────────────────────────────
const settingsBtn = $("btn-settings");
const settingsPanel = $("settings-panel");

if (settingsBtn && settingsPanel) {
  settingsBtn.addEventListener("click", () => {
    const isVisible = settingsPanel.style.display !== "none";
    if (isVisible) {
      settingsPanel.style.display = "none";
      settingsBtn.classList.remove("active");
    } else {
      loadSettingsIntoForm();
      settingsPanel.style.display = "block";
      settingsBtn.classList.add("active");
      // Close other panels
      const hp = $("history-panel");
      const ap = $("applied-panel");
      if (hp) hp.style.display = "none";
      if (ap) ap.style.display = "none";
      if (historyBtn) historyBtn.classList.remove("active");
      if (appliedBtn) appliedBtn.classList.remove("active");
    }
  });
}

const saveSettingsBtn = $("btn-settings-save");
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    const newSettings = collectSettingsFromForm();
    persistSettings(newSettings);
    const statusEl = $("settings-save-status");
    if (statusEl) {
      statusEl.textContent = "✅ Saved";
      statusEl.style.display = "block";
      setTimeout(() => { statusEl.style.display = "none"; }, 2000);
    }
  });
}

// ─── Init: load settings first, then start service check ─────────────────────
chrome.storage.local.get("agentSettings", ({ agentSettings: saved }) => {
  if (saved) agentSettings = { ...agentSettings, ...saved };
  checkService();
  setInterval(checkService, 8000);
});

// Lock the tab ID when popup opens — all operations use the last focused normal browser tab,
// not the extension popup window itself.
chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" }, (tabs) => {
  const tab = tabs.find((candidate) => candidate?.id && !candidate.url?.startsWith("chrome-extension://"));
  if (tab?.id) {
    currentTabId = tab.id;
    if (isLinkedInSearchUrl(tab.url)) searchTabId = tab.id;
    addMessage("system", `Connected to tab: ${tab.url}`);
    return;
  }

  // Fallback: pick any non-extension tab if the focused normal window query comes back empty.
  chrome.tabs.query({}, (allTabs) => {
    const fallback = allTabs.find((candidate) => candidate?.id && /linkedin\.com\/jobs\//i.test(candidate.url || "")) ||
      allTabs.find((candidate) => candidate?.id && !candidate.url?.startsWith("chrome-extension://"));
    if (fallback?.id) {
      currentTabId = fallback.id;
      if (isLinkedInSearchUrl(fallback.url)) searchTabId = fallback.id;
      addMessage("system", `Connected to tab: ${fallback.url}`);
      return;
    }
    addMessage("system", "No browser tab found. Open a LinkedIn page first.");
  });
});

// Feature 8: Restore currentTaskConfig on popup init
chrome.storage.local.get(["currentTaskConfig", "lastRankedJobs"], ({ currentTaskConfig: saved, lastRankedJobs }) => {
  if (saved) {
    currentTaskConfig = saved;
    if ((!currentTaskConfig.rankedJobs || currentTaskConfig.rankedJobs.length === 0) && Array.isArray(lastRankedJobs)) {
      currentTaskConfig.rankedJobs = lastRankedJobs;
    }
    if (saved.step && saved.step !== "done") {
      addMessage("system", `Resuming task: "${saved.keyword}" (step: ${saved.step})`);
    }
    return;
  }
  if (Array.isArray(lastRankedJobs) && lastRankedJobs.length > 0) {
    currentTaskConfig = { step: "ranked", rankedJobs: lastRankedJobs };
  }
});

// Restore previous chat history from storage
chrome.storage.local.get("chatHistory", (result) => {
  const saved = result.chatHistory;
  if (saved && saved.length > 0) {
    // Restore messages to UI without re-persisting
    for (const msg of saved) {
      const div = document.createElement("div");
      const displayRole = msg.role === "user" ? "user" : (msg.role === "system" ? "system" : "assistant");
      div.className = `message ${displayRole}`;
      div.textContent = msg.content;
      $("chat-messages").appendChild(div);
    }
    chatHistory = [...saved];
    $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
    addMessage("system", "Session restored. You can continue where you left off.");
  } else {
    addMessage("system", "Hi! Open a LinkedIn job page and click Analyze, or ask me anything.");
  }
});
