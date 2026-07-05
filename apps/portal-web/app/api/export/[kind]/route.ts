import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePortalPermission } from "../../../lib/auth";
import {
  getTowCompanyId,
  listCompanyJobs,
  listInsuranceCaseConsole,
  listInsuranceTowJobs,
  listInvoices,
} from "../../../lib/data";

type Row = Record<string, unknown>;

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.join(";"), ...rows.map((r) => r.map(csvEscape).join(";"))];
  // BOM so Excel opens Swedish characters correctly.
  return `\uFEFF${lines.join("\r\n")}`;
}

function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * CSV exports for the portal, scoped to the active organization:
 *  - cases    (insurance): the case console with status/BankID/towing
 *  - jobs     (both): tow jobs
 *  - invoices (tow): invoice basis
 */
const EXPORT_PERMISSIONS = {
  cases: "incidents.export",
  jobs: "tow_jobs.read",
  invoices: "billing.read",
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenant");
  const permission = EXPORT_PERMISSIONS[kind as keyof typeof EXPORT_PERMISSIONS];
  if (!permission) return NextResponse.json({ error: "Okänd export." }, { status: 404 });
  let tenant;
  try {
    ({ tenant } = await requirePortalPermission(tenantParam, permission));
  } catch (error) {
    // Let Next's own redirect (unauthenticated -> /login) pass through.
    unstable_rethrow(error);
    return NextResponse.json({ error: "Du saknar behörighet för den här exporten." }, { status: 403 });
  }
  const today = new Date().toISOString().slice(0, 10);

  if (kind === "cases") {
    if (tenant.type !== "insurance_company") {
      return NextResponse.json({ error: "Exporten är bara tillgänglig för försäkringsbolag." }, { status: 403 });
    }
    const rows = (await listInsuranceCaseConsole(tenant.id)) as Row[];
    const csv = toCsv(
      ["Ärendenummer", "Typ", "Status", "Kund", "Fordon", "BankID", "Bärgningsstatus", "Bärgningsbolag", "Skapat"],
      rows.map((r) => [
        r.case_number,
        r.incident_type === "damage_claim" ? "Skadeärende" : "Bärgning/assistans",
        r.incident_status,
        r.customer_name,
        r.registration_number,
        r.bankid_verified ? "Verifierad" : "Ej verifierad",
        r.tow_status ?? "",
        r.assigned_tow_company_name ?? "",
        String(r.created_at ?? "").slice(0, 16).replace("T", " "),
      ]),
    );
    return csvResponse(`arenden-${today}.csv`, csv);
  }

  if (kind === "jobs") {
    const rows =
      tenant.type === "tow_company"
        ? ((await listCompanyJobs(tenant.id)) as Row[])
        : ((await listInsuranceTowJobs(tenant.id)) as Row[]);
    const csv = toCsv(
      ["Uppdrag", "Status", "Prioritet", "Betalning", "Skapat"],
      rows.map((r) => [
        String(r.id ?? "").slice(0, 8).toUpperCase(),
        r.status,
        r.priority,
        r.payer_type === "customer_private" ? "Privat" : "Försäkring",
        String(r.created_at ?? "").slice(0, 16).replace("T", " "),
      ]),
    );
    return csvResponse(`uppdrag-${today}.csv`, csv);
  }

  if (kind === "invoices") {
    if (tenant.type !== "tow_company") {
      return NextResponse.json({ error: "Exporten är bara tillgänglig för bärgningsbolag." }, { status: 403 });
    }
    const companyId = await getTowCompanyId(tenant.id);
    if (!companyId) return NextResponse.json({ error: "Organisationen saknar bärgningsbolag." }, { status: 404 });
    const rows = (await listInvoices(tenant.id)) as Row[];
    const csv = toCsv(
      ["Uppdrag", "Status", "Betalning", "Netto (SEK)", "Moms (SEK)", "Totalt (SEK)", "Skapat"],
      rows.map((r) => [
        String(r.tow_job_id ?? "").slice(0, 8).toUpperCase(),
        r.status,
        r.payer_type === "customer_private" ? "Privat" : "Försäkring",
        (Number(r.subtotal_minor ?? 0) / 100).toFixed(2),
        (Number(r.vat_minor ?? 0) / 100).toFixed(2),
        (Number(r.total_minor ?? 0) / 100).toFixed(2),
        String(r.created_at ?? "").slice(0, 16).replace("T", " "),
      ]),
    );
    return csvResponse(`fakturaunderlag-${today}.csv`, csv);
  }

  return NextResponse.json({ error: "Okänd export." }, { status: 404 });
}
