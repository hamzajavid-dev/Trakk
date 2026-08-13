import { describe, expect, it } from "vitest";
import { createEmailToken, verifyEmailToken } from "../tokens";

const SECRET = "test-secret";
const EMAIL_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("createEmailToken / verifyEmailToken", () => {
  it("round-trips a valid token back to the email id", () => {
    const token = createEmailToken(EMAIL_ID, SECRET);
    expect(verifyEmailToken(token, SECRET)).toBe(EMAIL_ID);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createEmailToken(EMAIL_ID, "other-secret");
    expect(verifyEmailToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered emailId with a still-valid-looking signature", () => {
    const token = createEmailToken(EMAIL_ID, SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("11111111-1111-1111-1111-111111111111").toString("base64url")}.${sig}`;
    expect(verifyEmailToken(forged, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyEmailToken("not-a-token", SECRET)).toBeNull();
    expect(verifyEmailToken("", SECRET)).toBeNull();
  });

  it("does not produce sequential/guessable tokens for sequential ids", () => {
    const t1 = createEmailToken("00000000-0000-0000-0000-000000000001", SECRET);
    const t2 = createEmailToken("00000000-0000-0000-0000-000000000002", SECRET);
    const [, sig1] = t1.split(".");
    const [, sig2] = t2.split(".");
    expect(sig1).not.toBe(sig2);
    expect(sig1.slice(0, 10)).not.toBe(sig2.slice(0, 10));
  });
});
