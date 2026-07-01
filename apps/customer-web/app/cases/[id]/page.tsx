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

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useSupabase();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [towStatus, setTowStatus] = useState<TowJobStatus | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setAuthed(false); return; }
    setAuthed(true);
    const { data: inc } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();
    setIncident((inc as Incident | null) ?? null);
    const { data: job } = await supabase.from("tow_jobs").select("id, status").eq("incident_id", id).maybeSingle();
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
    const token = await accessToken();
    if (!token) return;
    const res = await fetch(`/api/customer/cases/${id}/bankid/sign`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(json.error ?? "BankID-verifieringen kunde inte startas."); return; }
    if (json.bankid_verified || json.status === "complete") {
      setMessage("BankID verifierad.");
      await load();
      return;
    }
    if (json.session_id) {
      setMessage("BankID är startat. Slutför i BankID-appen.");
      await pollBankid(json.session_id);
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
    const token = await accessToken();
    if (!token) return;
    const res = await fetch(`/api/customer/cases/${id}/request-tow`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ priority: "normal" }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(json.error ?? "Kunde inte begära bärgning.");
    else { setMessage(`Bärgning begärd: ${towStatusLabel(json.status)}`); await load(); }
  }

  if (!supabase) return <p>Tjänsten är inte konfigurerad ännu.</p>;
  if (authed === false) return <p>Du behöver <a href="/login">logga in</a>.</p>;
  if (!incident) return <p>Laddar ärende…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>{incident.case_number ?? "Ärende"}</h1>
      <p style={{ opacity: 0.7 }}>{incident.type === "damage_claim" ? "Försäkringsärende" : "Bärgningsärende"} • {incidentStatusLabel(incident.status)}</p>

      {incident.requires_bankid && !incident.bankid_verified ? (
        <div className="status-card">
          <strong>BankID krävs</strong>
          <p className="vehicle-meta">Verifiera ärendet innan det skickas vidare till försäkringsbolag/bärgning.</p>
          <button className="bigbtn" onClick={verifyWithBankid}>Verifiera med BankID</button>
        </div>
      ) : null}

      {incident.bankid_verified && !towStatus && incident.type !== "damage_claim" ? (
        <div className="status-card">
          <strong>Redo för bärgning</strong>
          <p className="vehicle-meta">Vi kan nu begära bärgning för ärendet.</p>
          <button className="bigbtn" onClick={requestTow}>Begär bärgning</button>
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

      <div className="status-card" style={{ marginTop: 12 }}>
        <strong>Vad händer nu?</strong>
        <p className="vehicle-meta">Status uppdateras här. Om realtime är nere hämtar appen ny status via polling.</p>
      </div>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
