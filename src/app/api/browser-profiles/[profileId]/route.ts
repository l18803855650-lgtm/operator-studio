import { deleteBrowserProfile, getBrowserProfile, updateBrowserProfile } from "@/features/browser-profiles/browser-profile.service";
import { requireRouteSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request, { params }: { params: { profileId: string } }) {
  try {
    await requireRouteSession(request);
    return jsonOk(await getBrowserProfile(params.profileId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: { params: { profileId: string } }) {
  try {
    await requireRouteSession(request);
    return jsonOk(await updateBrowserProfile(params.profileId, await request.json()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { profileId: string } }) {
  try {
    await requireRouteSession(request);
    await deleteBrowserProfile(params.profileId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
