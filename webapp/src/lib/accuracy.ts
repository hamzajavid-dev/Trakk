export type RequestMetadata = { ip: string; ua: string };

export type OpenClassification = {
  type: "prefetch" | "open";
  isProxy: boolean;
  confidence: number;
};

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
