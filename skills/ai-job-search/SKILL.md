---
name: ai-job-search
description: 通用求职自动化 OS — 支持多平台（BOSS直聘/猎聘/智联/前程无忧/LinkedIn 等），自动 Onboarding 候选人档案，个性化 Scout + Match + Sender + Retro pipeline。v3 新增：4 层 memory（L0/L1/L2/L3）+ bootstrap 持久化，对话中断重启不丢上下文。
version: 3.0.0
license: MIT
metadata:
  hermes:
    tags: [job-search, browser, automation, outreach, multi-platform, memory-bootstrap]
    related_skills: []
---

# AI Job Search OS

通用求职自动化系统。基于候选人简历和个人偏好，在多个招聘平台上执行精准投递和复盘。

**设计原则**：所有筛选条件和匹配逻辑均来自候选人的真实档案，无任何硬编码的个人偏好。

**v3 新增**：4 层 memory 持久化（L0 raw / L1 atoms / L2 scenarios / L3 persona）。详见 [`docs/MEMORY_LAYERS.md`](../../docs/MEMORY_LAYERS.md)。

---

## STEP 0 — Bootstrap（每次 session 启动**第一件事**）

**关键：在响应用户任何请求之前，必须先做这一步。无例外。**

```
1. 加载 L3 持久画像（完整上下文）：
   cat ~/.ai-job-search/L3_persona/candidate_profile.md
   cat ~/.ai-job-search/L3_persona/current_state.md
   cat ~/.ai-job-search/L3_persona/strategy.md
   cat ~/.ai-job-search/L3_persona/decision_rules.md
   cat ~/.ai-job-search/L3_persona/company_targets.md

2. 加载最近 3 天 L2 retros（近期上下文）：
   ls ~/.ai-job-search/L2_scenarios/retro_*.md | tail -3 | xargs cat

3. 加载 operational config：
   cat ~/.ai-job-search/operational/search_config.json
   cat ~/.ai-job-search/operational/company_blacklist.json

4. 一行确认状态，然后再回应用户：
   "已加载：profile（resume vN），funnel（本周 X 投 / Y 回），N 个待决策。开始。"
```

如果任一 L3 文件不存在 → 告诉用户，建议先跑 `scripts/install.sh` 完成首次设置。如果 `candidate_profile.md` 还是模板状态（未填写）→ 自动进入下方的 ONBOARDING 模式。

**这一步解决了「对话中断后重开就忘」的根本问题。** L3 每次 session 都重新加载，最近 3 天的 L2 retro 补足近期上下文。

---

## 数据目录（v3 结构）

默认路径：`~/.ai-job-search/`

```
~/.ai-job-search/
├── atoms.jsonl                    # L1: append-only 原子事实（详见 templates/L1_atoms_schema.md）
├── L2_scenarios/
│   ├── morning_YYYY-MM-DD.md      # 每日投递日报
│   ├── retro_YYYY-MM-DD.md        # 每日复盘
│   ├── weekly_YYYY-WW.md          # 每周总结
│   └── archive/                   # 4 周以上自动归档
├── L3_persona/
│   ├── candidate_profile.md       # 候选人长期档案（onboarding 填，后续手动维护）
│   ├── current_state.md           # 运营快照（每晚 distill.py 覆盖）
│   ├── strategy.md                # 学到的策略（distill.py promotion 追加）
│   ├── decision_rules.md          # 硬规则（distill.py promotion 追加）
│   └── company_targets.md         # 目标公司清单 + Track A/B 状态
└── operational/
    ├── applications.jsonl         # 投递记录（也是 atoms[type=application] 的镜像）
    ├── company_blacklist.json     # 用户黑名单
    └── search_config.json         # 搜索配置（关键词、平台、daily_cap）
```

L0 原始对话由 Hermes 自动维护在 `~/.hermes/sessions/*.json`，本 skill 只读不写。

---

## 运行模式检测

Step 0 bootstrap 完成后，按以下顺序判断模式：

```
1. 检测 ~/.ai-job-search/L3_persona/candidate_profile.md 是否含真实数据（非纯模板占位符）
   → 仍是模板：进入 ONBOARDING 模式
   → 已填写：检测 prompt 关键词
     - 含 "morning" 或 "投递" 或 "outreach"：MORNING 模式
     - 含 "evening" 或 "复盘" 或 "retro"：EVENING 模式
     - 含 "match" 或 "评分" 或 "tier"：MATCH 模式（单 JD 评分）
     - 含 "draft" 或 "写文案"：DRAFT 模式（直接生成文案）
     - 含 "setup" 或 "重新配置"：重新进入 ONBOARDING
     - 含 "add platform" 或 "添加平台"：ADD-PLATFORM 模式
     - 无明确关键词：CONVERSATIONAL 模式（用 L3 context 回答问题）
```

---

## ONBOARDING 模式

> 首次运行或检测不到候选人档案时自动进入。完成后保存档案，后续运行直接跳过。

**⚠️ 执行规则：每个步骤必须收到用户明确回复后，才能进入下一步。绝不跳步。Steps 1-4 禁止使用任何浏览器工具。**

---

### Step 1：确认数据目录

**立即输出以下内容，然后停止等待用户回复：**

```
📁 Step 1/7：数据目录

你的求职数据想存在哪里？
默认路径：~/.ai-job-search/

直接回复"ok"使用默认路径，或输入自定义绝对路径。
```

收到用户回复后：调用 `scripts/install.sh` 创建完整目录结构（L2/L3/operational + L1 atoms.jsonl）。

---

### Step 2：收集简历

**立即输出以下内容，然后停止等待用户回复：**

```
📄 Step 2/7：简历

请提供你的简历，两种方式任选：
A. 输入文件路径（支持 PDF / Word / Markdown / TXT）
B. 直接粘贴简历文本

请回复 A+路径 或 B+文本内容。
```

收到用户回复后：
- 方式 A：用 `read_file` 读取文件；若为 PDF/DOCX，用 `execute_code` + pdfminer/python-docx 提取文本
- 方式 B：直接使用粘贴内容

解析简历，提取结构化信息，**写入 L3_persona/candidate_profile.md** 的对应 sections：

```yaml
identity: name, contact, current_location, total_years
experience: timeline (companies × roles)
education: masters, bachelors
technical_capabilities: [list]
business_capabilities: [list]
proof_of_work: flagship_project + impact_metrics
```

**输出解析结果，询问用户确认：**
```
✅ 解析完成，请确认以下信息是否准确：

姓名：[name]
当前职位：[current_role]
工作年限：[years] 年
核心技能：[skills]
资历级别：[seniority_level]

如有不准确，请指出需要修改的地方；如无问题，回复"ok"继续。
```

等待用户确认后，写入 `L3_persona/candidate_profile.md`。

---

### Step 3：收集求职偏好

**一次性输出所有问题，等待用户统一回复：**

```
🎯 Step 3/7：求职偏好

请回答以下问题（不想填的直接跳过）：

1. 目标岗位类型？（例：AI架构师、算法工程师）
2. 期望薪资？（例：30-60K，或"至少40K"）
3. 目标城市？（例：上海、杭州、远程）
4. 决策优先级？（vibe / comp / role-form / speed / trajectory / geography — 按你的真实排序）
5. 偏好公司类型？
   A. AI-native 初创  B. 大厂AI部门  C. 外资  D. 传统行业+AI  E. 不限
6. 偏好公司规模？
   A. <100人  B. 100-500人  C. 500-2000人  D. >2000人  E. 不限
7. 绝对排除条件？（例：外包、驻场、销售岗）
8. 特别加分信号？（例：海外创始团队、弹性工作、期权）
```

收到用户回复后，写入 `L3_persona/candidate_profile.md` 的 `preferences` 和 `decision_priority` 字段。

---

### Step 4：生成搜索关键词

基于候选人档案，生成 5-10 个搜索关键词，**输出后等待确认：**

```
🔍 Step 4/7：搜索关键词

根据你的档案，推荐以下关键词：
1. [kw1]
2. [kw2]
...

回复"ok"确认，或告诉我需要增删的关键词。
```

确认后写入 `operational/search_config.json`：
```json
{"keywords": [], "platforms": [], "daily_cap": 10, "score_threshold": 6}
```

---

### Step 5：配置招聘平台

**⚠️ 此步骤 starts using browser tools — and requires visual login confirmation.**

**First: output platform selection and wait for user reply:**

```
🌐 Step 5/7：招聘平台

选择要启用的平台（回复字母，可多选，例："A C"）：
A. BOSS直聘（zhipin.com）
B. 猎聘（liepin.com）
C. 智联招聘（zhaopin.com）
D. 前程无忧（51job.com）
E. LinkedIn（linkedin.com）
F. 其他（请附上网址）
```

After user selects platforms:
1. For each selected platform, call `browser_navigate(url=[login_url])`
2. Immediately call `browser_vision(question="Is the user logged in? Look for their profile avatar or display name in the top-right corner.", annotate=True)`
3. **Require explicit user confirmation**: ask "Is the user logged in? Reply 'yes' or 'no'."
4. If 'yes': write platform to `operational/search_config.json` and proceed.
5. If 'no': prompt user to log in manually, then repeat steps 2–3 (max 2 retries). If still failed, skip platform and warn: "Login failed — skipped [platform]."

**Critical**: After all platforms processed, ensure `L3_persona/candidate_profile.md` and `operational/search_config.json` are written using `write_file`, not assumed saved.

---

### Step 6：生成 Outreach 文案

基于候选人档案自动生成打招呼模板，**输出后等待确认：**

```
✉️ Step 6/7：打招呼文案

根据你的档案，生成以下开场文案：

---
[生成的文案]
---

回复"ok"使用此文案，或直接输入你的修改版本。
```

确认后写入 `L3_persona/candidate_profile.md` 的 `outreach_message` 字段。

---

### Step 7：Onboarding 完成

```
✅ Step 7/7：配置完成！

候选人：[name]（[seniority_level]）
目标岗位：[target_roles]
启用平台：[platforms]
搜索关键词：[keywords]
每日投递上限：[daily_cap] 条

运行 morning 模式开始自动投递。
现在想先跑一次测试吗？（是/否）
```

---

## MORNING 模式

### 前置：加载档案 + 平台连通性验证

Step 0 bootstrap 已经加载了 L3，所以这里只补充 operational 数据：

```python
# Step 0 已加载：candidate_profile, current_state, strategy, decision_rules, company_targets
# 这里只需要补充：
applications = load_jsonl("~/.ai-job-search/operational/applications.jsonl")
blacklist    = load_json("~/.ai-job-search/operational/company_blacklist.json")
search_cfg   = load_json("~/.ai-job-search/operational/search_config.json")

# ⚠️ 不做自动导航验证登录 — 直接进入 Scout，由用户确保页面就绪
```

---

### Phase 1：Scout

对每个启用平台，按 `search_cfg.keywords` 搜索：

**1.1 搜索 & 提取列表**

🛑 **BOSS直聘反爬核心规则（必须严格遵守）**：

前提条件：
- Hermes 必须连接**用户的常规 Chrome**（含已登录的 trusted session），不能用独立 profile
- `config.yaml` 中 `human_delay.mode: 'on'`，min_ms ≥ 1800, max_ms ≥ 4500

操作节奏要求：
- **每个 browser 工具调用之间至少间隔 2 秒**（human_delay 自动注入）
- **同一个页面动作连续失败 1 次就停下**，不要重试 — 重试会被识别成攻击
- **翻页前后必须 snapshot 一次**，不能盲点 `下一页` 按钮
- **跨关键词搜索之间间隔至少 10 秒**

**Scout 流程（缓速自动模式）**：

```
# Step 1：导航到首页（带城市）— 一次性
browser_navigate(url="https://www.zhipin.com/web/geek/jobs?city=101210100")
browser_snapshot()  # 等待页面稳定（human_delay 自动延迟 1.8-4.5 秒）

# Step 2：搜索关键词 — 用首页搜索框，不要直接拼 query URL
browser_type(ref="搜索框", text="{keyword}")
browser_snapshot()  # 等待输入完成
browser_click(ref="搜索按钮")
browser_snapshot()  # 等待搜索结果加载

# Step 3：提取第1页岗位卡片
# 从 snapshot 提取 title / company / salary / location / experience / detail_url

# Step 4：翻页（如需要）— 每翻一页强制等 3-5 秒
browser_scroll(direction="down")  # 模拟人类浏览
browser_snapshot()
browser_click(ref="下一页按钮")
browser_snapshot()  # 必须确认页码变了再继续

# Step 5：跨关键词搜索 — 间隔至少 10 秒
# 在 SKILL 层做 sleep(10) 后再开始下一个关键词
```

**异常恢复规则**：
- 如果 snapshot 显示「安全验证」页面 → 立即停止所有自动化操作，提示用户手动完成验证后告知 Hermes 继续
- 不要尝试自动点击验证组件
- 验证完成后下一次操作前再等 10 秒

**城市代码备查**：杭州=101210100, 上海=101020100, 北京=101010100, 深圳=101280600

从列表页提取每张岗位卡片：`title / company / salary_range / location / experience / detail_url`

**1.2 Gate 1（列表页快速过滤）**

按顺序，任一命中即跳过：

| 条件 | 来源 |
|------|------|
| 公司名含匿名标识（"某大型/某中型/某小型/某知名/某头部/某上市"） | 通用规则 |
| 职位为实习/兼职（title 含"实习/intern/兼职/part-time"，或描述含"天/周"计薪） | 通用规则 |
| 已在 `operational/applications.jsonl` 投过 | 去重 |
| 在 `operational/company_blacklist.json` | 用户黑名单 |
| 经验要求上限 < candidate_profile.years_of_experience * 0.6（例：用户8年，JD要求≤1-3年则跳过） | L3_persona/candidate_profile |
| title 含用户 `hard_excludes` 中的关键词 | L3_persona/candidate_profile.preferences |
| 公司名含"猎头/咨询/人力/外包/派遣/staffing"（除非用户明确允许） | 通用规则 |
| 命中 `L3_persona/decision_rules.md` 中的任何规则 | distill.py 自动促升 |

**1.3 详情页读取**

```
browser_navigate(url=detail_url)
browser_snapshot()
```

提取：`funding_stage / company_size / jd_text / is_headhunter / company_description`

**1.4 Gate 2（详情页过滤）**

| 条件 | 来源 |
|------|------|
| 猎头职位标记 | 通用规则 |
| JD 含用户 `hard_excludes` 关键词 | L3_persona/candidate_profile.preferences |
| 融资阶段过早（天使/种子/Pre-A） | 若用户偏好 A/B 轮以上 |
| 公司规模不符 | L3_persona/candidate_profile.preferences.company_size |
| 薪资最高值 < 用户设定底线 | L3_persona/candidate_profile.preferences.salary_min_k |

**1.5 JD 评分（个性化）**

基于候选人档案，评估每条 JD 与候选人的匹配度（0-10分）：

- 核心技能重叠度（`candidate_profile.core_skills` vs JD要求）
- 目标职位方向对齐（`candidate_profile.preferences.target_roles` vs JD title/职责）
- 公司类型偏好匹配（`preferences.company_types` vs 公司描述）
- 加分信号命中数（`preferences.boost_signals` vs JD文本）

分数 ≥ `search_cfg.score_threshold`（默认 6）→ 进入 Phase 2。

---

### Phase 2：Match

对每个通过 Gate 的候选，基于候选人档案进行深度评估：

**评估维度**（根据候选人档案 + L3_persona/strategy.md 动态生成权重，不硬编码）：

| 维度 | 评估逻辑 |
|------|---------|
| 角色对齐 | JD 职责与候选人目标角色的语义相似度 |
| 技能匹配 | 候选人核心技能在 JD 中的覆盖率 |
| 领域匹配 | 候选人领域经验 vs 公司所在行业 |
| 级别适配 | JD 要求的资历 vs 候选人实际资历 |
| 公司偏好 | 公司类型/规模/阶段是否符合候选人偏好 |
| 文化 vibe | JD 文本中的工作方式信号 vs 候选人偏好 |

**Tier 分级**：

```
Tier A: 所有核心维度 strong，无明显风险
Tier B: 多数维度 medium+，1-2 个加分信号
Tier C: 部分相关但有明显 gap → 存档，不投
Tier D: 多个核心维度 weak/negative → 跳过
pending: ≥3 个维度信息不足 → 等用户补充
```

**输出字段**：

```json
{
  "tier": "A|B|C|D|pending",
  "match_scores": {
    "role_alignment": 0.0,
    "skill_coverage": 0.0,
    "domain_fit": 0.0,
    "seniority_fit": 0.0,
    "company_fit": 0.0,
    "vibe_fit": 0.0
  },
  "main_strengths": ["..."],
  "main_gaps": ["..."],
  "outreach_angle": "基于 JD 定制的一句话切入点（结合候选人最相关的项目/技能）",
  "missing_info": ["..."]
}
```

---

### Phase 3：Sender

| Tier | 行动 |
|------|------|
| A | 投递 + 标记 high-priority follow-up |
| B | 投递 |
| C | 不投，存入 `L2_scenarios/candidates_saved_YYYY-MM-DD.md` |
| D | 跳过，记录原因 |
| pending | 不投，存入 `L2_scenarios/pending_review_YYYY-MM-DD.md` |

**投递流程（通用，适配各平台）**：

```
1. browser_navigate(url=detail_url)
2. browser_vision(question="找到'立即沟通'/'打招呼'/'投递简历'等行动按钮", annotate=True)
3. browser_click(ref="@e[N]")
4. browser_vision(question="确认对话框/输入框已出现")
   → 未出现 → 重试1次 → 仍失败 → 跳过，记录"button_not_found"
5. browser_type(ref="@e[input]", text=personalized_message)
   # personalized_message = candidate_profile.outreach_message
   #   + outreach_angle（Match 阶段生成的定制切入点）
6. browser_vision(question="确认消息内容完整")
7. browser_press(key="Enter") 或 browser_click(发送按钮)
8. browser_vision(question="确认消息已发送")
9. 记录到 operational/applications.jsonl 和 atoms.jsonl
```

**每日上限**：`search_cfg.daily_cap`（默认 10 条，Tier A+B 合计）

**每次投递必须写两个文件**：
- `operational/applications.jsonl`（兼容老格式）
- `atoms.jsonl`（L1 原子事实，type=application，详见 `templates/L1_atoms_schema.md`）

---

### Phase 4：Mini Report

写入 `L2_scenarios/morning_YYYY-MM-DD.md`。

输出终端摘要（≤200字）：

```
[平台] 今投 N 条 (A:x B:y)，C存档 z，pending m，D跳过 n。
[高优先级公司列表（如有）]
```

---

## EVENING 模式

### Phase 1：各平台聊天状态采集

对每个启用平台，读取消息列表：

```
browser_navigate(url=platform.chat_url)
browser_snapshot()
```

提取每条对话：`hr_name / company / role / last_message / read_status / timestamp`

关联到 `operational/applications.jsonl` 中的记录，标注 Funnel Stage：

```
sent → read → reply → deep_chat → interview → offer
```

每条新的 conversation 更新都写一个 `type:conversation` 的 atom 到 `atoms.jsonl`。

### Phase 2：Pattern Observation（只观察，不修改 Match 规则）

用 `(count, ratio, sample_size)` 记录各维度分布。

> ⚠️ sample < 10 标"noisy"，不下结论；sample < 50 不调整关键词权重。

**Strict Match-vs-Reward separation**（来自 `docs/SYSTEM.md` §4.7-4.8）：
- **Match** = 战略判断（来自 candidate profile + 市场信号）— 只通过 L3 promotion 修改
- **Reward** = 观察到的漏斗结果 — 不直接修改 Match 规则
- 今天的 retro 可以**观察 pattern**，不会自动修改 `strategy.md`。distill.py 的 promotion 规则（如「同一 pattern 出现 3+ 次 → 升级到 strategy」）才会动 L3。

### Phase 3：Search Efficiency 优化

只允许调整关键词顺位（基于搜索侧信号），不根据回复率/深聊率修改 Match 逻辑。

### Phase 4：写复盘文件

写入 `L2_scenarios/retro_YYYY-MM-DD.md`。

### Phase 5：推送摘要（≤200字）

### Phase 6：更新运营快照

> 注：这步通常由 `scripts/distill.py` 在 23:30 cron 里自动做。手动 EVENING 模式也可以直接覆写。

覆盖写入 `L3_persona/current_state.md`：

```markdown
## 更新时间
{YYYY-MM-DD HH:MM}

## 漏斗快照（近7天）
- 投出：N 条 | Funnel：sent N → read N → reply N → deep_chat N → interview N

## 活跃对话（reply 及以上）
| 平台 | 公司 | 阶段 | 最新动态 | 下一步 |

## Pending 队列（待用户决策）
| 公司 | 缺失信息 | 截止 |

## 待用户处理
```

---

## MATCH 模式（单 JD 评分）

当用户贴一条 JD 直接问"这个怎么样"时：

1. 应用 Gate 1 — 任一规则命中就报 `Tier D, skip, reason: ...` 并停
2. 6 维度评分，输出：
   ```
   Tier: B
   Strong: role-form fit, compensation, AI-native
   Weak: vibe (unknown founder), geographic (Shanghai-only)
   Unknown: trajectory
   建议：投，文案如下
   Outreach: ...
   ```
3. 写一条 `type:learning` atom（如果是新公司）或 `type:conversation` atom（如果用户后续追问）

---

## DRAFT 模式（直接生成文案）

用户说"帮我写个 outreach 给这个 JD"→ 跳过 Gate，直接生成。明确说用了 candidate_profile 的哪一条 narrative pillar。

---

## CONVERSATIONAL 模式

用户问的问题不属于以上任何模式（例：「Anthropic 那个对话进展怎么样了？」）。

用 Step 0 已加载的 L3 上下文 + 最近 L2 retro 回答。**如果 L3/L2 里没数据，明说没有，不要编。** 这正是 v3 bootstrap 解决的核心问题。

---

## ADD-PLATFORM 模式

```
你想添加哪个平台？
A. 猎聘（liepin.com）
B. 智联招聘（zhaopin.com）
C. 前程无忧（51job.com）
D. LinkedIn（linkedin.com）
E. 其他（输入网址）
```

引导用户登录 → 验证登录态 → 写入 `operational/search_config.json`。

---

## 每个 action 都要写 atom（v3 核心改动）

任何有意义的 action 必须 append 一个 atom 到 `~/.ai-job-search/atoms.jsonl`：

- 投了一个岗位 → `type:application`
- HR 回了消息 → `type:conversation`
- 用户说了一条新规则 → `type:decision`
- 你观察到一个 pattern（有 1+ 证据）→ `type:learning`
- 面试结果 → `type:feedback`

格式见 `templates/L1_atoms_schema.md`。

```bash
echo '{"ts":"...","source":"<session_id>","type":"application","entities":{...},"content":"..."}' \
  >> ~/.ai-job-search/atoms.jsonl
```

晚上 23:30 `scripts/distill.py` 会读这些 atoms，自动生成 L2 retro，应用 promotion 规则更新 L3。

---

## 绝对禁止

- ❌ **跳过 Step 0 bootstrap**（即使为了「快一点」）
- ❌ 不投 Tier C/D/pending 候选
- ❌ 不重复投已在 `operational/applications.jsonl` 的公司
- ❌ 遇平台风控（滑块/验证码）→ 立即停止该平台，继续其他平台
- ❌ 不自动回复 HR 消息（只读不写）
- ❌ 不根据 outcome 信号直接修改 Match 逻辑（必须走 L3 promotion）
- ❌ 不修改 `operational/applications.jsonl` 已有记录（append-only）
- ❌ 不直接编辑 `L3_persona/strategy.md` 或 `decision_rules.md`（只能通过 distill.py promotion）
- ❌ Onboarding 未完成时不执行任何投递操作
- ❌ 没数据时不要编 — Step 0 已加载所有应该知道的，没有就明说

---

## 平台可靠性对比（2026-05-18 实测）

| 平台 | 自动化可靠性 | 主要问题 | 建议 |
|------|-------------|---------|------|
| LinkedIn | ✅ 高 | 基本无风控，页面加载稳定 | 优先使用，适合自动化投递 |
| BOSS直聘 | ⚠️ 中 | 反爬虫机制强，需严格遵守上方反爬节奏规则 | 必须用 trusted Chrome session + human_delay；遇验证立即停手 |
| 猎聘/智联/前程无忧 | ⚠️ 中 | 未充分测试，可能有类似 BOSS 的风控 | 先小规模测试再决定是否启用自动化 |

**经验教训：**
- LinkedIn 搜索和申请流程稳定，browser_navigate 和 browser_snapshot 都能正常工作
- BOSS直聘的关键是：用户常规 Chrome 启 CDP（不是新 profile）+ human_delay 开启 + 操作节奏放缓 + 遇验证立即停
- 优先选择 LinkedIn 自动化，BOSS 走「半自动」（用户翻页，Hermes 评分 + 写文案）也是合理选择

---

## 故障排查：浏览器工具失效

### 问题类型 1：浏览器会话未就绪

**症状：**
- `browser_navigate` 反复返回 `"No page found. Make sure the app has loaded content."`
- `browser_cdp` + `Target.getTargets` 返回空 `targetInfos: []`
- `browser_snapshot` 也返回相同错误

**原因：**
- 浏览器后端会话未初始化或已断开
- Chrome 在运行但没有可用标签页

**诊断命令：**
```bash
browser_cdp(method='Target.getTargets', params={})
# 空 targetInfos = 浏览器会话未就绪
```

**解决：**
- 需要重建浏览器会话（创建新标签页）
- 不要反复尝试 `browser_navigate` 超过 3 次——这是会话级故障，不是页面加载问题
- `browser_navigate` 返回 `about:blank` 但 CDP 显示其他标签页 → 会话切换失败
- `browser_snapshot` 返回 BOSS直聘内容但 `browser_vision` 显示其他网站 → 标签页不同步

---

### 问题类型 2：平台反爬虫机制（BOSS 直聘常见）

**症状：**
- `browser_navigate` 成功返回，但 `browser_vision` 显示页面空白
- `browser_snapshot` 只返回导航栏/页脚，没有动态内容
- 搜索后页面不刷新，仍显示旧结果或空列表
- 跳转到 `/web/passport/zp/verify.html` 安全验证页

**原因：**
- BOSS 直聘检测到自动化浏览器，触发安全验证或拒绝返回动态内容
- 独立 ChromeHermes profile 比用户常规 Chrome 更容易被识别（无浏览历史 = 可疑）
- 程序化连续点击会被识别成攻击

**经验教训（2026-05-18 full-session 测试）：**

| 尝试 | 结果 |
|------|------|
| 独立 ChromeHermes profile + CDP | 触发 `_security_check` 重定向 |
| 加 `--disable-blink-features=AutomationControlled` flag | 同上 |
| 复制用户 trusted profile 给 ChromeHermesCDP（5GB） | 验证组件能加载，但快速连续点击会被再次拦截 |
| 直接调 BOSS JSON API（带 referer） | 返回 `code: 37 您的环境存在异常` |
| JS `document.cookie` | 关键认证 cookie 全是 HttpOnly，拿不到 |

**结论：**BOSS 直聘必须用**用户常规 Chrome（CDP 接入）+ human_delay + 缓速操作**。任何「fresh profile + 全自动 + 高速」组合都会失败。

**推荐流程（仍可工作）：**
```bash
# 前提：用户已用 --remote-debugging-port=9222 启动了自己的常规 Chrome
# Hermes config.yaml: browser.cdp_url = http://localhost:9222
# Hermes config.yaml: human_delay.mode = 'on', min_ms = 1800, max_ms = 4500

browser_navigate(url="https://www.zhipin.com/")
browser_snapshot()  # 等待首页加载完成
browser_type(ref=e16, text="{keyword}")  # 在首页搜索框输入
browser_click(ref=e18)  # 点击搜索按钮
browser_vision(question="确认搜索结果显示的是 '{keyword}' 吗？列表中有相关岗位吗？")
# 如果 vision 确认失败 → 不要继续，重新导航到首页再试
```

**如果仍失败 → 切换到半自动模式（见下方）**

---

### 问题类型 3：登录态隔离

**症状：**
- 用户在个人浏览器已登录 BOSS 直聘/LinkedIn
- 但代理的浏览器工具显示未登录状态

**原因：**
- **代理的浏览器工具与用户个人浏览器是完全独立的会话**（除非你用 CDP 接入了用户常规 Chrome）
- Cookie/登录态不共享
- 用户手动登录的状态不可被代理直接访问

**解决：**
- 代理需要在自己的浏览器会话中重新登录
- 或者用 `--remote-debugging-port=9222` 启动用户常规 Chrome，让 Hermes 通过 CDP 接入（保留所有登录态）
- 或者使用半自动模式（用户手动操作，代理辅助决策）

---

### 问题类型 4：外部招聘系统（Avature / Greenhouse / Workday）重定向失败

**症状：**
- 点击 LinkedIn 的 "Apply on company website" 按钮后，页面跳转至 `ibmglobal.avature.net` 或类似域名，但显示空白或仅加载框架
- `browser_snapshot()` returns "Empty page"
- `browser_vision()` may fail or show minimal UI

**原因：**
- Avature/Greenhouse/Workday detect non-human navigation or lack of session context
- Redirects often require CAPTCHA, cookie consent, or JavaScript execution that fails in headless mode
- This is expected behavior — these systems are designed to prevent automation

**解决：**
- ✅ Do NOT retry or attempt further automation
- ✅ Switch immediately to semi-auto mode
- ✅ Extract job details from LinkedIn page (company, title, location, JD snippet) and generate outreach message
- ✅ User copies/pastes into official portal manually

**Pro tip:** To locate hidden "Easy Apply" buttons when snapshot doesn't show them:
```bash
browser_console(expression="Array.from(document.querySelectorAll('button,a')).filter(el => el.textContent.toLowerCase().includes('easy apply')).map(el => ({text:el.textContent.trim(), ref:el.id||'no-id'}))")
```

---

## 半自动模式（推荐用于反爬虫平台）

当浏览器工具因反爬虫机制无法正常工作时，切换到半自动模式：

**操作流程：**

1. **用户手动打开目标平台**（用自己的已登录浏览器）
   - BOSS 直聘：https://www.zhipin.com/web/geek/jobs
   - LinkedIn：https://www.linkedin.com/jobs/search/

2. **用户复制岗位信息给代理**：
   ```
   公司名：[xxx]
   职位：[xxx]
   薪资：[xxx]
   JD：[复制全文或关键点]
   ```

3. **代理评估 + 生成文案**：
   - 基于 L3_persona/candidate_profile 评估匹配度（Tier A/B/C/D）
   - 用 L3_persona/strategy 已学到的模式做加权
   - 生成个性化打招呼文案（结合 JD 定制切入点）
   - 给出投递建议（投/不投/待定）

4. **用户手动投递**：
   - 复制代理生成的文案
   - 在平台上发送消息

5. **代理写 atom**：
   - 即使用户手动投递，仍然 append 一个 `type:application` atom 到 atoms.jsonl
   - 这样 distill.py 仍能正确计算漏斗

**优势：**
- 绕过反爬虫限制
- 保持高效决策流程
- 用户始终掌控账号安全
- L1/L2/L3 memory pipeline 依然完整工作

**何时使用：**
- BOSS 直聘页面持续空白或重定向到安全验证
- LinkedIn 触发验证码
- 任何平台的风控限制导致自动化失败
- External ATS redirects (Avature, Greenhouse, Workday) return blank pages

---

## Open-source setup

首次使用：

```bash
git clone https://github.com/Xiao-yun-Hu/ai-job-search-os.git
cd ai-job-search-os
bash scripts/install.sh   # 创建 ~/.ai-job-search/ 全套目录 + 软链 SKILL.md 到 Hermes
```

然后在 Hermes：
```
> /skills run ai-job-search "今天的 morning outreach"
```

详细文档见 [`docs/INSTALL.md`](../../docs/INSTALL.md) 和 [`docs/MEMORY_LAYERS.md`](../../docs/MEMORY_LAYERS.md)。
