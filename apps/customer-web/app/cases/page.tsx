"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSupabase } from "../lib/supabase-client";

interface Incident {
  id: string;
  case_number: string | null;
  type: string;
  status: string;
  created_at: string;
}

const ACTIVE = ["draft", "awaiting_bankid", "bankid_verified", "signed", "submitted", "received", "more_info_required", "in_progress"];

function CasesInner() {
  const supabase = useSupabase();
  const params = useSearchParams();
  const filter = params.get("filter");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const { data } = await supabase
      .from("incidents")
      .select("id, case_number, type, status, created_at")
      .eq("customer_user_id", auth.user.id)
      .order("created_at", { ascending: false });
    setIncidents(((data as Incident[] | null) ?? []) as Incident[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supabase) return <p>Cases are unavailable until Supabase is configured.</p>;
  if (authed === false)
    return (
      <p>
        Please <a href="/login">log in</a> to view your cases.
      </p>
    );

  const shown = incidents.filter((i) =>
    filter === "previous" ? !ACTIVE.includes(i.status) : filter === "active" ? ACTIVE.includes(i.status) : true,
  );

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>My Cases</h1>
      {shown.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No cases to show.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {shown.map((i) => (
            <li key={i.id} className="tile" style={{ marginBottom: 10 }}>
              <a href={`/cases/${i.id}`}>
                {i.case_number ?? i.id.slice(0, 8)} — {i.type} — {i.status}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CasesInner />
    </Suspense>
  );
}
