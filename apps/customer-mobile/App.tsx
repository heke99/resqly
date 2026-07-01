import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { towStatusLabel, whatHappensNext } from "@resqly/ui";
import { getSupabase } from "./src/supabase";
import { palette } from "./src/theme";

type Screen = "hem" | "konto" | "fordon" | "newCase" | "ärenden" | "caseDetail";

const TILES: Array<{ key: Screen; label: string }> = [
  { key: "newCase", label: "Starta ärende" },
  { key: "fordon", label: "Mina fordon" },
  { key: "ärenden", label: "Mina ärenden" },
  { key: "konto", label: "Profil & BankID" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("hem");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const supabase = getSupabase();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Resqly</Text>
      {!supabase ? (
        <Text style={styles.muted}>Appen är inte konfigurerad ännu.</Text>
      ) : null}
      <View style={styles.body}>
        {screen === "hem" ? <Home onNavigate={setScreen} /> : null}
        {screen === "konto" ? <Login /> : null}
        {screen === "fordon" ? <Vehicles /> : null}
        {screen === "newCase" ? <NewCase /> : null}
        {screen === "ärenden" ? (
          <Cases
            onOpen={(id) => {
              setActiveCaseId(id);
              setScreen("caseDetail");
            }}
          />
        ) : null}
        {screen === "caseDetail" && activeCaseId ? (
          <CaseDetail caseId={activeCaseId} onBack={() => setScreen("ärenden")} />
        ) : null}
      </View>
      <View style={styles.nav}>
        {(["hem", "ärenden", "fordon", "konto"] as Screen[]).map((s) => (
          <Pressable key={s} onPress={() => setScreen(s)}>
            <Text style={styles.navItem}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Home({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <ScrollView>
      <Text style={styles.h1}>Vad behöver du hjälp med?</Text>
      <View style={styles.tiles}>
        {TILES.map((t) => (
          <Pressable key={t.key} style={styles.tile} onPress={() => onNavigate(t.key)}>
            <Text style={styles.tileText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Login() {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Du är inloggad.");
  }
  async function signUp() {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Kontot är skapat.");
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Profil & BankID</Text>
      <Text style={styles.label}>E-post</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Lösenord</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.bigbtn} onPress={signIn}>
        <Text style={styles.bigbtnText}>Logga in</Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, styles.secondary]} onPress={signUp}>
        <Text style={[styles.bigbtnText, { color: palette.primary }]}>Skapa konto</Text>
      </Pressable>
      <Text style={styles.muted}>
        BankID används för att verifiera fordonskopplingar och försäkringsärenden. Personnummer delas aldrig med bärgningsförare.
      </Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

interface VehicleRow {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
}

function Vehicles() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [reg, setReg] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase.from("vehicles").select("*").eq("owner_user_id", auth.user.id);
    setRows((data as VehicleRow[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("vehicles").insert({
      owner_user_id: auth.user.id,
      registration_number: reg.toUpperCase().replace(/[\s-]/g, ""),
      is_default: rows.length === 0,
    } as never);
    setReg("");
    await load();
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.h1}>Mina fordon</Text>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.id}
        ListEmptyComponent={<Text style={styles.muted}>Inga fordon ännu.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text>
              {item.make ?? ""} {item.model ?? ""} {item.registration_number}
            </Text>
          </View>
        )}
      />
      <Text style={styles.label}>Registreringsnummer</Text>
      <TextInput style={styles.input} value={reg} onChangeText={setReg} autoCapitalize="characters" />
      <Pressable style={styles.bigbtn} onPress={add}>
        <Text style={styles.bigbtnText}>Lägg till fordon</Text>
      </Pressable>
    </View>
  );
}

function NewCase() {
  const supabase = getSupabase();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [problem, setProblem] = useState("dead_battery");
  const [mode, setMode] = useState<"insurance" | "private">("insurance");
  const [status, setStatus] = useState<string | null>(null);

  async function shareLocation() {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setStatus("Platsbehörighet nekades. Du kan fortfarande kontakta support.");
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }

  async function submit() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("Logga in först.");
      return;
    }
    const { data: fordon } = await supabase
      .from("vehicles")
      .select("id, insurance_company_id")
      .eq("owner_user_id", auth.user.id)
      .limit(1);
    const vehicle = ((fordon as Array<{ id: string; insurance_company_id: string | null }> | null) ??
      [])[0];
    if (!vehicle) {
      setStatus("Lägg till ett fordon först.");
      return;
    }

    let tenantId: string | null = null;
    let insuranceCompanyId: string | null = null;
    let requiresBankid = false;

    if (mode === "private") {
      const { data: mkt } = await supabase
        .from("tenants")
        .select("id")
        .eq("type", "platform_internal")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      tenantId = (mkt as { id?: string } | null)?.id ?? null;
      if (!tenantId) {
        setStatus("Privat bärgning är inte aktiverad ännu.");
        return;
      }
    } else {
      if (!vehicle.insurance_company_id) {
        setStatus("Koppla fordonet till ett försäkringsbolag först, eller välj privat bärgning.");
        return;
      }
      insuranceCompanyId = vehicle.insurance_company_id;
      const { data: ins } = await supabase
        .from("insurance_companies")
        .select("tenant_id")
        .eq("id", vehicle.insurance_company_id)
        .maybeSingle();
      tenantId = (ins as { tenant_id?: string } | null)?.tenant_id ?? null;
      if (!tenantId) {
        setStatus("Försäkringen är inte tillgänglig.");
        return;
      }
      requiresBankid = true;
    }

    const { data: caseNo } = await supabase.rpc("allocate_case_number", {
      p_tenant: tenantId,
      p_scope: "default",
    } as never);
    const { data: incident } = await supabase
      .from("incidents")
      .insert({
        tenant_id: tenantId,
        customer_user_id: auth.user.id,
        vehicle_id: vehicle.id,
        insurance_company_id: insuranceCompanyId,
        type: "towing",
        status: requiresBankid ? "awaiting_bankid" : "submitted",
        problem_type: problem,
        requires_bankid: requiresBankid,
        case_number: caseNo,
      } as never)
      .select("id")
      .single();
    const incidentId = (incident as { id?: string } | null)?.id;
    if (incidentId && coords) {
      await supabase.from("incident_locations").insert({
        incident_id: incidentId,
        kind: "pickup",
        lat: coords.lat,
        lng: coords.lng,
      } as never);
    }
    setStatus(`Ärende skapat: ${String(caseNo)}`);
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Starta ärende</Text>
      <Text style={styles.label}>Problem</Text>
      <TextInput style={styles.input} value={problem} onChangeText={setProblem} />
      <Text style={styles.label}>Hur vill du bärga?</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Pressable
          style={[styles.pill, mode === "insurance" ? styles.pillActive : null]}
          onPress={() => setMode("insurance")}
        >
          <Text style={mode === "insurance" ? styles.pillTextActive : styles.pillText}>Via försäkring</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, mode === "private" ? styles.pillActive : null]}
          onPress={() => setMode("private")}
        >
          <Text style={mode === "private" ? styles.pillTextActive : styles.pillText}>Privat / direkt</Text>
        </Pressable>
      </View>
      <Pressable style={styles.bigbtn} onPress={shareLocation}>
        <Text style={styles.bigbtnText}>
          {coords ? `Position delad (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : "Dela min position"}
        </Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, { marginTop: 12 }]} onPress={submit}>
        <Text style={styles.bigbtnText}>Skapa ärende</Text>
      </Pressable>
      {status ? <Text style={styles.muted}>{status}</Text> : null}
    </ScrollView>
  );
}

interface IncidentRow {
  id: string;
  case_number: string | null;
  type: string;
  status: string;
}

function Cases({ onOpen }: { onOpen: (id: string) => void }) {
  const supabase = getSupabase();
  const [rows, setRows] = useState<IncidentRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) return setRows([]);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setRows([]);
      const { data } = await supabase
        .from("incidents")
        .select("id, case_number, type, status")
        .eq("customer_user_id", auth.user.id)
        .order("created_at", { ascending: false });
      setRows((data as IncidentRow[] | null) ?? []);
    })();
  }, [supabase]);

  if (rows === null) return <ActivityIndicator />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={<Text style={styles.h1}>Mina ärenden</Text>}
      ListEmptyComponent={<Text style={styles.muted}>Inga ärenden ännu.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item.id)}>
          <Text style={{ fontWeight: "700" }}>{item.case_number ?? item.id.slice(0, 8)}</Text>
          <Text>{towStatusLabel(item.status as never)}</Text>
          <Text style={styles.muted}>Tryck för att följa status →</Text>
        </Pressable>
      )}
    />
  );
}

interface CaseDetailData {
  incident: { id: string; case_number: string | null; status: string; type: string } | null;
  job: { id: string; status: string; tow_company_id: string | null; driver_id: string | null } | null;
  eta: { eta_seconds: number; distance_meters: number } | null;
}

function CaseDetail({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const supabase = getSupabase();
  const [data, setData] = useState<CaseDetailData | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: incident } = await supabase
      .from("incidents")
      .select("id, case_number, status, type")
      .eq("id", caseId)
      .maybeSingle();
    const { data: job } = await supabase
      .from("tow_jobs")
      .select("id, status, tow_company_id, driver_id")
      .eq("incident_id", caseId)
      .maybeSingle();
    let eta: CaseDetailData["eta"] = null;
    if (job) {
      const { data: snap } = await supabase
        .from("tow_job_eta_snapshots")
        .select("eta_seconds, distance_meters")
        .eq("tow_job_id", (job as { id: string }).id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      eta = (snap as CaseDetailData["eta"]) ?? null;
    }
    setData({
      incident: (incident as CaseDetailData["incident"]) ?? null,
      job: (job as CaseDetailData["job"]) ?? null,
      eta,
    });
  }, [supabase, caseId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <ActivityIndicator />;
  const job = data.job;
  const jobStatus = job?.status ?? data.incident?.status ?? "matching";

  return (
    <ScrollView>
      <Pressable onPress={onBack}>
        <Text style={{ color: palette.primary, fontWeight: "700" }}>‹ Tillbaka</Text>
      </Pressable>
      <Text style={styles.h1}>{data.incident?.case_number ?? caseId.slice(0, 8)}</Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{towStatusLabel(jobStatus as never)}</Text>
        <Text style={styles.muted}>{whatHappensNext(jobStatus as never)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={{ fontWeight: "600" }}>Bärgningsstatus</Text>
        {!job ? (
          <Text style={styles.muted}>Söker bärgare…</Text>
        ) : (
          <>
            <Text>{job.tow_company_id ? "Ett bärgningsföretag har accepterat uppdraget." : "Söker tillgängligt bärgningsföretag…"}</Text>
            <Text>{job.driver_id ? "En förare är tilldelad och på väg." : "Väntar på att förare accepterar."}</Text>
            {data.eta ? (
              <Text style={{ marginTop: 6 }}>
                ETA ~{Math.round(data.eta.eta_seconds / 60)} min ({(data.eta.distance_meters / 1000).toFixed(1)} km)
              </Text>
            ) : null}
          </>
        )}
      </View>
      <Text style={styles.muted}>Den här vyn uppdateras automatiskt var 15:e sekund.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background, paddingTop: 56, paddingHorizontal: 16 },
  brand: { fontSize: 18, fontWeight: "800", color: palette.primary },
  body: { flex: 1, marginTop: 12 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { backgroundColor: palette.surface, borderRadius: 14, padding: 20, width: "47%" },
  tileText: { fontWeight: "600", fontSize: 16 },
  card: { backgroundColor: palette.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16 },
  bigbtn: { backgroundColor: palette.primary, borderRadius: 12, padding: 16, marginTop: 14, alignItems: "center" },
  bigbtnText: { color: palette.onPrimary, fontWeight: "700", fontSize: 16 },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.primary },
  muted: { opacity: 0.7, marginTop: 10 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  navItem: { fontWeight: "600", textTransform: "capitalize" },
  pill: { borderWidth: 1, borderColor: palette.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  pillActive: { backgroundColor: palette.primary },
  pillText: { color: palette.primary, fontWeight: "600" },
  pillTextActive: { color: palette.onPrimary, fontWeight: "600" },
});
