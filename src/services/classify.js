const { collapse, excerptAround, findPhrase } = require('./text');

const CLOUD_PATTERNS = [
  { label: 'Oracle Cloud HCM', pattern: /oracle\s+cloud\s+hcm/i },
  { label: 'Oracle Fusion HCM', pattern: /oracle\s+fusion(?:\s+cloud)?\s+hcm/i },
  { label: 'Oracle HCM Cloud', pattern: /oracle\s+hcm\s+cloud/i },
  { label: 'Fusion Cloud HCM', pattern: /fusion\s+cloud\s+hcm/i },
  { label: 'Oracle Fusion Cloud HCM context', pattern: /oracle\s+fusion\s+cloud(?=[^.]{0,80}\b(hcm|human capital|payroll|absence|core hr)\b)/i },
  { label: 'Oracle Cloud HCM module', pattern: /oracle\s+(?:cloud|fusion)(?:\s+cloud)?(?:\s+hcm)?\s+(?:payroll|absence(?:\s+management)?|time\s+(?:and|&)\s+labou?r|fast\s+formulas?|benefits|journeys)/i },
  { label: 'Oracle HCM security', pattern: /oracle\s+(?:cloud\s+hcm|fusion(?:\s+hcm)?)\s+security|\bhcm\s+security\b/i },
  { label: 'Oracle HCM reports', pattern: /oracle\s+(?:cloud|fusion)(?:\s+cloud)?\s+hcm\s+reports|oracle\s+(?:cloud|fusion)(?:\s+hcm)?\s+(?:bi\s+publisher|otbi|hcm\s+extracts?)/i },
];

const EBS_PATTERNS = [
  { label: 'Oracle E-Business Suite', pattern: /e-?business suite/i },
  { label: 'Oracle EBS', pattern: /\boracle\s+ebs\b/i },
];

const PEOPLESOFT_PATTERNS = [
  { label: 'PeopleSoft', pattern: /\bpeoplesoft\b/i },
  { label: 'PeopleSoft', pattern: /\bpeople\s*soft\b/i },
];

const MODULES = [
  { id: 'Core HR', patterns: [/\bcore hr\b/i, /\bglobal hr\b/i, /\bglobal human resources\b/i, /\bworkforce structures\b/i, /\bhr help\s*desk\b/i] },
  { id: 'Payroll', patterns: [/\bpayroll\b/i, /\bus payroll\b/i] },
  { id: 'Absence', patterns: [/\babsence management\b/i, /\babsence\b/i] },
  { id: 'Time and Labor', patterns: [/\btime and labor\b/i, /\btime & labor\b/i, /\btime and labour\b/i, /\botl\b/i] },
  { id: 'Benefits', patterns: [/\bbenefits\b/i] },
  { id: 'Compensation', patterns: [/\bcompensation\b/i] },
  { id: 'Recruiting', patterns: [/\boracle recruiting\b/i, /\brecruiting cloud\b/i, /\bfusion recruiting\b/i, /\brecruiting\s*\(\s*orc\s*\)/i] },
  { id: 'Learning', patterns: [/\boracle learning\b/i, /\blearning cloud\b/i] },
  { id: 'Talent', patterns: [/\btalent management\b/i, /\boracle talent\b/i] },
  { id: 'Security', patterns: [/\bhcm security\b/i, /oracle\s+(?:cloud\s+hcm|fusion(?:\s+hcm)?)\s+security/i] },
  { id: 'Journeys', patterns: [/\bjourneys\b/i] },
  { id: 'Integrations', patterns: [/\bintegrations?\b/i, /\boracle integration cloud\b/i] },
  { id: 'HDL', patterns: [/\bhcm data loader\b/i, /\bhsdl\b/i, /\bhdl\b/i] },
  { id: 'HCM Extracts', patterns: [/\bhcm extracts?\b/i] },
  { id: 'BI Publisher', patterns: [/\bbi publisher\b/i, /\bbip reports?\b/i] },
  { id: 'Fast Formulas', patterns: [/\bfast formulas?\b/i] },
];

const SPECIFIC_MODULES = new Set(['HDL', 'HCM Extracts', 'Fast Formulas']);

const ROLE_RULES = [
  { category: 'techno_functional', label: 'Techno-functional', pattern: /techno[-\s]?functional/i },
  { category: 'payroll_operations', label: 'Payroll operations', pattern: /\bpayroll operations\b|\bpayroll (?:specialist|administrator|admin|clerk)\b/i },
  { category: 'architecture', label: 'Architecture or project leadership', pattern: /\b(solution architect|enterprise architect|project manager|program manager|engagement lead|project lead)\b/i },
  { category: 'support', label: 'Support or managed services', pattern: /\b(managed services|application managed services|\bams\b|production support|support analyst)\b/i },
  { category: 'implementation', label: 'Implementation', pattern: /\b(implementation|implementer)\b/i },
  { category: 'technical', label: 'Technical', pattern: /\b(developer|technical consultant|technical lead)\b/i },
  { category: 'functional', label: 'Functional', pattern: /\b(functional consultant|functional configuration|functional lead|functional analyst|business analyst)\b/i },
];

function matchRules(text, rules) {
  const matches = [];
  for (const rule of rules) {
    const found = findPhrase(text, rule.pattern);
    if (!found) continue;
    matches.push({
      label: rule.label || rule.id,
      category: rule.category || null,
      excerpt: excerptAround(text, found.index, found[0].length),
    });
  }
  return matches;
}

function classifyOracleHcm(input) {
  const title = collapse(input && input.title);
  const description = collapse(input && input.description);
  const text = `${title}\n${description}`;
  const cloud = matchRules(text, CLOUD_PATTERNS);
  const ebs = matchRules(text, EBS_PATTERNS);
  const peoplesoft = matchRules(text, PEOPLESOFT_PATTERNS);
  const oracleMention = findPhrase(text, /\boracle\b/i);

  let platform = 'unrelated';
  if (cloud.length && (ebs.length || peoplesoft.length)) platform = 'mixed';
  else if (cloud.length) platform = 'oracle_cloud_hcm';
  else if (ebs.length && peoplesoft.length) platform = 'ebs_and_peoplesoft';
  else if (ebs.length) platform = 'ebs_only';
  else if (peoplesoft.length) platform = 'peoplesoft_only';
  else if (oracleMention) platform = 'unrelated_oracle';

  const cloudContext = platform === 'oracle_cloud_hcm' || platform === 'mixed';
  const modules = [];
  const moduleMatches = [];
  for (const mod of MODULES) {
    if (!cloudContext && !(SPECIFIC_MODULES.has(mod.id) && oracleMention && cloud.length)) continue;
    const hits = matchRules(text, mod.patterns.map((pattern) => ({ id: mod.id, label: mod.id, pattern })));
    if (!hits.length) continue;
    if (!modules.includes(mod.id)) modules.push(mod.id);
    moduleMatches.push(hits[0]);
  }

  const roleHits = [];
  for (const rule of ROLE_RULES) {
    const found = findPhrase(text, rule.pattern);
    if (!found) continue;
    roleHits.push({
      category: rule.category,
      label: rule.label,
      excerpt: excerptAround(text, found.index, found[0].length),
    });
  }
  const has = (category) => roleHits.some((hit) => hit.category === category);
  let roleCategory = 'unknown';
  if (has('techno_functional') || (has('functional') && has('technical'))) roleCategory = 'techno_functional';
  else if (has('payroll_operations')) roleCategory = 'payroll_operations';
  else if (has('architecture')) roleCategory = 'architecture';
  else if (has('support')) roleCategory = 'support';
  else if (has('implementation')) roleCategory = 'implementation';
  else if (has('technical')) roleCategory = 'technical';
  else if (has('functional')) roleCategory = 'functional';

  const matches = [
    ...cloud.map((hit) => ({ field: 'platform', label: hit.label, excerpt: hit.excerpt })),
    ...ebs.map((hit) => ({ field: 'platform', label: hit.label, excerpt: hit.excerpt })),
    ...peoplesoft.map((hit) => ({ field: 'platform', label: hit.label, excerpt: hit.excerpt })),
    ...moduleMatches.map((hit) => ({ field: 'module', label: hit.label, excerpt: hit.excerpt })),
    ...roleHits.map((hit) => ({ field: 'role', label: hit.label, excerpt: hit.excerpt })),
  ];
  if (roleCategory === 'techno_functional' && has('functional') && has('technical') && !has('techno_functional')) {
    matches.push({
      field: 'role',
      label: 'Techno-functional (functional and technical signals)',
      excerpt: 'Both functional and technical wording is present, and the posting does not use the techno-functional label.',
    });
  }

  const relevance = scoreRelevance(title, description, platform, modules);

  let confidence = 0.35;
  if (platform === 'unrelated') confidence = 0.8;
  else if (platform === 'unrelated_oracle') confidence = 0.7;
  else if (cloudContext && roleCategory !== 'unknown' && modules.length) confidence = 0.9;
  else if (cloudContext && (roleCategory !== 'unknown' || modules.length)) confidence = 0.75;
  else if (cloudContext) confidence = 0.55;
  else if (platform === 'ebs_only' || platform === 'peoplesoft_only' || platform === 'ebs_and_peoplesoft') confidence = 0.8;

  return {
    platform,
    roleCategory,
    modules,
    matches,
    confidence,
    relevance,
  };
}

function scoreRelevance(title, description, platform, modules) {
  if (platform !== 'oracle_cloud_hcm' && platform !== 'mixed') {
    return {
      score: 0,
      mention: 'none',
      basis: 'No Oracle Cloud HCM phrase. A zero score is not a statement that the posting is closed.',
    };
  }
  const titleHit = CLOUD_PATTERNS.some((rule) => rule.pattern.test(title || ''));
  const body = String(description || '');
  const index = body.search(/oracle\s+(?:cloud|fusion|hcm)/i);
  const before = index >= 0 ? body.slice(0, index).toLowerCase() : '';
  const preferredAt = before.lastIndexOf('preferred');
  const requiredAt = Math.max(before.lastIndexOf('required'), before.lastIndexOf('requirement'), before.lastIndexOf('qualification'));
  let mention = 'body';
  if (titleHit) mention = 'title';
  else if (preferredAt > requiredAt && preferredAt >= 0) mention = 'preferred';
  else if (requiredAt >= 0) mention = 'required';
  let score = 55;
  if (mention === 'title') score = 80;
  else if (mention === 'required') score = 70;
  else if (mention === 'preferred') score = 40;
  if (mention === 'title' && modules.length) score = Math.min(95, score + 10);
  const basis = mention === 'title'
    ? 'The title names Oracle Cloud HCM, Oracle Fusion HCM, or a named Oracle Cloud HCM module. This score does not confirm the job is open.'
    : mention === 'required'
      ? 'Oracle Cloud HCM wording is in required wording, not the title. This score does not confirm the job is open.'
      : mention === 'preferred'
        ? 'Oracle Cloud HCM wording is in preferred wording. This score does not confirm the job is open.'
        : 'Oracle Cloud HCM wording is in the description. This score does not confirm the job is open.';
  return { score, mention, basis };
}

module.exports = {
  classifyOracleHcm,
  MODULES: MODULES.map((mod) => mod.id),
};
