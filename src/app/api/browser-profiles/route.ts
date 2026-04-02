import { createBrowserProfile, listBrowserProfiles } from "@/features/browser-profiles/browser-profile.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await listBrowserProfiles());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRouteSession(request);
    return jsonOk(await createBrowserProfile(await request.json()), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
