"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "../lib/supabase-client";

interface Insurer {
  id: string;
  name: string;
}
interface Vehicle {
  id: string;
  registration_number: string;
  insurance_company_id: string | null;
}

export default function InsurancesPage() {
  const supabase = useSupabase();
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [insurerId, setInsurerId] = useState("");
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
    const { data: ins } = await supabase.from("insurance_companies").select("id, name").eq("active", true);
    setInsurers(((ins as Insurer[] | null) ?? []) as Insurer[]);
    const { data: veh } = await supabase
      .from("vehicles")
      .select("id, registration_number, insurance_company_id")
      .eq("owner_user_id", auth.user.id);
    const list = ((veh as Vehicle[] | null) ?? []) as Vehicle[];
    setVehicles(list);
    if (list[0]) setVehicleId(list[0].id);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !vehicleId || !insurerId) return;
    const { error } = await supabase
      .from("vehicles")
      .update({ insurance_company_id: insurerId } as never)
      .eq("id", vehicleId);
    setStatus(error ? error.message : "Insurance connected to your vehicle.");
    await load();
  }

  if (!supabase) return <p>Unavailable until Supabase is configured.</p>;
  if (authed === false)
    return (
      <p>
        Please <a href="/login">log in</a>.
      </p>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>My Insurances</h1>
      <p style={{ opacity: 0.7 }}>Connect each vehicle to its insurance company.</p>
      <form onSubmit={connect}>
        <label htmlFor="vehicle">Vehicle</label>
        <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration_number}
            </option>
          ))}
        </select>
        <label htmlFor="insurer">Insurance company</label>
        <select id="insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
          <option value="">Select…</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit">
            Connect insurance
          </button>
        </div>
      </form>
      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}
