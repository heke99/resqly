"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSupabase } from "../../lib/supabase-client";
import { towStatusLabel, whatHappensNext, formatEta, incidentStatusLabel } from "@resqly/web-kit";
import type { TowJobStatus } from "@resqly/types";

interface Incident {
  id: string;
  case_number: string | null;
  type: string;
  status: string;
  description: string | null;
  requires_bankid: boolean;
  bankid_verified: boolean;
}

interface TimelineEntry {
  at: string;
  kind: "incident" | "tow";
  to_status: string;
  reason: string | null;
}

interface CaseLocation {
  kind: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const CANCELLABLE = new Set([
  "draft",
  "awaiting_bankid",
  "bankid_verified",
  "signed",
  "submitted",
  "received",
  "more_info_required",
]);

function timelineLabel(entry: TimelineEntry): string {
  return entry.kind === "tow" ? towStatusLabel(entry.to_status as TowJobStatus) : incidentStatusLabel(entry.to_status);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useSupabase();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [towStatus, setTowStatus] = useState<TowJobStatus | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [locations, setLocations] = useState<CaseLocation[]>([]);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setAuthed(false); return; }
    setAuthed(true);
    const { data: inc } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();
    setIncident((inc as Incident | null) ?? null);
    setLoaded(true);
    const { data: job } = await supabase
      .from("tow_jobs")
      .select("id, status")
      .eq("incident_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const jobRow = job as { id: string; status: TowJobStatus } | null;
    if (jobRow) {
      setTowStatus(jobRow.status);
      const { data: eta } = await supabase
        .from("tow_job_eta_snapshots")
        .select("eta_seconds")
        .eq("tow_job_id", jobRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const etaRow = eta as { eta_seconds: number } | null;
      if (etaRow) setEtaSeconds(etaRow.eta_seconds);
    }
    // Merged timeline (incident + tow events) via the customer API.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (token) {
      try {
        const res = await fetch(`/api/customer/cases/${id}/timeline`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as { entries?: TimelineEntry[]; locations?: CaseLocation[] };
          setTimeline(json.entries ?? []);
          setLocations(json.locations ?? []);
        }
      } catch {
        // Timeline is progressive enhancement — the page still works without it.
      }
    }
  }, [supabase, id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function accessToken() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function verifyWithBankid() {
    if (busy) return;
    const token = await accessToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/cases/${id}/bankid/sign`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? "BankID-verifieringen kunde inte startas. Försök igen."); return; }
      if (json.bankid_verified || json.status === "complete") {
        setMessage("BankID verifierad.");
        await load();
        return;
      }
      if (json.session_id) {
        setMessage("BankID är startat. Slutför i BankID-appen.");
        await pollBankid(json.session_id);
      }
    } catch {
      setMessage("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function pollBankid(sessionId: string) {
    const token = await accessToken();
    if (!token) return;
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await fetch(`/api/customer/bankid/sessions/${sessionId}/poll`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? "BankID-verifieringen kunde inte kontrolleras."); return; }
      if (json.bankid_verified || json.status === "complete") {
        setMessage("BankID verifierad.");
        await load();
        return;
      }
      if (["failed", "cancelled", "expired"].includes(String(json.status))) {
        setMessage("BankID-verifieringen avbröts eller gick ut. Försök igen.");
        return;
      }
    }
    setMessage("BankID tar längre tid än väntat. Kontrollera status igen om en stund.");
  }

  async function requestTow() {
    if (busy) return;
    const token = await accessToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/cases/${id}/request-tow`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ priority: "normal" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(json.error ?? "Bärgningen kunde inte skickas. Försök igen.");
      else { setMessage(`Bärgning begärd: ${towStatusLabel(json.status)}`); await load(); }
    } catch {
      setMessage("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelCase() {
    if (busy) return;
    if (!cancelReason.trim()) { setMessage("Ange varför du vill avbryta ärendet."); return; }
    const token = await accessToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customer/cases/${id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(json.error ?? "Ärendet kunde inte avbrytas. Kontakta supporten.");
      else {
        setMessage("Ärendet är avbrutet.");
        setShowCancel(false);
        await load();
      }
    } catch {
      setMessage("Något gick fel. Kontrollera din uppkoppling och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) return <p>Tjänsten är inte tillgänglig just nu. Försök igen om en stund.</p>;
  if (authed === false) return <p>Du behöver <a href="/login">logga in</a>.</p>;
  if (!incident && !loaded) return <p>Laddar ärende…</p>;
  if (!incident) {
    return (
      <div>
        <h1 style={{ fontSize: 24 }}>Ärendet hittades inte</h1>
        <p style={{ opacity: 0.72 }}>Ärendet finns inte eller tillhör ett annat konto.</p>
        <a className="bigbtn" href="/cases">Till mina ärenden</a>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>{incident.case_number ?? "Ärende"}</h1>
      <p style={{ opacity: 0.7 }}>{incident.type === "damage_claim" ? "Försäkringsärende" : "Bärgningsärende"} • {incidentStatusLabel(incident.status)}</p>

      {incident.requires_bankid && !incident.bankid_verified ? (
        <div className="status-card">
          <strong>BankID krävs</strong>
          <p className="vehicle-meta">Verifiera ärendet innan det skickas vidare till försäkringsbolag/bärgning.</p>
          <button className="bigbtn" onClick={verifyWithBankid} disabled={busy}>{busy ? "Väntar på BankID…" : "Verifiera med BankID"}</button>
        </div>
      ) : null}

      {incident.bankid_verified && !towStatus && incident.type !== "damage_claim" ? (
        <div className="status-card">
          <strong>Redo för bärgning</strong>
          <p className="vehicle-meta">Vi kan nu begära bärgning för ärendet.</p>
          <button className="bigbtn" onClick={requestTow} disabled={busy}>{busy ? "Skickar…" : "Begär bärgning"}</button>
        </div>
      ) : null}

      {towStatus ? (
        <div className="status-card" style={{ marginTop: 12 }}>
          <strong>{towStatusLabel(towStatus)}</strong>
          <p style={{ margin: "6px 0 0" }}>{whatHappensNext(towStatus)}</p>
          {etaSeconds != null ? <p style={{ margin: "6px 0 0" }}>ETA: {formatEta(etaSeconds)}</p> : null}
        </div>
      ) : incident.type === "damage_claim" ? (
        <p style={{ opacity: 0.7 }}>Skadeärendet är synligt i försäkringsbolagets portal efter BankID-verifiering.</p>
      ) : (
        <p style={{ opacity: 0.7 }}>{whatHappensNext("matching")}</p>
      )}

      {locations.length > 0 ? (
        <div className="status-card" style={{ marginTop: 12 }}>
          <strong>Platser</strong>
          {locations.map((loc, i) => (
            <p key={i} className="vehicle-meta" style={{ margin: "4px 0 0" }}>
              {loc.kind === "destination" ? "Destination: " : "Upphämtning: "}
              {loc.address ?? (loc.lat != null && loc.lng != null ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : "—")}
            </p>
          ))}
        </div>
      ) : null}

      {timeline.length > 0 ? (
        <div className="status-card" style={{ marginTop: 12 }}>
          <strong>Händelser</strong>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {timeline.map((entry, i) => (
              <li key={i} style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                <span style={{ fontWeight: 600 }}>{timelineLabel(entry)}</span>
                <span style={{ opacity: 0.6, marginLeft: 8, fontSize: 13 }}>{formatTime(entry.at)}</span>
                {entry.reason ? <div style={{ opacity: 0.7, fontSize: 13 }}>{entry.reason}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="status-card" style={{ marginTop: 12 }}>
          <strong>Vad händer nu?</strong>
          <p className="vehicle-meta">Statusen på ärendet uppdateras automatiskt på den här sidan.</p>
        </div>
      )}

      {incident.status !== "cancelled" && CANCELLABLE.has(incident.status) ? (
        <div style={{ marginTop: 16 }}>
          {showCancel ? (
            <div className="status-card">
              <strong>Avbryt ärendet</strong>
              <label htmlFor="cancel-reason" className="vehicle-meta" style={{ display: "block", marginTop: 6 }}>
                Varför vill du avbryta?
              </label>
              <input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="T.ex. hjälpen behövs inte längre"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="bigbtn" onClick={cancelCase} disabled={busy}>
                  {busy ? "Avbryter…" : "Bekräfta avbryt"}
                </button>
                <button className="bigbtn" style={{ opacity: 0.7 }} onClick={() => setShowCancel(false)} disabled={busy}>
                  Ångra
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCancel(true)}
              style={{ background: "transparent", border: "none", color: "#B00020", cursor: "pointer", padding: 0 }}
            >
              Behöver du avbryta ärendet?
            </button>
          )}
        </div>
      ) : null}

      <p style={{ marginTop: 16 }}>
        <a href="/support">Behöver du hjälp? Kontakta supporten</a>
      </p>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
