import { NextResponse } from "next/server";
import type { AppSupabaseClient } from "@resqly/database";
import { requireCustomer, jsonError } from "../../../_lib";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

async function assertOwnedIncident(db: AppSupabaseClient, incidentId: string, userId: string) {
  const { data } = await db
    .from("incidents" as never)
    .select("id, tenant_id, status")
    .eq("id", incidentId)
    .eq("customer_user_id", userId)
    .maybeSingle();
  return data as { id: string; tenant_id: string; status: string } | null;
}

/** Upload a photo/document to the case. Case-scoped path, strict type/size. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;

  const incident = await assertOwnedIncident(db, id, user.id);
  if (!incident) return jsonError(404, "Ärendet hittades inte.");
  if (["closed", "cancelled"].includes(incident.status)) {
    return jsonError(409, "Ärendet är avslutat och kan inte längre kompletteras.");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "Välj en fil att ladda upp.");
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return jsonError(400, "Endast foton (JPEG/PNG/WebP/HEIC) och PDF kan laddas upp.");
  if (file.size > MAX_FILE_BYTES) return jsonError(400, "Filen är för stor. Max 10 MB per fil.");
  if (file.size === 0) return jsonError(400, "Filen är tom.");

  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `${incident.id}/${fileName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from("incident-evidence")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return jsonError(503, "Uppladdningen misslyckades. Försök igen om en stund.");

  const { data: row, error } = await db
    .from("incident_evidence" as never)
    .insert({
      incident_id: incident.id,
      storage_path: path,
      content_type: file.type,
      uploaded_by: user.id,
    } as never)
    .select("id")
    .single();
  if (error) {
    await db.storage.from("incident-evidence").remove([path]).catch(() => undefined);
    return jsonError(503, "Uppladdningen kunde inte sparas. Försök igen.");
  }

  await db.from("audit_logs" as never).insert({
    tenant_id: incident.tenant_id,
    actor_user_id: user.id,
    action: "create",
    entity_type: "incident_evidence",
    entity_id: (row as { id: string }).id,
    fields: ["storage_path", "content_type"],
    metadata: { incident_id: incident.id, content_type: file.type, size_bytes: file.size },
  } as never);

  return NextResponse.json({ evidence_id: (row as { id: string }).id }, { status: 201 });
}

/** List the case's uploads with short-lived signed URLs for display. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;

  const incident = await assertOwnedIncident(db, id, user.id);
  if (!incident) return jsonError(404, "Ärendet hittades inte.");

  const { data: rows } = await db
    .from("incident_evidence" as never)
    .select("id, storage_path, content_type, created_at")
    .eq("incident_id", incident.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const evidence = (rows as Array<{ id: string; storage_path: string; content_type: string; created_at: string }> | null) ?? [];

  const items = await Promise.all(
    evidence.map(async (e) => {
      const { data: signed } = await db.storage
        .from("incident-evidence")
        .createSignedUrl(e.storage_path, 600);
      return {
        id: e.id,
        content_type: e.content_type,
        created_at: e.created_at,
        url: signed?.signedUrl ?? null,
      };
    }),
  );
  return NextResponse.json({ evidence: items });
}
