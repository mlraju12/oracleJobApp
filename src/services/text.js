const crypto = require('crypto');

function decodeEntities(value) {
  let current = String(value || '');
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current
      .replace(/&nbsp;/gi, ' ')
      .replace(/&mdash;/gi, '—')
      .replace(/&ndash;/gi, '–')
      .replace(/&rsquo;|&lsquo;/gi, "'")
      .replace(/&rdquo;|&ldquo;/gi, '"')
      .replace(/&hellip;/gi, '...')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
        const code = parseInt(n, 16);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
    if (next === current) break;
    current = next;
  }
  return current;
}

function htmlToText(html) {
  const decoded = decodeEntities(String(html || ''));
  const stripped = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function keepLines(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function excerptAround(text, index, length) {
  const source = String(text || '');
  const start = Math.max(0, index - 60);
  const end = Math.min(source.length, index + length + 60);
  return collapse(source.slice(start, end)).slice(0, 280);
}

function findPhrase(text, pattern) {
  const source = String(text || '');
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  let match;
  while ((match = global.exec(source))) {
    const before = source.slice(Math.max(0, match.index - 16), match.index);
    if (/\b(not an|not a|not|no|without)\s+$/i.test(before)) continue;
    return match;
  }
  return null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
}

function canonicalUrl(raw) {
  const url = new URL(String(raw || '').trim());
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  const drop = [];
  for (const key of url.searchParams.keys()) {
    if (/^utm_/i.test(key) || key === 'gh_src' || key === 'lever-source') drop.push(key);
  }
  for (const key of drop) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

function employerKey(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

module.exports = {
  decodeEntities,
  htmlToText,
  collapse,
  excerptAround,
  findPhrase,
  sha256,
  escapeRegex,
  canonicalUrl,
  employerKey,
  keepLines,
};
