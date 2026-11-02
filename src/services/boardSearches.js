const BOARD_SEARCHES = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    buildUrl({ q, modules }) {
      return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerms(q, modules))}`;
    },
  },
  {
    id: 'indeed',
    name: 'Indeed',
    buildUrl({ q, modules }) {
      return `https://www.indeed.com/jobs?q=${encodeURIComponent(searchTerms(q, modules))}`;
    },
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    buildUrl({ q, modules }) {
      return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(searchTerms(q, modules))}`;
    },
  },
];

function selectedModules(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function searchTerms(q, modules) {
  const parts = [];
  const query = String(q || '').trim();
  const mods = selectedModules(modules);
  if (query) parts.push(query);
  if (mods.length) {
    for (const mod of mods) parts.push(`Oracle ${mod}`);
  } else if (!query) {
    parts.push('Oracle Cloud HCM');
  }
  return parts.join(' ');
}

function moduleFilter(value) {
  const modules = selectedModules(value).slice(0, 20);
  if (!modules.length) return null;
  if (modules.length === 1) return modules[0];
  return { $in: modules };
}

module.exports = {
  BOARD_SEARCHES,
  selectedModules,
  searchTerms,
  moduleFilter,
};
