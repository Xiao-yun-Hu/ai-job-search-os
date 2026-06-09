// tests/run-tests.js
// Run: node tests/run-tests.js

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

// ─── Test harness ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "PASS" });
    console.log(`✅ PASS: ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: "FAIL", error: e.message });
    console.log(`❌ FAIL: ${name} — ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── Fixture loader ───────────────────────────────────────────────────────────
function loadFixture(filename) {
  const fixturePath = path.join(__dirname, "..", "fixtures", filename);
  const html = fs.readFileSync(fixturePath, "utf-8");
  const dom = new JSDOM(html, { url: "https://www.linkedin.com/jobs/search/" });
  return dom.window.document;
}

// ─── Inline implementations ───────────────────────────────────────────────────

function parseUserIntent(message) {
  if (!message || typeof message !== "string") return null;
  const msg = message.trim().toLowerCase();

  const searchTriggers = ["search", "find", "look for", "apply"];
  const hasSearchTrigger = searchTriggers.some(t => msg.includes(t));
  if (!hasSearchTrigger) return null;

  let keyword = null;
  const keywordMatch =
    message.match(/(?:search|look\s+for)\s+(.+?)(?:\s+(?:top|find|apply|above\s+score)\b|$)/i) ||
    message.match(/find\s+(?:top\s+\d+\s+)?(.+?)(?:\s+(?:apply|above\s+score)\b|$)/i);
  if (keywordMatch) {
    keyword = keywordMatch[1].trim();
    keyword = keyword.replace(/\s+and\s*$/i, "").trim();
  }

  if (!keyword) return null;
  if (keyword.length < 2) return null;

  let targetCount = 3;
  const topMatch = message.match(/\btop\s+(\d+)\b/i) || message.match(/\bfind\s+(\d+)\b/i);
  if (topMatch) targetCount = parseInt(topMatch[1], 10);

  let minScore = 70;
  const scoreMatch = message.match(/(?:above\s+score|score\s+above)\s+(\d+)/i);
  if (scoreMatch) minScore = parseInt(scoreMatch[1], 10);

  const applyMode = /\bauto\b|\bapply\b/i.test(message) ? "auto_submit" : "review";

  return { keyword, targetCount, minScore, applyMode };
}

function extractJobCardsFromDoc(doc) {
  const cardSelectors = [
    '.job-card-container',
    '.jobs-search-results__list-item',
    '[data-job-id]',
    '.scaffold-layout__list-item',
  ];

  let containers = [];
  for (const sel of cardSelectors) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 0) { containers = found; break; }
  }

  return containers.slice(0, 50).map(card => {
    const title = (
      card.querySelector('.job-card-container__primary-description') &&
        card.querySelector('.job-card-container__primary-description').textContent ||
      card.querySelector('h3') && card.querySelector('h3').textContent ||
      card.querySelector('h2') && card.querySelector('h2').textContent ||
      card.getAttribute('aria-label') ||
      ""
    ).replace(/\s+/g, " ").trim();

    const company = (
      card.querySelector('.job-card-container__company-name') &&
        card.querySelector('.job-card-container__company-name').textContent ||
      card.querySelector('.artdeco-entity-lockup__subtitle') &&
        card.querySelector('.artdeco-entity-lockup__subtitle').textContent ||
      ""
    ).replace(/\s+/g, " ").trim();

    const location = (
      card.querySelector('.job-card-container__metadata-item') &&
        card.querySelector('.job-card-container__metadata-item').textContent ||
      card.querySelector('.artdeco-entity-lockup__caption') &&
        card.querySelector('.artdeco-entity-lockup__caption').textContent ||
      ""
    ).replace(/\s+/g, " ").trim();

    const anchor = card.querySelector('a[href*="/jobs/view/"]');
    let url = "";
    if (anchor) {
      const href = anchor.getAttribute("href") || "";
      url = href.startsWith("http") ? href : "https://www.linkedin.com" + href;
    }

    const easyApply = /easy\s*apply/i.test(card.textContent || "");
    return { title, company, location, url, easyApply };
  }).filter(c => c.title || c.url);
}

function detectModalStateFromDoc(doc) {
  const modal = doc.querySelector('[role="dialog"], .jobs-easy-apply-content');
  if (!modal) return "closed";

  const headingEl = modal.querySelector('h3, h2, [aria-label]');
  const heading = ((headingEl && headingEl.textContent) || '').toLowerCase();
  const submitBtn = modal.querySelector('button[aria-label*="Submit application"]');

  if (submitBtn) return "submit";
  if (/review your application/.test(heading)) return "review";
  if (/contact info|phone number|email/.test(heading)) return "contact_info";
  if (/resume|cv/.test(heading)) return "resume";
  if (/additional questions|screening|work authorization|sponsorship/.test(heading)) return "screening";
  if (modal.querySelectorAll('input, select, textarea').length > 0) return "additional_questions";
  return "unknown";
}

function handleModalStateResumeFromDoc(doc) {
  const modal = doc.querySelector('[role="dialog"], .jobs-easy-apply-content');
  if (!modal) return { advanced: false, reason: "modal_closed" };

  const resumes = modal.querySelectorAll(
    '.jobs-document-upload-redesign-card__container, [data-test-document-upload-list-item]'
  );
  if (resumes.length === 0) return { advanced: false, reason: "resume_not_selectable" };

  const firstResume = resumes[0];
  const radio = firstResume.querySelector('input[type="radio"]');
  if (radio) radio.click();
  else firstResume.click();

  const nextBtn = modal.querySelector(
    'button[aria-label*="Continue"], button[aria-label*="Next"], button[aria-label*="Review"]'
  );
  if (nextBtn && !nextBtn.disabled) return { advanced: true };
  return { advanced: false, reason: "next_button_not_found" };
}

function handleModalStateScreeningFromDoc(doc) {
  const modal = doc.querySelector('[role="dialog"], .jobs-easy-apply-content');
  if (!modal) return { advanced: false, reason: "modal_closed" };

  const allInputs = Array.from(modal.querySelectorAll('input, select, textarea'));
  for (const input of allInputs) {
    const labelEl = doc.querySelector('label[for="' + input.id + '"]');
    const label = ((labelEl && labelEl.textContent) || '').toLowerCase();
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
    const dataType = (input.getAttribute('data-field-type') || '').toLowerCase();
    if (/salary|compensation|pay\b|wage/i.test(label) ||
        /salary|compensation/i.test(placeholder) ||
        /salary|compensation/.test(dataType)) {
      return { advanced: false, reason: "unsupported_screening_question" };
    }
  }
  return { advanced: true };
}

function mockRankJobs(cards, config) {
  const targetCount = config.targetCount != null ? config.targetCount : 3;
  const minScore = config.minScore != null ? config.minScore : 70;

  const ranked = cards.map((card, i) => ({
    title: card.title,
    company: card.company,
    url: card.url,
    location: card.location,
    easyApply: card.easyApply,
    score: Math.max(95 - i * 3, 50),
    fitReason: "Strong match for " + (config.keyword || "AI") + " roles",
    risk: i > 5 ? "May require visa sponsorship" : "",
  }));

  return ranked
    .filter(j => j.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount);
}

function hasRankedJobs(ranked) {
  return Array.isArray(ranked) && ranked.some((job) => job && job.url);
}

// ─── Main runner (async IIFE for CJS compatibility) ──────────────────────────
(async function main() {

  // === Extraction tests ===

  await test("extractJobCards on search fixture returns 15 cards", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    assertEqual(cards.length, 15, `Expected 15 cards, got ${cards.length}`);
  });

  await test("Cards have title, company, location, url, easyApply fields", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    for (const card of cards) {
      assert("title" in card, "Missing title field");
      assert("company" in card, "Missing company field");
      assert("location" in card, "Missing location field");
      assert("url" in card, "Missing url field");
      assert("easyApply" in card, "Missing easyApply field");
    }
  });

  await test("Cards with Easy Apply badge have easyApply=true", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const easyApplyCards = cards.filter(c => c.easyApply);
    assert(easyApplyCards.length > 0, "Expected some easyApply=true cards");
    assertEqual(easyApplyCards[0].title, "AI Agent Architect",
      `First Easy Apply card should be AI Agent Architect, got: ${easyApplyCards[0].title}`);
  });

  await test("Cards without Easy Apply badge have easyApply=false", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const deepmind = cards.find(c => c.company === "DeepMind");
    assert(deepmind, "DeepMind card should exist");
    assert(!deepmind.easyApply, "DeepMind card should have easyApply=false");
  });

  await test("Returns [] on non-search-results page (no-results fixture)", async () => {
    const doc = loadFixture("linkedin-no-results.html");
    const cards = extractJobCardsFromDoc(doc);
    assertEqual(cards.length, 0, `Expected 0 cards on no-results page, got ${cards.length}`);
  });

  await test("Card URLs are absolute LinkedIn URLs", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const cardsWithUrl = cards.filter(c => c.url);
    assert(cardsWithUrl.length > 0, "Should have cards with URLs");
    for (const card of cardsWithUrl) {
      assert(card.url.startsWith("https://www.linkedin.com"),
        `URL should be absolute, got: ${card.url}`);
    }
  });

  await test("Card titles are non-empty strings", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    for (const card of cards) {
      assert(typeof card.title === "string" && card.title.length > 0,
        `Card title should be non-empty`);
    }
  });

  await test("First card is AI Agent Architect at Anthropic", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    assertEqual(cards[0].title, "AI Agent Architect");
    assertEqual(cards[0].company, "Anthropic");
  });

  // === Intent parsing tests ===

  await test("parseUserIntent: search AI Agent Architect top 5 apply", async () => {
    const result = parseUserIntent("search AI Agent Architect top 5 apply");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.keyword, "AI Agent Architect");
    assertEqual(result.targetCount, 5);
    assertEqual(result.applyMode, "auto_submit");
  });

  await test("parseUserIntent: find top 3 AI jobs → review mode", async () => {
    const result = parseUserIntent("find top 3 AI jobs");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.targetCount, 3);
    assertEqual(result.applyMode, "review", "No apply keyword → review mode");
  });

  await test("parseUserIntent: minScore extracted from 'above score 80'", async () => {
    const result = parseUserIntent("search ML engineer above score 80");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.minScore, 80);
  });

  await test("parseUserIntent: non-job message returns null", async () => {
    const result = parseUserIntent("what is this job");
    assertEqual(result, null, "Should return null for non-search message");
  });

  await test("parseUserIntent: 'search ML engineer' defaults to targetCount=3", async () => {
    const result = parseUserIntent("search ML engineer");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.targetCount, 3, "Default targetCount should be 3");
  });

  await test("parseUserIntent: 'find top 5 Agent jobs and apply' → auto_submit", async () => {
    const result = parseUserIntent("find top 5 Agent jobs and apply");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.targetCount, 5);
    assertEqual(result.applyMode, "auto_submit");
  });

  await test("parseUserIntent: 'what's the weather' returns null", async () => {
    const result = parseUserIntent("what's the weather");
    assertEqual(result, null, "Weather query should not be a job search intent");
  });

  await test("parseUserIntent: default minScore is 70", async () => {
    const result = parseUserIntent("search AI roles");
    assert(result !== null, "Should parse as intent");
    assertEqual(result.minScore, 70, "Default minScore should be 70");
  });

  // === Modal state detection tests ===

  await test("detectModalState on contact-info fixture → 'contact_info'", async () => {
    const doc = loadFixture("easy-apply-contact-info.html");
    assertEqual(detectModalStateFromDoc(doc), "contact_info");
  });

  await test("detectModalState on resume fixture → 'resume'", async () => {
    const doc = loadFixture("easy-apply-resume.html");
    assertEqual(detectModalStateFromDoc(doc), "resume");
  });

  await test("detectModalState on review fixture → 'review'", async () => {
    const doc = loadFixture("easy-apply-review.html");
    assertEqual(detectModalStateFromDoc(doc), "review");
  });

  await test("detectModalState on submit fixture → 'submit'", async () => {
    const doc = loadFixture("easy-apply-submit.html");
    assertEqual(detectModalStateFromDoc(doc), "submit");
  });

  await test("detectModalState on unknown fixture → 'unknown'", async () => {
    const doc = loadFixture("easy-apply-unknown.html");
    assertEqual(detectModalStateFromDoc(doc), "unknown");
  });

  await test("detectModalState on resume-missing fixture → 'resume'", async () => {
    const doc = loadFixture("easy-apply-resume-missing.html");
    assertEqual(detectModalStateFromDoc(doc), "resume",
      "State should still be resume even with no uploads");
  });

  await test("detectModalState on yes/no screening fixture → 'screening'", async () => {
    const doc = loadFixture("easy-apply-screening-yes-no.html");
    assertEqual(detectModalStateFromDoc(doc), "screening");
  });

  // === State handler tests ===

  await test("handleModalState(resume) on fixture with 2 resumes → advanced:true", async () => {
    const doc = loadFixture("easy-apply-resume.html");
    const result = handleModalStateResumeFromDoc(doc);
    assertEqual(result.advanced, true, `Expected advanced=true, got: ${JSON.stringify(result)}`);
  });

  await test("handleModalState(resume) on 0 resumes → resume_not_selectable", async () => {
    const doc = loadFixture("easy-apply-resume-missing.html");
    const result = handleModalStateResumeFromDoc(doc);
    assertEqual(result.advanced, false, "Should not advance with no resumes");
    assertEqual(result.reason, "resume_not_selectable");
  });

  await test("handleModalState(screening) on salary question → unsupported_screening_question", async () => {
    const doc = loadFixture("easy-apply-screening-salary.html");
    const result = handleModalStateScreeningFromDoc(doc);
    assertEqual(result.advanced, false, "Should not advance on salary question");
    assertEqual(result.reason, "unsupported_screening_question");
  });

  await test("handleModalState(screening) on yes/no fixture advances (no salary)", async () => {
    const doc = loadFixture("easy-apply-screening-yes-no.html");
    const result = handleModalStateScreeningFromDoc(doc);
    assertEqual(result.advanced, true, `Expected advanced=true on yes/no fixture: ${JSON.stringify(result)}`);
  });

  // === Ranking config tests (mock) ===

  await test("mockRankJobs with targetCount:3 returns exactly 3 items", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const ranked = mockRankJobs(cards, { targetCount: 3, minScore: 0 });
    assertEqual(ranked.length, 3, `Expected 3 ranked jobs, got ${ranked.length}`);
  });

  await test("mockRankJobs with targetCount:5 returns exactly 5 items", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const ranked = mockRankJobs(cards, { targetCount: 5, minScore: 0 });
    assertEqual(ranked.length, 5, `Expected 5 ranked jobs, got ${ranked.length}`);
  });

  await test("mockRankJobs with minScore:90 returns only items with score >= 90", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const ranked = mockRankJobs(cards, { targetCount: 20, minScore: 90 });
    for (const job of ranked) {
      assert(job.score >= 90, `Job score ${job.score} is below minScore 90`);
    }
  });

  await test("mockRankJobs returns jobs sorted by score descending", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const ranked = mockRankJobs(cards, { targetCount: 5, minScore: 0 });
    for (let i = 1; i < ranked.length; i++) {
      assert(ranked[i - 1].score >= ranked[i].score,
        `Jobs not sorted: position ${i-1} score ${ranked[i-1].score} < position ${i} score ${ranked[i].score}`);
    }
  });

  await test("mockRankJobs with targetCount:1 returns exactly 1 item", async () => {
    const doc = loadFixture("linkedin-search-results.html");
    const cards = extractJobCardsFromDoc(doc);
    const ranked = mockRankJobs(cards, { targetCount: 1, minScore: 0 });
    assertEqual(ranked.length, 1, `Expected 1 ranked job, got ${ranked.length}`);
  });

  await test("empty ranking is not treated as saved ranked jobs", async () => {
    assertEqual(hasRankedJobs([]), false);
    assertEqual(hasRankedJobs(null), false);
  });

  await test("ranking requires at least one job URL before opening matches", async () => {
    assertEqual(hasRankedJobs([{ title: "Missing URL" }]), false);
    assertEqual(hasRankedJobs([{ title: "Valid", url: "https://www.linkedin.com/jobs/view/1/" }]), true);
  });

  // ─── Final report ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Results: " + passed + " passed, " + failed + " failed (total: " + (passed + failed) + ")");
  console.log("=".repeat(60));

  process.exit(failed > 0 ? 1 : 0);
})();
