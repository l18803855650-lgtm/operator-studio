import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { AUTH_COOKIE_NAME, logoutByToken } from "@/features/auth/auth.service";
import { getCookieTokenFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await logoutByToken(await getCookieTokenFromRequest(request));
    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
