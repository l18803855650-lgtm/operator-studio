import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { AUTH_COOKIE_NAME, bootstrapAdmin } from "@/features/auth/auth.service";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await bootstrapAdmin({
      username: body.username,
      password: body.password,
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json({ data: result.session }, { status: 201 });
    response.cookies.set(AUTH_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      expires: new Date(result.session.expiresAt),
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
