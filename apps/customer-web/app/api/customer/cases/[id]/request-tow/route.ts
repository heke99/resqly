import { NextResponse } from "next/server";
import {
  createSupabaseDispatchStore,
  loadDispatchSettings,
  orchestrateDispatch,
} from "@resqly/dispatch";
import { requireCustomer, jsonError, replayIfIdempotent, storeIdempotentResponse } from "../../../_lib";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickLocation(body: Record<string, unknown>, existing: { lat?: number | null; lng?: number | null } | null) {
  const pickup = body.pickup && typeof body.pickup === "object" ? body.pickup as { lat?: unknown; lng?: unknown } : null;
  const lat = Number(pickup?.lat ?? existing?.lat);
  const lng = Number(pickup?.lng ?? existing?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const priority = ["normal", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, type, status, requires_bankid, bankid_verified, customer_user_id, insurance_company_id, problem_type, case_number")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const inc = incident as {
    id: string;
    tenant_id: string;
    type: string;
    status: string;
    requires_bankid: boolean;
    bankid_verified: boolean;
    insurance_company_id: string | null;
    problem_type: string | null;
    case_number: string | null;
  } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");
  if (inc.requires_bankid && !inc.bankid_verified) {
    return jsonError(409, "BankID-verifiering krävs innan bärgning kan begäras.");
  }

  const { key: idemKey, replay } = await replayIfIdempotent(db, user.id, `tow.request:${inc.id}`, request);
  if (replay) return replay;

  const { data: existing } = await db
    .from("tow_jobs" as never)
    .select("id, status")
    .eq("tenant_id", inc.tenant_id)
    .eq("incident_id", inc.id)
    .not("status", "in", "(cancelled,failed,closed)" as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      tow_job_id: (existing as { id: string }).id,
      status: (existing as { status: string }).status,
    });
  }

  // Persist a client-supplied pickup so the driver share/ETA get real coords.
  const bodyPickup = body.pickup && typeof body.pickup === "object" ? (body.pickup as { lat?: unknown; lng?: unknown }) : null;
  if (Number.isFinite(Number(bodyPickup?.lat)) && Number.isFinite(Number(bodyPickup?.lng))) {
    await db.from("incident_locations" as never).delete().eq("incident_id", inc.id).eq("kind", "pickup");
    await db.from("incident_locations" as never).insert({
      incident_id: inc.id,
      kind: "pickup",
      lat: Number(bodyPickup!.lat),
      lng: Number(bodyPickup!.lng),
    } as never);
  }

  const { data: locRow } = await db
    .from("incident_locations" as never)
    .select("lat, lng, address")
    .eq("incident_id", inc.id)
    .eq("kind", "pickup")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const location = pickLocation(body, locRow as { lat?: number | null; lng?: number | null } | null);

  // No usable coordinates (GPS denied and address could not be located):
  // never dead-end the customer — the case goes to manual help where a
  // handler confirms the pickup address, instead of failing with an error.
  if (!location) {
    const manualAddress = stringOrNull(body.address);
    const { data: manualJob, error: manualErr } = await db
      .from("tow_jobs" as never)
      .insert({
        tenant_id: inc.tenant_id,
        incident_id: inc.id,
        status: "manual_review",
        payer_type: inc.insurance_company_id ? "insurance_company" : "customer_private",
        priority,
      } as never)
      .select("id")
      .single();
    if (manualErr) return jsonError(503, "Bärgningen kunde inte skickas just nu. Försök igen eller kontakta support.");
    const manualJobId = (manualJob as { id: string }).id;
    await db.from("tow_job_status_events" as never).insert({
      tow_job_id: manualJobId,
      from_status: null,
      to_status: "manual_review",
      actor_user_id: user.id,
      reason: "upphämtningsplats saknas; adress behöver bekräftas av handläggare",
    } as never);
    await db.from("manual_reviews" as never).insert({
      tenant_id: inc.tenant_id,
      incident_id: inc.id,
      tow_job_id: manualJobId,
      reason: manualAddress
        ? `Kunden angav adressen "${manualAddress}" men platsen kunde inte fastställas automatiskt.`
        : "Kunden kunde inte dela sin position. Upphämtningsplats behöver bekräftas.",
      status: "open",
    } as never);
    const manualBody = { tow_job_id: manualJobId, status: "manual_review", offered_drivers: [] };
    await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, manualJobId, manualBody);
    return NextResponse.json(manualBody, { status: 201 });
  }

  const payerType = inc.insurance_company_id ? "insurance_company" : "customer_private";

  const { data: job, error: jobError } = await db
    .from("tow_jobs" as never)
    .insert({
      tenant_id: inc.tenant_id,
      incident_id: inc.id,
      status: "created",
      payer_type: payerType,
      priority,
    } as never)
    .select("id, status")
    .single();
  if (jobError) {
    // Unique live-job constraint: a concurrent duplicate request already
    // created the job — return it instead of failing.
    const { data: concurrent } = await db
      .from("tow_jobs" as never)
      .select("id, status")
      .eq("incident_id", inc.id)
      .not("status", "in", "(cancelled,failed,closed)" as never)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (concurrent) {
      return NextResponse.json({
        tow_job_id: (concurrent as { id: string }).id,
        status: (concurrent as { status: string }).status,
      });
    }
    return jsonError(503, "Bärgningen kunde inte skickas just nu. Försök igen om en stund.");
  }
  const jobId = (job as { id: string }).id;

  // All dispatch logic (eligibility, waves, offers, pushes, audit, manual
  // review escalation) lives in the shared orchestrator — identical to the
  // partner API's dispatch path.
  const settings = await loadDispatchSettings(db, inc.tenant_id);
  let outcome;
  try {
    outcome = await orchestrateDispatch(
      createSupabaseDispatchStore(db),
      {
        tenantId: inc.tenant_id,
        job: { id: jobId, incident_id: inc.id, status: "created" },
        pickup: location,
        payerType,
        priority: priority as "normal" | "high" | "urgent",
        problemType: inc.problem_type,
        caseNumber: inc.case_number,
        actorUserId: user.id,
        settings,
      },
      {
        push: { enabled: process.env.EXPO_PUSH_ENABLED !== "false" },
      },
    );
  } catch {
    return jsonError(503, "Bärgningen kunde inte skickas just nu. Försök igen om en stund.");
  }

  if (outcome.status === "offered") {
    await db.from("incidents" as never).update({ status: "submitted" } as never).eq("id", inc.id).eq("customer_user_id", user.id);
  }

  const okBody = {
    tow_job_id: jobId,
    status: outcome.status,
    offered_drivers: outcome.offeredDrivers,
    offered_tow_vehicles: outcome.offeredTowVehicles,
    contract_only: payerType === "insurance_company",
  };
  await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, jobId, okBody);
  return NextResponse.json(okBody, { status: 201 });
}
