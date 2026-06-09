# JobPilot

A Chrome extension that ranks LinkedIn jobs by resume fit and automates Easy Apply — no local server needed.  
It analyzes jobs on LinkedIn search results pages, ranks them against your resume, and automates LinkedIn Easy Apply applications — with a human confirmation gate before every submission.

---

## Overview

This project is designed for a focused use case:

1. Open a LinkedIn Jobs search results page.
2. Let the extension analyze the visible job listings.
3. Rank jobs based on your resume and preferences.
4. Apply to selected LinkedIn Easy Apply jobs automatically.
5. Review the completed form and confirm before it submits.

The extension is not a fully autonomous job search agent. It focuses on making the most repetitive parts of LinkedIn job search faster and more affordable to run.

---

## Why This Exists

General-purpose AI computer-use agents can operate browsers end-to-end, but applying that approach to job applications is expensive and slow.

A full browser-use workflow — opening tabs, reading pages, reasoning, filling forms, waiting for page loads — can consume large token budgets when running through tools like Claude Code, Codex, or similar computer-use agents. This adds up quickly if you are applying to many jobs.

This extension takes a more practical approach:

- Keep the workflow narrow and structured.
- Optimize specifically for LinkedIn search results and Easy Apply.
- Execute common application steps without per-pixel browser reasoning.
- Allow users to configure lower-cost model providers.
- Put a human confirmation step before every submission.

In local testing, a single Easy Apply application typically completes in around 10–20 seconds, depending on form complexity and network speed.

---

## Features

### Resume-Based Job Ranking

The extension reads the visible job listings on a LinkedIn search results page and ranks them based on your resume.

It considers signals such as:

- Job title and description
- Required skills and experience level
- Role direction and seniority
- Resume alignment and skill overlap
- User-defined preferences (target roles, industries, locations)

Example prompts:

```
Find the top 5 jobs on this page that best match my resume.
```

```
Rank the current job listings by fit.
```

```
Show me the best Easy Apply jobs for my background.
```

### LinkedIn Easy Apply Automation

For LinkedIn Easy Apply jobs, the extension runs the full application flow automatically:

- **Contact info** — verifies required fields are filled
- **Resume** — selects an already-uploaded resume from your LinkedIn profile
- **Screening questions** — fills numeric experience fields, dropdowns (work authorization, experience level), and salary fields
- **Additional questions** — handles yes/no radio buttons and other simple inputs
- **Review** — stops and shows `[CONFIRM REQUIRED]` before touching the submit button

Example prompts:

```
Apply to the currently selected job.
```

```
Apply to the top 3 Easy Apply jobs from the recommendation list.
```

To submit after review:

```
confirm submit
```

To cancel:

```
cancel
```

### Configurable AI Model

The local backend service (`service/`) is configurable. You bring your own API key and model.

Default configuration uses Alibaba Cloud Qwen via the OpenAI-compatible DashScope API:

- `DASHSCOPE_API_KEY` — your API key (environment variable, never hardcoded)
- Model: `qwen-plus-2025-11-05`
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`

Any OpenAI-compatible provider works. Lower-cost models are preferred for ranking tasks.

---

## Project Structure

```
runtime/linkedin-agent/
  extension/          Chrome Extension (Manifest V3, vanilla JS)
    manifest.json
    popup.html
    popup-agent.js    Main extension logic — UI, chat, Easy Apply state machine
    popup.css
    background.js     Service worker
    content.js        Content script (page DOM access)
    icons/
  service/            Local backend (TypeScript, Express)
    server.ts         /rank endpoint — LLM job ranking
    llm.ts            LLM client (OpenAI-compatible)
    package.json
```

---

## Getting Started

### 1. Start the Backend Service

```bash
cd service
npm install
export DASHSCOPE_API_KEY=your_key_here
npx ts-node server.ts
```

The service runs on `localhost:7788`. Keep this terminal open while using the extension.

To use a different model provider, edit `service/llm.ts`:

```typescript
export const llm = new OpenAI({
  apiKey: process.env.YOUR_API_KEY_VAR,
  baseURL: "https://your-provider-base-url/v1",
});
export const DEFAULT_MODEL = "your-model-name";
```

### 2. Load the Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder

The extension icon will appear in your toolbar.

### 3. Upload Your Resume to LinkedIn

The Easy Apply automation selects from resumes already uploaded to your LinkedIn profile. Make sure your resume is uploaded at [linkedin.com/jobs/application-settings](https://www.linkedin.com/jobs/application-settings) before running applications.

---

## Recommended Workflow

A practical session looks like this:

1. Go to [LinkedIn Jobs](https://www.linkedin.com/jobs/) and search for a target role.
2. Open the extension popup and ask it to rank the visible jobs.
3. Review the recommendations — check titles, companies, fit scores.
4. Pick one job from the list and ask the extension to apply.
5. Watch the form fill in — intervene if any field looks wrong.
6. When the review screen appears and `[CONFIRM REQUIRED]` shows, read the form summary.
7. Type `confirm submit` to submit, or `cancel` to abort.
8. Track submitted applications separately.

The extension assists your judgment — it does not replace it.

---

## Easy Apply: What Gets Filled Automatically

| Field type | Behavior |
|---|---|
| Numeric experience fields | Filled with `1` (years) |
| Work authorization / citizenship dropdowns | Filled with `No` (not a local citizen/PR) |
| Experience / proficiency dropdowns | Filled with `Yes` |
| Salary / compensation fields | Filled with `10000` (default, adjust as needed) |
| Yes/No radio buttons | Selects `Yes` |
| Resume selection | Selects first available uploaded resume |
| Free-text custom questions | Left empty — requires manual input |

Fields that cannot be reliably inferred are left blank. The flow stops at `required_field_empty` if a mandatory field is still empty after auto-fill.

---

## Supported Use Cases

Currently best suited for:

- LinkedIn Jobs search result analysis
- Resume-based job ranking on the current page
- Identifying high-fit Easy Apply opportunities
- Automating LinkedIn Easy Apply form flows
- Reducing the cost of AI-assisted job applications

---

## Limitations

This extension is optimized for **LinkedIn Easy Apply only**.

It is not designed to handle external application flows such as:

- Workday, Greenhouse, Lever, Ashby
- Company-specific career portals
- Any ATS that opens in a new tab after clicking "Apply"

When a LinkedIn job redirects to an external site (`openSDUIApplyFlow` or external URL), the extension detects this and stops gracefully, prompting you to complete the application manually.

The extension also does not guarantee successful completion for every Easy Apply job, especially if the form contains unusual questions, required file uploads, or account-specific verification steps.

---

## Technical Notes (for contributors)

Key DOM facts verified via live browser testing on 2026-06-09:

- **Easy Apply button**: `<a aria-label="Easy Apply to ...">` — NOT `<button>`. Must use `dispatchEvent(new MouseEvent(..., {bubbles:true}))`, not `el.click()` (React synthetic events require bubbling)
- **Easy Apply modal**: lives inside `document.querySelector('#interop-outlet').shadowRoot`. Do NOT use `document.querySelector('[role="dialog"]')` as a fallback — LinkedIn's chat bubble also has `role="dialog"` in the regular document
- **React-compatible input fill**: must use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` to trigger React re-renders
- **`autonomous_submit = false`**: never calls `clickSubmit()` without an explicit user `confirm submit` message — hardcoded, not configurable

State machine flow: `contact_info → resume → screening → additional_questions → review → [CONFIRM REQUIRED] → submit`

---

## Safety Notes

- **Human gate on every submission.** The extension never submits without your `confirm submit` reply. This is hardcoded.
- **Review before confirming.** Read the form before typing `confirm submit`. Check that experience, salary, and authorization answers match your situation.
- **Protect your API keys.** Never commit `.env` files. API keys go in environment variables only.
- **Follow platform terms of use.** Use this tool responsibly and in moderation.
- **Do not mass-apply to irrelevant jobs.** This tool is designed to improve application quality, not volume.

---

## Roadmap

- Better handling of unusual Easy Apply question types
- Support for additional OpenAI-compatible model providers
- Application history tracking and deduplication
- Resume version management (select per application)
- Cover letter generation for high-fit roles
- Partial support for selected external ATS platforms

---

## Disclaimer

This project is provided for personal productivity and research purposes. Users are responsible for how they use the extension. The project does not guarantee job application success and is not responsible for account restrictions, failed applications, incorrect submissions, or any other outcomes caused by use of this tool.
