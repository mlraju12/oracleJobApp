const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const OBFUSCATED = /([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\))\s*((?:[A-Z0-9-]+\s*(?:\[dot\]|\(dot\))\s*)+[A-Z]{2,})/gi;
const BLOCKED_LOCAL = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'bounce', 'notifications']);
const BLOCKED_DOMAIN = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'localhost', 'schema.org', 'sentry.io', 'wixpress.com']);
const FILE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'css', 'js', 'webp']);

function remember(found, raw) {
  const email = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return;
  const [local, domain] = email.split('@');
  const tld = domain.split('.').pop();
  if (BLOCKED_LOCAL.has(local) || BLOCKED_DOMAIN.has(domain) || FILE_TLDS.has(tld)) return;
  if (local.length > 64 || domain.length > 253) return;
  if (!found.includes(email)) found.push(email);
}

function publishedEmails(text) {
  const found = [];
  const source = String(text || '');
  for (const match of source.matchAll(EMAIL)) remember(found, match[0]);
  for (const match of source.matchAll(OBFUSCATED)) {
    remember(found, `${match[1]}@${match[2].replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, '.')}`);
  }
  return found.slice(0, 3);
}

function emailDraft(opportunity, resumeFileName) {
  const emails = publishedEmails(opportunity && opportunity.descriptionText);
  if (!emails.length) return null;
  const email = emails[0];
  const title = opportunity.title || 'the role';
  const employer = opportunity.employerName || 'the employer';
  const url = opportunity.canonicalUrl || '';
  const resumeLine = resumeFileName
    ? `I will attach my resume (${resumeFileName}) to this message.`
    : 'I will attach my resume to this message.';
  const body = [
    'Hello,',
    '',
    `I am interested in the ${title} role at ${employer}.`,
    url ? `The posting is ${url}.` : null,
    '',
    resumeLine,
    '',
    'Thank you.',
  ].filter((line) => line != null).join('\n');
  const subject = `Application for ${title}`.slice(0, 180);
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return {
    email,
    emails,
    subject,
    body,
    mailto,
    note: 'This opens your mail program with a draft. Attach the resume saved in this account. This app does not send the message.',
  };
}

module.exports = {
  publishedEmails,
  emailDraft,
};
