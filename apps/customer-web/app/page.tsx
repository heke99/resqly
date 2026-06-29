"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "./lib/supabase-client";

interface VehicleRow {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  is_default: boolean;
}
interface PolicyRow {
  id: string;
  vehicle_id: string;
  insurance_company_id: string;
  tenant_id: string | null;
  policy_number: string | null;
  insurance_companies?: { name?: string; tenant_id?: string } | null;
}
interface IncidentRow {
  id: string;
  case_number: string | null;
  status: string;
  type: string;
  vehicle_id: string | null;
  created_at: string;
}

function HomeInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const partner = params.get("partner") ?? params.get("tenant");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const { data: veh } = await supabase
      .from("vehicles")
      .select("id, registration_number, make, model, is_default")
      .eq("owner_user_id", auth.user.id)
      .order("created_at", { ascending: false });
    const vehicleList = ((veh as VehicleRow[] | null) ?? []) as VehicleRow[];
    setVehicles(vehicleList);

    if (vehicleList.length > 0) {
      const ids = vehicleList.map((v) => v.id);
      const { data: pol } = await supabase
        .from("vehicle_insurance_policies")
        .select("id, vehicle_id, insurance_company_id, tenant_id, policy_number, insurance_companies(name, tenant_id)")
        .in("vehicle_id", ids)
        .eq("is_active", true);
      setPolicies(((pol as PolicyRow[] | null) ?? []) as PolicyRow[]);
    }

    const { data: cases } = await supabase
      .from("incidents")
      .select("id, case_number, status, type, vehicle_id, created_at")
      .eq("customer_user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setIncidents(((cases as IncidentRow[] | null) ?? []) as IncidentRow[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const policyByVehicle = useMemo(() => new Map(policies.map((p) => [p.vehicle_id, p])), [policies]);
  const activeCases = incidents.filter((i) => !["closed", "cancelled", "rejected", "completed"].includes(i.status));

  if (!supabase) return <p>Unavailable until Supabase is configured.</p>;

  return (
    <div>
      <div className="hero-card">
        <p className="eyebrow">Resqly Assistans</p>
        <h1>Vad behöver du hjälp med?</h1>
        <p>
          Starta bärgning eller skadeärende från rätt fordon. Resqly väljer automatiskt rätt försäkringspartner från bilens aktiva försäkring.
        </p>
        <a className="bigbtn" href={vehicles.length === 1 ? `/cases/new?vehicle=${vehicles[0]!.id}&type=towing` : "/cases/new?type=towing"}>
          Starta bärgning
        </a>
        <a className="secondary-link" href={vehicles.length === 1 ? `/cases/new?vehicle=${vehicles[0]!.id}&type=damage_claim` : "/cases/new?type=damage_claim"}>
          Anmäl skada
        </a>
      </div>

      {partner ? (
        <div className="status-card" style={{ marginTop: 16 }}>
          <strong>Partnerlänk aktiv</strong>
          <p className="vehicle-meta">
            Partnern <code>{partner}</code> förväljs när du kopplar ny försäkring. Befintliga ärenden styrs alltid av valt fordons försäkring.
          </p>
        </div>
      ) : null}

      {authed === false ? (
        <div className="status-card" style={{ marginTop: 16 }}>
          <strong>Logga in för att se dina fordon</strong>
          <p className="vehicle-meta">Du kan ha flera bilar med olika försäkringsbolag på samma konto.</p>
          <a className="bigbtn" href="/login">Logga in</a>
        </div>
      ) : null}

      <div className="section-title">
        <h2>Mina fordon</h2>
        <a href="/vehicles">Hantera</a>
      </div>
      {vehicles.length === 0 ? (
        <div className="vehicle-card">
          <strong>Inget fordon ännu</strong>
          <p className="vehicle-meta">Lägg till en bil och koppla den till rätt försäkringsbolag.</p>
          <a className="bigbtn" href={`/vehicles${partner ? `?partner=${partner}` : ""}`}>Lägg till fordon</a>
        </div>
      ) : (
        vehicles.map((vehicle) => {
          const policy = policyByVehicle.get(vehicle.id);
          return (
            <div key={vehicle.id} className="vehicle-card">
              <strong>{vehicle.registration_number}</strong>
              <div className="vehicle-meta">
                {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Fordon"} • {policy?.insurance_companies?.name ? `Försäkrad hos ${policy.insurance_companies.name}` : "Saknar kopplad försäkring"}
              </div>
              <div className="action-grid" style={{ margin: 0 }}>
                <a className="bigbtn" href={`/cases/new?vehicle=${vehicle.id}&type=towing`}>Bärgning</a>
                <a className="tile" href={`/cases/new?vehicle=${vehicle.id}&type=damage_claim`}>Skada</a>
              </div>
            </div>
          );
        })
      )}

      <div className="section-title">
        <h2>Aktiva ärenden</h2>
        <a href="/cases">Alla</a>
      </div>
      {activeCases.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Inga aktiva ärenden just nu.</p>
      ) : (
        activeCases.map((incident) => (
          <a key={incident.id} className="status-card" href={`/cases/${incident.id}`}>
            <strong>{incident.case_number ?? incident.id.slice(0, 8)}</strong>
            <div className="vehicle-meta">{incident.type.replaceAll("_", " ")} • {incident.status.replaceAll("_", " ")}</div>
          </a>
        ))
      )}

      <div className="section-title"><h2>Snabbval</h2></div>
      <div className="action-grid">
        <a className="tile" href="/insurances">Mina försäkringar</a>
        <a className="tile" href="/support">Support</a>
        <a className="tile" href="/profile">Profil & BankID</a>
        <a className="tile" href="/cases?filter=previous">Tidigare ärenden</a>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p>Laddar…</p>}>
      <HomeInner />
    </Suspense>
  );
}
