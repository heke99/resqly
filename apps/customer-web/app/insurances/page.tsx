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
  insurance_companies?: { name?: string } | null;
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
        .select("id, vehicle_id, insurance_company_id, policy_number, insurance_companies(name)")
        .in("vehicle_id", list.map((v) => v.id))
        .eq("is_active", true);
      setPolicies(((pol as Policy[] | null) ?? []) as Policy[]);
    }
  }, [supabase, requestedVehicle, vehicleId]);

  useEffect(() => { void load(); }, [load]);

  const policyByVehicle = useMemo(() => new Map(policies.map((p) => [p.vehicle_id, p])), [policies]);

  useEffect(() => {
    if (!partner || insurerId) return;
    const match = insurers.find((i) => i.tenants?.slug === partner || i.tenant_id === partner);
    if (match) setInsurerId(match.id);
  }, [partner, insurers, insurerId]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !vehicleId || !insurerId) return;
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      setStatus("Logga in igen för att koppla försäkringen.");
      return;
    }
    const res = await fetch("/api/customer/vehicle-policies", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ vehicle_id: vehicleId, insurance_company_id: insurerId, policy_number: policyNumber || null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setStatus(json.error ?? "Could not connect insurance.");
    else {
      setStatus("Insurance connected to your vehicle. Next case will use this partner automatically.");
      await load();
    }
  }

  if (!supabase) return <p>Unavailable until Supabase is configured.</p>;
  if (authed === false) return <p>Please <a href="/login">log in</a>.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>Mina försäkringar</h1>
      <p style={{ opacity: 0.72 }}>Koppla varje fordon till rätt försäkringsbolag. Du kan ha olika försäkringar för olika bilar.</p>

      {vehicles.map((vehicle) => {
        const policy = policyByVehicle.get(vehicle.id);
        return (
          <div key={vehicle.id} className="vehicle-card">
            <strong>{vehicle.registration_number}</strong>
            <div className="vehicle-meta">{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Fordon"}</div>
            <span className="badge">{policy?.insurance_companies?.name ? `Aktiv: ${policy.insurance_companies.name}` : "Ingen aktiv försäkring"}</span>
          </div>
        );
      })}

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Koppla försäkring</h2>
      <form onSubmit={connect}>
        <label htmlFor="vehicle">Vehicle</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
          <option value="">Select vehicle…</option>
          {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.registration_number}</option>))}
        </select>
        <label htmlFor="insurer">Insurance company</label>
        <select id="insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
          <option value="">Select…</option>
          {insurers.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
        </select>
        <label htmlFor="policy">Policy number optional</label>
        <input id="policy" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Optional" />
        <div style={{ marginTop: 16 }}><button className="bigbtn" type="submit">Connect insurance</button></div>
      </form>
      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}

export default function InsurancesPage() {
  return <Suspense fallback={<p>Laddar…</p>}><InsurancesInner /></Suspense>;
}
