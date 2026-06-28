"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSupabase } from "../../lib/supabase-client";
import { towStatusLabel, whatHappensNext, formatEta } from "@roadside/web-kit";
import type { TowJobStatus } from "@roadside/types";

interface Incident {
  id: string;
  case_number: string | null;
  type: string;
  status: string;
  description: string | null;
}

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useSupabase();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [towStatus, setTowStatus] = useState<TowJobStatus | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const { data: inc } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();
    setIncident((inc as Incident | null) ?? null);
    const { data: job } = await supabase
      .from("tow_jobs")
      .select("id, status")
      .eq("incident_id", id)
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
  }, [supabase, id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000); // polling fallback when realtime is down
    return () => clearInterval(t);
  }, [load]);

  if (!supabase) return <p>Unavailable until Supabase is configured.</p>;
  if (authed === false)
    return (
      <p>
        Please <a href="/login">log in</a>.
      </p>
    );
  if (!incident) return <p>Loading case…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{incident.case_number ?? "Case"}</h1>
      <p style={{ opacity: 0.7 }}>
        {incident.type} • {incident.status}
      </p>

      {towStatus ? (
        <div className="tile" style={{ marginTop: 12 }}>
          <strong>{towStatusLabel(towStatus)}</strong>
          <p style={{ margin: "6px 0 0" }}>{whatHappensNext(towStatus)}</p>
          {etaSeconds != null ? <p style={{ margin: "6px 0 0" }}>ETA: {formatEta(etaSeconds)}</p> : null}
        </div>
      ) : (
        <p style={{ opacity: 0.7 }}>{whatHappensNext("matching")}</p>
      )}

      <div className="tile" style={{ marginTop: 12, background: "transparent", padding: 0 }}>
        <a className="bigbtn" href="tel:+46000000000" style={{ marginTop: 12 }}>
          Call tow driver
        </a>
      </div>
    </div>
  );
}
