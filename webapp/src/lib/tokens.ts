import { timingSafeEqual } from "crypto";
import { hashWithSecret } from "./hash";

export function createEmailToken(emailId: string, secret: string): string {
  const idPart = Buffer.from(emailId, "utf8").toString("base64url");
  const sig = hashWithSecret(emailId, secret);
  return `${idPart}.${sig}`;
}

export function verifyEmailToken(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [idPart, sig] = parts;

  let emailId: string;
  try {
    emailId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = hashWithSecret(emailId, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return emailId;
}
