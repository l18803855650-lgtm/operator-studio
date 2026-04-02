export const dynamic = "force-dynamic";

import { getBootstrapStatus } from "@/features/auth/auth.service";
import { getCookieTokenFromRequest } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    return jsonOk(await getBootstrapStatus(await getCookieTokenFromRequest(request)));
  } catch (error) {
    return jsonError(error);
  }
}
