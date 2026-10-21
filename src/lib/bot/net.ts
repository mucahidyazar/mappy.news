import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Addresses the bot must never fetch: loopback, private, link-local and other special ranges. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("ff")
  );
}

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  /** Tests inject a resolver; production resolves through DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function assertPublicUrl(url: URL, resolve: (hostname: string) => Promise<string[]>) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError(`Protocol ${url.protocol} is not allowed`);
  if (url.username || url.password) throw new FetchBlockedError("Credentials in URLs are not allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await resolve(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new FetchBlockedError(`${hostname} resolves to a private address`);
}

/**
 * Decodes a fetched document. The charset comes from the Content-Type header, else from the XML declaration
 * (Turkish feeds still use ISO-8859-9 / windows-1254), else UTF-8.
 */
export function decodeBody(buffer: Uint8Array, contentType: string | null): string {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(new TextDecoder("latin1").decode(buffer.subarray(0, 256)))?.[1];
  try {
    return new TextDecoder(declared?.toLowerCase() ?? "utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/**
 * Fetches a public web resource for the bot: only http(s), never private networks (checked again on every
 * redirect), bounded time and size. Returns the body as text with the final response.
 */
export async function safeFetchText(input: string, options: SafeFetchOptions = {}): Promise<{ response: Response; body: string; url: string }> {
  const resolve = options.resolve ?? defaultResolve;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  let url = new URL(input);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  for (let redirects = 0; ; redirects += 1) {
    await assertPublicUrl(url, resolve);
    const response = await fetchImpl(url, { headers: options.headers, redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (redirects >= (options.maxRedirects ?? 3)) throw new FetchBlockedError("Too many redirects");
      url = new URL(response.headers.get("location")!, url);
      continue;
    }
    if (!response.body) return { response, body: "", url: url.toString() };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new FetchBlockedError(`Response larger than ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { response, body: decodeBody(buffer, response.headers.get("content-type")), url: url.toString() };
  }
}

export const BOT_USER_AGENT = "mappy.news-bot/1.0 (+https://mappy.news/about)";
