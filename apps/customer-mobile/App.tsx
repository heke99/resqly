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
import { towStatusLabel, whatHappensNext } from "@roadside/ui";
import { getSupabase } from "./src/supabase";
import { palette } from "./src/theme";

type Screen = "home" | "login" | "vehicles" | "newCase" | "cases";

const TILES: Array<{ key: Screen; label: string }> = [
  { key: "newCase", label: "Start Case" },
  { key: "vehicles", label: "My Vehicles" },
  { key: "cases", label: "My Cases" },
  { key: "login", label: "Profile & BankID" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const supabase = getSupabase();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Roadside Assistance</Text>
      {!supabase ? (
        <Text style={styles.muted}>Set EXPO_PUBLIC_SUPABASE_URL / ANON_KEY to connect.</Text>
      ) : null}
      <View style={styles.body}>
        {screen === "home" ? <Home onNavigate={setScreen} /> : null}
        {screen === "login" ? <Login /> : null}
        {screen === "vehicles" ? <Vehicles /> : null}
        {screen === "newCase" ? <NewCase /> : null}
        {screen === "cases" ? <Cases /> : null}
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
    if (!vehicle?.insurance_company_id) {
      setStatus("Connect a vehicle to an insurance company first.");
      return;
    }
    const { data: ins } = await supabase
      .from("insurance_companies")
      .select("tenant_id")
      .eq("id", vehicle.insurance_company_id)
      .maybeSingle();
    const tenantId = (ins as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) {
      setStatus("Insurance not available.");
      return;
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
        insurance_company_id: vehicle.insurance_company_id,
        type: "towing",
        status: "awaiting_bankid",
        problem_type: problem,
        requires_bankid: true,
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

function Cases() {
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
        <View style={styles.card}>
          <Text style={{ fontWeight: "700" }}>{item.case_number ?? item.id.slice(0, 8)}</Text>
          <Text>{towStatusLabel(item.status as never)}</Text>
          <Text style={styles.muted}>{whatHappensNext("matching")}</Text>
        </View>
      )}
    />
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
});
