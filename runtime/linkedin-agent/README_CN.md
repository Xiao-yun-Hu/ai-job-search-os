# JobPilot

一个面向 LinkedIn 求职场景的 Chrome 插件——根据简历排序职位并自动完成 Easy Apply，无需本地服务。  
它可以分析当前 LinkedIn 搜索结果页中的职位，根据用户简历和求职偏好进行匹配排序，并自动完成 LinkedIn Easy Apply 投递流程——每次提交前都需要用户手动确认。

---

## 项目简介

这个项目主要解决一个明确场景：

1. 用户打开 LinkedIn Jobs 搜索结果页。
2. 插件读取当前页面上的职位列表。
3. 插件根据用户简历和求职偏好判断职位匹配度。
4. 用户选择想投递的职位。
5. 插件自动完成 LinkedIn Easy Apply 投递。
6. 用户在提交前查看表单并确认。

这个项目不是一个完全自主运行的求职 Agent，也不是覆盖所有招聘网站的万能投递系统。  
它的目标更具体：让 LinkedIn 上最重复、最机械的职位筛选和 Easy Apply 投递流程变得更快、更便宜。

---

## 为什么做这个项目

通用 AI Agent 理论上可以操作浏览器完成求职投递，但实际使用中经常遇到几个问题：

- token 消耗快、成本高
- 执行速度慢
- 对普通用户门槛较高
- 跑几个职位就可能触发使用限制

这个插件采用更轻量的方式：

- 聚焦 LinkedIn Jobs 和 Easy Apply
- 支持配置低成本模型
- 减少不必要的浏览器推理步骤
- 对高频重复流程做专门优化
- 每次提交前都有人工确认环节

在本地测试中，一次 Easy Apply 投递通常可以在约 10–20 秒内完成。

---

## 核心功能

### 基于简历的职位匹配

插件可以读取当前 LinkedIn 搜索结果页中的职位，并根据你上传的简历进行匹配分析。

它会参考：

- 职位标题、职位描述
- 技能要求、经验要求
- 岗位方向和职级
- 简历匹配度
- 用户求职偏好（目标岗位、城市、薪资等）

示例指令：

```
根据我的简历，帮我找出当前页面最匹配的前 5 个职位。
```

```
帮我给当前页面的职位按匹配度排序。
```

```
找出最适合我申请的 Easy Apply 职位。
```

### LinkedIn Easy Apply 自动投递

对于 LinkedIn Easy Apply 类型的职位，插件可以自动执行完整的投递流程：

- **联系方式** — 验证必填字段是否已填写
- **简历** — 从你已上传到 LinkedIn 的简历中自动选择
- **筛选问题** — 自动填写经验年限、下拉选项（工作授权、经验等级）、薪资期望等字段
- **附加问题** — 处理是/否单选按钮等简单选项
- **审核** — 停下来展示 `[CONFIRM REQUIRED]`，等待用户确认再提交

示例指令：

```
帮我申请当前选中的职位。
```

```
帮我申请推荐列表里的前 3 个 Easy Apply 职位。
```

审核后提交：

```
confirm submit
```

取消：

```
cancel
```

### 可配置的 AI 模型

本地后端服务支持自定义配置。你可以在插件设置面板中填写：

- **API Key** — 模型服务的 API 密钥
- **Base URL** — 模型服务的 API 地址
- **Model Name** — 使用的模型名称

默认使用阿里云 Qwen（通过 DashScope OpenAI 兼容接口）：
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 模型: `qwen-plus-2025-11-05`

支持任何 OpenAI-compatible 的模型服务。建议使用成本较低的模型来完成职位排序任务。

---

## 项目结构

```
runtime/linkedin-agent/
  extension/          Chrome 插件（Manifest V3，原生 JS）
    manifest.json
    popup.html
    popup-agent.js    插件主逻辑 — UI、对话、Easy Apply 状态机
    popup.css
    background.js     Service worker
    content.js        内容脚本（读取页面 DOM）
    icons/
  service/            本地后端（TypeScript，Express）
    server.ts         /rank 接口 — LLM 职位排序
    llm.ts            LLM 客户端（OpenAI 兼容）
    package.json
```

---

## 快速开始

### 第一步：启动后端服务

```bash
cd service
npm install
export DASHSCOPE_API_KEY=你的API密钥
npx ts-node server.ts
```

服务运行在 `localhost:7788`。使用插件期间保持此终端开启。

如需使用其他模型服务，也可以直接在插件的设置面板中填写 API Key、Base URL 和 Model Name，无需修改代码。

### 第二步：加载 Chrome 插件

1. 打开 `chrome://extensions/`
2. 开启**开发者模式**（右上角开关）
3. 点击**加载已解压的扩展程序**
4. 选择 `extension/` 文件夹

插件图标将出现在工具栏中。

### 第三步：配置个人信息

点击插件图标打开弹窗，然后点击右下角的 **⚙️** 按钮进入设置。

需要填写的内容：

| 字段 | 说明 |
|------|------|
| Service URL | 本地服务地址，默认 `http://localhost:7788` |
| API Key | 模型 API 密钥（可选，也可在服务端设置环境变量） |
| Base URL | 模型 API 地址 |
| Model Name | 模型名称 |
| Your name | 你的名字（用于个性化提示） |
| Target job titles | 目标职位，如 `AI Engineer, ML Engineer` |
| Preferred location | 偏好城市，如 `Singapore, Remote` |
| Other preferences | 其他偏好，如薪资要求、是否接受外派等 |
| Resume | **粘贴你的完整简历文本**（用于职位匹配和 fit 评分） |

填写完毕后点击 **Save Settings**。

### 第四步：确认 LinkedIn 简历已上传

Easy Apply 自动投递会从你的 LinkedIn Profile 中选择已上传的简历。  
请先在 [linkedin.com/jobs/application-settings](https://www.linkedin.com/jobs/application-settings) 确认简历已上传。

---

## 推荐使用流程

一次典型的使用流程如下：

1. 打开 [LinkedIn Jobs](https://www.linkedin.com/jobs/)，搜索目标职位。
2. 打开插件弹窗，让插件对当前页面职位进行排序。
3. 人工查看推荐结果——检查职位名称、公司、匹配分数。
4. 从列表中选择一个职位，让插件执行投递。
5. 观察表单自动填写过程——如有填写异常可随时干预。
6. 出现 `[CONFIRM REQUIRED]` 提示时，认真查看表单摘要。
7. 输入 `confirm submit` 提交，或输入 `cancel` 取消。
8. 在其他地方单独记录投递状态。

插件是辅助工具，不建议完全替代人工判断。

---

## Easy Apply 自动填写规则

| 字段类型 | 处理方式 |
|---------|---------|
| 经验年限（数字字段） | 填写 `1`（年） |
| 工作授权 / 签证身份下拉 | 填写 `No`（非本地公民/PR） |
| 经验 / 熟练度下拉 | 填写 `Yes` |
| 薪资 / 薪酬字段 | 填写 `10000`（默认，可按需调整） |
| 是/否单选 | 选择 `Yes` |
| 简历选择 | 自动选择第一份已上传的简历 |
| 开放性文字题 | 留空，需用户手动填写 |

无法可靠推断的字段会留空。如果有必填字段仍为空，流程会在 `required_field_empty` 处停下。

---

## 适合的使用场景

当前版本比较适合：

- LinkedIn Jobs 搜索结果分析
- 根据简历对当前页面职位进行排序
- 找出高匹配度的 Easy Apply 职位
- 自动执行 LinkedIn Easy Apply 投递流程
- 降低 AI 辅助求职的成本

---

## 当前限制

插件目前主要针对 **LinkedIn Easy Apply** 做优化。

不支持的申请流程包括：

- Workday、Greenhouse、Lever、Ashby
- 公司官网 Career 页面
- 点击申请后跳转到外部网站的职位

当 LinkedIn 职位跳转到外部网站（`openSDUIApplyFlow` 或外部链接）时，插件会检测到并优雅地停下来，提示用户手动完成投递。

---

## 使用注意事项

- **每次提交都需要人工确认。** 插件永远不会在没有你回复 `confirm submit` 的情况下提交申请。
- **确认前请仔细查看表单。** 检查经验年限、薪资期望、工作授权等字段是否符合你的实际情况。
- **保护好你的 API Key。** 不要将 `.env` 文件提交到代码库。
- **请遵守平台使用规则。** 合理使用，不建议批量投递大量不相关职位。
- **简历数据属于个人隐私。** 简历内容会被发送给你配置的模型服务进行匹配分析，请选择你信任的服务商。

---

## Roadmap

未来可能优化的方向：

- 更好地处理 Easy Apply 特殊问题类型
- 支持更多 OpenAI-compatible 模型服务商
- 投递记录管理和去重
- 多版本简历管理
- 针对高匹配度职位自动生成 Cover Letter
- 部分支持特定外部 ATS 平台

---

## Disclaimer

本项目仅用于个人效率提升和研究学习。  
用户需要自行对使用方式负责。本项目不保证投递成功，也不对账号限制、投递失败、错误提交或其他使用后果负责。
