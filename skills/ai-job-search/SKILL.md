---
name: ai-job-search
description: 通用求职自动化 OS — 支持多平台（BOSS直聘/猎聘/智联/前程无忧/LinkedIn 等），自动 Onboarding 候选人档案，个性化 Scout + Match + Sender + Retro pipeline。v3 新增：4 层 memory（L0/L1/L2/L3）+ bootstrap 持久化，对话中断重启不丢上下文。
version: 3.1.0
license: MIT
metadata:
  hermes:
    tags: [job-search, browser, automation, outreach, multi-platform, memory-bootstrap]
    requires_mcp: [chrome-devtools]
    related_skills: []
---

# AI Job Search Skill — Hermes Adapter

本文件是 Hermes 运行时对 [`docs/AGENT_PROTOCOL.md`](../../docs/AGENT_PROTOCOL.md) 的适配器实现。

**完整操作规范（Bootstrap / Onboarding / MORNING / EVENING / MATCH / DRAFT / CONVERSATIONAL / ADD-PLATFORM / Atom 写入规则 / 禁止清单）见 [`docs/AGENT_PROTOCOL.md`](../../docs/AGENT_PROTOCOL.md)。**

本文件仅记录 Hermes 特有的：执行约束、工具名映射、故障排查。

---

## 执行硬约束（Hermes 特有）

1. **浏览器工具白名单**：仅允许使用 `mcp_chrome_devtools_*` 工具。
   - 明确禁止：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_press`、`browser_cdp` 等所有 `browser_*` 内置工具。
   - 若模型尝试调用 `browser_*`，必须立即中止当前计划并改为 `mcp_chrome_devtools_*`。

2. **分页节奏**：涉及翻页测试时必须拆成两段：
   - 段 A：只读当前页，不翻页；
   - 段 B：在用户确认后再翻下一页。
   不能在同一段里连续翻多页。

3. **慢速动作**：翻页/点击前后必须遵守 `runtime/policy.yaml` 的最小间隔，不得"读完即点下一页"。

---

## 工具名映射（Hermes → 协议抽象）

协议文档（`docs/AGENT_PROTOCOL.md`）使用 `browser.*` 抽象名，Hermes 实现如下：

| 协议抽象 | Hermes 工具名（`mcp_chrome_devtools_*`）|
|---|---|
| `browser.navigate(url)` | `mcp_chrome_devtools_navigate_page(url=url)` |
| `browser.snapshot()` | `mcp_chrome_devtools_take_snapshot()` |
| `browser.screenshot()` | `mcp_chrome_devtools_take_screenshot()` |
| `browser.click(uid)` | `mcp_chrome_devtools_click(uid=uid)` |
| `browser.fill(uid, value)` | `mcp_chrome_devtools_fill(uid=uid, value=value)` |
| `browser.scroll()` | `mcp_chrome_devtools_scroll_page()` |
| `browser.press(key)` | `mcp_chrome_devtools_press_key(key=key)` |
| `browser.eval(code)` | `mcp_chrome_devtools_evaluate_script(code=code)` |
| `browser.new_page()` | `mcp_chrome_devtools_new_page()` |

> 其他 MCP 客户端（非 Hermes）使用双下划线形式：`mcp__chrome-devtools__*`。

---

## Step 0 — Bootstrap 补充说明

遵循 `docs/AGENT_PROTOCOL.md` Step 0 规范，在 Hermes 中具体执行：

```bash
cat ~/.ai-job-search/L3_persona/candidate_profile.md
cat ~/.ai-job-search/L3_persona/current_state.md
cat ~/.ai-job-search/L3_persona/strategy.md
cat ~/.ai-job-search/L3_persona/decision_rules.md
cat ~/.ai-job-search/L3_persona/company_targets.md
ls ~/.ai-job-search/L2_scenarios/retro_*.md | tail -3 | xargs cat
cat ~/.ai-job-search/operational/search_config.json
cat ~/.ai-job-search/operational/company_blacklist.json
cat ../../runtime/policy.yaml
```

→ 解析 `policy.yaml` 每个启用平台的 `mode / inter_action_min_ms / autonomous_navigate / autonomous_submit / security_check_patterns` 字段，存为 session 变量 `platform_policy[domain]`。

→ 一行确认后回应用户：`"已加载：profile（resume vN），funnel（本周 X 投 / Y 回），N 个待决策。开始。"`

---

## 运行模式

模式检测逻辑遵循 `docs/AGENT_PROTOCOL.md`，支持：

`MORNING` / `EVENING` / `MATCH` / `DRAFT` / `ONBOARDING` / `CONVERSATIONAL` / `ADD-PLATFORM`

所有模式的完整规范见 `docs/AGENT_PROTOCOL.md`。Hermes 执行时，将协议中所有 `browser.*` 调用替换为上方映射表对应的 `mcp_chrome_devtools_*` 工具。

---

## 平台可靠性参考（2026-05-18 实测）

| 平台 | 自动化可靠性 | 主要问题 | 建议 |
|---|---|---|---|
| LinkedIn | ✅ 高 | 基本无风控，页面加载稳定 | 优先使用，适合自动化投递 |
| BOSS直聘 | ⚠️ 中 | 反爬虫机制强，需严格遵守 `beside_user` 模式 | 用户日常 Chrome + `beside_user` + 遇验证立即停 |
| 猎聘/智联/前程无忧 | ⚠️ 中 | 未充分测试 | 先小规模测试再决定是否启用自动化 |

**经验教训：**
- BOSS直聘关键：用户日常 Chrome（非 fresh profile）+ `beside_user` 模式 + 遇验证立即停手
- BOSS 走「半自动」模式（用户翻页，AI 评分 + 写文案）是最可靠选择
- LinkedIn 搜索和申请流程稳定，可全自动

城市代码备查（BOSS直聘）：杭州=101210100, 上海=101020100, 北京=101010100, 深圳=101280600

---

## 故障排查：chrome-devtools-mcp（Hermes 专用）

### 问题 1：工具未找到 / MCP 连接错误

**症状：** `mcp_chrome_devtools_*` 工具调用返回 "tool not found" 或 MCP 连接错误。

```bash
hermes mcp list                    # 确认 chrome-devtools 出现
hermes mcp test chrome-devtools    # 期望 ✅ Connected, 33 tools
```

解决：
- Chrome 未启动 → 用 `--remote-debugging-port=9222` 启动 Chrome（见 `docs/BROWSER_BACKEND.md`）
- MCP 未注册 → 重跑 `bash scripts/install.sh`
- npx 冷启动慢 → 等最多 60 秒后重试

---

### 问题 2：`take_snapshot` 返回 "no current page"

Chrome 在运行但没有打开的标签页。

```
mcp_chrome_devtools_new_page()
mcp_chrome_devtools_navigate_page(url="https://www.example.com")
```

或让用户手动按 Cmd+T 打开标签后重试。

---

### 问题 3：BOSS直聘触发反爬虫

**症状：** `take_snapshot` 只返回导航栏/页脚，或 URL 跳转到 `/web/passport/zp/verify.html`。

**解决：**
1. 确认 `policy.yaml`：`www.zhipin.com.mode` 必须是 `beside_user`
2. 切换半自动模式（用户手动浏览，AI 评分 + 写文案）
3. 如已触发验证 → 立即停止，等用户手动完成，冷却 30 分钟

---

### 问题 4：外部 ATS 重定向失败（Avature / Greenhouse / Workday）

这些系统不允许程序化导航（预期行为）。

寻找隐藏的 Easy Apply 按钮：

```javascript
mcp_chrome_devtools_evaluate_script(code="
  Array.from(document.querySelectorAll('button,a'))
    .filter(el => el.textContent.toLowerCase().includes('easy apply'))
    .map(el => ({text: el.textContent.trim(), id: el.id}))
")
```

找到 UID 后直接点击，或切换半自动模式（用户手动在 ATS 门户提交，代理写文案 + 写 atom）。

---

## Open-source setup

```bash
git clone https://github.com/Xiao-yun-Hu/ai-job-search-os.git
cd ai-job-search-os
bash scripts/install.sh   # 创建 ~/.ai-job-search/ 全套目录 + 软链 SKILL.md 到 Hermes
                          # 注册 chrome-devtools MCP server

# 启动 Chrome（CDP 模式，每次机器 session 一次）
open -a "Google Chrome" --args --remote-debugging-port=9222
curl -s http://127.0.0.1:9222/json/version | python3 -c \
  "import json,sys; print(json.load(sys.stdin).get('Browser'))"
```

然后在 Hermes：
```
> /skills run ai-job-search "今天的 morning outreach"
```

完整操作规范见 [`docs/AGENT_PROTOCOL.md`](../../docs/AGENT_PROTOCOL.md)。
内存架构见 [`docs/MEMORY_LAYERS.md`](../../docs/MEMORY_LAYERS.md)。
