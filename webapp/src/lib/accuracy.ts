export type RequestMetadata = { ip: string; ua: string };

export type OpenClassification = {
  type: "prefetch" | "open";
  isProxy: boolean;
  confidence: number;
};

export type ClientType = "desktop" | "mobile" | "proxy" | "unknown";

const GOOGLE_PROXY_RANGES = [
  "64.18.0.0/20", "64.233.160.0/19", "66.102.0.0/20", "66.249.80.0/20",
  "72.14.192.0/18", "74.125.0.0/16", "108.177.0.0/17", "142.250.0.0/15",
  "172.217.0.0/16", "173.194.0.0/16", "209.85.128.0/17", "216.58.192.0/19",
  "216.239.32.0/19",
];

function ipv4ToNumber(ip: string): number | null {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets[0] * 2 ** 24 + octets[1] * 2 ** 16 + octets[2] * 2 ** 8 + octets[3];
}

function isInCidr(ip: string, cidr: string): boolean {
  const [network, prefixText] = cidr.split("/");
  const address = ipv4ToNumber(ip);
  const networkAddress = ipv4ToNumber(network);
  const prefix = Number(prefixText);
  if (address === null || networkAddress === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(address / blockSize) === Math.floor(networkAddress / blockSize);
}

export function isGoogleProxyUserAgent(ua: string): boolean {
  return /GoogleImageProxy|via ggpht\.com/i.test(ua);
}

export function isGoogleProxyIp(ip: string): boolean {
  return GOOGLE_PROXY_RANGES.some((range) => isInCidr(ip, range));
}

function isAppleMailPrivacyRequest({ ip, ua }: RequestMetadata): boolean {
  return /^17\./.test(ip) || /\bApple ?Mail\b/i.test(ua);
}

const MOBILE_UA_PATTERN = /Mobile|Android|iPhone|iPad|iPod/i;
const DESKTOP_UA_PATTERN = /Windows NT|Macintosh|X11|CrOS/i;

// Never stores the raw UA — just buckets it into a coarse, non-identifying
// category so the dashboard can show "opened on mobile" without keeping
// anything that could fingerprint a specific recipient device.
export function classifyClient(ua: string, isProxy: boolean): ClientType {
  if (isProxy) return "proxy"; // A relay/proxy fetch masks the real device — don't guess.
  if (MOBILE_UA_PATTERN.test(ua)) return "mobile";
  if (DESKTOP_UA_PATTERN.test(ua)) return "desktop";
  return "unknown";
}

// Google's image proxy serves each pixel fetch from a large, rotating pool of
// edge IPs with no per-recipient session affinity, so the same human opening
// the same email twice in a row can produce two different source IPs. Dedup
// on the proxy path must therefore key off the stable UA string, not IP.
export function dedupeMatchesIp(isProxy: boolean): boolean {
  return !isProxy;
}

export function classifyOpen(
  request: RequestMetadata,
  sentAt: Date,
  observedAt: Date,
): OpenClassification {
  const isGoogleProxy = isGoogleProxyUserAgent(request.ua) || isGoogleProxyIp(request.ip);
  const elapsedMs = observedAt.getTime() - sentAt.getTime();

  if (isGoogleProxy && elapsedMs >= 0 && elapsedMs <= 90_000) {
    return { type: "prefetch", isProxy: true, confidence: 0 };
  }
  if (isAppleMailPrivacyRequest(request)) {
    return { type: "open", isProxy: true, confidence: 25 };
  }
  if (isGoogleProxy) {
    return { type: "open", isProxy: true, confidence: 70 };
  }
  return { type: "open", isProxy: false, confidence: 100 };
}
