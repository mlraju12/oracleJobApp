const { htmlToText } = require('./text');
const { fetchPublic } = require('./publicFetch');

const DELOITTE_HOST = 'apply.deloitte.com';
const EY_HOST = 'careers.ey.com';
const PWC_HOST = 'jobs-us.pwc.com';

function decodeHref(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

function absoluteUrl(raw, base) {
  try {
    return new URL(decodeHref(raw), base).toString();
  } catch {
    return '';
  }
}

function tagValue(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  return match[1]
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();
}

function rssItems(xml) {
  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: htmlToText(tagValue(match[1], 'title')),
    link: decodeHref(tagValue(match[1], 'link')).trim(),
    description: htmlToText(tagValue(match[1], 'description')),
  })).filter((item) => item.link);
}

function sameHostLinks(html, base, host, pattern) {
  const found = [];
  for (const match of String(html || '').matchAll(/href=["']([^"']+)["']/gi)) {
    const url = absoluteUrl(match[1], base);
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.hostname.toLowerCase() !== host) continue;
    if (!pattern.test(`${parsed.pathname}${parsed.search}`)) continue;
    found.push(url.split('#')[0]);
  }
  return [...new Set(found)];
}

function jsonArrayAfter(html, anchor) {
  const origin = String(html || '').indexOf(anchor);
  if (origin < 0) return [];
  const key = String(html).indexOf('"jobs":', origin);
  if (key < 0) return [];
  const start = String(html).indexOf('[', key);
  if (start < 0) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function pwcIdentity(url) {
  const match = String(url || '').match(/\/([^/?#]+)_([A-Za-z0-9]+)(?:\?|#|$)/);
  if (!match) return { title: '', sourceJobId: '' };
  return {
    title: match[1].replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(),
    sourceJobId: match[2],
  };
}

function pwcLocation(url) {
  const match = String(url || '').match(/\/job\/([A-Z]{2})-([^/?#]+)\//);
  if (!match) return [];
  const locality = match[2].replace(/-/g, ' ').trim();
  if (!locality) return [];
  return [{ label: `${locality}, ${match[1]}`, locality, region: match[1], country: null }];
}

function mapPwcJobs(html) {
  const jobs = jsonArrayAfter(html, 'eagerLoadRefineSearch');
  const totalMatch = String(html || '').match(/"totalHits"\s*:\s*(\d+)/);
  const totalHits = totalMatch ? Number(totalMatch[1]) : null;
  const listings = jobs.map((job) => {
    const identity = pwcIdentity(job.applyUrl);
    const title = typeof job.title === 'string' && job.title.trim() ? job.title.trim() : identity.title;
    return {
      sourceJobId: identity.sourceJobId,
      canonicalUrl: job.applyUrl || null,
      title,
      descriptionText: typeof job.descriptionTeaser === 'string' ? job.descriptionTeaser : '',
      employmentType: job.type || null,
      locations: pwcLocation(job.applyUrl),
    };
  }).filter((job) => job.sourceJobId && job.canonicalUrl);
  return { listings, totalHits };
}

async function readPage(url, deps, host) {
  const response = await fetchPublic(url, {
    ...deps,
    allowedHosts: [host],
    accept: 'text/html, application/rss+xml, application/xml;q=0.8',
    maxBytes: 3_000_000,
  });
  return response.body || '';
}

async function collectDeloitte(source, deps) {
  const searchUrl = (source.adapterConfig && source.adapterConfig.searchUrl)
    || 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM';
  const feedUrl = (source.adapterConfig && source.adapterConfig.feedUrl)
    || 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM/feed/?jobRecordsPerPage=10';
  const pause = deps.minIntervalMs != null ? deps.minIntervalMs : 400;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxPages = deps.maxPages || 6;
  const pages = [searchUrl];
  const seenPages = new Set();
  const links = new Map();
  let requests = 0;
  while (pages.length && seenPages.size < maxPages) {
    const pageUrl = pages.shift();
    if (seenPages.has(pageUrl)) continue;
    seenPages.add(pageUrl);
    if (requests && pause) await sleep(pause);
    const html = await readPage(pageUrl, deps, DELOITTE_HOST);
    requests += 1;
    for (const href of sameHostLinks(html, pageUrl, DELOITTE_HOST, /\/careers\/JobDetail\//i)) {
      const idMatch = href.match(/\/(\d+)\/?$/);
      if (!idMatch || links.has(idMatch[1])) continue;
      links.set(idMatch[1], href);
    }
    for (const href of sameHostLinks(html, pageUrl, DELOITTE_HOST, /jobOffset=\d+/i)) {
      if (!seenPages.has(href) && !pages.includes(href)) pages.push(href);
    }
  }
  if (pause) await sleep(pause);
  const feed = await readPage(feedUrl, deps, DELOITTE_HOST);
  requests += 1;
  const descriptions = new Map();
  for (const item of rssItems(feed)) {
    const idMatch = item.link.match(/\/(\d+)\/?$/);
    if (idMatch) descriptions.set(idMatch[1], item);
  }
  const listings = [...links.entries()].map(([id, href]) => {
    const fromFeed = descriptions.get(id);
    return {
      sourceJobId: id,
      canonicalUrl: href,
      title: fromFeed && fromFeed.title ? fromFeed.title : `Deloitte role ${id}`,
      descriptionText: fromFeed ? fromFeed.description : '',
    };
  });
  const detailCap = deps.detailCap || 25;
  const warnings = [];
  let detailed = 0;
  for (const listing of listings) {
    if (detailed >= detailCap) break;
    if ((listing.descriptionText || '').length >= 180) continue;
    if (pause) await sleep(pause);
    requests += 1;
    detailed += 1;
    try {
      const html = await readPage(listing.canonicalUrl, deps, DELOITTE_HOST);
      const text = htmlToText(html).slice(0, 20000);
      if (text.length > (listing.descriptionText || '').length) listing.descriptionText = text;
      if (!listing.title || listing.title.startsWith('Deloitte role')) {
        const title = htmlToText(tagValue(html, 'title')).replace(/\s*[-|]\s*Deloitte.*$/i, '').trim();
        if (title) listing.title = title;
      }
    } catch (error) {
      warnings.push(error.message);
    }
  }
  const described = listings.filter((item) => item.descriptionText).length;
  const thin = listings.filter((item) => (item.descriptionText || '').length < 180).length;
  const complete = pages.length === 0 && described === listings.length && thin === 0 && warnings.length === 0 && seenPages.size < maxPages;
  return {
    listings,
    complete,
    applyAbsencePolicy: complete,
    pages: seenPages.size,
    requests,
    warnings: warnings.concat(described === listings.length ? [] : ['Some Deloitte results had a public link without a description in the feed.']),
    completeness: {
      kind: 'deloitte.public-search',
      fetched: listings.length,
      described,
      verified: complete,
    },
  };
}

async function collectEy(source, deps) {
  const searchUrl = (source.adapterConfig && source.adapterConfig.searchUrl)
    || 'https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0';
  const pause = deps.minIntervalMs != null ? deps.minIntervalMs : 400;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxPages = deps.maxPages || 4;
  const detailCap = deps.detailCap || 30;
  const queue = [searchUrl];
  const seenPages = new Set();
  const jobs = new Map();
  let requests = 0;
  while (queue.length && seenPages.size < maxPages) {
    const pageUrl = queue.shift();
    if (seenPages.has(pageUrl)) continue;
    seenPages.add(pageUrl);
    if (requests && pause) await sleep(pause);
    const html = await readPage(pageUrl, deps, EY_HOST);
    requests += 1;
    for (const href of sameHostLinks(html, pageUrl, EY_HOST, /\/ey\/job\//i)) {
      const idMatch = href.match(/\/(\d+)\/?$/);
      if (!idMatch) continue;
      jobs.set(idMatch[1], href);
    }
    for (const href of sameHostLinks(html, pageUrl, EY_HOST, /startrow=\d+/i)) {
      if (!seenPages.has(href) && !queue.includes(href)) queue.push(href);
    }
  }
  const selected = [...jobs.entries()].slice(0, detailCap);
  const listings = [];
  const warnings = [];
  for (const [id, href] of selected) {
    if (pause) await sleep(pause);
    requests += 1;
    try {
      const html = await readPage(href, deps, EY_HOST);
      const title = htmlToText(tagValue(html, 'title'))
        .replace(/\s+Job Details\s*$/i, '')
        .replace(/\s+Stellendetails\s*$/i, '')
        .replace(/\s+Detalles del puesto\s*$/i, '')
        .replace(/\s*[-|]\s*EY\s*$/i, '')
        .trim();
      listings.push({
        sourceJobId: id,
        canonicalUrl: href,
        title: title || `EY role ${id}`,
        descriptionText: htmlToText(html).slice(0, 20000),
      });
    } catch (error) {
      warnings.push(error.message);
    }
  }
  const complete = queue.length === 0 && jobs.size <= detailCap && warnings.length === 0 && seenPages.size < maxPages;
  return {
    listings,
    complete,
    applyAbsencePolicy: complete,
    pages: seenPages.size,
    requests,
    warnings,
    error: warnings.length ? 'One or more EY job pages could not be read.' : '',
    completeness: {
      kind: 'ey.public-search',
      fetched: jobs.size,
      detailed: listings.length,
      verified: complete,
    },
  };
}

async function collectPwc(source, deps) {
  const searchUrl = (source.adapterConfig && source.adapterConfig.searchUrl)
    || 'https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM';
  const html = await readPage(searchUrl, deps, PWC_HOST);
  const mapped = mapPwcJobs(html);
  const complete = mapped.totalHits != null && mapped.listings.length >= mapped.totalHits;
  return {
    listings: mapped.listings,
    complete,
    applyAbsencePolicy: complete,
    pages: 1,
    requests: 1,
    warnings: complete ? [] : ['The public PwC search page did not include every hit in the first response.'],
    completeness: {
      kind: 'pwc.public-search',
      fetched: mapped.listings.length,
      reported: mapped.totalHits,
      verified: complete,
    },
  };
}

async function collectPublicSearch(source, deps) {
  const provider = source.adapterConfig && source.adapterConfig.provider;
  if (provider === 'deloitte') return collectDeloitte(source, deps);
  if (provider === 'ey') return collectEy(source, deps);
  if (provider === 'pwc') return collectPwc(source, deps);
  const error = new Error('This Big 5 career site has no documented public job feed.');
  error.retryable = false;
  throw error;
}

module.exports = {
  rssItems,
  mapPwcJobs,
  pwcIdentity,
  collectPublicSearch,
};
