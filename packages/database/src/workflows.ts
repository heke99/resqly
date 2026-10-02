import type { AppSupabaseClient } from "./index";
import type { Json } from "./generated-types";

export interface WorkflowActor {
  tenantId: string;
  userId?: string | null;
  apiClientId?: string | null;
  key: string;
  correlationId: string;
}

export interface IncidentWorkflowResult {
  incident_id: string;
  case_number: string;
  status: string;
  requires_bankid: boolean;
  mode: "insurance" | "private";
  replay: boolean;
}

/** Only a server-side client may call these actor-bound transactions. */
export async function createIncidentWorkflow(
  db: AppSupabaseClient,
  actor: WorkflowActor,
  input: Record<string, unknown>,
  locations: Array<Record<string, unknown>> = [],
  consents: Array<Record<string, unknown>> = [],
): Promise<IncidentWorkflowResult> {
  const { data, error } = await db.rpc("create_incident_workflow", {
    p_tenant: actor.tenantId,
    p_actor_user: actor.userId ?? (null as unknown as string),
    p_actor_api: actor.apiClientId ?? (null as unknown as string),
    p_input: input as Json,
    p_key: actor.key,
    p_correlation_id: actor.correlationId,
    p_locations: locations as Json,
    p_consents: consents as Json,
  });
  if (error) throw new WorkflowError(error.code, error.message);
  const row = data as unknown as IncidentWorkflowResult;
  if (
    !row ||
    typeof row.incident_id !== "string" ||
    typeof row.case_number !== "string" ||
    typeof row.replay !== "boolean"
  )
    throw new Error("Invalid incident workflow response");
  return row;
}

export interface TowWorkflowResult<TJob> {
  tow_job_id: string;
  status: string;
  job: TJob;
  created: boolean;
  replay: boolean;
}

export async function requestTowWorkflow<TJob>(
  db: AppSupabaseClient,
  actor: WorkflowActor,
  incidentId: string,
  input: Record<string, unknown>,
): Promise<TowWorkflowResult<TJob>> {
  const { data, error } = await db.rpc("request_tow_workflow", {
    p_incident: incidentId,
    p_tenant: actor.tenantId,
    p_actor_user: actor.userId ?? (null as unknown as string),
    p_actor_api: actor.apiClientId ?? (null as unknown as string),
    p_input: input as Json,
    p_key: actor.key,
    p_correlation_id: actor.correlationId,
  });
  if (error) throw new WorkflowError(error.code, error.message);
  const row = data as unknown as TowWorkflowResult<TJob>;
  if (!row || typeof row.tow_job_id !== "string" || !row.job || typeof row.created !== "boolean") {
    throw new Error("Invalid tow workflow response");
  }
  return row;
}

export class WorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
  get status(): number {
    return this.code === "42501"
      ? 403
      : this.code === "P0002"
        ? 404
        : this.code === "23505" || this.code === "23514"
          ? 409
          : this.code === "22023" || this.code === "22P02"
            ? 400
            : 503;
  }
}
