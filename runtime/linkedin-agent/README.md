# LinkedIn Easy Apply Agent

Chrome extension + local service that automates LinkedIn Easy Apply end-to-end.

## Structure

```
extension/   Chrome Extension (Manifest V3, vanilla JS)
service/     Local backend (TypeScript, Express) — /rank endpoint
```

## Setup

### Service
```bash
cd service && npm install
export DASHSCOPE_API_KEY=your_key
npx ts-node server.ts   # localhost:7788
```

### Extension
1. `chrome://extensions` → Enable Developer Mode
2. Load unpacked → select `extension/`

## Usage

| Command | Action |
|---------|--------|
| `找最匹配的职位 top 5` | Search + rank top 5 jobs |
| `申请这个工作` | Run Easy Apply on selected job |
| `confirm submit` | Confirm final submission |

## Key facts (verified 2026-06-09)

- Easy Apply button: `a[aria-label*="Easy Apply"]` — use `dispatchEvent`, not `.click()`
- Modal: inside `#interop-outlet.shadowRoot`
- Auto-fills: dropdowns (citizenship→No, experience→Yes), numeric fields (1), salary (10000)
- `autonomous_submit = false` always — human confirms every submission
