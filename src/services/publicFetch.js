const { assertSafeOutboundUrl, UnsafeUrlError } = require('./outbound');

const USER_AGENT = 'SLPMicrosystems-OracleHCMOpportunities/1.0';

class SourceFetchError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SourceFetchError';
    this.retryable = options.retryable !== false;
    this.statusCode = options.statusCode || 0;
  }
}

function delay(ms, sleep) {
  const wait = sleep || ((value) => new Promise((resolve) => setTimeout(resolve, value)));
  return wait(ms);
}

async function fetchPublic(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const retries = options.retries != null ? options.retries : 3;
  const backoffMs = options.backoffMs != null ? options.backoffMs : 500;
  const maxBytes = options.maxBytes || 2_000_000;
  const timeoutMs = options.timeoutMs || 20000;
  let url = assertSafeOutboundUrl(rawUrl, options).toString();
  let attempt = 0;
  let lastError = null;

  while (attempt < retries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: options.accept || 'application/json, text/html;q=0.8',
          'user-agent': USER_AGENT,
        },
        signal: options.signal || controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get('location');
        if (!next || attempt > 3) throw new SourceFetchError('Redirect could not be followed safely.', { retryable: false, statusCode: response.status });
        url = assertSafeOutboundUrl(new URL(next, url).toString(), options).toString();
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 60000) : Math.min(backoffMs * (2 ** (attempt - 1)), 30000);
        lastError = new SourceFetchError(`Source responded ${response.status}.`, { retryable: true, statusCode: response.status });
        if (attempt >= retries) throw lastError;
        await delay(wait, options.sleep);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new SourceFetchError('Source denied access. This adapter will not bypass login or access controls.', {
          retryable: false,
          statusCode: response.status,
        });
      }
      if (response.status === 404) {
        throw new SourceFetchError('Source URL was not found.', { retryable: false, statusCode: 404 });
      }
      if (!response.ok) {
        throw new SourceFetchError(`Source responded ${response.status}.`, { retryable: false, statusCode: response.status });
      }
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      let body = '';
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
          if (received > maxBytes) {
            throw new SourceFetchError('Source response exceeded the size limit.', { retryable: false, statusCode: response.status });
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } else {
        body = await response.text();
        if (Buffer.byteLength(body) > maxBytes) {
          throw new SourceFetchError('Source response exceeded the size limit.', { retryable: false, statusCode: response.status });
        }
      }
      return { status: response.status, body, url };
    } catch (error) {
      if (error instanceof UnsafeUrlError || (error instanceof SourceFetchError && !error.retryable)) throw error;
      lastError = error instanceof SourceFetchError
        ? error
        : new SourceFetchError(error.name === 'AbortError' ? 'Source request timed out.' : 'Source request failed.', { retryable: true });
      if (attempt >= retries) throw lastError;
      await delay(Math.min(backoffMs * (2 ** (attempt - 1)), 30000), options.sleep);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new SourceFetchError('Source request failed.');
}

async function fetchJson(url, options = {}) {
  const response = await fetchPublic(url, { ...options, accept: 'application/json', maxBytes: options.maxBytes || 25_000_000 });
  try {
    return { ...response, json: JSON.parse(response.body) };
  } catch {
    throw new SourceFetchError('Source response was not valid JSON.', { retryable: false, statusCode: response.status });
  }
}

module.exports = {
  USER_AGENT,
  SourceFetchError,
  fetchPublic,
  fetchJson,
};
