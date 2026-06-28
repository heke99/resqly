"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "../lib/supabase-client";

interface Vehicle {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  is_default: boolean;
}

export default function VehiclesPage() {
  const supabase = useSupabase();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("not_authed");
      return;
    }
    const { data } = await supabase.from("vehicles").select("*").eq("owner_user_id", auth.user.id);
    setVehicles(((data as Vehicle[] | null) ?? []) as Vehicle[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("not_authed");
      return;
    }
    const normalized = reg.toUpperCase().replace(/[\s-]/g, "");
    const { error } = await supabase.from("vehicles").insert({
      owner_user_id: auth.user.id,
      registration_number: normalized,
      make: make || null,
      model: model || null,
      is_default: vehicles.length === 0,
    } as never);
    if (error) setStatus(error.message);
    else {
      setReg("");
      setMake("");
      setModel("");
      await load();
    }
  }

  if (!supabase) return <p>Vehicles are unavailable until Supabase is configured.</p>;
  if (status === "not_authed")
    return (
      <p>
        Please <a href="/login">log in</a> to manage your vehicles.
      </p>
    );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>My Vehicles</h1>
      {vehicles.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No vehicles yet. Add your first below.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {vehicles.map((v) => (
            <li key={v.id} className="tile" style={{ marginBottom: 10 }}>
              {v.make} {v.model} — {v.registration_number}
              {v.is_default ? " (default)" : ""}
            </li>
          ))}
        </ul>
      )}
      <h2 style={{ fontSize: 18, marginTop: 24 }}>Add vehicle</h2>
      <form onSubmit={add}>
        <label htmlFor="reg">Registration number</label>
        <input id="reg" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="ABC123" required />
        <label htmlFor="make">Make</label>
        <input id="make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Volvo" />
        <label htmlFor="model">Model</label>
        <input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="XC60" />
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit">
            Add vehicle
          </button>
        </div>
      </form>
      {status && status !== "not_authed" ? <p>{status}</p> : null}
    </div>
  );
}
