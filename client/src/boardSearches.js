export const BOARD_SEARCHES = [
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

export function selectedModules(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function searchTerms(q, modules) {
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

export function openBoardSearches(ids, draft) {
  const wanted = new Set((ids || []).filter(Boolean));
  const modules = selectedModules(draft && draft.module);
  for (const board of BOARD_SEARCHES) {
    if (!wanted.has(board.id)) continue;
    const url = board.buildUrl({ q: draft && draft.q, modules });
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
