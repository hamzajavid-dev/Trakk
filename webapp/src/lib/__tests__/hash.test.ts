import { describe, expect, it } from "vitest";
import { hashWithSecret, sha256Hex } from "../hash";

describe("sha256Hex", () => {
  it("produces a deterministic 64-char hex digest", () => {
    const digest = sha256Hex("hello");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(sha256Hex("hello"));
  });

  it("produces different digests for different input", () => {
    expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
  });
});

describe("hashWithSecret", () => {
  it("produces different output for different secrets", () => {
    const a = hashWithSecret("payload", "secret-a");
    const b = hashWithSecret("payload", "secret-b");
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same input and secret", () => {
    expect(hashWithSecret("payload", "secret")).toBe(
      hashWithSecret("payload", "secret"),
    );
  });
});
