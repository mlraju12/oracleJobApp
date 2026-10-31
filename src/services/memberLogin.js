const { assertSafeOutboundUrl } = require('./outbound');
const { USER_AGENT } = require('./publicFetch');

const MEMBER_SITES = {
  'public:pwc-talent-exchange': { host: 'talentexchange.pwc.com' },
  'public:kpmg-contingent': { host: 'us.kpmg.talentnet.community' },
  'public:ey-gignow': { host: 'www.gignow.com' },
  'public:deloitte-open-talent': { host: 'www.deloitte.com' },
  'public:accenture-contractor-exchange': { host: 'www.accenture.com' },
};

const UNAVAILABLE = 'Sign-in was saved. This page does not include a password form the app can submit.';
const REJECTED = 'The site did not accept the sign-in.';
const SIGNED_IN = 'Signed in. The page still does not include the role requirements.';

function memberSite(catalogKey) {
  return MEMBER_SITES[catalogKey] || null;
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return '';
  return match[2] ?? match[3] ?? match[4] ?? '';
}

function sameHost(left, right) {
  return new URL(left).host === new URL(right).host;
}

function passwordForm(html, pageUrl) {
  const forms = String(html || '').match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  const form = forms.find((candidate) => /type\s*=\s*["']password["']/i.test(candidate));
  if (!form) return null;
  const method = (attr(form, 'method') || 'get').toLowerCase();
  if (method !== 'post') return null;
  const actionValue = attr(form, 'action');
  const action = new URL(actionValue || pageUrl, pageUrl);
  if (!sameHost(action, pageUrl)) return null;
  const fields = [];
  for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
    const name = attr(tag, 'name');
    if (!name) continue;
    fields.push({
      name,
      type: (attr(tag, 'type') || 'text').toLowerCase(),
      value: attr(tag, 'value') || '',
    });
  }
  const passwordField = fields.find((field) => field.type === 'password');
  const usernameField = fields.find((field) => field.type === 'email')
    || fields.find((field) => /user|email|login/i.test(field.name) && field.type !== 'password' && field.type !== 'hidden')
    || fields.find((field) => field.type === 'text');
  if (!passwordField || !usernameField) return null;
  return { action: action.toString(), fields, usernameField: usernameField.name, passwordField: passwordField.name };
}

async function readText(response) {
  const text = await response.text();
  if (Buffer.byteLength(text) > 1_000_000) {
    const error = new Error('Sign-in response was too large.');
    error.code = 'login_response';
    throw error;
  }
  return text;
}

async function attemptMemberLogin({ loginUrl, username, password, fetchImpl }) {
  const fetchPage = fetchImpl || global.fetch;
  const start = assertSafeOutboundUrl(loginUrl).toString();
  let pageUrl = start;
  let body = '';
  let status = 0;
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchPage(pageUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
    });
    status = response.status;
    if (status >= 300 && status < 400) {
      const next = response.headers.get('location');
      if (!next || !sameHost(new URL(next, pageUrl), start)) break;
      pageUrl = assertSafeOutboundUrl(new URL(next, pageUrl).toString()).toString();
      continue;
    }
    body = await readText(response);
    break;
  }
  const form = status === 200 ? passwordForm(body, pageUrl) : null;
  if (!form) return { status: 'unavailable', message: UNAVAILABLE };
  const payload = new URLSearchParams();
  for (const field of form.fields) {
    if (field.name === form.usernameField) payload.set(field.name, username);
    else if (field.name === form.passwordField) payload.set(field.name, password);
    else if (field.type === 'hidden') payload.set(field.name, field.value);
  }
  const posted = await fetchPage(form.action, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      accept: 'text/html',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
    },
    body: payload.toString(),
  });
  const postedStatus = posted.status;
  const location = posted.headers.get('location');
  const postedBody = postedStatus >= 300 && postedStatus < 400 ? '' : await readText(posted);
  const stillAsking = /type\s*=\s*["']password["']/i.test(postedBody);
  const stayed = !location || sameHost(new URL(location, form.action), start);
  if (postedStatus === 200 && !stillAsking && stayed) return { status: 'signed_in', message: SIGNED_IN };
  if (postedStatus >= 300 && postedStatus < 400 && location && stayed && !stillAsking) return { status: 'signed_in', message: SIGNED_IN };
  if (postedStatus === 401 || postedStatus === 403 || stillAsking) return { status: 'rejected', message: REJECTED };
  return { status: 'unavailable', message: UNAVAILABLE };
}

module.exports = {
  MEMBER_SITES,
  memberSite,
  passwordForm,
  attemptMemberLogin,
};
