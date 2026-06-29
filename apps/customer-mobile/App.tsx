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

type Screen = "home" | "login" | "vehicles" | "newCase" | "cases" | "caseDetail";

const TILES: Array<{ key: Screen; label: string }> = [
  { key: "newCase", label: "Start Case" },
  { key: "vehicles", label: "My Vehicles" },
  { key: "cases", label: "My Cases" },
  { key: "login", label: "Profile & BankID" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const supabase = getSupabase();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Resqly</Text>
      {!supabase ? (
        <Text style={styles.muted}>Set EXPO_PUBLIC_SUPABASE_URL / ANON_KEY to connect.</Text>
      ) : null}
      <View style={styles.body}>
        {screen === "home" ? <Home onNavigate={setScreen} /> : null}
        {screen === "login" ? <Login /> : null}
        {screen === "vehicles" ? <Vehicles /> : null}
        {screen === "newCase" ? <NewCase /> : null}
        {screen === "cases" ? (
          <Cases
            onOpen={(id) => {
              setActiveCaseId(id);
              setScreen("caseDetail");
            }}
          />
        ) : null}
        {screen === "caseDetail" && activeCaseId ? (
          <CaseDetail caseId={activeCaseId} onBack={() => setScreen("cases")} />
        ) : null}
      </View>
      <View style={styles.nav}>
        {(["home", "cases", "vehicles", "login"] as Screen[]).map((s) => (
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
      <Text style={styles.h1}>How can we help?</Text>
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
    setMessage(error ? error.message : "Signed in.");
  }
  async function signUp() {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Account created.");
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Profile & BankID</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.bigbtn} onPress={signIn}>
        <Text style={styles.bigbtnText}>Log in</Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, styles.secondary]} onPress={signUp}>
        <Text style={[styles.bigbtnText, { color: palette.primary }]}>Create account</Text>
      </Pressable>
      <Text style={styles.muted}>
        BankID runs in test/mock mode and is required before insurance cases are submitted. Your
        personal number is never shared with tow drivers.
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
      <Text style={styles.h1}>My Vehicles</Text>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.id}
        ListEmptyComponent={<Text style={styles.muted}>No vehicles yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text>
              {item.make ?? ""} {item.model ?? ""} {item.registration_number}
            </Text>
          </View>
        )}
      />
      <Text style={styles.label}>Registration number</Text>
      <TextInput style={styles.input} value={reg} onChangeText={setReg} autoCapitalize="characters" />
      <Pressable style={styles.bigbtn} onPress={add}>
        <Text style={styles.bigbtnText}>Add vehicle</Text>
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
      setStatus("Location permission denied; you can still call support.");
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }

  async function submit() {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("Please log in first.");
      return;
    }
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, insurance_company_id")
      .eq("owner_user_id", auth.user.id)
      .limit(1);
    const vehicle = ((vehicles as Array<{ id: string; insurance_company_id: string | null }> | null) ??
      [])[0];
    if (!vehicle) {
      setStatus("Add a vehicle first.");
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
        setStatus("Direct/private towing is not enabled on this platform yet.");
        return;
      }
    } else {
      if (!vehicle.insurance_company_id) {
        setStatus("Connect a vehicle to an insurance company first, or choose private towing.");
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
        setStatus("Insurance not available.");
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
    setStatus(`Case created: ${String(caseNo)}`);
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Start a case</Text>
      <Text style={styles.label}>Problem</Text>
      <TextInput style={styles.input} value={problem} onChangeText={setProblem} />
      <Text style={styles.label}>How should we tow?</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Pressable
          style={[styles.pill, mode === "insurance" ? styles.pillActive : null]}
          onPress={() => setMode("insurance")}
        >
          <Text style={mode === "insurance" ? styles.pillTextActive : styles.pillText}>Via insurance</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, mode === "private" ? styles.pillActive : null]}
          onPress={() => setMode("private")}
        >
          <Text style={mode === "private" ? styles.pillTextActive : styles.pillText}>Private / direct</Text>
        </Pressable>
      </View>
      <Pressable style={styles.bigbtn} onPress={shareLocation}>
        <Text style={styles.bigbtnText}>
          {coords ? `Location shared (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : "Share my location"}
        </Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, { marginTop: 12 }]} onPress={submit}>
        <Text style={styles.bigbtnText}>Create case</Text>
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
      ListHeaderComponent={<Text style={styles.h1}>My Cases</Text>}
      ListEmptyComponent={<Text style={styles.muted}>No cases yet.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item.id)}>
          <Text style={{ fontWeight: "700" }}>{item.case_number ?? item.id.slice(0, 8)}</Text>
          <Text>{towStatusLabel(item.status as never)}</Text>
          <Text style={styles.muted}>Tap to follow live status →</Text>
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
        <Text style={{ color: palette.primary, fontWeight: "700" }}>‹ Back</Text>
      </Pressable>
      <Text style={styles.h1}>{data.incident?.case_number ?? caseId.slice(0, 8)}</Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{towStatusLabel(jobStatus as never)}</Text>
        <Text style={styles.muted}>{whatHappensNext(jobStatus as never)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={{ fontWeight: "600" }}>Tow status</Text>
        {!job ? (
          <Text style={styles.muted}>Searching for a tow truck…</Text>
        ) : (
          <>
            <Text>{job.tow_company_id ? "A tow company has accepted your job." : "Finding an available tow company…"}</Text>
            <Text>{job.driver_id ? "A driver is assigned and on the way." : "Waiting for a driver to accept."}</Text>
            {data.eta ? (
              <Text style={{ marginTop: 6 }}>
                ETA ~{Math.round(data.eta.eta_seconds / 60)} min ({(data.eta.distance_meters / 1000).toFixed(1)} km)
              </Text>
            ) : null}
          </>
        )}
      </View>
      <Text style={styles.muted}>This view refreshes automatically every 15 seconds.</Text>
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
