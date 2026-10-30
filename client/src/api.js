function csrfToken() {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('Content-Type', 'application/json');
    if (!headers.has('x-xsrf-token')) headers.set('x-xsrf-token', csrfToken());
  }
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

export async function uploadResume(file) {
  const headers = new Headers();
  headers.set('x-xsrf-token', csrfToken());
  headers.set('content-type', file.type || 'application/octet-stream');
  headers.set('x-file-name', encodeURIComponent(file.name || 'resume.pdf'));
  const response = await fetch('/api/profile/resume', {
    method: 'POST',
    headers,
    body: file,
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Upload failed.');
  return data;
}
