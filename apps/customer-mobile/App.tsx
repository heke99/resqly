import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  damageTypeLabel,
  formatEta,
  incidentStatusLabel,
  problemTypeLabel,
  towStatusLabel,
  whatHappensNext,
} from "@resqly/ui";
import { getSupabase } from "./src/supabase";
import { customerApi, newIdempotencyKey, pollBankidSession } from "./src/api";
import { DEFAULT_BRANDING, fetchBrandingForTenant, type Branding } from "./src/branding";
import { normalizePhoneE164 } from "@resqly/utils";

type Screen = "home" | "account" | "vehicles" | "insurance" | "newCase" | "cases" | "caseDetail";

const NAV: Array<{ key: Screen; label: string }> = [
  { key: "home", label: "Hem" },
  { key: "cases", label: "Ärenden" },
  { key: "vehicles", label: "Fordon" },
  { key: "account", label: "Konto" },
];

const TOW_PROBLEMS = [
  "car_does_not_start",
  "puncture",
  "accident",
  "engine_failure",
  "dead_battery",
  "stuck_snow_mud",
  "keys_locked_inside",
  "misfueling",
  "ev_out_of_battery",
  "other",
];

export default function App() {
  const supabase = getSupabase();
  const [screen, setScreen] = useState<Screen>("home");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  const refreshBranding = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("customer_insurance_connections")
      .select("tenant_id, status")
      .eq("customer_user_id", auth.user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tenantId = (data as { tenant_id?: string } | null)?.tenant_id;
    if (tenantId) setBranding(await fetchBrandingForTenant(tenantId));
    else setBranding(DEFAULT_BRANDING);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setAuthed(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
      if (data.session) void refreshBranding();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      if (session) void refreshBranding();
      else setBranding(DEFAULT_BRANDING);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, refreshBranding]);

  const palette = branding.tokens;

  if (!supabase) {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <StatusBar style="dark" />
        <Text style={[styles.brand, { color: palette.primary }]}>Resqly</Text>
        <Text style={styles.muted}>Appen är inte klar att användas ännu. Försök igen senare.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar style="dark" />
      <Text style={[styles.brand, { color: palette.primary }]}>{branding.productName}</Text>
      <View style={styles.body}>
        {screen === "home" ? (
          <Home authed={authed} onNavigate={setScreen} palette={palette} supportPhone={branding.supportPhone} />
        ) : null}
        {screen === "account" ? <Account authed={authed} palette={palette} onDone={() => setScreen("home")} /> : null}
        {screen === "vehicles" ? <Vehicles authed={authed} palette={palette} onConnectInsurance={() => setScreen("insurance")} /> : null}
        {screen === "insurance" ? <Insurance authed={authed} palette={palette} onDone={() => { void refreshBranding(); setScreen("vehicles"); }} /> : null}
        {screen === "newCase" ? <NewCase authed={authed} palette={palette} onFollow={(id) => { setActiveCaseId(id); setScreen("caseDetail"); }} /> : null}
        {screen === "cases" ? (
          <Cases
            authed={authed}
            onOpen={(id) => {
              setActiveCaseId(id);
              setScreen("caseDetail");
            }}
          />
        ) : null}
        {screen === "caseDetail" && activeCaseId ? (
          <CaseDetail caseId={activeCaseId} palette={palette} onBack={() => setScreen("cases")} />
        ) : null}
      </View>
      <View style={styles.nav}>
        {NAV.map((n) => (
          <Pressable key={n.key} onPress={() => setScreen(n.key)}>
            <Text style={[styles.navItem, screen === n.key ? { color: palette.primary } : null]}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type Palette = Branding["tokens"];

function Home({
  authed,
  onNavigate,
  palette,
  supportPhone,
}: {
  authed: boolean | null;
  onNavigate: (s: Screen) => void;
  palette: Palette;
  supportPhone: string | null;
}) {
  return (
    <ScrollView>
      <Text style={styles.h1}>Vad behöver du hjälp med?</Text>
      <View style={styles.tiles}>
        <Pressable style={[styles.tile, { backgroundColor: palette.surface }]} onPress={() => onNavigate("newCase")}>
          <Text style={styles.tileText}>Starta bärgning</Text>
        </Pressable>
        <Pressable style={[styles.tile, { backgroundColor: palette.surface }]} onPress={() => onNavigate("vehicles")}>
          <Text style={styles.tileText}>Mina fordon</Text>
        </Pressable>
        <Pressable style={[styles.tile, { backgroundColor: palette.surface }]} onPress={() => onNavigate("cases")}>
          <Text style={styles.tileText}>Mina ärenden</Text>
        </Pressable>
        <Pressable style={[styles.tile, { backgroundColor: palette.surface }]} onPress={() => onNavigate("insurance")}>
          <Text style={styles.tileText}>Koppla försäkring</Text>
        </Pressable>
      </View>
      {authed === false ? (
        <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }]} onPress={() => onNavigate("account")}>
          <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>Logga in eller skapa konto</Text>
        </Pressable>
      ) : null}
      {supportPhone ? <Text style={styles.muted}>Behöver du hjälp? Ring {supportPhone}.</Text> : null}
    </ScrollView>
  );
}

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) return "Fel e-post eller lösenord. Försök igen.";
  if (msg.includes("already registered")) return "Det finns redan ett konto med den e-postadressen. Logga in i stället.";
  if (msg.includes("password should be")) return "Lösenordet är för kort. Använd minst 6 tecken.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "För många försök. Vänta en stund och försök igen.";
  if (msg.includes("network") || msg.includes("fetch")) return "Kunde inte nå tjänsten. Kontrollera din uppkoppling.";
  return "Det gick inte just nu. Kontrollera uppgifterna och försök igen.";
}

function Account({ authed, palette, onDone }: { authed: boolean | null; palette: Palette; onDone: () => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !authed) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
      if (data.user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, phone")
          .eq("id", data.user.id)
          .maybeSingle();
        const row = profile as { full_name?: string | null; phone?: string | null } | null;
        setFullName(row?.full_name ?? "");
        setPhone(row?.phone ?? "");
      }
    })();
  }, [supabase, authed]);

  async function signIn() {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(friendlyAuthError(error.message));
    else onDone();
  }
  async function signUp() {
    if (!supabase || busy) return;
    const normalizedPhone = normalizePhoneE164(phone);
    if (fullName.trim().length < 2) return setMessage("Ange ditt fullständiga namn.");
    if (!normalizedPhone) return setMessage("Ange ett giltigt mobilnummer, till exempel 0701234567.");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim(), phone: normalizedPhone } },
    });
    if (!error && !data.session) {
      setBusy(false);
      setMessage("Kontot är skapat. Bekräfta din e-postadress via mejlet vi skickade och logga sedan in.");
      return;
    }
    if (!error && data.user) {
      const { error: profileError } = await supabase.from("user_profiles").upsert({
        id: data.user.id,
        email: data.user.email ?? email,
        full_name: fullName.trim(),
        phone: normalizedPhone,
      } as never);
      if (profileError) {
        setBusy(false);
        setMessage("Kontot skapades men kontaktuppgifterna kunde inte sparas. Öppna Konto innan du begär bärgning.");
        return;
      }
    }
    setBusy(false);
    if (error) setMessage(friendlyAuthError(error.message));
    else {
      setMessage("Kontot är skapat. Du är nu inloggad.");
      onDone();
    }
  }
  async function saveProfile() {
    if (!supabase || !userId || busy) return;
    const normalizedPhone = normalizePhoneE164(phone);
    if (fullName.trim().length < 2) return setMessage("Ange ditt fullständiga namn.");
    if (!normalizedPhone) return setMessage("Ange ett giltigt mobilnummer, till exempel 0701234567.");
    setBusy(true);
    const { error } = await supabase.from("user_profiles").upsert({
      id: userId,
      email: currentEmail,
      full_name: fullName.trim(),
      phone: normalizedPhone,
    } as never);
    if (!error) await supabase.auth.updateUser({ data: { full_name: fullName.trim(), phone: normalizedPhone } });
    setBusy(false);
    setPhone(normalizedPhone);
    setMessage(error ? "Kontaktuppgifterna kunde inte sparas." : "Kontaktuppgifterna är sparade.");
  }
  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentEmail(null);
    setMessage("Du är utloggad.");
  }

  if (authed) {
    return (
      <ScrollView>
        <Text style={styles.h1}>Mitt konto</Text>
        {currentEmail ? <Text>Inloggad som {currentEmail}</Text> : null}
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <Text style={{ fontWeight: "700" }}>Kontaktuppgifter för bärgning</Text>
          <Text style={styles.label}>Fullständigt namn</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          <Text style={styles.label}>Mobilnummer</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0701234567" />
          <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={saveProfile} disabled={busy}>
            <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Sparar…" : "Spara uppgifter"}</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <Text style={{ fontWeight: "700" }}>BankID</Text>
          <Text style={styles.muted}>
            BankID används för att verifiera fordonskopplingar och försäkringsärenden. Personnummer och
            BankID-uppgifter delas aldrig med bärgare eller förare.
          </Text>
        </View>
        <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }]} onPress={signOut}>
          <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>Logga ut</Text>
        </Pressable>
        {message ? <Text style={styles.muted}>{message}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Logga in eller skapa konto</Text>
      <Text style={styles.label}>Fullständigt namn (krävs när du skapar konto)</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Text style={styles.label}>Mobilnummer (krävs när du skapar konto)</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0701234567" />
      <Text style={styles.label}>E-post</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Text style={styles.label}>Lösenord</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={signIn} disabled={busy}>
        <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Vänta…" : "Logga in"}</Text>
      </Pressable>
      <Pressable
        style={[styles.bigbtn, styles.secondary, { borderColor: palette.primary }, busy ? styles.disabled : null]}
        onPress={signUp}
        disabled={busy}
      >
        <Text style={[styles.bigbtnText, { color: palette.primary }]}>Skapa konto</Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

interface VehicleRow {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  insurance_company_id: string | null;
}

function LoginPrompt({ palette }: { palette: Palette }) {
  return (
    <View>
      <Text style={styles.h1}>Logga in först</Text>
      <Text style={styles.muted}>Gå till Konto och logga in för att fortsätta.</Text>
      <View style={[styles.card, { backgroundColor: palette.surface, marginTop: 12 }]}>
        <Text>Du kan ha flera fordon med olika försäkringsbolag på samma konto.</Text>
      </View>
    </View>
  );
}

function Vehicles({
  authed,
  palette,
  onConnectInsurance,
}: {
  authed: boolean | null;
  palette: Palette;
  onConnectInsurance: () => void;
}) {
  const supabase = getSupabase();
  const [rows, setRows] = useState<VehicleRow[] | null>(null);
  const [reg, setReg] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from("vehicles")
      .select("id, registration_number, make, model, insurance_company_id")
      .eq("owner_user_id", auth.user.id)
      .order("created_at", { ascending: false });
    setRows((data as VehicleRow[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (busy) return;
    if (!reg.trim()) {
      setMessage("Ange fordonets registreringsnummer.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await customerApi<{ vehicle_id?: string; duplicate?: boolean }>("/api/customer/vehicles", {
      body: { registration_number: reg },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setReg("");
    setMessage(res.data.duplicate ? "Fordonet finns redan bland dina fordon." : "Fordon sparat. Koppla nu rätt försäkring.");
    await load();
  }

  if (authed === false) return <LoginPrompt palette={palette} />;
  if (rows === null) return <ActivityIndicator />;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.h1}>Mina fordon</Text>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.id}
        ListEmptyComponent={<Text style={styles.muted}>Inga fordon ännu. Lägg till din första bil nedan.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <Text style={{ fontWeight: "700" }}>{item.registration_number}</Text>
            <Text style={styles.muted}>{[item.make, item.model].filter(Boolean).join(" ") || "Fordon"}</Text>
            <Pressable onPress={onConnectInsurance}>
              <Text style={{ color: palette.primary, fontWeight: "600", marginTop: 6 }}>
                {item.insurance_company_id ? "Byt försäkring →" : "Koppla försäkring →"}
              </Text>
            </Pressable>
          </View>
        )}
      />
      <Text style={styles.label}>Registreringsnummer</Text>
      <TextInput style={styles.input} value={reg} onChangeText={setReg} autoCapitalize="characters" placeholder="ABC123" />
      <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={add} disabled={busy}>
        <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Sparar…" : "Lägg till fordon"}</Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </View>
  );
}

interface InsurerRow {
  id: string;
  name: string;
}

function Insurance({ authed, palette, onDone }: { authed: boolean | null; palette: Palette; onDone: () => void }) {
  const supabase = getSupabase();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [insurers, setInsurers] = useState<InsurerRow[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [insurerId, setInsurerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: v }, { data: ic }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, registration_number, make, model, insurance_company_id")
          .eq("owner_user_id", auth.user.id),
        supabase.from("insurance_companies").select("id, name").eq("active", true).order("name"),
      ]);
      const list = (v as VehicleRow[] | null) ?? [];
      setVehicles(list);
      if (list.length === 1) setVehicleId(list[0]!.id);
      setInsurers((ic as InsurerRow[] | null) ?? []);
    })();
  }, [supabase]);

  async function connect() {
    if (busy) return;
    if (!vehicleId) {
      setMessage("Välj vilket fordon du vill koppla.");
      return;
    }
    if (!insurerId) {
      setMessage("Välj försäkringsbolag.");
      return;
    }
    if (!consent) {
      setMessage("Godkänn kopplingen till försäkringsbolaget för att fortsätta.");
      return;
    }
    setBusy(true);
    setMessage("Skapar försäkringskoppling…");
    try {
      const res = await customerApi<{ policy_id?: string; requires_bankid?: boolean; status?: string }>(
        "/api/customer/vehicle-policies",
        { body: { vehicle_id: vehicleId, insurance_company_id: insurerId, consent: true } },
      );
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      if (res.data.requires_bankid && res.data.policy_id) {
        setMessage("Öppna BankID och signera fordonskopplingen…");
        const sign = await customerApi<{ status?: string; session_id?: string; bankid_verified?: boolean }>(
          `/api/customer/vehicle-policies/${res.data.policy_id}/bankid/sign`,
          { body: {} },
        );
        if (!sign.ok) {
          setMessage(sign.error);
          return;
        }
        if (sign.data.status === "complete" || sign.data.bankid_verified) {
          setMessage("Fordonet är nu kopplat till valt försäkringsbolag.");
          onDone();
          return;
        }
        if (sign.data.session_id) {
          const polled = await pollBankidSession(sign.data.session_id);
          setMessage(polled.message);
          if (polled.ok) onDone();
          return;
        }
        setMessage("BankID kunde inte startas. Försök igen.");
        return;
      }
      setMessage("Fordonet är kopplat till valt försäkringsbolag.");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (authed === false) return <LoginPrompt palette={palette} />;

  return (
    <ScrollView>
      <Text style={styles.h1}>Koppla försäkring</Text>
      <Text style={styles.muted}>
        Välj fordon och försäkringsbolag. Kopplingen verifieras med BankID innan den blir aktiv.
      </Text>
      <Text style={styles.label}>Fordon</Text>
      {vehicles.length === 0 ? <Text style={styles.muted}>Lägg till ett fordon först under Fordon.</Text> : null}
      <View style={styles.pillRow}>
        {vehicles.map((v) => (
          <Pressable
            key={v.id}
            style={[styles.pill, { borderColor: palette.primary }, vehicleId === v.id ? { backgroundColor: palette.primary } : null]}
            onPress={() => setVehicleId(v.id)}
          >
            <Text style={vehicleId === v.id ? { color: palette.onPrimary, fontWeight: "600" } : { color: palette.primary, fontWeight: "600" }}>
              {v.registration_number}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Försäkringsbolag</Text>
      <View style={styles.pillRow}>
        {insurers.map((i) => (
          <Pressable
            key={i.id}
            style={[styles.pill, { borderColor: palette.primary }, insurerId === i.id ? { backgroundColor: palette.primary } : null]}
            onPress={() => setInsurerId(i.id)}
          >
            <Text style={insurerId === i.id ? { color: palette.onPrimary, fontWeight: "600" } : { color: palette.primary, fontWeight: "600" }}>
              {i.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.consentRow} onPress={() => setConsent(!consent)}>
        <View style={[styles.checkbox, { borderColor: palette.primary }, consent ? { backgroundColor: palette.primary } : null]}>
          {consent ? <Text style={{ color: palette.onPrimary, fontWeight: "700" }}>✓</Text> : null}
        </View>
        <Text style={[styles.muted, { flex: 1 }]}>
          Jag godkänner att mitt fordon kopplas till valt försäkringsbolag, att kopplingen verifieras med BankID och
          att försäkringsbolaget kan se fordonet och mina ärenden som rör det.
        </Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={connect} disabled={busy}>
        <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Vänta…" : "Koppla och verifiera med BankID"}</Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

function NewCase({
  authed,
  palette,
  onFollow,
}: {
  authed: boolean | null;
  palette: Palette;
  onFollow: (incidentId: string) => void;
}) {
  const supabase = getSupabase();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [destination, setDestination] = useState("");
  const [gpsDenied, setGpsDenied] = useState(false);
  const [problem, setProblem] = useState<string>(TOW_PROBLEMS[0]!);
  const [mode, setMode] = useState<"insurance" | "private">("insurance");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; caseNumber: string; requiresBankid: boolean; towStatus?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("vehicles")
        .select("id, registration_number, make, model, insurance_company_id")
        .eq("owner_user_id", auth.user.id)
        .order("created_at", { ascending: false });
      const list = (data as VehicleRow[] | null) ?? [];
      setVehicles(list);
      if (list.length === 1) setVehicleId(list[0]!.id);
    })();
  }, [supabase]);

  async function shareLocation() {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setGpsDenied(true);
      setStatus("Platsdelning nekades. Ange adressen manuellt nedan så hjälper vi dig ändå.");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsDenied(false);
      setStatus(null);
    } catch {
      setGpsDenied(true);
      setStatus("Kunde inte hämta din position. Ange adressen manuellt nedan.");
    }
  }

  async function submit() {
    if (busy) return;
    if (!vehicleId) {
      setStatus("Välj vilket fordon ärendet gäller.");
      return;
    }
    if (!consent) {
      setStatus("Godkänn hur dina uppgifter delas för att fortsätta.");
      return;
    }
    setBusy(true);
    setStatus(null);
    const res = await customerApi<{ incident_id?: string; case_number?: string; requires_bankid?: boolean }>(
      "/api/customer/cases",
      {
        idempotencyKey,
        body: {
          vehicle_id: vehicleId,
          type: "towing",
          subtype: problem,
          coords,
          address: address || null,
          destination: destination || null,
          mode,
          consent: true,
        },
      },
    );
    setBusy(false);
    if (!res.ok || !res.data.incident_id) {
      setStatus(res.error ?? "Ärendet kunde inte skapas. Försök igen.");
      return;
    }
    setCreated({
      id: res.data.incident_id,
      caseNumber: res.data.case_number ?? "",
      requiresBankid: Boolean(res.data.requires_bankid),
    });
  }

  async function verifyWithBankid() {
    if (!created || busy) return;
    setBusy(true);
    try {
      const res = await customerApi<{ status?: string; session_id?: string; bankid_verified?: boolean }>(
        `/api/customer/cases/${created.id}/bankid/sign`,
        { body: {} },
      );
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      if (res.data.bankid_verified || res.data.status === "complete") {
        setStatus("BankID-verifieringen är klar.");
        setCreated({ ...created, requiresBankid: false });
        return;
      }
      if (res.data.session_id) {
        setStatus("Öppna BankID och signera ärendet…");
        const polled = await pollBankidSession(res.data.session_id);
        setStatus(polled.message);
        if (polled.ok) setCreated({ ...created, requiresBankid: false });
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestTow() {
    if (!created || busy) return;
    setBusy(true);
    const res = await customerApi<{ status?: string }>(`/api/customer/cases/${created.id}/request-tow`, {
      idempotencyKey,
      body: { priority: "normal", pickup: coords, address: address || null },
    });
    setBusy(false);
    if (!res.ok) {
      setStatus(res.error);
      return;
    }
    setCreated({ ...created, towStatus: towStatusLabel((res.data.status ?? "manual_review") as never) });
  }

  if (authed === false) return <LoginPrompt palette={palette} />;

  if (created) {
    return (
      <ScrollView>
        <Text style={styles.h1}>Ärende skapat</Text>
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{created.caseNumber}</Text>
          {created.requiresBankid ? (
            <>
              <Text style={styles.muted}>Ärendet behöver verifieras med BankID innan det skickas vidare.</Text>
              <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={verifyWithBankid} disabled={busy}>
                <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Väntar på BankID…" : "Verifiera med BankID"}</Text>
              </Pressable>
            </>
          ) : created.towStatus ? (
            <>
              <Text style={styles.muted}>Bärgning begärd: {created.towStatus}</Text>
              <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }]} onPress={() => onFollow(created.id)}>
                <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>Följ ärendet</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.muted}>Verifieringen är klar. Nu kan vi skicka ut bärgningen.</Text>
              <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }, busy ? styles.disabled : null]} onPress={requestTow} disabled={busy}>
                <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Skickar…" : "Begär bärgning"}</Text>
              </Pressable>
            </>
          )}
        </View>
        {status ? <Text style={styles.muted}>{status}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Starta bärgning</Text>
      <Text style={styles.label}>Fordon</Text>
      {vehicles.length === 0 ? <Text style={styles.muted}>Lägg till ett fordon först under Fordon.</Text> : null}
      <View style={styles.pillRow}>
        {vehicles.map((v) => (
          <Pressable
            key={v.id}
            style={[styles.pill, { borderColor: palette.primary }, vehicleId === v.id ? { backgroundColor: palette.primary } : null]}
            onPress={() => setVehicleId(v.id)}
          >
            <Text style={vehicleId === v.id ? { color: palette.onPrimary, fontWeight: "600" } : { color: palette.primary, fontWeight: "600" }}>
              {v.registration_number}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Vad är problemet?</Text>
      <View style={styles.pillRow}>
        {TOW_PROBLEMS.map((p) => (
          <Pressable
            key={p}
            style={[styles.pill, { borderColor: palette.primary }, problem === p ? { backgroundColor: palette.primary } : null]}
            onPress={() => setProblem(p)}
          >
            <Text style={problem === p ? { color: palette.onPrimary } : { color: palette.primary }}>{problemTypeLabel(p as never)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Hur vill du bärga?</Text>
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, { borderColor: palette.primary }, mode === "insurance" ? { backgroundColor: palette.primary } : null]}
          onPress={() => setMode("insurance")}
        >
          <Text style={mode === "insurance" ? { color: palette.onPrimary, fontWeight: "600" } : { color: palette.primary, fontWeight: "600" }}>
            Via försäkring
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, { borderColor: palette.primary }, mode === "private" ? { backgroundColor: palette.primary } : null]}
          onPress={() => setMode("private")}
        >
          <Text style={mode === "private" ? { color: palette.onPrimary, fontWeight: "600" } : { color: palette.primary, fontWeight: "600" }}>
            Privat / direkt
          </Text>
        </Pressable>
      </View>

      <Pressable style={[styles.bigbtn, { backgroundColor: palette.primary }]} onPress={shareLocation}>
        <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>
          {coords ? "Position delad ✓" : "Dela min position"}
        </Text>
      </Pressable>
      {gpsDenied || address ? (
        <>
          <Text style={styles.label}>Adress där fordonet står</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Gatuadress, ort" />
        </>
      ) : null}
      <Text style={styles.label}>Vart ska fordonet? (valfritt)</Text>
      <TextInput
        style={styles.input}
        value={destination}
        onChangeText={setDestination}
        placeholder="T.ex. verkstad eller hemadress"
      />
      <Pressable style={styles.consentRow} onPress={() => setConsent(!consent)}>
        <View style={[styles.checkbox, { borderColor: palette.primary }, consent ? { backgroundColor: palette.primary } : null]}>
          {consent ? <Text style={{ color: palette.onPrimary, fontWeight: "700" }}>✓</Text> : null}
        </View>
        <Text style={[styles.muted, { flex: 1 }]}>
          {mode === "insurance"
            ? "Jag godkänner att uppgifter om ärendet, fordonet, min position och mina kontaktuppgifter delas med mitt försäkringsbolag och den bärgare som tar uppdraget."
            : "Jag godkänner att den bärgare som accepterar uppdraget får mitt namn, telefonnummer, fordonets registreringsnummer, plats och destination."}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.bigbtn, { backgroundColor: palette.primary, marginTop: 12 }, busy ? styles.disabled : null]}
        onPress={submit}
        disabled={busy}
      >
        <Text style={[styles.bigbtnText, { color: palette.onPrimary }]}>{busy ? "Skapar ärende…" : "Skapa ärende"}</Text>
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
  damage_type: string | null;
  problem_type: string | null;
}

function Cases({ authed, onOpen }: { authed: boolean | null; onOpen: (id: string) => void }) {
  const supabase = getSupabase();
  const [rows, setRows] = useState<IncidentRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      if (!supabase) return setRows([]);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setRows([]);
      const { data } = await supabase
        .from("incidents")
        .select("id, case_number, type, status, damage_type, problem_type")
        .eq("customer_user_id", auth.user.id)
        .order("created_at", { ascending: false });
      setRows((data as IncidentRow[] | null) ?? []);
    })();
  }, [supabase]);

  if (authed === false) return <Text style={styles.muted}>Logga in under Konto för att se dina ärenden.</Text>;
  if (rows === null) return <ActivityIndicator />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={<Text style={styles.h1}>Mina ärenden</Text>}
      ListEmptyComponent={<Text style={styles.muted}>Inga ärenden ännu.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.cardPlain} onPress={() => onOpen(item.id)}>
          <Text style={{ fontWeight: "700" }}>{item.case_number ?? "Ärende"}</Text>
          <Text>
            {item.type === "damage_claim"
              ? damageTypeLabel((item.damage_type ?? "other") as never)
              : problemTypeLabel((item.problem_type ?? "other") as never)}
          </Text>
          <Text>{incidentStatusLabel(item.status as never)}</Text>
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

function CaseDetail({ caseId, palette, onBack }: { caseId: string; palette: Palette; onBack: () => void }) {
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
      .order("created_at", { ascending: false })
      .limit(1)
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

  return (
    <ScrollView>
      <Pressable onPress={onBack}>
        <Text style={{ color: palette.primary, fontWeight: "700" }}>‹ Tillbaka</Text>
      </Pressable>
      <Text style={styles.h1}>{data.incident?.case_number ?? "Ärende"}</Text>
      <View style={[styles.card, { backgroundColor: palette.surface }]}>
        {job ? (
          <>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>{towStatusLabel(job.status as never)}</Text>
            <Text style={styles.muted}>{whatHappensNext(job.status as never)}</Text>
          </>
        ) : (
          <>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>
              {incidentStatusLabel((data.incident?.status ?? "submitted") as never)}
            </Text>
            <Text style={styles.muted}>Ärendet är registrerat.</Text>
          </>
        )}
      </View>
      {job ? (
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <Text style={{ fontWeight: "600" }}>Bärgning</Text>
          <Text>{job.driver_id ? "En bärgare har accepterat och är på väg." : "Vi söker en tillgänglig bärgare…"}</Text>
          {data.eta ? (
            <Text style={{ marginTop: 6 }}>
              Beräknad ankomst: {formatEta(data.eta.eta_seconds)} ({(data.eta.distance_meters / 1000).toFixed(1)} km)
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.muted}>Statusen uppdateras automatiskt på den här sidan.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 56, paddingHorizontal: 16 },
  brand: { fontSize: 18, fontWeight: "800" },
  body: { flex: 1, marginTop: 12 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { borderRadius: 14, padding: 20, width: "47%" },
  tileText: { fontWeight: "600", fontSize: 16 },
  card: { borderRadius: 12, padding: 16, marginBottom: 10 },
  cardPlain: { backgroundColor: "#F5F7FB", borderRadius: 12, padding: 16, marginBottom: 10 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: "#fff" },
  bigbtn: { borderRadius: 12, padding: 16, marginTop: 14, alignItems: "center" },
  bigbtnText: { fontWeight: "700", fontSize: 16 },
  secondary: { backgroundColor: "transparent", borderWidth: 1 },
  disabled: { opacity: 0.6 },
  muted: { opacity: 0.7, marginTop: 10 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  navItem: { fontWeight: "600" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 14 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
});
