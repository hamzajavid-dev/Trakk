import { NextResponse } from "next/server";
import { PIXEL_GIF, PIXEL_HEADERS } from "@/lib/pixel";

export function GET() {
  return new NextResponse(new Uint8Array(PIXEL_GIF), { headers: PIXEL_HEADERS });
}
