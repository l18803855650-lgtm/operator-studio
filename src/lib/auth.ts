import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, getBootstrapStatus, getSessionFromToken, requireSessionFromToken } from "@/features/auth/auth.service";

export async function getCookieTokenFromRequest(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const target = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!target) return null;
  return decodeURIComponent(target.slice(AUTH_COOKIE_NAME.length + 1));
}

export async function requireRouteSession(request: Request) {
  return requireSessionFromToken(await getCookieTokenFromRequest(request));
}

export async function getCurrentPageSession() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null;
  return getSessionFromToken(token);
}

export async function requirePageSession() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null;
  const status = await getBootstrapStatus(token);
  if (status.requiresSetup) {
    redirect("/login");
  }
  const session = await getSessionFromToken(token);
  if (!session) {
    redirect("/login");
  }
  return session;
}
