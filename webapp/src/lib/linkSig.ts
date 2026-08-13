import { timingSafeEqual } from "crypto";
import { hashWithSecret } from "./hash";

function payload(emailId: string, idx: number, url: string): string {
  return `${emailId}:${idx}:${url}`;
}

export function signLink(
  emailId: string,
  idx: number,
  url: string,
  secret: string,
): string {
  return hashWithSecret(payload(emailId, idx, url), secret);
}

export function verifyLinkSig(
  emailId: string,
  idx: number,
  url: string,
  sig: string,
  secret: string,
): boolean {
  const expected = signLink(emailId, idx, url, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

export function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
