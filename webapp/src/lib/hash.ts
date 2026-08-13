import { createHash, createHmac } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashWithSecret(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}
