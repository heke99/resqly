"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../../lib/supabase-client";

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
  tenant_id: string | null;
  insurance_companies?: { name?: string } | null;
}

const TOW_PROBLEMS = ["car_does_not_start", "puncture", "accident", "engine_failure", "dead_battery", "stuck_snow_mud", "keys_locked_inside", "misfueling", "ev_out_of_battery", "other"];
const DAMAGE_TYPES = ["parking_damage", "glass_damage", "collision_damage", "wildlife_collision", "vandalism", "water_damage", "mechanical_damage"];

function NewCaseInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const type = params.get("type") ?? "towing";
  const isDamage = type === "damage_claim";
  const requestedVehicle = params.get("vehicle") ?? "";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [vehicleId, setVehicleId] = useState(requestedVehicle);
  const [mode, setMode] = useState<"insurance" | "private">("insurance");
  const [subtype, setSubtype] = useState(isDamage ? DAMAGE_TYPES[0]! : TOW_PROBLEMS[0]!);
  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [created, setCreated] = useState<{ id: string; caseNumber: string; requiresBankid: boolean; towStatus?: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setStatus("not_authed"); return; }
    const { data } = await supabase
      .from("vehicles")
      .select("id, registration_number, make, model")
      .eq("owner_user_id", auth.user.id)
      .order("created_at", { ascending: false });
    const list = ((data as Vehicle[] | null) ?? []) as Vehicle[];
    setVehicles(list);
    if (!vehicleId && list.length === 1) setVehicleId(list[0]!.id);
    if (!vehicleId && requestedVehicle) setVehicleId(requestedVehicle);

    if (list.length > 0) {
      const { data: pol } = await supabase
        .from("vehicle_insurance_policies")
        .select("id, vehicle_id, insurance_company_id, tenant_id, insurance_companies(name)")
        .in("vehicle_id", list.map((v) => v.id))
        .eq("is_active", true);
      setPolicies(((pol as Policy[] | null) ?? []) as Policy[]);
    }
  }, [supabase, vehicleId, requestedVehicle]);

  useEffect(() => { void load(); }, [load]);

  const policyByVehicle = useMemo(() => new Map(policies.map((p) => [p.vehicle_id, p])), [policies]);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const selectedPolicy = vehicleId ? policyByVehicle.get(vehicleId) : null;

  function shareLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setStatus("Could not get location; you can still submit and add it later."),
    );
  }

  async function token(): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const accessToken = await token();
    if (!accessToken) { setStatus("not_authed"); return; }
    if (!vehicleId) { setStatus("Välj vilket fordon ärendet gäller."); return; }
    const effectiveMode = isDamage ? "insurance" : mode;
    if (effectiveMode === "insurance" && !selectedPolicy) {
      setStatus("Koppla detta fordon till ett försäkringsbolag först, eller välj privat bärgning.");
      return;
    }
    const res = await fetch("/api/customer/cases", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ vehicle_id: vehicleId, type, subtype, description, coords, mode: effectiveMode }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(json.error ?? "Could not create case."); return; }
    setCreated({ id: json.incident_id, caseNumber: json.case_number, requiresBankid: Boolean(json.requires_bankid) });
  }

  async function mockSign() {
    if (!created) return;
    const accessToken = await token();
    if (!accessToken) return;
    const res = await fetch(`/api/customer/cases/${created.id}/bankid/mock-sign`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setStatus(json.error ?? "BankID failed.");
    else setCreated({ ...created, requiresBankid: false });
  }

  async function requestTow() {
    if (!created) return;
    const accessToken = await token();
    if (!accessToken) return;
    const res = await fetch(`/api/customer/cases/${created.id}/request-tow`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ priority: "normal" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setStatus(json.error ?? "Could not request tow.");
    else setCreated({ ...created, towStatus: json.status ?? "manual_review" });
  }

  if (!supabase) return <p>Case creation is unavailable until Supabase is configured.</p>;
  if (status === "not_authed") return <p>Please <a href="/login">log in</a> to create a case.</p>;

  if (created) {
    return (
      <div>
        <h1 style={{ fontSize: 24 }}>Ärende skapat</h1>
        <div className="status-card">
          <strong>{created.caseNumber}</strong>
          <p className="vehicle-meta">{selectedVehicle?.registration_number} • {selectedPolicy?.insurance_companies?.name ?? "Privat / direkt bärgning"}</p>
          {created.requiresBankid ? (
            <>
              <p>Detta ärende behöver BankID-verifieras innan det skickas vidare.</p>
              <button className="bigbtn" onClick={mockSign}>Verifiera med BankID mock/test</button>
            </>
          ) : isDamage ? (
            <>
              <p>Ärendet är verifierat och skickas till försäkringsbolagets portal.</p>
              <a className="bigbtn" href={`/cases/${created.id}`}>Visa ärendet</a>
            </>
          ) : (
            <>
              <p>{created.towStatus ? `Bärgning begärd: ${created.towStatus}` : "BankID klart. Nu kan vi begära bärgning."}</p>
              {created.towStatus ? <a className="bigbtn" href={`/cases/${created.id}`}>Följ ärendet</a> : <button className="bigbtn" onClick={requestTow}>Begär bärgning</button>}
            </>
          )}
        </div>
        {status ? <p>{status}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>{isDamage ? "Anmäl skada" : "Starta ärende"}</h1>
      <p style={{ opacity: 0.72 }}>Välj vilket fordon ärendet gäller. Rätt försäkringspartner, case-prefix och regler hämtas från bilens aktiva försäkring.</p>
      <form onSubmit={submit}>
        <label htmlFor="vehicle">Fordon</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
          <option value="">Välj fordon…</option>
          {vehicles.map((v) => {
            const p = policyByVehicle.get(v.id);
            return <option key={v.id} value={v.id}>{v.registration_number} {p?.insurance_companies?.name ? `— ${p.insurance_companies.name}` : "— saknar försäkring"}</option>;
          })}
        </select>
        {selectedVehicle ? <p className="vehicle-meta">Detta ärende hanteras av {selectedPolicy?.insurance_companies?.name ?? "vald försäkringspartner saknas"}. <a href={`/insurances?vehicle=${selectedVehicle.id}`}>Byt/koppla försäkring</a></p> : null}

        {!isDamage ? (
          <div style={{ marginTop: 12 }}>
            <label>Hur vill du bärga?</label>
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="radio" name="mode" checked={mode === "insurance"} onChange={() => setMode("insurance")} /> Via försäkring
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="radio" name="mode" checked={mode === "private"} onChange={() => setMode("private")} /> Privat / direkt (utan försäkring)
              </label>
            </div>
            {mode === "private" ? (
              <p className="vehicle-meta">Privat bärgning skickas till bärgningsföretag som tar emot direkta uppdrag via marknadsplatsen.</p>
            ) : null}
          </div>
        ) : null}

        <label htmlFor="subtype">{isDamage ? "Skadetyp" : "Problem"}</label>
        <select id="subtype" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
          {(isDamage ? DAMAGE_TYPES : TOW_PROBLEMS).map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
        </select>

        <label htmlFor="desc">Vad hände?</label>
        <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

        <div style={{ marginTop: 12 }}>
          <button type="button" className="bigbtn" onClick={shareLocation}>
            {coords ? `Location shared (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : "Dela min position"}
          </button>
        </div>
        <div style={{ marginTop: 16 }}><button className="bigbtn" type="submit">Skapa ärende</button></div>
      </form>
      {vehicles.length === 0 ? <p><a href="/vehicles">Lägg till fordon först</a></p> : null}
      {status && status !== "created" ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}

export default function NewCasePage() {
  return <Suspense fallback={<p>Loading…</p>}><NewCaseInner /></Suspense>;
}
