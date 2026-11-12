/** Error raised when a public data service fails or times out. */
export class UpstreamError extends Error {
  constructor(
    public service: string,
    message: string,
  ) {
    super(`${service}: ${message}`);
    this.name = 'UpstreamError';
  }
}

const USER_AGENT = 'TractTrack/0.1 (land research app)';

export interface FetchOptions {
  service: string;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  /** Sent as application/x-www-form-urlencoded. */
  form?: Record<string, string>;
  /** Sent as application/json. */
  json?: unknown;
  retries?: number;
}

/** Fetches JSON from a public service with a timeout and one retry on transient failure. */
export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const { service, timeoutMs = 20_000, retries = 1 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
      let body: string | undefined;
      if (opts.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(opts.form).toString();
      } else if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
      }
      const res = await fetch(url, {
        method: opts.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        // 4xx is our request's fault; retrying will not help.
        if (res.status < 500) throw new UpstreamError(service, `HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new UpstreamError(service, 'returned a non-JSON response');
      }
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      lastError = err;
    }
  }
  const reason =
    lastError instanceof Error && lastError.name === 'TimeoutError'
      ? 'timed out'
      : lastError instanceof Error
        ? lastError.message
        : 'request failed';
  throw new UpstreamError(service, reason);
}
