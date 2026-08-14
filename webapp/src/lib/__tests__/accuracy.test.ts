import { describe, expect, it } from "vitest";
import {
  classifyClient,
  classifyOpen,
  dedupeMatchesIp,
  isGoogleProxyIp,
  isGoogleProxyUserAgent,
} from "../accuracy";
import {
  APPLE_MAIL_PRIVACY,
  GOOGLE_IMAGE_PROXY,
  MOBILE_BROWSER,
  NORMAL_BROWSER,
} from "./fixtures/requestFixtures";

const SENT_AT = new Date("2026-08-14T10:00:00.000Z");

describe("proxy and privacy classification", () => {
  it("recognizes Gmail's recorded GoogleImageProxy signature", () => {
    expect(isGoogleProxyUserAgent(GOOGLE_IMAGE_PROXY.ua)).toBe(true);
    expect(isGoogleProxyIp(GOOGLE_IMAGE_PROXY.ip)).toBe(true);
  });

  it("classifies a Google proxy request shortly after delivery as a prefetch", () => {
    expect(
      classifyOpen(GOOGLE_IMAGE_PROXY, SENT_AT, new Date("2026-08-14T10:01:29.000Z")),
    ).toEqual({ type: "prefetch", isProxy: true, confidence: 0 });
  });

  it("keeps a later Google proxy render as an uncertain open", () => {
    expect(
      classifyOpen(GOOGLE_IMAGE_PROXY, SENT_AT, new Date("2026-08-14T10:01:31.000Z")),
    ).toEqual({ type: "open", isProxy: true, confidence: 70 });
  });

  it("marks Apple Mail privacy relay traffic as low confidence", () => {
    expect(classifyOpen(APPLE_MAIL_PRIVACY, SENT_AT, SENT_AT)).toEqual({
      type: "open",
      isProxy: true,
      confidence: 25,
    });
  });

  it("keeps an ordinary browser open at full confidence", () => {
    expect(classifyOpen(NORMAL_BROWSER, SENT_AT, SENT_AT)).toEqual({
      type: "open",
      isProxy: false,
      confidence: 100,
    });
  });

  it("does not mistake a normal browser's AppleWebKit token for Apple Mail", () => {
    expect(classifyOpen(NORMAL_BROWSER, SENT_AT, SENT_AT).confidence).toBe(100);
  });
});

describe("classifyClient", () => {
  it("marks proxied opens as 'proxy' — the real device is masked by the relay", () => {
    expect(classifyClient(GOOGLE_IMAGE_PROXY.ua, true)).toBe("proxy");
    expect(classifyClient(APPLE_MAIL_PRIVACY.ua, true)).toBe("proxy");
  });

  it("recognizes a mobile user agent on a direct, non-proxied open", () => {
    expect(classifyClient(MOBILE_BROWSER.ua, false)).toBe("mobile");
  });

  it("recognizes a desktop user agent on a direct, non-proxied open", () => {
    expect(classifyClient(NORMAL_BROWSER.ua, false)).toBe("desktop");
  });

  it("falls back to 'unknown' for an unrecognizable user agent", () => {
    expect(classifyClient("", false)).toBe("unknown");
  });
});

describe("dedupeMatchesIp", () => {
  it("ignores IP for proxied opens, since Google's image proxy has no stable per-recipient IP", () => {
    expect(dedupeMatchesIp(true)).toBe(false);
  });

  it("still requires a matching IP for direct, non-proxied opens", () => {
    expect(dedupeMatchesIp(false)).toBe(true);
  });
});
