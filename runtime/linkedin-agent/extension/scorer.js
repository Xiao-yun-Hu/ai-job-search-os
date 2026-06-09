// Scoring engine. Pure functions only — no DOM access, no storage.
// Input: JD object. Output: Score object.
// Rules source: decision_task_rules.md (hardcoded interpretation, never override from outside).

/**
 * @param {JD} jd
 * @returns {Score}
 */
function scoreJD(jd) {
  const signals = {
    salary_gate: evalSalaryGate(jd),
    ai_native: evalAINative(jd),
    role_alignment: evalRoleAlignment(jd),
    ai_systems: evalAISystems(jd),
    business_workflow: evalBusinessWorkflow(jd),
    seniority: evalSeniority(jd),
    company_context: evalCompanyContext(jd),
    vibe: evalVibe(jd),
  };
  const tier = assignTier(signals);
  const action = assignAction(tier);

  return {
    jdId: jd.id,
    scoredAt: Date.now(),
    tier,
    signals,
    reasons: buildReasons(signals, jd),
    action: action.action,
    followup: action.followup,
  };
}

/** @param {JD} jd @returns {GateResult} */
function evalSalaryGate(jd) {
  const salary = jd.salary || {};
  const min = salary.min;
  const max = salary.max;

  if (min == null && max == null) return 'unknown';
  if (max == null && min != null) return 'pass';

  const threshold = salary.currency === 'SGD' ? 6000 : 30000;
  return max < threshold ? 'fail' : 'pass';
}

/** @param {JD} jd @returns {GateResult} */
function evalAINative(jd) {
  const text = [
    jd.description || '',
    jd.company || '',
    ...(Array.isArray(jd.tags) ? jd.tags : []),
  ].join(' ').toLowerCase();
  const passKeys = [
    'agent os', 'agent framework', 'multi-agent', 'evaluation infra',
    'memory substrate', 'workflow orchestration', 'llm platform',
    'agent platform', 'decision system', '多智能体', 'agent框架',
    'agent编排', 'agentic',
  ];
  const excludeKeys = [
    '传统电商', '零售业', '制造业', '汽车', '能源', '房地产', '地产',
    'erp', 'crm', '降本增效', '智能客服', 'oa自动化', 'ai赋能',
  ];

  if (passKeys.some((key) => text.includes(key))) return 'pass';
  if (excludeKeys.some((key) => text.includes(key))) return 'fail';
  return 'unknown';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalRoleAlignment(jd) {
  const text = `${jd.title || ''} ${(jd.description || '').slice(0, 500)}`.toLowerCase();
  const strongKeys = [
    'agent architect', 'multi-agent', 'llm platform', 'ai platform architect',
    'agent engineer', 'platform architect', '智能体架构', 'agent架构',
  ];
  const mediumKeys = [
    'ai engineer', 'ml engineer', 'machine learning engineer', 'nlp engineer',
    'ai researcher', 'ai scientist',
  ];
  const hasWeakRole = ['software engineer', 'backend engineer', 'data engineer']
    .some((key) => text.includes(key));
  const hasWeakAI = text.includes('ai') || text.includes('llm');

  if (strongKeys.some((key) => text.includes(key))) return 'strong';
  if (mediumKeys.some((key) => text.includes(key))) return 'medium';
  if (hasWeakRole && hasWeakAI) return 'weak';
  return 'unknown';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalAISystems(jd) {
  const text = [
    jd.description || '',
    ...(Array.isArray(jd.tags) ? jd.tags : []),
  ].join(' ').toLowerCase();
  const strongKeys = [
    'agent framework', 'multi-agent', 'rag', 'evaluation pipeline',
    'eval infra', 'memory system', 'orchestration', 'function calling',
    'langchain', 'langraph', 'autogen', '编排', '知识图谱',
  ];
  const mediumKeys = [
    'llm integration', 'prompt engineering', 'fine-tuning',
    'vector database', 'embedding', '大模型',
  ];
  const strongHits = strongKeys.filter((key) => text.includes(key)).length;

  if (strongHits >= 2) return 'strong';
  if (strongHits >= 1) return 'medium';
  if (mediumKeys.some((key) => text.includes(key))) return 'medium';
  if (text.includes('ai') || text.includes('machine learning')) return 'weak';
  return 'unknown';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalBusinessWorkflow(jd) {
  const text = (jd.description || '').toLowerCase();
  const strongKeys = [
    'end-to-end', 'platform-level', 'cross-functional', 'technical lead',
    'architect the', 'own the', '负责设计', '全链路', '平台级',
  ];
  const mediumKeys = [
    'work with pm', 'collaborate with', 'feature ownership', '参与设计',
  ];

  if (text.length < 100) return 'unknown';
  if (strongKeys.some((key) => text.includes(key))) return 'strong';
  if (mediumKeys.some((key) => text.includes(key))) return 'medium';
  return 'weak';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalSeniority(jd) {
  const text = `${jd.title || ''} ${jd.description || ''}`.toLowerCase();
  const strongKeys = [
    '8+ year', '10+ year', 'staff engineer', 'principal', 'architect',
    'tech lead', 'senior staff', '8年', '10年', '资深', '专家',
  ];
  const mediumKeys = [
    '5+ year', '6+ year', '7+ year', 'senior', 'mid-senior',
    '5年', '6年', '7年',
  ];
  const weakKeys = [
    '0-3 year', '1-2 year', 'junior', 'entry', 'fresh', '应届', '初级',
  ];

  if (strongKeys.some((key) => text.includes(key))) return 'strong';
  if (mediumKeys.some((key) => text.includes(key))) return 'medium';
  if (weakKeys.some((key) => text.includes(key))) return 'weak';
  return 'unknown';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalCompanyContext(jd) {
  const text = `${jd.description || ''} ${jd.company || ''}`.toLowerCase();
  const aiSignals = ['agent', 'llm', 'ai-native', 'ai native'];
  const strongStage = [
    'series a', 'series b', 'seed stage', 'early stage', 'founding team',
    'a轮', 'b轮', '初创',
  ];
  const mediumKeys = [
    'series c', 'series d', 'well-funded', 'anthropic', 'openai',
    'mistral', 'cohere', 'together ai', 'c轮',
  ];
  const weakKeys = [
    'alibaba', 'tencent', 'baidu', 'bytedance', 'microsoft', 'google',
    'amazon', '阿里', '腾讯', '百度', '字节',
  ];

  if (strongStage.some((key) => text.includes(key)) &&
      aiSignals.some((key) => text.includes(key))) {
    return 'strong';
  }
  if (mediumKeys.some((key) => text.includes(key))) return 'medium';
  if (weakKeys.some((key) => text.includes(key))) return 'weak';
  return 'unknown';
}

/** @param {JD} jd @returns {SignalStrength} */
function evalVibe(jd) {
  const text = (jd.description || '').toLowerCase();
  const weakKeys = ['on-site only', '996', 'overtime required', '线下办公', '坐班'];
  const strongKeys = [
    'remote', 'hybrid', 'async', 'flexible', 'work from anywhere', '远程', '弹性',
  ];

  if (text.length < 50) return 'unknown';
  if (weakKeys.some((key) => text.includes(key))) return 'weak';
  if (strongKeys.some((key) => text.includes(key))) return 'strong';
  return 'medium';
}

/** @param {Signals} signals @returns {Tier} */
function assignTier(signals) {
  const values = Object.values(signals);
  const unknownCount = values.filter((value) => value === 'unknown').length;
  const strongCount = values.filter((value) => value === 'strong').length;
  const role = signals.role_alignment;
  const aiSys = signals.ai_systems;
  const biz = signals.business_workflow;
  const sen = signals.seniority;
  const co = signals.company_context;
  const vibe = signals.vibe;

  if (values.includes('fail')) return 'D';
  if (unknownCount >= 3 && (role === 'unknown' || aiSys === 'unknown')) return 'pending';
  if (role === 'strong' &&
      ['strong', 'medium'].includes(aiSys) &&
      biz === 'strong' &&
      ['strong', 'medium'].includes(sen) &&
      ['strong', 'medium'].includes(co) &&
      ['strong', 'medium'].includes(vibe)) {
    return 'A';
  }
  if (['strong', 'medium'].includes(role) &&
      ['strong', 'medium'].includes(aiSys) &&
      strongCount >= 2) {
    return 'B';
  }
  return 'C';
}

/** @param {Tier} tier @returns {{ action: Action, followup: boolean }} */
function assignAction(tier) {
  const MAP = {
    A: { action: 'apply', followup: true },
    B: { action: 'apply', followup: false },
    C: { action: 'save', followup: false },
    D: { action: 'skip', followup: false },
    pending: { action: 'review', followup: false },
  };
  return MAP[tier];
}

/**
 * @param {Signals} signals
 * @param {JD} jd
 * @returns {string[]}
 */
function buildReasons(signals, jd) {
  const reasons = [];
  const labels = {
    salary_gate: 'salary',
    ai_native: 'ai-native',
    role_alignment: 'role alignment',
    ai_systems: 'ai systems',
    business_workflow: 'business workflow',
    seniority: 'seniority',
    company_context: 'company context',
    vibe: 'vibe',
  };

  Object.keys(labels).forEach((key) => {
    const value = signals[key];
    if (value === 'unknown') return;

    if (key === 'salary_gate') {
      const salary = jd.salary || {};
      const currency = salary.currency && salary.currency !== 'unknown'
        ? ` ${salary.currency}`
        : '';
      let range = '';
      const min = salary.min;
      const max = salary.max;

      if (min != null || max != null) {
        const minText = min == null
          ? null
          : min >= 1000
            ? `${Number.isInteger(min / 1000) ? min / 1000 : +(min / 1000).toFixed(1)}K`
            : String(min);
        const maxText = max == null
          ? null
          : max >= 1000
            ? `${Number.isInteger(max / 1000) ? max / 1000 : +(max / 1000).toFixed(1)}K`
            : String(max);

        if (minText && maxText) {
          const displayMin = minText.endsWith('K') && maxText.endsWith('K')
            ? minText.slice(0, -1)
            : minText;
          range = ` (${displayMin}-${maxText}${currency})`;
        }
        else if (minText) range = ` (${minText}+${currency})`;
        else if (maxText) range = ` (up to ${maxText}${currency})`;
      } else if (salary.raw) {
        range = ` (${salary.raw})`;
      }

      reasons.push(`${labels[key]}: ${value}${range}`);
      return;
    }

    reasons.push(`${labels[key]}: ${value}`);
  });

  return reasons;
}
