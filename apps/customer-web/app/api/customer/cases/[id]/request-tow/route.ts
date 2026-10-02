import { NextResponse } from "next/server";
import { requestTowWorkflow, WorkflowError, type AppSupabaseClient } from "@resqly/database";
import { randomUUID } from "node:crypto";
import {
  createSupabaseDispatchStore,
  loadDispatchSettings,
  orchestrateDispatch,
} from "@resqly/dispatch";
import { getCompleteCustomerProfile, requireCustomer, jsonError } from "../../../_lib";

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
  const pickup =
    body.pickup && typeof body.pickup === "object"
      ? (body.pickup as { lat?: unknown; lng?: unknown })
      : null;
  const rawLat = pickup?.lat ?? existing?.lat;
  const rawLng = pickup?.lng ?? existing?.lng;
  if (rawLat == null || rawLng == null) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function recordDispatchAttempt(
  db: AppSupabaseClient,
  jobId: string,
  errorMessage: string | null,
): Promise<{ attempts: number; status: string }> {
  const { data, error } = await db.rpc(
    "record_tow_dispatch_attempt" as never,
    {
      p_job: jobId,
      p_error: errorMessage,
    } as never,
  );
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
    return jsonError(
      409,
      "Fyll i fullständigt namn och ett giltigt mobilnummer i din profil innan du begär bärgning.",
    );
  }

  const { data: incident, error: incidentError } = await db
    .from("incidents" as never)
    .select(
      "id, tenant_id, type, status, requires_bankid, bankid_verified, customer_user_id, insurance_company_id, problem_type, case_number",
    )
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
    return jsonError(
      409,
      "Det går inte att begära bärgning för ett avslutat eller avvisat ärende.",
    );
  }
  if (inc.requires_bankid && !inc.bankid_verified) {
    return jsonError(409, "BankID-verifiering krävs innan bärgning kan begäras.");
  }

  const supplied =
    body.pickup && typeof body.pickup === "object"
      ? (body.pickup as { lat?: unknown; lng?: unknown })
      : null;
  const pickup =
    typeof supplied?.lat === "number" && typeof supplied?.lng === "number" ? supplied : null;
  const payerType = inc.insurance_company_id ? "insurance_company" : "customer_private";
  let job: TowJobRow;
  let created: boolean;
  try {
    const requested = await requestTowWorkflow<TowJobRow>(
      db,
      {
        tenantId: inc.tenant_id,
        userId: user.id,
        key:
          request.headers.get("idempotency-key") ??
          request.headers.get("x-idempotency-key") ??
          randomUUID(),
        correlationId: randomUUID(),
      },
      inc.id,
      {
        pickup,
        pickup_address: stringOrNull(body.address),
        payer_type: payerType,
        priority,
      },
    );
    job = requested.job;
    created = requested.created;
  } catch (error) {
    const status = error instanceof WorkflowError ? error.status : 503;
    if (error instanceof WorkflowError && error.message === "insurance_coverage_required") {
      return jsonError(
        409,
        "Försäkringsbolaget behöver godkänna täckningen innan försäkringsbetald bärgning kan begäras.",
      );
    }
    return jsonError(
      status,
      status === 409
        ? "Förfrågan kunde inte godkännas. Kontrollera aktuellt ärende och försök igen."
        : "Bärgningsförfrågan kunde inte sparas. Försök igen.",
    );
  }
  if (!["created", "matching"].includes(job.status)) {
    return NextResponse.json(
      {
        tow_job_id: job.id,
        status: job.status,
        offered_drivers: [],
        contract_only: job.payer_type === "insurance_company",
        replay: true,
      },
      { status: 200 },
    );
  }
  const { data: locRow, error: locationReadError } = await db
    .from("incident_locations" as never)
    .select("lat,lng,address")
    .eq("incident_id", inc.id)
    .eq("kind", "pickup")
    .maybeSingle();
  if (locationReadError) return jsonError(503, "Upphämtningsplatsen kunde inte läsas just nu.");
  const location = pickLocation({}, locRow as { lat?: number | null; lng?: number | null } | null);
  if (!location) {
    const { data, error } = await db.rpc(
      "escalate_tow_job_manual_review" as never,
      {
        p_job: job.id,
        p_tenant: inc.tenant_id,
        p_actor_user: user.id,
        p_reason: "Upphämtningsplats behöver bekräftas",
        p_review_reason: "Kunden saknar bekräftade koordinater",
        p_assign_to: null,
      } as never,
    );
    if (error || (data as { error?: string } | null)?.error)
      return jsonError(503, "Ärendet kunde inte skickas till manuell hantering.");
    return NextResponse.json(
      { tow_job_id: job.id, status: "manual_review", offered_drivers: [] },
      { status: created ? 201 : 200 },
    );
  }
  const { data: claimData, error: claimError } = await db.rpc(
    "claim_tow_dispatch_job" as never,
    {
      p_job: job.id,
      p_lease_seconds: 300,
    } as never,
  );
  if (claimError) return jsonError(503, "Dispatch kunde inte låsas. Försök igen om en stund.");
  const claimRow = (Array.isArray(claimData) ? claimData[0] : claimData) as {
    claimed?: boolean;
    job_status?: string;
  } | null;
  if (!claimRow?.claimed) {
    const currentStatus = claimRow?.job_status ?? job.status;
    return NextResponse.json(
      {
        tow_job_id: job.id,
        status: currentStatus,
        dispatch_in_progress: ["created", "matching"].includes(currentStatus),
        replay: true,
      },
      { status: 202 },
    );
  }

  let outcome;
  try {
    const settings = await loadDispatchSettings(db, inc.tenant_id);
    outcome = await orchestrateDispatch(
      createSupabaseDispatchStore(db),
      {
        tenantId: inc.tenant_id,
        job: { id: job.id, incident_id: inc.id, status: job.status },
        pickup: location,
        payerType: job.payer_type,
        priority: job.priority as "normal" | "high" | "urgent",
        problemType: inc.problem_type,
        caseNumber: inc.case_number,
        actorUserId: user.id,
        settings,
      },
      { push: { enabled: process.env.EXPO_PUSH_ENABLED !== "false" } },
    );
    await recordDispatchAttempt(db, job.id, null);
  } catch (error) {
    let attempt: { attempts: number; status: string };
    try {
      attempt = await recordDispatchAttempt(
        db,
        job.id,
        error instanceof Error ? error.message : String(error),
      );
    } catch {
      return jsonError(
        503,
        "Dispatch misslyckades och driftlarmet kunde inte registreras. Kontakta support och försök inte skapa ett nytt ärende.",
      );
    }
    if (attempt.status === "manual_review") {
      const manualBody = {
        tow_job_id: job.id,
        status: "manual_review",
        offered_drivers: [],
        requires_manual_review: true,
      };
      return NextResponse.json(manualBody, { status: 202 });
    }
    return jsonError(
      503,
      `Bärgningen kunde inte skickas just nu. Försök igen. Försök ${attempt.attempts}/3.`,
    );
  }

  const okBody = {
    tow_job_id: job.id,
    status: outcome.status,
    offered_drivers: outcome.offeredDrivers,
    offered_tow_vehicles: outcome.offeredTowVehicles,
    contract_only: job.payer_type === "insurance_company",
    resumed: !created,
  };
  return NextResponse.json(okBody, { status: created ? 201 : 200 });
}
