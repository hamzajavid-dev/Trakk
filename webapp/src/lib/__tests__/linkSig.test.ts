import { describe, expect, it } from "vitest";
import { isSafeRedirectUrl, signLink, verifyLinkSig } from "../linkSig";

const SECRET = "test-secret";
const EMAIL_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("signLink / verifyLinkSig", () => {
  it("verifies a signature it produced", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 0, "https://example.com", sig, SECRET)).toBe(true);
  });

  it("rejects if the url was swapped after signing", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 0, "https://evil.com", sig, SECRET)).toBe(false);
  });

  it("rejects if the idx was swapped after signing", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(verifyLinkSig(EMAIL_ID, 1, "https://example.com", sig, SECRET)).toBe(false);
  });

  it("rejects a signature from a different email", () => {
    const sig = signLink(EMAIL_ID, 0, "https://example.com", SECRET);
    expect(
      verifyLinkSig("00000000-0000-0000-0000-000000000099", 0, "https://example.com", sig, SECRET),
    ).toBe(false);
  });
});

describe("isSafeRedirectUrl", () => {
  it("allows http and https", () => {
    expect(isSafeRedirectUrl("https://example.com")).toBe(true);
    expect(isSafeRedirectUrl("http://example.com/path?q=1")).toBe(true);
  });

  it("rejects javascript: and other schemes", () => {
    expect(isSafeRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectUrl("data:text/html,hi")).toBe(false);
    expect(isSafeRedirectUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed urls", () => {
    expect(isSafeRedirectUrl("not a url")).toBe(false);
    expect(isSafeRedirectUrl("")).toBe(false);
  });

  it("rejects protocol-relative and path-relative urls", () => {
    expect(isSafeRedirectUrl("//evil.com")).toBe(false);
    expect(isSafeRedirectUrl("/foo")).toBe(false);
  });
});
