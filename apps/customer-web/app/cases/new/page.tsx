"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../../lib/supabase-client";
import { damageTypeLabel, problemTypeLabel, towStatusLabel } from "@resqly/web-kit";

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

interface PricePreview {
  distance_km: number | null;
  factors: { evening_night: boolean; weekend: boolean } | null;
  estimates: Array<{
    company_name: string;
    total_minor: number;
    currency: string;
    lines: Array<{ type: string; description: string; total_minor: number }>;
    cancellation_policy: string | null;
  }>;
  companies_without_pricing: number;
  disclaimer: string;
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
  const [address, setAddress] = useState("");
  const [destination, setDestination] = useState("");
  const [gpsDenied, setGpsDenied] = useState(false);
  const [created, setCreated] = useState<{ id: string; caseNumber: string; requiresBankid: boolean; towStatus?: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState(0);
  // One key per form mount: double clicks and retries never create two cases.
  const [idempotencyKey] = useState(() =>
    typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  );

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
    if (!navigator.geolocation) {
      setGpsDenied(true);
      setStatus("Platsdelning stöds inte i den här webbläsaren. Ange adressen manuellt nedan.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsDenied(false);
      },
      () => {
        setGpsDenied(true);
        setStatus("Kunde inte hämta din position. Ange adressen manuellt nedan så hjälper vi dig ändå.");
      },
    );
  }

  async function token(): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadPricePreview() {
    if (previewBusy) return;
    const accessToken = await token();
    if (!accessToken) { setStatus("not_authed"); return; }
    setPreviewBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/customer/private-price-preview", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pickup: coords, address: address || null, destination: destination || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(json.error ?? "Prisuppskattningen kunde inte hämtas just nu."); return; }
      setPreview(json as PricePreview);
    } catch {
      setStatus("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStatus(null);
    const accessToken = await token();
    if (!accessToken) { setStatus("not_authed"); return; }
    if (!vehicleId) { setStatus("Välj vilket fordon ärendet gäller."); return; }
    const effectiveMode = isDamage ? "insurance" : mode;
    if (effectiveMode === "insurance" && !selectedPolicy) {
      setStatus("Koppla detta fordon till ett försäkringsbolag först, eller välj privat bärgning.");
      return;
    }
    if (!consent) {
      setStatus("Godkänn hur dina uppgifter delas för att fortsätta.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/customer/cases", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          type,
          subtype,
          description,
          coords,
          address: address || null,
          destination: !isDamage ? destination || null : null,
          mode: effectiveMode,
          consent: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(json.error ?? "Ärendet kunde inte skapas. Försök igen."); return; }
      setCreated({ id: json.incident_id, caseNumber: json.case_number, requiresBankid: Boolean(json.requires_bankid) });
    } catch {
      setStatus("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyWithBankid() {
    if (!created || busy) return;
    const accessToken = await token();
    if (!accessToken) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/cases/${created.id}/bankid/sign`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(json.error ?? "BankID-verifieringen kunde inte startas. Försök igen."); return; }
      if (json.bankid_verified || json.status === "complete") {
        setStatus("BankID verifierad.");
        setCreated({ ...created, requiresBankid: false });
        return;
      }
      if (json.session_id) {
        setStatus("BankID är startat. Slutför i BankID-appen.");
        await pollBankid(json.session_id);
      }
    } catch {
      setStatus("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function pollBankid(sessionId: string) {
    const accessToken = await token();
    if (!accessToken) return;
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await fetch(`/api/customer/bankid/sessions/${sessionId}/poll`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(json.error ?? "BankID-verifieringen kunde inte kontrolleras."); return; }
      if (json.bankid_verified || json.status === "complete") {
        setStatus("BankID verifierad.");
        setCreated((current) => current ? { ...current, requiresBankid: false } : current);
        return;
      }
      if (["failed", "cancelled", "expired"].includes(String(json.status))) {
        setStatus("BankID-verifieringen avbröts eller gick ut. Försök igen.");
        return;
      }
    }
    setStatus("BankID tar längre tid än väntat. Öppna ärendet och kontrollera status igen.");
  }

  async function requestTow() {
    if (!created || busy) return;
    const accessToken = await token();
    if (!accessToken) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/cases/${created.id}/request-tow`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ priority: "normal", address: address || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setStatus(json.error ?? "Bärgningen kunde inte skickas. Försök igen.");
      else setCreated({ ...created, towStatus: towStatusLabel(json.status ?? "manual_review") });
    } catch {
      setStatus("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) return <p>Tjänsten är inte tillgänglig just nu. Försök igen om en stund.</p>;
  if (status === "not_authed") return <p>Du behöver <a href="/login">logga in</a> för att skapa ett ärende.</p>;

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
              <button className="bigbtn" onClick={verifyWithBankid} disabled={busy}>{busy ? "Väntar på BankID…" : "Verifiera med BankID"}</button>
            </>
          ) : isDamage ? (
            <>
              <p>Ärendet är verifierat och skickas vidare till ditt försäkringsbolag.</p>
              <a className="bigbtn" href={`/cases/${created.id}`}>Visa ärendet</a>
            </>
          ) : (
            <>
              <p>{created.towStatus ? `Bärgning begärd: ${created.towStatus}` : "Verifieringen är klar. Nu kan vi skicka ut bärgningen."}</p>
              {created.towStatus ? <a className="bigbtn" href={`/cases/${created.id}`}>Följ ärendet</a> : <button className="bigbtn" onClick={requestTow} disabled={busy}>{busy ? "Skickar…" : "Begär bärgning"}</button>}
            </>
          )}
        </div>
        {status ? <p>{status}</p> : null}
      </div>
    );
  }

  // Step-by-step wizard: one clear question per screen.
  const steps = isDamage
    ? (["vehicle", "what", "where", "confirm"] as const)
    : (["vehicle", "payment", "what", "where", "confirm"] as const);
  const currentStep = steps[Math.min(step, steps.length - 1)]!;

  const STEP_TITLES: Record<(typeof steps)[number], string> = {
    vehicle: "Vilket fordon gäller det?",
    payment: "Hur vill du bärga?",
    what: isDamage ? "Vad har hänt med fordonet?" : "Vad är problemet?",
    where: "Var står fordonet?",
    confirm: "Granska och skicka",
  };

  function next() {
    setStatus(null);
    if (currentStep === "vehicle" && !vehicleId) {
      setStatus("Välj vilket fordon ärendet gäller.");
      return;
    }
    if (currentStep === "payment" && mode === "insurance" && !selectedPolicy) {
      setStatus("Koppla detta fordon till ett försäkringsbolag först, eller välj privat bärgning.");
      return;
    }
    const nextIndex = Math.min(step + 1, steps.length - 1);
    setStep(nextIndex);
    // Fetch the price preview automatically when entering the confirm step.
    if (steps[nextIndex] === "confirm" && !isDamage && mode === "private" && !preview && !previewBusy) {
      void loadPricePreview();
    }
  }

  function back() {
    setStatus(null);
    setStep(Math.max(0, step - 1));
  }

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>{isDamage ? "Anmäl skada" : "Begär bärgning"}</h1>
      <p style={{ opacity: 0.72 }}>
        Steg {step + 1} av {steps.length} — {STEP_TITLES[currentStep]}
      </p>
      <div style={{ display: "flex", gap: 4, margin: "8px 0 16px" }} aria-hidden>
        {steps.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= step ? "var(--rs-color-primary, #0B5FFF)" : "rgba(0,0,0,0.12)",
            }}
          />
        ))}
      </div>

      <form onSubmit={submit}>
        {currentStep === "vehicle" ? (
          <div>
            <label htmlFor="vehicle">Fordon</label>
            <select id="vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Välj fordon…</option>
              {vehicles.map((v) => {
                const p = policyByVehicle.get(v.id);
                return <option key={v.id} value={v.id}>{v.registration_number} {p?.insurance_companies?.name ? `— ${p.insurance_companies.name}` : "— saknar försäkring"}</option>;
              })}
            </select>
            {selectedVehicle ? (
              <p className="vehicle-meta">
                {selectedPolicy?.insurance_companies?.name
                  ? `Försäkrad hos ${selectedPolicy.insurance_companies.name}.`
                  : "Fordonet saknar kopplad försäkring."}{" "}
                <a href={`/insurances?vehicle=${selectedVehicle.id}`}>Byt/koppla försäkring</a>
              </p>
            ) : null}
            {vehicles.length === 0 ? (
              <p className="vehicle-meta"><a href="/vehicles">Lägg till ditt fordon först</a> — det tar mindre än en minut.</p>
            ) : null}
          </div>
        ) : null}

        {currentStep === "payment" ? (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <label className="status-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="mode" checked={mode === "insurance"} onChange={() => setMode("insurance")} style={{ marginTop: 3 }} />
                <span>
                  <strong>Via försäkring</strong>
                  <span className="vehicle-meta" style={{ display: "block" }}>
                    Bärgningen hanteras av försäkringsbolagets avtalade bärgare. BankID-verifiering kan krävas.
                  </span>
                </span>
              </label>
              <label className="status-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="mode" checked={mode === "private"} onChange={() => setMode("private")} style={{ marginTop: 3 }} />
                <span>
                  <strong>Privat / direkt</strong>
                  <span className="vehicle-meta" style={{ display: "block" }}>
                    Du betalar bärgaren direkt. Du ser en prisuppskattning innan du skickar förfrågan.
                  </span>
                </span>
              </label>
            </div>
            {mode === "insurance" && !selectedPolicy ? (
              <p className="vehicle-meta" style={{ marginTop: 10 }}>
                Fordonet saknar försäkringskoppling. <a href={`/insurances?vehicle=${vehicleId}`}>Koppla försäkring</a> eller välj privat bärgning.
              </p>
            ) : null}
          </div>
        ) : null}

        {currentStep === "what" ? (
          <div>
            <label htmlFor="subtype">{isDamage ? "Skadetyp" : "Problem"}</label>
            <select id="subtype" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              {(isDamage ? DAMAGE_TYPES : TOW_PROBLEMS).map((t) => <option key={t} value={t}>{isDamage ? damageTypeLabel(t) : problemTypeLabel(t)}</option>)}
            </select>
            <label htmlFor="desc">Beskriv gärna kort vad som hänt (valfritt)</label>
            <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        ) : null}

        {currentStep === "where" ? (
          <div>
            <button type="button" className="bigbtn" onClick={shareLocation}>
              {coords ? "Position delad ✓" : "Dela min position"}
            </button>
            {coords ? (
              <p className="vehicle-meta">Din position används som upphämtningsplats.</p>
            ) : (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="address">…eller skriv adressen där fordonet står</label>
                <input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Gatuadress, ort"
                />
                {gpsDenied ? <p className="vehicle-meta">Ingen fara — ange adressen så hjälper vi dig ändå.</p> : null}
              </div>
            )}
            {!isDamage ? (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="destination">Vart ska fordonet? (valfritt)</label>
                <input
                  id="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="T.ex. verkstad eller hemadress"
                />
                <p className="vehicle-meta">Lämna tomt om du inte vet ännu — bärgaren hjälper dig välja verkstad.</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "confirm" ? (
          <div>
            <div className="status-card">
              <strong>Sammanfattning</strong>
              <p className="vehicle-meta" style={{ margin: "6px 0 0" }}>Fordon: {selectedVehicle?.registration_number ?? "—"}</p>
              <p className="vehicle-meta" style={{ margin: "4px 0 0" }}>
                {isDamage ? `Skadetyp: ${damageTypeLabel(subtype)}` : `Problem: ${problemTypeLabel(subtype)}`}
              </p>
              {!isDamage ? (
                <p className="vehicle-meta" style={{ margin: "4px 0 0" }}>
                  Betalning: {mode === "insurance" ? `Via försäkring (${selectedPolicy?.insurance_companies?.name ?? "—"})` : "Privat / direkt"}
                </p>
              ) : null}
              <p className="vehicle-meta" style={{ margin: "4px 0 0" }}>
                Plats: {coords ? "Delad position" : address || "Ingen plats angiven ännu"}
              </p>
              {!isDamage && destination ? (
                <p className="vehicle-meta" style={{ margin: "4px 0 0" }}>Destination: {destination}</p>
              ) : null}
            </div>

            {!isDamage && mode === "private" ? (
              <div style={{ marginTop: 12 }}>
                {previewBusy ? <p className="vehicle-meta">Hämtar prisuppskattning…</p> : null}
                {!preview && !previewBusy ? (
                  <button type="button" className="bigbtn" onClick={loadPricePreview}>Visa prisuppskattning</button>
                ) : null}
                {preview ? (
                  <div className="status-card" style={{ marginTop: 10 }}>
                    <strong>Uppskattat pris</strong>
                    {preview.distance_km != null ? (
                      <p className="vehicle-meta">Sträcka: cirka {preview.distance_km} km</p>
                    ) : (
                      <p className="vehicle-meta">Dela din position och ange destination för ett mer exakt pris.</p>
                    )}
                    {preview.factors?.evening_night ? <p className="vehicle-meta">Kvälls-/nattillägg ingår i priset.</p> : null}
                    {preview.factors?.weekend ? <p className="vehicle-meta">Helgtillägg ingår i priset.</p> : null}
                    {preview.estimates.length === 0 ? (
                      <p className="vehicle-meta">Inga förhandspriser tillgängliga just nu — du får hjälp ändå och bärgaren bekräftar priset.</p>
                    ) : (
                      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                        {preview.estimates.map((e, i) => (
                          <li key={i} style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                            <span style={{ fontWeight: 600 }}>{e.company_name}</span>
                            <span style={{ float: "right", fontWeight: 700 }}>
                              {(e.total_minor / 100).toLocaleString("sv-SE")} {e.currency}
                            </span>
                            {e.cancellation_policy ? (
                              <div style={{ opacity: 0.65, fontSize: 12 }}>Avbokning: {e.cancellation_policy}</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {preview.companies_without_pricing > 0 ? (
                      <p className="vehicle-meta">
                        Ytterligare {preview.companies_without_pricing} bärgare kan ta uppdraget utan förhandspris.
                      </p>
                    ) : null}
                    <p className="vehicle-meta" style={{ marginTop: 8 }}>{preview.disclaimer}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="status-card" style={{ marginTop: 16 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 14 }}>
                  {isDamage || mode === "insurance"
                    ? "Jag godkänner att uppgifter om ärendet, fordonet, min position och mina kontaktuppgifter delas med mitt försäkringsbolag och den bärgare som tar uppdraget."
                    : "Jag godkänner att den bärgare som accepterar uppdraget får mitt namn, telefonnummer, fordonets registreringsnummer, plats och destination."}
                </span>
              </label>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {step > 0 ? (
            <button type="button" className="bigbtn" style={{ opacity: 0.75 }} onClick={back} disabled={busy}>
              Tillbaka
            </button>
          ) : null}
          {currentStep !== "confirm" ? (
            <button type="button" className="bigbtn" onClick={next}>
              Fortsätt
            </button>
          ) : (
            <button className="bigbtn" type="submit" disabled={busy}>
              {busy ? "Skickar…" : isDamage ? "Skicka skadeanmälan" : "Skicka förfrågan"}
            </button>
          )}
        </div>
      </form>
      {status && status !== "created" ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}

export default function NewCasePage() {
  return <Suspense fallback={<p>Laddar…</p>}><NewCaseInner /></Suspense>;
}
