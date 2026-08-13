import type { NextRequest } from "next/server";

export function isExtensionAuthorized(req: NextRequest, secret: string): boolean {
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
