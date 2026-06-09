import express from "express";
import cors from "cors";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { llm, DEFAULT_MODEL } from "./llm.js";
import { writeLog } from "./logger.js";
import { scoreJD, type JD, type Salary } from "./scorer.js";
import { appendResult } from "./storage.js";

const app = express();
const PORT = 7788;

type ChatHistoryItem = {
  role: "user" | "assistant" | "system";
  content: string;
};

type PagePayload = {
  pageText?: string;
  url?: string;
  links?: PageLink[];
};

type PageLink = {
  href: string;
  text?: string;
};

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      origin.startsWith("chrome-extension://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1")
    ) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "running" });
});

app.post("/extract", (req, res) => {
  try {
    const { pageText = "", url = "" } = req.body as PagePayload;
    if (!pageText.trim()) throw new Error("pageText is required");

    const jd = parseJD(pageText, url);
    const score = scoreJD(jd);
    appendResult({ jd, score });
    writeLog({
      agent: "Extension",
      type: "extract",
      task: `Analyze: ${jd.title} @ ${jd.company}`,
      status: "done",
      details: {
        url,
        tier: score.tier,
      },
    });

    res.json({ ok: true, jd, score });
  } catch (error) {
    writeLog({
      agent: "Extension",
      type: "error",
      task: "Analyze",
      status: "failed",
      details: {
        error: errorMessage(error),
      },
    });
    res.json({ ok: false, error: errorMessage(error) });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const {
      message,
      pageText = "",
      url = "",
      links = [],
      history = [],
      profile,
    } = req.body as PagePayload & { message?: string; history?: ChatHistoryItem[]; profile?: UserProfile };
    if (!message?.trim()) throw new Error("message is required");

    const candidateLinks = normalizeLinkedInLinks(Array.isArray(links) ? links : []);

    const profileBlock = buildProfileBlock(profile);
    const systemPrompt = [
      "You are a job search assistant embedded in a Chrome extension popup.",
      profileBlock,
      "",
      "CAPABILITIES AND RULES:",
      "1. You can read the current page content provided below.",
      "2. You can request navigation only to one of the provided LinkedIn job URLs. To do this, write exactly: [NAVIGATE: exact_url_from_links]",
      "3. You can trigger the Apply button. To do this, say \"I'll apply for you now.\"",
      "4. You can request navigate + apply in one step. Write: [NAVIGATE_AND_APPLY: exact_url_from_links]",
      "5. NEVER output raw JSON like {\"action\":...}. Use the [NAVIGATE:] and [NAVIGATE_AND_APPLY:] tags above.",
      "6. NEVER fabricate page content or URLs. Only choose from the provided links array.",
      "",
      "WORKFLOW for multi-job requests:",
      "- If user asks to compare jobs on a search results page, analyze the visible listings from the page content.",
      "- If user asks to apply for a specific job, choose the best matching LinkedIn job link from the provided links array.",
      "- If you want navigation, mention the selected company or job title in your response.",
      "- Then use [NAVIGATE_AND_APPLY: exact_url_from_links] to go there and apply.",
      "",
      `Current page URL: ${url || "unknown"}`,
      `Provided LinkedIn job links (${candidateLinks.length}):`,
      candidateLinks.length > 0
        ? candidateLinks.map((link, index) => `${index + 1}. ${link.text || "(no text)"} => ${link.href}`).join("\n")
        : "(none)",
      "",
      `Page content (first 5000 chars):`,
      pageText.slice(0, 5000),
      "",
      "Capabilities: analyze job fit, compare roles, navigate to jobs, trigger apply, draft outreach.",
      "Keep responses concise. Use bullet points.",
    ].join("\n");

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...sanitizeHistory(history).slice(-10),
      { role: "user", content: message },
    ];

    const chatLlm = getLlmForProfile(profile);
    const chatModel = getModelForProfile(profile);
    const completion = await chatLlm.chat.completions.create({
      model: chatModel,
      messages,
      temperature: 0.3,
    });
    let reply = completion.choices[0]?.message?.content || "";
    console.log("[CHAT DEBUG] Raw LLM reply:", reply);

    // Detect intents from LLM reply
    const navigateAndApplyMatch = reply.match(/\[NAVIGATE_AND_APPLY:\s*((?:https?:\/\/)?[^\]\s]+)\s*\]/i);
    const navigateMatch = reply.match(/\[NAVIGATE:\s*((?:https?:\/\/)?[^\]\s]+)\s*\]/i);

    // Fallback: detect LinkedIn job URL anywhere in the reply
    const linkedinJobUrlMatch = !navigateAndApplyMatch && !navigateMatch &&
      reply.match(/(?:https:\/\/www\.linkedin\.com)?\/jobs\/view\/(\d+)\/?/i);

    const applyIntent = /i'll apply|applying now|let me apply|triggering apply|clicking apply/i.test(reply) ||
      /\bapply\b.*for (you|this|the job)/i.test(message || "");
    const analyzeIntent = /\banalyz/i.test(message || "") && !applyIntent;

    let intent = null;
    let navigateUrl = null;

    if (navigateAndApplyMatch) {
      intent = "navigate_and_apply";
      navigateUrl = resolveLinkedInJobUrl(navigateAndApplyMatch[1], candidateLinks, reply, message);
    } else if (navigateMatch) {
      intent = "navigate";
      navigateUrl = resolveLinkedInJobUrl(navigateMatch[1], candidateLinks, reply, message);
    } else if (linkedinJobUrlMatch && applyIntent) {
      // LLM mentioned a job URL and expressed apply intent — treat as navigate_and_apply
      intent = "navigate_and_apply";
      navigateUrl = resolveLinkedInJobUrl(linkedinJobUrlMatch[0], candidateLinks, reply, message);
    } else if (linkedinJobUrlMatch) {
      intent = "navigate";
      navigateUrl = resolveLinkedInJobUrl(linkedinJobUrlMatch[0], candidateLinks, reply, message);
    } else if (applyIntent) {
      intent = "apply";
    } else if (analyzeIntent) {
      intent = "analyze";
    }
    console.log("[CHAT DEBUG] navigateAndApplyMatch:", navigateAndApplyMatch);
    console.log("[CHAT DEBUG] navigateMatch:", navigateMatch);
    console.log("[CHAT DEBUG] applyIntent:", applyIntent);
    console.log("[CHAT DEBUG] Final intent:", intent, "navigateUrl:", navigateUrl);
    console.log("[CHAT] intent:", intent, "navigateUrl:", navigateUrl);

    if (intent === "navigate_and_apply" && navigateUrl && !reply.replace(/\[NAVIGATE_AND_APPLY:\s*[^\]]+\]/gi, '').trim()) {
      const target = message.replace(/^apply\s+for\s+/i, '').trim() || "this job";
      reply = `I'll apply for ${target} now. [NAVIGATE_AND_APPLY: ${navigateUrl}]`;
    }
    if (intent === "navigate" && navigateUrl && !reply.replace(/\[NAVIGATE:\s*[^\]]+\]/gi, '').trim()) {
      reply = `Opening the best match now. [NAVIGATE: ${navigateUrl}]`;
    }

    const tokensUsed = tokensFromUsage(completion.usage) || estimateChatTokens(messages, reply);
    writeLog({
      agent: "Extension",
      type: "chat",
      task: message.slice(0, 60),
      status: "done",
      details: {
        url,
        tokens_used: tokensUsed,
        cost_usd: costUsd(tokensUsed),
        message,
      },
    });

    res.json({ ok: true, reply, intent, navigateUrl });
  } catch (error) {
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    writeLog({
      agent: "Extension",
      type: "error",
      task: message ? message.slice(0, 60) : "Chat",
      status: "failed",
      details: {
        error: errorMessage(error),
        message,
      },
    });
    res.json({ ok: false, error: errorMessage(error) });
  }
});

// ─── Feature 5: POST /rank ────────────────────────────────────────────────────
type JobCard = {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  easyApply?: boolean;
};

type RankedJob = {
  title: string;
  company: string;
  url: string;
  location?: string;
  score: number;
  fitReason: string;
  risk: string;
  easyApply?: boolean;
};

type RankConfig = {
  targetCount?: number;
  minScore?: number;
  keyword?: string;
};

type UserProfile = {
  name?: string;
  resume?: string;
  targetTitle?: string;
  location?: string;
  preferences?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

/** Build a system prompt identity block from user profile, with sensible defaults. */
function buildProfileBlock(profile?: UserProfile): string {
  const name = profile?.name?.trim() || "the candidate";
  const lines: string[] = [`You are a job search assistant helping ${name}.`];
  if (profile?.targetTitle?.trim()) {
    lines.push(`Target roles: ${profile.targetTitle.trim()}.`);
  }
  if (profile?.location?.trim()) {
    lines.push(`Preferred location: ${profile.location.trim()}.`);
  }
  if (profile?.preferences?.trim()) {
    lines.push(`Additional preferences: ${profile.preferences.trim()}`);
  }
  if (profile?.resume?.trim()) {
    const resumeSnippet = profile.resume.trim().slice(0, 2500);
    lines.push(`\nCandidate resume:\n${resumeSnippet}`);
  }
  return lines.join("\n");
}

/** Create an LLM client from profile overrides, falling back to env/defaults. */
function getLlmForProfile(profile?: UserProfile): typeof llm {
  if (profile?.apiKey || profile?.baseUrl || profile?.model) {
    const OpenAI = (llm as unknown as { constructor: new (opts: object) => typeof llm }).constructor;
    return new (OpenAI as unknown as new (opts: object) => typeof llm)({
      apiKey: profile.apiKey || process.env.DASHSCOPE_API_KEY,
      baseURL: profile.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }
  return llm;
}

function getModelForProfile(profile?: UserProfile): string {
  return profile?.model?.trim() || DEFAULT_MODEL;
}

function normalizeJobUrl(url?: string): string {
  return String(url || "").split("?")[0].replace(/\/+$/, "");
}

function findSourceCard(item: Partial<RankedJob>, cards: JobCard[]): JobCard | undefined {
  const itemUrl = normalizeJobUrl(item.url);
  const itemTitle = String(item.title || "").trim().toLowerCase();
  const itemCompany = String(item.company || "").trim().toLowerCase();

  return cards.find((card) => itemUrl && normalizeJobUrl(card.url) === itemUrl) ||
    cards.find((card) => {
      const titleMatches = itemTitle && String(card.title || "").trim().toLowerCase() === itemTitle;
      const companyMatches = itemCompany && String(card.company || "").trim().toLowerCase() === itemCompany;
      return titleMatches && (!itemCompany || companyMatches);
    });
}

app.post("/rank", async (req, res) => {
  try {
    const { cards, config, profile } = req.body as { cards: JobCard[]; config: RankConfig; profile?: UserProfile };
    if (!Array.isArray(cards) || cards.length === 0) throw new Error("cards array is required and must be non-empty");

    const targetCount = config?.targetCount ?? 3;
    const minScore = config?.minScore ?? 70;
    const candidateName = profile?.name?.trim() || "the candidate";

    const systemPrompt = [
      buildProfileBlock(profile),
      "",
      "Rank the provided job cards from best to worst fit for this candidate.",
      `Return exactly ${targetCount} jobs (or fewer if less available).`,
      `Only include jobs with match score >= ${minScore}.`,
      "Return JSON array: [{title, company, url, location, score (0-100), fitReason, risk}]",
      "Do not invent jobs. Only use jobs from the provided cards.",
      "Do not return markdown. Return raw JSON array only.",
      `fitReason: 1 short sentence why this role fits ${candidateName}.`,
      "risk: 1 short sentence about the main risk or concern (empty string if none).",
    ].join("\n");

    const cardList = cards.map((c, i) =>
      `${i + 1}. Title: ${c.title || "(unknown)"} | Company: ${c.company || "(unknown)"} | Location: ${c.location || "(unknown)"} | URL: ${c.url || ""} | EasyApply: ${c.easyApply ? "yes" : "no"}`
    ).join("\n");

    const userPrompt = `Job cards to rank:\n${cardList}\n\nKeyword context: ${config?.keyword || "AI roles"}`;

    const rankLlm = getLlmForProfile(profile);
    const rankModel = getModelForProfile(profile);
    const completion = await rankLlm.chat.completions.create({
      model: rankModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "";
    console.log("[RANK DEBUG] Raw LLM reply:", raw.slice(0, 500));

    // Extract JSON array from response
    let ranked: RankedJob[] = [];
    const jsonMatch =
      raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i)?.[1] ||
      raw.match(/(\[[\s\S]*\])/)?.[1];

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch);
        if (Array.isArray(parsed)) {
          ranked = parsed.map((item: Partial<RankedJob> & Record<string, unknown>) => {
            const source = findSourceCard(item, cards);
            return {
              title: String(item.title || source?.title || ""),
              company: String(item.company || source?.company || ""),
              url: String(source?.url || item.url || ""),
              location: String(item.location || source?.location || ""),
              score: typeof item.score === "number" ? item.score : parseInt(String(item.score || "0"), 10),
              fitReason: String(item.fitReason || item.fit_reason || ""),
              risk: String(item.risk || ""),
              easyApply: Boolean(source?.easyApply ?? item.easyApply ?? item.easy_apply),
            };
          });
        }
      } catch (parseErr) {
        throw new Error(`Failed to parse LLM ranking JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      }
    }

    // Validate: require title, company, url, score
    ranked = ranked.filter(item => item.title && item.company && item.url && typeof item.score === "number");

    if (minScore === 0 && ranked.length < targetCount) {
      const rankedUrls = new Set(ranked.map((item) => normalizeJobUrl(item.url)));
      const supplemental = cards
        .filter((card) => card.title && card.url && !rankedUrls.has(normalizeJobUrl(card.url)))
        .map((card) => ({
          title: String(card.title),
          company: String(card.company || "Unknown company"),
          url: String(card.url),
          location: String(card.location || ""),
          score: 50,
          fitReason: "Included from the visible search results to complete the requested candidate count.",
          risk: "Review manually; the ranking model did not score this supplemental result.",
          easyApply: Boolean(card.easyApply),
        }));
      ranked = [...ranked, ...supplemental];
    }

    // Enforce minScore filter and targetCount cap
    ranked = ranked
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, targetCount);

    const tokensUsed = tokensFromUsage(completion.usage) || estimateTokens(systemPrompt, userPrompt, raw);
    writeLog({
      agent: "Extension",
      type: "rank",
      task: `Rank ${cards.length} jobs → ${ranked.length} returned`,
      status: "done",
      details: { tokens_used: tokensUsed, cost_usd: costUsd(tokensUsed) },
    });

    res.json({ ok: true, ranked });
  } catch (error) {
    writeLog({
      agent: "Extension",
      type: "error",
      task: "Rank",
      status: "failed",
      details: { error: errorMessage(error) },
    });
    res.json({ ok: false, error: errorMessage(error) });
  }
});

app.post("/apply", async (req, res) => {
  try {
    const { pageText = "", url = "" } = req.body as PagePayload;
    if (!pageText.trim()) throw new Error("pageText is required");

    const applySystemPrompt = [
      "You identify the best CSS selector for a job application button.",
      "Return only compact JSON in this exact shape: {\"selector\":\"...\"}.",
      "Prefer stable selectors for LinkedIn and BOSS job pages when the page text does not expose DOM attributes.",
      "If unsure on LinkedIn, use .jobs-apply-button. If unsure on BOSS, use .btn-startchat.",
    ].join(" ");
    const applyUserPrompt = `URL: ${url}\n\nPAGE TEXT:\n${pageText.slice(0, 3000)}`;

    const completion = await llm.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: applySystemPrompt,
        },
        {
          role: "user",
          content: applyUserPrompt,
        },
      ],
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content || "";
    const selector = parseSelector(raw) || fallbackApplySelector(url, pageText);
    if (!selector) throw new Error("Could not identify an apply button selector");
    const jd = parseJD(pageText, url);
    const tokensUsed = tokensFromUsage(completion.usage) || estimateTokens(applySystemPrompt, applyUserPrompt, raw);
    writeLog({
      agent: "Extension",
      type: "apply",
      task: `Apply: ${jd.title} @ ${jd.company}`,
      status: "done",
      details: {
        url,
        tokens_used: tokensUsed,
        cost_usd: costUsd(tokensUsed),
      },
    });

    res.json({ ok: true, actions: [{ type: "click", selector }] });
  } catch (error) {
    writeLog({
      agent: "Extension",
      type: "error",
      task: "Apply",
      status: "failed",
      details: {
        error: errorMessage(error),
      },
    });
    res.json({ ok: false, error: errorMessage(error) });
  }
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] job-search-agent-service listening on ${PORT}`);
});

function parseJD(pageText: string, url: string): JD {
  const lines = pageText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const compact = lines.join("\n");

  const title = firstMatch(compact, [
    /^(.*?(?:architect|engineer|developer|scientist|researcher|manager|lead|专家|工程师|架构师|算法|研发).*?)$/im,
  ]) || lines[0] || "Unknown title";
  const company = firstMatch(compact, [
    /(?:Company|公司)\s*[:：]\s*(.+)/i,
    / at ([^\n|·]+)(?:\n|$)/i,
  ]) || inferCompany(lines, title) || "Unknown company";
  const location = firstMatch(compact, [
    /(?:Location|地点|工作地点)\s*[:：]\s*(.+)/i,
    /\b(Remote|Hybrid|Singapore|Shanghai|Beijing|Shenzhen|Guangzhou|Hangzhou|Hong Kong|上海|北京|深圳|广州|杭州|香港)\b/i,
  ]) || "";
  const salaryRaw = firstMatch(compact, [
    /(?:Salary|薪资|薪酬|待遇)\s*[:：]?\s*([^\n]+)/i,
    /((?:SGD|S\$|RMB|CNY|¥|\$)?\s*\d+(?:\.\d+)?\s*(?:k|K|万)?\s*[-~到至]\s*(?:SGD|S\$|RMB|CNY|¥|\$)?\s*\d+(?:\.\d+)?\s*(?:k|K|万)?(?:\s*\/\s*(?:month|mo|月|年))?)/i,
  ]) || "";

  return {
    id: stableId(`${url}\n${title}\n${company}`),
    title: cleanField(title),
    company: cleanField(company),
    location: cleanField(location),
    salary: parseSalary(salaryRaw),
    description: pageText.trim(),
    url,
  };
}

function parseSalary(raw: string): Salary {
  const salary: Salary = { raw: raw.trim() };
  const text = salary.raw;
  if (!text) return salary;

  if (/sgd|s\$|singapore/i.test(text)) salary.currency = "SGD";
  else if (/rmb|cny|¥|人民币|元/i.test(text)) salary.currency = "CNY";
  else if (/usd|\$/i.test(text)) salary.currency = "USD";
  else salary.currency = "unknown";

  const normalized = text.replace(/,/g, "");
  const values = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(k|K|万)?/g)].map((match) => {
    const amount = Number(match[1]);
    const unit = match[2] || "";
    if (/k/i.test(unit)) return amount * 1000;
    if (unit === "万") return amount * 10000;
    return amount;
  });

  if (values.length === 1) salary.min = values[0];
  if (values.length >= 2) {
    salary.min = Math.min(values[0], values[1]);
    salary.max = Math.max(values[0], values[1]);
  }

  return salary;
}

function sanitizeHistory(history: ChatHistoryItem[]): ChatCompletionMessageParam[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => ["user", "assistant", "system"].includes(item.role) && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: item.content }));
}

function parseSelector(reply: string): string | undefined {
  const json = extractJson(reply);
  if (typeof json?.selector === "string" && json.selector.trim()) return json.selector.trim();
  const selector = reply.match(/["']selector["']\s*:\s*["']([^"']+)["']/)?.[1];
  return selector?.trim();
}

function extractJson(text: string): Record<string, unknown> | undefined {
  const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return undefined;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function fallbackApplySelector(url: string, pageText: string): string | undefined {
  if (/linkedin\.com/i.test(url)) return ".jobs-apply-button";
  if (/zhipin\.com/i.test(url)) return ".btn-startchat";
  if (/easy apply/i.test(pageText)) return "[aria-label*='Easy Apply'], button";
  if (/apply|申请|投递/i.test(pageText)) return "button";
  return undefined;
}

function normalizeLinkedInUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (url.startsWith('/')) url = 'https://www.linkedin.com' + url;
  if (!url.startsWith('https://')) url = 'https://' + url;
  return url;
}

function normalizeLinkedInLinks(links: PageLink[]): PageLink[] {
  const seen = new Set<string>();
  const normalized: PageLink[] = [];
  for (const link of links) {
    const href = normalizeLinkedInUrl(link.href);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    normalized.push({
      href,
      text: (link.text || "").replace(/\s+/g, " ").trim(),
    });
  }
  return normalized;
}

function resolveLinkedInJobUrl(
  raw: string | undefined,
  candidateLinks: PageLink[],
  reply: string,
  message: string
): string | null {
  const normalizedRaw = normalizeLinkedInUrl(raw);
  if (/\/jobs\/view\/\d+\/apply\/\?/i.test(normalizedRaw || "")) {
    return normalizedRaw;
  }
  if (!candidateLinks.length) return normalizedRaw;

  const rawJobId = extractLinkedInJobId(normalizedRaw || "");
  if (rawJobId) {
    const byId = candidateLinks.find((link) => extractLinkedInJobId(link.href) === rawJobId);
    if (byId) return byId.href;
  }

  if (normalizedRaw) {
    const exact = candidateLinks.find((link) => link.href === normalizedRaw);
    if (exact) return exact.href;
  }

  const haystack = `${reply}\n${message}`.toLowerCase();
  let bestLink: PageLink | null = null;
  let bestScore = 0;

  for (const link of candidateLinks) {
    const text = (link.text || "").toLowerCase();
    const href = link.href.toLowerCase();
    const tokens = Array.from(new Set(
      `${text} ${href}`
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
    ));

    let score = 0;
    if (text && haystack.includes(text)) score += 8;
    if (href && haystack.includes(href)) score += 8;
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length >= 7 ? 2 : 1;
    }

    const titleTokens = (link.text || "")
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/gi, "").toLowerCase())
      .filter((token) => token.length >= 4);
    for (const token of titleTokens) {
      if (haystack.includes(token)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLink = link;
    }
  }

  if (bestLink && bestScore > 0) return bestLink.href;
  if (candidateLinks.length === 1) return candidateLinks[0].href;
  return null;
}

function extractLinkedInJobId(url: string): string | null {
  const match = url.match(/\/jobs\/view\/(\d+)\b/i);
  return match?.[1] || null;
}

function tokensFromUsage(usage: { total_tokens?: number } | null | undefined): number | undefined {
  return typeof usage?.total_tokens === "number" ? usage.total_tokens : undefined;
}

function estimateTokens(...texts: string[]): number {
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  return Math.ceil(chars / 4);
}

function estimateChatTokens(messages: ChatCompletionMessageParam[], output: string): number {
  return estimateTokens(...messages.map((message) => stringifyMessageContent(message.content)), output);
}

function stringifyMessageContent(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content);
}

function costUsd(tokensUsed: number): number {
  return tokensUsed * 0.000002;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function inferCompany(lines: string[], title: string): string | undefined {
  const titleIndex = lines.findIndex((line) => line === title);
  const candidates = lines.slice(Math.max(0, titleIndex + 1), titleIndex + 6);
  return candidates.find((line) => !/apply|save|remote|hybrid|薪资|salary/i.test(line));
}

function cleanField(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[|·•]+$/g, "").trim();
}

function stableId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `jd_${Math.abs(hash)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
