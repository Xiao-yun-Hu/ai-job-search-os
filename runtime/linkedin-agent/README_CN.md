# JobPilot

一个面向 LinkedIn 求职场景的 Chrome 插件——根据简历排序职位，并自动完成 Easy Apply 投递。  
无需本地服务，无需命令行，安装即用。

---

## 它能做什么

1. 打开 LinkedIn Jobs 搜索结果页
2. 让 JobPilot 根据你的简历对当前页面职位排序
3. 选出最匹配的职位
4. 让 JobPilot 自动填写并提交 Easy Apply 表单
5. 审核表单内容，输入 `confirm submit` 确认提交

---

## 安装

### 第一步——下载插件

**[⬇️ 下载 jobpilot-extension.zip](https://github.com/Xiao-yun-Hu/ai-job-search-os/releases/latest/download/jobpilot-extension.zip)**

下载后解压，得到一个 `extension/` 文件夹，这就是你需要的全部内容。

### 第二步——加载到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择刚才解压得到的 `extension/` 文件夹

工具栏中会出现 **JobPilot** 图标。

---

## 配置

### 第三步——配置 AI 模型

点击工具栏中的 JobPilot 图标，再点击弹窗右下角的 **⚙️**。

填写以下内容：

| 字段 | 填写说明 |
|---|---|
| **API Key** | 你的模型 API 密钥 |
| **Base URL** | 模型服务的 API 地址 |
| **Model name** | 使用的模型名称 |

**默认推荐（阿里云 Qwen / DashScope）：**
- Base URL：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 模型：`qwen-plus-2025-11-05`
- 申请密钥：[dashscope.console.aliyun.com](https://dashscope.console.aliyun.com)

**OpenAI：**
- Base URL：`https://api.openai.com/v1`
- 模型：`gpt-4o-mini`
- 申请密钥：[platform.openai.com](https://platform.openai.com)

支持任何 OpenAI-compatible 的模型服务。

### 第四步——填写个人信息

继续在 ⚙️ 设置中填写：

| 字段 | 填写说明 |
|---|---|
| **Your name** | 你的名字（用于个性化提示） |
| **Target job titles** | 目标职位，如 `AI Engineer, ML Engineer` |
| **Preferred location** | 偏好城市，如 `Singapore, Remote` |
| **Other preferences** | 其他偏好，如最低薪资、是否接受外派等 |
| **Resume** | **粘贴完整简历文本**（用于职位匹配和评分） |

填写完成后点击 **Save Settings**。

### 第五步——确认 LinkedIn 上已上传简历

Easy Apply 自动投递会从你的 LinkedIn 个人主页选择已上传的简历。  
请先在以下地址确认简历已上传：  
[linkedin.com/jobs/application-settings](https://www.linkedin.com/jobs/application-settings)

---

## 使用方法

### 对搜索结果排序

1. 打开 [linkedin.com/jobs](https://www.linkedin.com/jobs)，搜索目标职位
2. 点击 JobPilot 图标打开弹窗
3. 输入指令，例如：

```
根据我的简历，帮我找出当前页面最匹配的前 5 个职位。
```

```
帮我给当前页面的职位按匹配度排序。
```

JobPilot 会读取页面上的职位列表，对照你的简历评分，返回排序结果，并标注匹配原因和风险点。

### 投递职位

确认好职位后，输入：

```
帮我申请当前选中的职位。
```

或排序完成后：

```
帮我申请推荐列表里前 3 个 Easy Apply 职位。
```

JobPilot 会自动：
- 找到并点击 Easy Apply 按钮
- 填写联系方式、选择简历、回答筛选问题、填写薪资期望
- 在审核页面停下来，显示 **`[CONFIRM REQUIRED]`**

确认提交：
```
confirm submit
```

取消：
```
cancel
```

### 分析单个职位

打开某个 LinkedIn 职位页面，输入：

```
分析这个职位。
```

JobPilot 会根据你的简历给出匹配评级（A/B/C/D）和分析理由。

---

## Easy Apply 自动填写规则

| 字段类型 | 处理方式 |
|---|---|
| 经验年限（数字字段） | 填写 `1`（年） |
| 工作授权 / 签证身份下拉 | 填写 `No` |
| 经验 / 熟练度下拉 | 填写 `Yes` |
| 薪资 / 薪酬字段 | 填写 `10000` |
| 是/否单选 | 选择 `Yes` |
| 简历选择 | 自动选择 LinkedIn 上第一份已上传的简历 |
| 开放性文字题 | 留空，需手动填写 |

无法可靠推断的字段会留空。如果有必填字段仍为空，流程会暂停并提示。

---

## 当前限制

- **仅支持 LinkedIn Easy Apply。** 点击申请后跳转到 Workday、Greenhouse、Lever、Ashby 或公司官网的职位不支持自动投递——JobPilot 会检测到并提示手动完成。
- 开放性文字题（如"为什么想加入这家公司"）需手动填写。
- 不保证每次都能完整完成投递，表单结构异常或包含验证步骤时可能需要手动干预。

---

## 使用注意事项

- **每次提交都需要人工确认。** JobPilot 永远不会在没有你回复 `confirm submit` 的情况下提交申请，这是硬编码限制。
- **确认前请仔细查看表单。** 检查工作授权、薪资期望、经验年限等字段是否符合你的实际情况。
- **API Key 存储在本地。** 密钥保存在 Chrome 的插件专属存储空间中，不会上传到任何地方，只会直接发送给你配置的模型服务。
- **简历数据属于个人隐私。** 简历内容仅在排序或分析职位时发送给你的模型服务，请选择你信任的服务商。
- **请合理使用。** 遵守 LinkedIn 使用条款，不建议批量投递大量不相关职位。

---

## Roadmap

- 更好地处理 Easy Apply 特殊问题类型
- 针对高匹配度职位自动生成求职信
- 投递记录管理与去重
- 多版本简历管理
- 支持更多模型服务商
- 部分支持特定外部 ATS 平台（Greenhouse、Lever）

---

## 免责声明

本项目仅用于个人效率提升和研究学习。用户需自行对使用方式负责。本项目不保证投递成功，也不对账号限制、投递失败、错误提交或其他使用后果负责。
