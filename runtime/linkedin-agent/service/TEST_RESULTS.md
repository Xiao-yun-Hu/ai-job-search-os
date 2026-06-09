# Test Results

Run date: 2026-05-22

## Test 1: Service health

Status: PASS

Command:

```sh
curl -i --max-time 5 http://localhost:7788/health
```

Result:

```text
HTTP/1.1 200 OK
{"ok":true,"status":"running"}
```

Reason: The local service was already running on port 7788 and returned the expected health response.

## Test 2: Extension loads in Chrome for Testing / Playwright fallback

Status: PASS

Notes:

- The expected scripts directory does not exist:
  `/Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/scripts/`
- Used the Playwright fallback.
- Playwright launched Chromium with the unpacked extension loaded.
- Extension service worker loaded from:
  `chrome-extension://mbhaagemnbaahcfeibjonneaojkloipi/background.js`
- Popup opened at:
  `chrome-extension://mbhaagemnbaahcfeibjonneaojkloipi/popup.html`
- Screenshot written to:
  `/Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/test-artifacts/extension-popup-playwright.png`

Result:

```json
{
  "ok": true,
  "extensionId": "mbhaagemnbaahcfeibjonneaojkloipi",
  "workerUrl": "chrome-extension://mbhaagemnbaahcfeibjonneaojkloipi/background.js",
  "popupUrl": "chrome-extension://mbhaagemnbaahcfeibjonneaojkloipi/popup.html",
  "screenshotPath": "/Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/test-artifacts/extension-popup-playwright.png",
  "errors": [],
  "title": "Job Agent",
  "statusText": "Connected",
  "usesPopupAgent": true,
  "bodyText": "⚡ Service: Connected\n🔍 Analyze Current Page\n✦ Apply to This Job"
}
```

Reason: The extension loaded, the popup rendered, it connected to the service, and no page or console errors were captured.

## Test 3: Service /extract endpoint

Status: FAIL

Command:

```sh
curl -i --max-time 15 -X POST http://localhost:7788/extract
```

Result:

```text
HTTP/1.1 200 OK
{"ok":false,"error":""}
```

Reason: The endpoint returned JSON, but it did not return the expected `{ok, jd, score}` shape and did not provide a clear CDP error message. The error field was an empty string.

## Test 4: popup-agent.js is wired correctly

Status: PASS

Checks:

- `popup.html` references `popup-agent.js`.
- `popup.html` does not reference `popup.js`.
- `popup-agent.js` exists in the extension directory.
- `SERVICE_URL` is exactly `"http://localhost:7788"`.

Evidence:

```html
<script src="popup-agent.js"></script>
```

```js
const SERVICE_URL = "http://localhost:7788";
```

## What needs to be fixed

1. Fix `/extract` error reporting so failures include a useful message instead of `{"ok":false,"error":""}`.
2. If `/extract` requires an externally launched Chrome instance, document and verify the required CDP setup, currently implied by `browser.ts` as `http://localhost:9222`.
3. Add or restore extension test scripts under the extension repo's `scripts/` directory if that path is meant to remain the canonical test entrypoint.
