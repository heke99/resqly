import { NextResponse } from "next/server";
import type { AppSupabaseClient } from "@resqly/database";
import {
  createSupabaseDispatchStore,
  loadDispatchSettings,
  orchestrateDispatch,
} from "@resqly/dispatch";
import {
  getCompleteCustomerProfile,
  requireCustomer,
  jsonError,
  replayIfIdempotent,
  storeIdempotentResponse,
} from "../../../_lib";
import { sendCustomerEmail } from "../../../_email";

type TowJobRow = {
  id: string;
  status: string;
  payer_type: "insurance_company" | "customer_private";
  priority: string;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickLocation(
  body: Record<string, unknown>,
  existing: { lat?: number | null; lng?: number | null } | null,
) {
  const pickup = body.pickup && typeof body.pickup === "object"
    ? body.pickup as { lat?: unknown; lng?: unknown }
    : null;
  const lat = Number(pickup?.lat ?? existing?.lat);
  const lng = Number(pickup?.lng ?? existing?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function recordDispatchAttempt(
  db: AppSupabaseClient,
  jobId: string,
  errorMessage: string | null,
): Promise<{ attempts: number; status: string }> {
  const { data, error } = await db.rpc("record_tow_dispatch_attempt" as never, {
    p_job: jobId,
    p_error: errorMessage,
  } as never);
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as {
    attempts?: number;
    job_status?: string;
  } | null;
  return {
    attempts: Number(row?.attempts ?? 0),
    status: row?.job_status ?? "created",
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const priority = ["normal", "high", "urgent"].includes(String(body.priority))
    ? String(body.priority)
    : "normal";

  const profile = await getCompleteCustomerProfile(db, user.id);
  if (!profile) {
    return jsonError(409, "Fyll i fullständigt namn och ett giltigt mobilnummer i din profil innan du begär bärgning.");
  }

  const { data: incident, error: incidentError } = await db
    .from("incidents" as never)
    .select("id, tenant_id, type, status, requires_bankid, bankid_verified, customer_user_id, insurance_company_id, problem_type, case_number")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  if (incidentError) return jsonError(503, "Ärendet kunde inte läsas just nu.");
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
  if (["completed", "closed", "cancelled", "rejected"].includes(inc.status)) {
    return jsonError(409, "Det går inte att begära bärgning för ett avslutat eller avvisat ärende.");
  }
  if (inc.requires_bankid && !inc.bankid_verified) {
    return jsonError(409, "BankID-verifiering krävs innan bärgning kan begäras.");
  }

  const { key: idemKey, replay } = await replayIfIdempotent(
    db,
    user.id,
    `tow.request:${inc.id}`,
    request,
  );
  if (replay) return replay;

  // Persist a client-supplied pickup so the shared dispatch/driver share use
  // the exact same coordinates across web, mobile and partner API.
  const bodyPickup = body.pickup && typeof body.pickup === "object"
    ? body.pickup as { lat?: unknown; lng?: unknown }
    : null;
  if (Number.isFinite(Number(bodyPickup?.lat)) && Number.isFinite(Number(bodyPickup?.lng))) {
    const pickupUpdate: Record<string, unknown> = {
      incident_id: inc.id,
      kind: "pickup",
      lat: Number(bodyPickup!.lat),
      lng: Number(bodyPickup!.lng),
    };
    const suppliedAddress = stringOrNull(body.address);
    if (suppliedAddress) pickupUpdate.address = suppliedAddress;
    const { error } = await db.from("incident_locations" as never).upsert(
      pickupUpdate as never,
      { onConflict: "incident_id,kind" } as never,
    );
    if (error) return jsonError(503, "Upphämtningsplatsen kunde inte sparas. Försök igen.");
  }

  const { data: locRow, error: locationReadError } = await db
    .from("incident_locations" as never)
    .select("lat, lng, address")
    .eq("incident_id", inc.id)
    .eq("kind", "pickup")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (locationReadError) return jsonError(503, "Upphämtningsplatsen kunde inte läsas just nu.");
  const location = pickLocation(body, locRow as { lat?: number | null; lng?: number | null } | null);

  const { data: existingRow, error: existingJobError } = await db
    .from("tow_jobs" as never)
    .select("id, status, payer_type, priority")
    .eq("tenant_id", inc.tenant_id)
    .eq("incident_id", inc.id)
    .not("status", "in", "(cancelled,failed,closed)" as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingJobError) return jsonError(503, "Bärgningsuppdraget kunde inte kontrolleras just nu.");
  let job = existingRow as TowJobRow | null;

  if (job && !["created", "matching"].includes(job.status)) {
    const existingBody = {
      tow_job_id: job.id,
      status: job.status,
      offered_drivers: [],
      contract_only: job.payer_type === "insurance_company",
      replay: true,
    };
    await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, job.id, existingBody);
    return NextResponse.json(existingBody, { status: 200 });
  }

  const payerType = inc.insurance_company_id ? "insurance_company" : "customer_private";
  let created = false;

  if (!location) {
    if (!job) {
      const { data: manualJob, error: manualErr } = await db
        .from("tow_jobs" as never)
        .insert({
          tenant_id: inc.tenant_id,
          incident_id: inc.id,
          status: "created",
          payer_type: payerType,
          priority,
          created_by_user_id: user.id,
        } as never)
        .select("id, status, payer_type, priority")
        .single();
      if (manualErr || !manualJob) return jsonError(503, "Bärgningen kunde inte skickas just nu. Försök igen eller kontakta support.");
      job = manualJob as TowJobRow;
    }

    const manualAddress = stringOrNull(body.address);
    const reviewReason = manualAddress
      ? `Kunden angav adressen "${manualAddress}" men platsen kunde inte fastställas automatiskt.`
      : "Kunden kunde inte dela sin position. Upphämtningsplats behöver bekräftas.";
    const { data: escalationData, error: escalationError } = await db.rpc(
      "escalate_tow_job_manual_review" as never,
      {
        p_job: job.id,
        p_tenant: inc.tenant_id,
        p_actor_user: user.id,
        p_reason: "upphämtningsplats saknas; adress behöver bekräftas av handläggare",
        p_review_reason: reviewReason,
        p_assign_to: null,
      } as never,
    );
    if (escalationError) return jsonError(503, "Ärendet kunde inte skickas till manuell hantering.");
    const escalation = (escalationData ?? {}) as { error?: string };
    if (escalation.error) return jsonError(409, "Ärendet kunde inte skickas till manuell hantering.");

    const manualBody = { tow_job_id: job.id, status: "manual_review", offered_drivers: [] };
    await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, job.id, manualBody);
    return NextResponse.json(manualBody, { status: 201 });
  }

  if (!job) {
    const { data: inserted, error: jobError } = await db
      .from("tow_jobs" as never)
      .insert({
        tenant_id: inc.tenant_id,
        incident_id: inc.id,
        status: "created",
        payer_type: payerType,
        priority,
        created_by_user_id: user.id,
      } as never)
      .select("id, status, payer_type, priority")
      .single();

    if (jobError) {
      const { data: concurrent, error: concurrentError } = await db
        .from("tow_jobs" as never)
        .select("id, status, payer_type, priority")
        .eq("tenant_id", inc.tenant_id)
        .eq("incident_id", inc.id)
        .not("status", "in", "(cancelled,failed,closed)" as never)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (concurrentError) return jsonError(503, "Bärgningsuppdraget kunde inte kontrolleras efter ett samtidigt försök.");
      job = concurrent as TowJobRow | null;
      if (!job) return jsonError(503, "Bärgningen kunde inte skickas just nu. Försök igen om en stund.");
      if (!["created", "matching"].includes(job.status)) {
        return NextResponse.json({ tow_job_id: job.id, status: job.status }, { status: 200 });
      }
    } else {
      job = inserted as TowJobRow;
      created = true;
    }
  }

  const { data: claimData, error: claimError } = await db.rpc("claim_tow_dispatch_job" as never, {
    p_job: job!.id,
    p_lease_seconds: 300,
  } as never);
  if (claimError) return jsonError(503, "Dispatch kunde inte låsas. Försök igen om en stund.");
  const claimRow = (Array.isArray(claimData) ? claimData[0] : claimData) as {
    claimed?: boolean;
    job_status?: string;
  } | null;
  if (!claimRow?.claimed) {
    const currentStatus = claimRow?.job_status ?? job!.status;
    return NextResponse.json({
      tow_job_id: job!.id,
      status: currentStatus,
      dispatch_in_progress: ["created", "matching"].includes(currentStatus),
      replay: true,
    }, { status: 202 });
  }

  let outcome;
  try {
    const settings = await loadDispatchSettings(db, inc.tenant_id);
    outcome = await orchestrateDispatch(
      createSupabaseDispatchStore(db),
      {
        tenantId: inc.tenant_id,
        job: { id: job!.id, incident_id: inc.id, status: job!.status },
        pickup: location,
        payerType: job!.payer_type,
        priority: job!.priority as "normal" | "high" | "urgent",
        problemType: inc.problem_type,
        caseNumber: inc.case_number,
        actorUserId: user.id,
        settings,
      },
      { push: { enabled: process.env.EXPO_PUSH_ENABLED !== "false" } },
    );
    await recordDispatchAttempt(db, job!.id, null);
  } catch (error) {
    let attempt: { attempts: number; status: string };
    try {
      attempt = await recordDispatchAttempt(
        db,
        job!.id,
        error instanceof Error ? error.message : String(error),
      );
    } catch {
      return jsonError(503, "Dispatch misslyckades och driftlarmet kunde inte registreras. Kontakta support och försök inte skapa ett nytt ärende.");
    }
    if (attempt.status === "manual_review") {
      const manualBody = {
        tow_job_id: job!.id,
        status: "manual_review",
        offered_drivers: [],
        requires_manual_review: true,
      };
      await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, job!.id, manualBody);
      return NextResponse.json(manualBody, { status: 202 });
    }
    return jsonError(503, `Bärgningen kunde inte skickas just nu. Försök igen. Försök ${attempt.attempts}/3.`);
  }

  if (outcome.status === "offered" && inc.status !== "submitted") {
    const { error: incidentUpdateError } = await db.from("incidents" as never)
      .update({ status: "submitted" } as never)
      .eq("id", inc.id)
      .eq("customer_user_id", user.id)
      .eq("tenant_id", inc.tenant_id);
    if (!incidentUpdateError) {
      const { error: eventError } = await db.from("incident_status_events" as never).insert({
        incident_id: inc.id,
        from_status: inc.status,
        to_status: "submitted",
        actor_user_id: user.id,
        actor_kind: "user",
        reason: "Bärgning begärd av kund",
      } as never);
      if (eventError) {
        await db.from("incidents" as never).update({ status: inc.status } as never).eq("id", inc.id).eq("tenant_id", inc.tenant_id);
        return jsonError(503, "Ärendestatus kunde inte sparas med full spårbarhet.");
      }
    }
  }

  await sendCustomerEmail(db, {
    tenantId: inc.tenant_id,
    to: profile.email ?? user.email,
    subject: `Bärgning begärd för ärende ${inc.case_number ?? ""}`.trim(),
    html: outcome.status === "offered"
      ? "<p>Vi söker nu en bärgare åt dig. Du får besked så snart någon accepterar uppdraget.</p>"
      : "<p>Din förfrågan hanteras manuellt av en handläggare. Vi hör av oss så snart som möjligt.</p>",
    incidentId: inc.id,
    towJobId: job!.id,
    dedupeKey: `email:tow_requested:${job!.id}`,
  });

  const okBody = {
    tow_job_id: job!.id,
    status: outcome.status,
    offered_drivers: outcome.offeredDrivers,
    offered_tow_vehicles: outcome.offeredTowVehicles,
    contract_only: job!.payer_type === "insurance_company",
    resumed: !created,
  };
  await storeIdempotentResponse(db, user.id, `tow.request:${inc.id}`, idemKey, job!.id, okBody);
  return NextResponse.json(okBody, { status: created ? 201 : 200 });
}
