"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../lib/supabase-client";

interface Insurer {
  id: string;
  name: string;
  tenant_id: string;
  tenants?: { slug?: string; name?: string } | null;
}
interface Vehicle {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
}
interface Policy {
  id: string;
  vehicle_id: string;
  insurance_company_id: string;
  policy_number: string | null;
  is_active: boolean;
  status?: string | null;
  verified_with_bankid_at?: string | null;
  insurance_companies?: { name?: string } | null;
}

function policyStatusLabel(policy?: Policy): string {
  if (!policy) return "Ingen försäkring kopplad";
  if (policy.status === "insurance_verified") return `Verifierad av försäkringsbolaget: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
  if (policy.status === "insurance_pending") return `BankID klar – väntar på försäkringsbolaget: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
  if (policy.status === "pending_bankid") return `Väntar på BankID: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
  if (policy.status === "rejected") return `Avvisad: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
  if (policy.is_active || policy.status === "active") return `BankID-verifierad: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
  return `Kopplad: ${policy.insurance_companies?.name ?? "försäkringsbolag"}`;
}

async function parseJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function InsurancesInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const requestedVehicle = params.get("vehicle");
  const partner = params.get("partner") ?? params.get("tenant");
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [vehicleId, setVehicleId] = useState(requestedVehicle ?? "");
  const [insurerId, setInsurerId] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const { data: ins } = await supabase
      .from("insurance_companies")
      .select("id, name, tenant_id, tenants(slug, name)")
      .eq("active", true);
    const insurerList = ((ins as Insurer[] | null) ?? []) as Insurer[];
    setInsurers(insurerList);

    const { data: veh } = await supabase
      .from("vehicles")
      .select("id, registration_number, make, model")
      .eq("owner_user_id", auth.user.id)
      .order("created_at", { ascending: false });
    const list = ((veh as Vehicle[] | null) ?? []) as Vehicle[];
    setVehicles(list);
    if (!vehicleId && list[0]) setVehicleId(requestedVehicle ?? list[0].id);

    if (list.length > 0) {
      const { data: pol } = await supabase
        .from("vehicle_insurance_policies")
        .select("id, vehicle_id, insurance_company_id, policy_number, is_active, status, verified_with_bankid_at, insurance_companies(name)")
        .in("vehicle_id", list.map((v) => v.id))
        .neq("status", "inactive")
        .order("created_at", { ascending: false });
      setPolicies(((pol as Policy[] | null) ?? []) as Policy[]);
    } else {
      setPolicies([]);
    }
  }, [supabase, requestedVehicle, vehicleId]);

  useEffect(() => { void load(); }, [load]);

  const policyByVehicle = useMemo(() => {
    const map = new Map<string, Policy>();
    for (const policy of policies) {
      if (!map.has(policy.vehicle_id)) map.set(policy.vehicle_id, policy);
    }
    return map;
  }, [policies]);

  useEffect(() => {
    if (!partner || insurerId) return;
    const match = insurers.find((i) => i.tenants?.slug === partner || i.tenant_id === partner);
    if (match) setInsurerId(match.id);
  }, [partner, insurers, insurerId]);

  async function pollBankid(sessionId: string, token: string) {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await fetch(`/api/customer/bankid/sessions/${sessionId}/poll`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await parseJson(res);
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "BankID kunde inte kontrolleras.");
      if (json.status === "complete") return json;
      if (json.status === "failed" || json.status === "cancelled" || json.status === "expired") {
        throw new Error("BankID-verifieringen avbröts eller gick inte igenom.");
      }
    }
    throw new Error("BankID-verifieringen tog för lång tid. Försök igen.");
  }

  async function verifyPolicyWithBankid(policyId: string, token: string) {
    setStatus("Startar BankID för fordonskopplingen…");
    const signRes = await fetch(`/api/customer/vehicle-policies/${policyId}/bankid/sign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const signJson = await parseJson(signRes);
    if (!signRes.ok) throw new Error(typeof signJson.error === "string" ? signJson.error : "BankID kunde inte startas.");
    if (signJson.status === "complete") return signJson;
    const sessionId = typeof signJson.session_id === "string" ? signJson.session_id : null;
    if (!sessionId) throw new Error("BankID-session saknas.");
    setStatus("Öppna BankID och signera fordonskopplingen…");
    return pollBankid(sessionId, token);
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !vehicleId || !insurerId || busy) return;
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setStatus("Logga in igen för att koppla försäkringen.");
        return;
      }
      setStatus("Skapar försäkringskoppling…");
      const res = await fetch("/api/customer/vehicle-policies", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicle_id: vehicleId, insurance_company_id: insurerId, policy_number: policyNumber || null }),
      });
      const json = await parseJson(res);
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Kunde inte koppla försäkringen.");

      if (json.requires_bankid && typeof json.policy_id === "string") {
        await verifyPolicyWithBankid(json.policy_id, token);
        setStatus("BankID-verifieringen är klar. Fordonet är kopplat till valt försäkringsbolag.");
      } else {
        setStatus("Fordonet är kopplat till valt försäkringsbolag.");
      }
      setPolicyNumber("");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Något gick fel. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) return <p>Tjänsten är inte konfigurerad ännu.</p>;
  if (authed === false) return <p>Du behöver <a href="/login">logga in</a>.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>Mina försäkringar</h1>
      <p style={{ opacity: 0.72 }}>
        Koppla varje fordon till rätt försäkringsbolag. BankID används som verifiering när bilen kopplas och när du senare skapar ett försäkringsärende.
      </p>

      {vehicles.map((vehicle) => {
        const policy = policyByVehicle.get(vehicle.id);
        return (
          <div key={vehicle.id} className="vehicle-card">
            <strong>{vehicle.registration_number}</strong>
            <div className="vehicle-meta">{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Fordon"}</div>
            <span className="badge">{policyStatusLabel(policy)}</span>
          </div>
        );
      })}

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Koppla försäkring</h2>
      <form onSubmit={connect}>
        <label htmlFor="vehicle">Fordon</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
          <option value="">Välj fordon…</option>
          {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.registration_number}</option>))}
        </select>
        <label htmlFor="insurer">Försäkringsbolag</label>
        <select id="insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
          <option value="">Välj…</option>
          {insurers.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
        <label htmlFor="policy">Försäkrings-/kundnummer, om du har det</label>
        <input id="policy" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Valfritt" />
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit" disabled={busy}>{busy ? "Verifierar…" : "Koppla och verifiera med BankID"}</button>
        </div>
      </form>
      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}

export default function InsurancesPage() {
  return <Suspense fallback={<p>Laddar…</p>}><InsurancesInner /></Suspense>;
}
