# Codex Test Task: Verify Extension + Service Integration

## Context
- Local service: /Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/ (runs on port 7788)
- Chrome extension: /Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/
- Extension popup now uses popup-agent.js which calls http://localhost:7788
- Previous test method (from project_agent_state.md): use Chrome for Testing with host-mapped fixtures

## What to test

### Test 1: Service health
Run: curl http://localhost:7788/health
Expected: {"ok":true,"status":"running"}

### Test 2: Extension loads in Chrome for Testing
Use the existing test scripts in:
/Users/rachelhu/Documents/Claude/Projects/AI job search plugin/ai-job-search-plugin/scripts/

If those scripts exist, run them. If not, use Playwright to:
1. Launch Chrome for Testing with extension loaded
2. Verify extension loads without errors
3. Take a screenshot of the popup

### Test 3: Service /extract endpoint
Start the service if not running, then:
curl -X POST http://localhost:7788/extract
Check response shape: should return {ok, jd, score} or a clear error about CDP

### Test 4: popup-agent.js is wired correctly
Check that:
- popup.html references popup-agent.js (not popup.js)
- popup-agent.js exists at the extension directory
- SERVICE_URL in popup-agent.js is "http://localhost:7788"

## Report format
After running all tests, write a file: /Users/rachelhu/Documents/Claude/Projects/job-search-agent-service/TEST_RESULTS.md
with:
- Each test: PASS / FAIL / SKIP + reason
- Any errors with full message
- What needs to be fixed
