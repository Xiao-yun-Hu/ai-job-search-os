# JobPilot

A Chrome extension that ranks LinkedIn jobs by resume fit and automates Easy Apply.  
No local server. No command line. Just install, configure, and go.

---

## What It Does

1. Open a LinkedIn Jobs search results page.
2. Ask JobPilot to rank the visible jobs against your resume.
3. Pick the best matches.
4. Ask JobPilot to apply — it fills the Easy Apply form automatically.
5. Review the completed form and type `confirm submit` to submit.

---

## Installation

### Step 1 — Download the extension

**[⬇️ Download jobpilot-extension.zip](https://github.com/Xiao-yun-Hu/ai-job-search-os/releases/latest/download/jobpilot-extension.zip)**

Unzip it — you get a single `extension/` folder. That's all you need.

### Step 2 — Load into Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder you just unzipped

The **JobPilot** icon will appear in your Chrome toolbar.

---

## Setup

### Step 3 — Configure your AI model

Click the JobPilot icon in your toolbar, then click **⚙️** (bottom right of the popup).

Fill in:

| Field | What to enter |
|---|---|
| **API Key** | Your LLM API key (e.g. from DashScope, OpenAI, etc.) |
| **Base URL** | Your provider's API base URL |
| **Model name** | The model you want to use |

**Default (Alibaba Cloud Qwen — DashScope):**
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Model: `qwen-plus-2025-11-05`
- Get a key at: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com)

**OpenAI:**
- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`
- Get a key at: [platform.openai.com](https://platform.openai.com)

Any OpenAI-compatible provider works.

### Step 4 — Enter your profile

Still in ⚙️ Settings, fill in:

| Field | What to enter |
|---|---|
| **Your name** | Your name (used to personalise responses) |
| **Target job titles** | e.g. `AI Engineer, ML Engineer, LLM Engineer` |
| **Preferred location** | e.g. `Singapore, Remote` |
| **Other preferences** | e.g. `Prefer AI-native startups. Min salary 8000 SGD.` |
| **Resume** | Paste your full resume text here |

Click **Save Settings**.

### Step 5 — Upload your resume to LinkedIn

The Easy Apply automation picks from resumes already on your LinkedIn profile.  
Make sure at least one resume is uploaded at:  
[linkedin.com/jobs/application-settings](https://www.linkedin.com/jobs/application-settings)

---

## How to Use

### Rank jobs on a search page

1. Go to [linkedin.com/jobs](https://www.linkedin.com/jobs) and search for a role
2. Open the JobPilot popup
3. Type something like:

```
Find the top 5 jobs on this page that best match my resume.
```

```
Rank these jobs by fit.
```

JobPilot reads the visible listings, scores them against your resume, and returns a ranked list with fit reasons and risks.

### Apply to a job

Once you've picked a job, type:

```
Apply to the currently selected job.
```

or after ranking:

```
Apply to the top 3 Easy Apply jobs.
```

JobPilot will:
- Find and click the Easy Apply button
- Fill in contact info, resume selection, screening questions, dropdowns, salary
- Stop at the Review screen and show you: **`[CONFIRM REQUIRED]`**

To submit:
```
confirm submit
```

To cancel:
```
cancel
```

### Analyze a single job

Open a LinkedIn job page and type:

```
Analyze this job.
```

JobPilot evaluates fit based on your resume and returns a tier (A/B/C/D) with reasons.

---

## What Gets Filled Automatically

| Field type | Auto-fill value |
|---|---|
| Numeric experience (years) | `1` |
| Work authorization / citizenship | `No` |
| Experience / proficiency level | `Yes` |
| Salary / compensation | `10000` |
| Yes / No radio buttons | `Yes` |
| Resume selection | First uploaded resume on your LinkedIn profile |
| Free-text / open-ended questions | Left empty — fill manually |

---

## Limitations

- **LinkedIn Easy Apply only.** Jobs that redirect to Workday, Greenhouse, Lever, Ashby, or company career pages are not supported — JobPilot detects this and stops gracefully.
- Free-text questions (e.g. "Why do you want this role?") are left blank and must be filled manually.
- Does not guarantee successful submission for every form — unusual questions or verification steps may require manual intervention.

---

## Safety

- **You confirm every submission.** JobPilot never submits without your `confirm submit` reply. This is hardcoded and cannot be changed.
- **Review the form before confirming.** Check that authorization, salary, and experience answers are correct for your situation.
- **Your API key is stored locally** in Chrome's sandboxed extension storage on your machine. It is never sent anywhere except directly to your configured LLM provider.
- **Your resume stays on your machine.** It is sent only to your configured LLM provider when ranking or analyzing jobs.

---

## Technical Notes (for contributors)

Key DOM facts verified via live browser testing (2026-06-09):

- Easy Apply button is `<a aria-label="Easy Apply to ...">` — not `<button>`. Requires `dispatchEvent(MouseEvent)` not `el.click()`.
- Easy Apply modal lives inside `document.querySelector('#interop-outlet').shadowRoot`.
- React input fills require `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`.
- `autonomous_submit` is always `false` — submit only fires after explicit user confirmation.

State machine: `contact_info → resume → screening → additional_questions → review → [CONFIRM REQUIRED] → submit`

---

## Roadmap

- Better handling of unusual Easy Apply question types
- Cover letter generation for high-fit roles
- Application history tracking
- Support for more model providers
- Partial ATS support (Greenhouse, Lever)

---

## Disclaimer

For personal productivity and research use only. Users are responsible for how they use this tool. JobPilot does not guarantee application success and is not responsible for account restrictions, failed submissions, or any other outcomes.
