"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../../lib/supabase-client";

interface Vehicle {
  id: string;
  registration_number: string;
  insurance_company_id: string | null;
}

const TOW_PROBLEMS = [
  "car_does_not_start",
  "puncture",
  "accident",
  "engine_failure",
  "dead_battery",
  "stuck_snow_mud",
  "keys_locked_inside",
  "misfueling",
  "ev_out_of_battery",
  "other",
];
const DAMAGE_TYPES = [
  "parking_damage",
  "glass_damage",
  "collision_damage",
  "wildlife_collision",
  "vandalism",
  "water_damage",
  "mechanical_damage",
];

function NewCaseInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const type = params.get("type") ?? "towing";
  const isDamage = type === "damage_claim";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [subtype, setSubtype] = useState(isDamage ? DAMAGE_TYPES[0]! : TOW_PROBLEMS[0]!);
  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("not_authed");
      return;
    }
    const { data } = await supabase
      .from("vehicles")
      .select("id, registration_number, insurance_company_id")
      .eq("owner_user_id", auth.user.id);
    const list = ((data as Vehicle[] | null) ?? []) as Vehicle[];
    setVehicles(list);
    if (list.length > 0) setVehicleId(list[0]!.id);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function shareLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setStatus("Could not get location; you can still submit and add it later."),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("not_authed");
      return;
    }
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle?.insurance_company_id) {
      setStatus("Please connect this vehicle to an insurance company first.");
      return;
    }
    const { data: ins } = await supabase
      .from("insurance_companies")
      .select("tenant_id")
      .eq("id", vehicle.insurance_company_id)
      .maybeSingle();
    const tenantId = (ins as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) {
      setStatus("Insurance company is not available.");
      return;
    }

    const { data: caseNo, error: rpcErr } = await supabase.rpc("allocate_case_number" as never, {
      p_tenant: tenantId,
      p_scope: "default",
    } as never);
    if (rpcErr) {
      setStatus(rpcErr.message);
      return;
    }

    const { data: incident, error } = await supabase
      .from("incidents")
      .insert({
        tenant_id: tenantId,
        customer_user_id: auth.user.id,
        vehicle_id: vehicleId,
        insurance_company_id: vehicle.insurance_company_id,
        type,
        status: "awaiting_bankid",
        damage_type: isDamage ? subtype : null,
        problem_type: isDamage ? null : subtype,
        description: description || null,
        requires_bankid: true,
        case_number: caseNo as unknown as string,
      } as never)
      .select("id")
      .single();
    if (error) {
      setStatus(error.message);
      return;
    }
    const incidentId = (incident as unknown as { id: string }).id;
    if (coords) {
      await supabase.from("incident_locations").insert({
        incident_id: incidentId,
        kind: "pickup",
        lat: coords.lat,
        lng: coords.lng,
      } as never);
    }
    setCaseNumber(caseNo as unknown as string);
    setStatus("created");
  }

  if (!supabase) return <p>Case creation is unavailable until Supabase is configured.</p>;
  if (status === "not_authed")
    return (
      <p>
        Please <a href="/login">log in</a> to create a case.
      </p>
    );
  if (caseNumber)
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Case created</h1>
        <p>
          Your case number is <strong>{caseNumber}</strong>.
        </p>
        <p>Next, verify with BankID from your profile, then we will find a tow truck.</p>
        <a className="bigbtn" href="/cases">
          View my cases
        </a>
      </div>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{isDamage ? "Damage claim" : "Start a case"}</h1>
      <form onSubmit={submit}>
        <label htmlFor="vehicle">Vehicle</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
          {vehicles.length === 0 ? <option value="">No vehicles — add one first</option> : null}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration_number}
            </option>
          ))}
        </select>

        <label htmlFor="subtype">{isDamage ? "Damage type" : "Problem"}</label>
        <select id="subtype" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
          {(isDamage ? DAMAGE_TYPES : TOW_PROBLEMS).map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>

        <label htmlFor="desc">What happened?</label>
        <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />

        <div style={{ marginTop: 12 }}>
          <button type="button" className="bigbtn" onClick={shareLocation}>
            {coords ? `Location shared (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : "Share my location"}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit">
            Create case
          </button>
        </div>
      </form>
      {status && status !== "created" ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}

export default function NewCasePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewCaseInner />
    </Suspense>
  );
}
