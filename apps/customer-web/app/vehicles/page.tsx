"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../lib/supabase-client";

interface Vehicle {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  is_default: boolean;
  insurance_company_id: string | null;
}

function VehiclesInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const partner = params.get("partner") ?? params.get("tenant");
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
    const { data } = await supabase
      .from("vehicles")
      .select("id, registration_number, make, model, is_default, insurance_company_id")
      .eq("owner_user_id", auth.user.id)
      .order("created_at", { ascending: false });
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
    await supabase.from("user_profiles").upsert({ id: auth.user.id, email: auth.user.email ?? null } as never);
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
      setStatus("Fordon sparat. Koppla nu rätt försäkring.");
      await load();
    }
  }

  if (!supabase) return <p>Tjänsten är inte konfigurerad ännu.</p>;
  if (status === "not_authed")
    return (
      <p>
        Du behöver <a href="/login">logga in</a> för att hantera dina fordon.
      </p>
    );

  return (
    <div>
      <div className="section-title"><h1 style={{ fontSize: 24 }}>Mina fordon</h1></div>
      <p style={{ opacity: 0.72 }}>
        Varje fordon kan kopplas till ett eget försäkringsbolag. När du startar ett ärende väljer Resqly rätt försäkringsbolag från bilens verifierade koppling.
      </p>
      {vehicles.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Inga fordon ännu. Lägg till din första bil nedan.</p>
      ) : (
        vehicles.map((v) => (
          <div key={v.id} className="vehicle-card">
            <strong>{v.registration_number}</strong>
            <div className="vehicle-meta">{[v.make, v.model].filter(Boolean).join(" ") || "Fordon"}{v.is_default ? " • standard" : ""}</div>
            <a className="tile" href={`/insurances?vehicle=${v.id}${partner ? `&partner=${partner}` : ""}`}>Koppla/ändra försäkring</a>
          </div>
        ))
      )}
      <h2 style={{ fontSize: 18, marginTop: 24 }}>Lägg till fordon</h2>
      <form onSubmit={add}>
        <label htmlFor="reg">Registreringsnummer</label>
        <input id="reg" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="ABC123" required />
        <label htmlFor="make">Märke</label>
        <input id="make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Volvo" />
        <label htmlFor="model">Modell</label>
        <input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="XC60" />
        <div style={{ marginTop: 16 }}>
          <button className="bigbtn" type="submit">Lägg till fordon</button>
        </div>
      </form>
      {status && status !== "not_authed" ? <p>{status}</p> : null}
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<p>Laddar…</p>}>
      <VehiclesInner />
    </Suspense>
  );
}
