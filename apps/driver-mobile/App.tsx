import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { problemTypeLabel, towStatusLabel } from "@resqly/ui";
import { getSupabase, apiPost, apiGet } from "./src/supabase";
import { getExpoPushToken, devicePlatform, listenForOfferPushes } from "./src/push";
import { startBackgroundLocation, stopBackgroundLocation } from "./src/location-task";
import { palette } from "./src/theme";

type Screen = "loading" | "login" | "denied" | "offers" | "detail" | "account";

interface RoleContext {
  driver: { driver_id: string; tow_company_id: string; is_online: boolean; status: string } | null;
  capabilities: { driver: boolean };
}

interface Offer {
  offer_id: string;
  tow_job_id: string;
  status: string;
  rank: number;
  expires_at: string;
  priority: string;
  payer_type: string;
  problem_type: string | null;
  approx_area: string | null;
  distance_meters: number | null;
}

interface ActiveJob {
  id: string;
  status: string;
  payer_type: string;
  priority: string;
}

interface CustomerShare {
  customer_name: string;
  customer_phone: string;
  registration_number: string;
  problem_summary: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  destination_address: string | null;
  customer_notes: string | null;
}

const STATUS_BUTTONS: Array<{ label: string; status: string }> = [
  { label: "Jag är på väg", status: "driver_en_route" },
  { label: "Jag är framme", status: "driver_arrived" },
  { label: "Fordon lastat", status: "vehicle_loaded" },
  { label: "Transport pågår", status: "transporting" },
  { label: "Levererad", status: "delivered" },
];

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function expiresInLabel(expiresAt: string): string | null {
  const remaining = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return "Har gått ut";
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return minutes > 0 ? `Svara inom ${minutes} min ${seconds} s` : `Svara inom ${seconds} s`;
}

export default function App() {
  const supabase = getSupabase();
  const [screen, setScreen] = useState<Screen>("loading");
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [driverCtx, setDriverCtx] = useState<RoleContext["driver"]>(null);

  const verifyDriver = useCallback(async (): Promise<boolean> => {
    const ctx = await apiGet<RoleContext>("/api/v1/me/role-context");
    if (ctx?.driver && ctx.capabilities.driver) {
      setDriverCtx(ctx.driver);
      return true;
    }
    setDriverCtx(null);
    return false;
  }, []);

  // Restore the session on cold start: signed-in drivers land directly on
  // their job list instead of the login form.
  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setScreen("login");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setScreen("login");
        return;
      }
      const isDriver = await verifyDriver();
      setScreen(isDriver ? "offers" : "denied");
    })();
  }, [supabase, verifyDriver]);

  const openJob = useCallback((offer: Offer | null, jobId: string) => {
    setActiveOffer(offer);
    setActiveJobId(jobId);
    setScreen("detail");
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Resqly Förare</Text>
      <View style={styles.body}>
        {screen === "loading" ? <Text style={styles.muted}>Laddar…</Text> : null}
        {screen === "login" ? (
          <Login
            onDriver={() => {
              void verifyDriver();
              setScreen("offers");
            }}
            onDenied={() => setScreen("denied")}
          />
        ) : null}
        {screen === "denied" ? <AccessDenied onBack={() => setScreen("login")} /> : null}
        {screen === "offers" ? <Offers driver={driverCtx} onOpen={openJob} /> : null}
        {screen === "detail" && activeJobId ? (
          <JobDetail offer={activeOffer} jobId={activeJobId} onBack={() => setScreen("offers")} />
        ) : null}
        {screen === "account" ? (
          <Account driver={driverCtx} onSignedOut={() => setScreen("login")} />
        ) : null}
      </View>
      <View style={styles.nav}>
        <Pressable onPress={() => setScreen(driverCtx ? "offers" : "login")}>
          <Text style={styles.navItem}>Uppdrag</Text>
        </Pressable>
        <Pressable onPress={() => setScreen(driverCtx ? "account" : "login")}>
          <Text style={styles.navItem}>Konto</Text>
        </Pressable>
      </View>
    </View>
  );
}

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials")) return "Fel e-post eller lösenord. Försök igen.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "För många försök. Vänta en stund och försök igen.";
  if (msg.includes("network") || msg.includes("fetch")) return "Kunde inte nå tjänsten. Kontrollera din uppkoppling.";
  return "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen.";
}

function Login({ onDriver, onDenied }: { onDriver: () => void; onDenied: () => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!supabase) {
      setMessage("Appen är inte klar att användas ännu. Försök igen senare.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setMessage(friendlyAuthError(error.message));
      return;
    }
    const ctx = await apiGet<RoleContext>("/api/v1/me/role-context");
    setBusy(false);
    if (ctx?.driver && ctx.capabilities.driver) onDriver();
    else onDenied();
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Förarinloggning</Text>
      <Text style={styles.label}>E-post</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Text style={styles.label}>Lösenord</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={[styles.bigbtn, busy ? styles.disabled : null]} onPress={signIn} disabled={busy}>
        <Text style={styles.bigbtnText}>{busy ? "Loggar in…" : "Logga in"}</Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView>
      <Text style={styles.h1}>Förarbehörighet krävs</Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>Det här kontot är inte kopplat till en förare.</Text>
        <Text style={styles.muted}>
          Be administratören på bärgningsbolaget att bjuda in dig som förare. När din förarprofil är aktiv kan du
          logga in, gå i tjänst och ta emot uppdrag.
        </Text>
      </View>
      <Pressable style={styles.bigbtn} onPress={onBack}>
        <Text style={styles.bigbtnText}>Tillbaka till inloggning</Text>
      </Pressable>
    </ScrollView>
  );
}

function Account({ driver, onSignedOut }: { driver: RoleContext["driver"]; onSignedOut: () => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await apiPost("/api/v1/drivers/me/offline", {}).catch(() => undefined);
    await stopBackgroundLocation();
    await supabase.auth.signOut();
    onSignedOut();
  }

  const statusLabel =
    driver?.status === "active" ? "Godkänd förare" : driver?.status === "suspended" ? "Avstängd — kontakta din arbetsledare" : "Inte aktiv ännu";

  return (
    <ScrollView>
      <Text style={styles.h1}>Mitt konto</Text>
      {email ? <Text>Inloggad som {email}</Text> : null}
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>Förarprofil</Text>
        <Text>{statusLabel}</Text>
        <Text style={styles.muted}>Kunduppgifter visas först efter att du accepterat ett uppdrag. Personnummer visas aldrig.</Text>
      </View>
      <Pressable style={styles.bigbtn} onPress={signOut}>
        <Text style={styles.bigbtnText}>Logga ut</Text>
      </Pressable>
    </ScrollView>
  );
}

function Offers({
  driver,
  onOpen,
}: {
  driver: RoleContext["driver"];
  onOpen: (offer: Offer | null, jobId: string) => void;
}) {
  const [online, setOnline] = useState(Boolean(driver?.is_online));
  const [offers, setOffers] = useState<Offer[]>([]);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  // Keep the local switch in sync with the server-side state on mount.
  useEffect(() => {
    setOnline(Boolean(driver?.is_online));
  }, [driver?.is_online]);

  const loadOffers = useCallback(async () => {
    const res = await apiGet<{ offers: Offer[] }>("/api/v1/drivers/me/offers");
    const now = Date.now();
    setOffers((res?.offers ?? []).filter((o) => !o.expires_at || Date.parse(o.expires_at) > now));
    const jobsRes = await apiGet<{ jobs: ActiveJob[] }>("/api/v1/drivers/me/jobs");
    setJobs(jobsRes?.jobs ?? []);
  }, []);

  const registerPush = useCallback(async () => {
    const token = await getExpoPushToken();
    if (token) {
      await apiPost("/api/v1/drivers/me/device", { expo_push_token: token, platform: devicePlatform() });
    }
  }, []);

  const pushLocation = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      await apiPost("/api/v1/drivers/me/location", {
        location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    } catch {
      /* best-effort: a temporarily unavailable API must never crash tracking */
    }
  }, []);

  async function toggleOnline(next: boolean) {
    setMessage(null);
    if (next) {
      const perm = await Location.requestForegroundPermissionsAsync();
      const res = await apiPost("/api/v1/drivers/me/online", {});
      if (!res.ok) {
        setMessage(res.error ?? "Kunde inte gå i tjänst. Kontrollera din förarprofil.");
        return;
      }
      setOnline(true);
      await registerPush();
      if (perm.status === "granted") {
        setLocationWarning(null);
        await pushLocation();
        locationTimer.current = setInterval(() => void pushLocation(), 20000);
        void startBackgroundLocation();
      } else {
        setLocationWarning(
          "Platsdelning är avstängd. Du kan missa uppdrag nära dig och kunden ser ingen ankomsttid. Aktivera plats i inställningarna.",
        );
      }
      await loadOffers();
    } else {
      await apiPost("/api/v1/drivers/me/offline", {});
      setOnline(false);
      if (locationTimer.current) clearInterval(locationTimer.current);
      locationTimer.current = null;
      await stopBackgroundLocation();
    }
  }

  useEffect(() => {
    void loadOffers();
    if (!online) return;
    const t = setInterval(() => void loadOffers(), 12000);
    return () => clearInterval(t);
  }, [online, loadOffers]);

  // Countdown re-render for offer expiry labels.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // New offer pushes refresh the list; tapping a push opens the offer.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void listenForOfferPushes({
      onReceived: () => void loadOffers(),
      onOpened: (data) => {
        if (data.tow_job_id) onOpen(null, data.tow_job_id);
      },
    }).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [loadOffers, onOpen]);

  useEffect(() => {
    return () => {
      if (locationTimer.current) clearInterval(locationTimer.current);
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{online ? "I tjänst" : "Ej i tjänst"}</Text>
        <Switch value={online} onValueChange={(v) => void toggleOnline(v)} />
      </View>
      {locationWarning ? (
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: "#D97706" }]}>
          <Text>{locationWarning}</Text>
        </View>
      ) : null}
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      <FlatList
        data={offers}
        keyExtractor={(o) => o.offer_id}
        ListHeaderComponent={
          <View>
            {jobs.length > 0 ? (
              <View>
                <Text style={styles.h1}>Pågående uppdrag</Text>
                {jobs.map((j) => (
                  <Pressable key={j.id} style={styles.card} onPress={() => onOpen(null, j.id)}>
                    <Text style={{ fontWeight: "700" }}>{towStatusLabel(j.status as never)}</Text>
                    <Text style={styles.muted}>
                      {j.payer_type === "customer_private" ? "Privat uppdrag" : "Försäkringsuppdrag"} • Fortsätt →
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.h1}>Nya uppdrag</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            {online ? "Inga nya uppdrag just nu. Du får en notis när ett uppdrag kommer." : "Gå i tjänst för att ta emot uppdrag."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpen(item, item.tow_job_id)}>
            <Text style={{ fontWeight: "700" }}>{problemTypeLabel((item.problem_type ?? "other") as never)}</Text>
            <Text style={styles.muted}>
              {item.approx_area ? `Område ${item.approx_area} • ` : ""}
              {item.payer_type === "customer_private" ? "Privat" : "Försäkring"} • Prioritet{" "}
              {PRIORITY_LABELS[item.priority] ?? item.priority}
            </Text>
            {item.expires_at ? <Text style={{ color: "#B45309", marginTop: 4 }}>{expiresInLabel(item.expires_at)}</Text> : null}
            <Text style={styles.muted}>Tryck för att granska och acceptera →</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function JobDetail({ offer, jobId, onBack }: { offer: Offer | null; jobId: string; onBack: () => void }) {
  const supabase = getSupabase();
  const [share, setShare] = useState<CustomerShare | null>(null);
  const [status, setStatus] = useState<string>(offer ? "offered" : "accepted");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [work, setWork] = useState("Fordon bärgat till destination");
  const [waiting, setWaiting] = useState("0");
  const [notes, setNotes] = useState("");
  const [failedTrip, setFailedTrip] = useState(false);
  const [damages, setDamages] = useState("");

  const loadShare = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("tow_job_customer_shares")
      .select(
        "customer_name, customer_phone, registration_number, problem_summary, pickup_lat, pickup_lng, pickup_address, destination_address, customer_notes",
      )
      .eq("tow_job_id", jobId)
      .maybeSingle();
    setShare((data as CustomerShare | null) ?? null);
  }, [supabase, jobId]);

  // Server-synced job status so the workflow survives app restarts.
  const loadJobStatus = useCallback(async () => {
    const job = await apiGet<{ status?: string }>(`/api/v1/tow/jobs/${jobId}`);
    if (job?.status) setStatus(job.status);
  }, [jobId]);

  useEffect(() => {
    void loadShare();
    void loadJobStatus();
  }, [loadShare, loadJobStatus]);

  async function accept() {
    if (!offer || busy) return;
    setBusy(true);
    const res = await apiPost(`/api/v1/drivers/offers/${offer.offer_id}/accept`, {});
    setBusy(false);
    if (res.ok) {
      setStatus("accepted");
      setMessage("Accepterat. Kunduppgifter visas nu.");
      await loadShare();
    } else {
      setMessage(res.error ?? "Uppdraget kunde inte accepteras. Försök igen.");
    }
  }

  async function reject() {
    if (!offer || busy) return;
    setBusy(true);
    const res = await apiPost(`/api/v1/drivers/offers/${offer.offer_id}/reject`, { reason: "unavailable" });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.error ?? "Kunde inte neka uppdraget. Försök igen.");
      return;
    }
    onBack();
  }

  async function setJobStatus(next: string) {
    if (busy) return;
    setBusy(true);
    const res = await apiPost(`/api/v1/tow/jobs/${jobId}/status`, { status: next });
    setBusy(false);
    if (res.ok) {
      setStatus(next);
      setMessage(null);
    } else {
      setMessage(res.error ?? "Statusen kunde inte uppdateras. Försök igen.");
    }
  }

  async function submitReport() {
    if (busy) return;
    setBusy(true);
    const res = await apiPost(`/api/v1/tow/jobs/${jobId}/complete`, {
      work_performed: work || "Slutfört",
      vehicle_picked_up: !failedTrip,
      waiting_minutes: Number(waiting) || 0,
      failed_trip: failedTrip,
      observed_damages: damages || undefined,
      comments: notes || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setStatus("invoiced");
      setShowReport(false);
      setMessage("Slutrapporten är skickad. Bra jobbat!");
    } else {
      setMessage(res.error ?? "Slutrapporten kunde inte skickas. Försök igen.");
    }
  }

  const accepted = Boolean(share);
  const offerExpired = offer?.expires_at ? Date.parse(offer.expires_at) < Date.now() : false;

  return (
    <ScrollView>
      <Pressable onPress={onBack}>
        <Text style={{ color: palette.primary, fontWeight: "700" }}>‹ Tillbaka till uppdrag</Text>
      </Pressable>
      <Text style={styles.h1}>{towStatusLabel(status as never)}</Text>

      {!accepted ? (
        <View>
          <Text style={styles.muted}>
            Innan du accepterar ser du bara ungefärligt område, problemtyp och prioritet — aldrig kundens
            personuppgifter eller personnummer.
          </Text>
          <View style={styles.card}>
            <Text style={{ fontWeight: "700" }}>{problemTypeLabel((offer?.problem_type ?? "other") as never)}</Text>
            {offer?.approx_area ? <Text>Ungefärligt område: {offer.approx_area}</Text> : null}
            <Text>Typ: {offer?.payer_type === "customer_private" ? "Privat" : "Försäkring"}</Text>
            <Text>Prioritet: {PRIORITY_LABELS[offer?.priority ?? "normal"] ?? offer?.priority}</Text>
            {offer?.expires_at ? <Text style={{ color: "#B45309", marginTop: 4 }}>{expiresInLabel(offer.expires_at)}</Text> : null}
          </View>
          {offerExpired ? (
            <View style={styles.card}>
              <Text style={{ fontWeight: "700" }}>Erbjudandet har gått ut</Text>
              <Text style={styles.muted}>Uppdraget är inte längre tillgängligt.</Text>
            </View>
          ) : (
            <>
              <Pressable style={[styles.bigbtn, busy ? styles.disabled : null]} onPress={accept} disabled={busy}>
                <Text style={styles.bigbtnText}>{busy ? "Vänta…" : "Acceptera"}</Text>
              </Pressable>
              <Pressable style={[styles.bigbtn, styles.secondary, busy ? styles.disabled : null]} onPress={reject} disabled={busy}>
                <Text style={[styles.bigbtnText, { color: palette.primary }]}>Neka</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <View>
          <View style={styles.card}>
            <Text style={{ fontWeight: "700" }}>{share!.customer_name}</Text>
            <Text>{share!.registration_number}</Text>
            <Text>{share!.problem_summary}</Text>
            {share!.pickup_address ? <Text>Upphämtning: {share!.pickup_address}</Text> : null}
            {share!.destination_address ? <Text>Destination: {share!.destination_address}</Text> : null}
            {share!.customer_notes ? <Text>Anteckningar: {share!.customer_notes}</Text> : null}
            <Text style={styles.muted}>Personnummer och BankID-detaljer visas aldrig.</Text>
          </View>
          <Pressable style={styles.bigbtn} onPress={() => Linking.openURL(`tel:${share!.customer_phone}`)}>
            <Text style={styles.bigbtnText}>Ring kund</Text>
          </Pressable>
          {share!.pickup_lat != null && share!.pickup_lng != null ? (
            <Pressable
              style={[styles.bigbtn, styles.secondary]}
              onPress={() => Linking.openURL(mapsUrl(share!.pickup_lat as number, share!.pickup_lng as number))}
            >
              <Text style={[styles.bigbtnText, { color: palette.primary }]}>Navigera till upphämtning</Text>
            </Pressable>
          ) : null}
          {STATUS_BUTTONS.map((b) => (
            <Pressable
              key={b.status}
              style={[styles.bigbtn, styles.secondary, busy ? styles.disabled : null]}
              onPress={() => setJobStatus(b.status)}
              disabled={busy}
            >
              <Text style={[styles.bigbtnText, { color: palette.primary }]}>{b.label}</Text>
            </Pressable>
          ))}
          {!showReport ? (
            <Pressable style={styles.bigbtn} onPress={() => setShowReport(true)}>
              <Text style={styles.bigbtnText}>Slutför och skicka rapport</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={{ fontWeight: "700" }}>Slutrapport</Text>
              <Text style={styles.label}>Utfört arbete</Text>
              <TextInput style={styles.input} value={work} onChangeText={setWork} />
              <Text style={styles.label}>Väntetid (minuter)</Text>
              <TextInput style={styles.input} value={waiting} onChangeText={setWaiting} keyboardType="number-pad" />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                <Text style={{ fontWeight: "600" }}>Bomkörning (kunde inte utföras)</Text>
                <Switch value={failedTrip} onValueChange={setFailedTrip} />
              </View>
              <Text style={styles.label}>Observerade skador</Text>
              <TextInput style={styles.input} value={damages} onChangeText={setDamages} multiline />
              <Text style={styles.label}>Anteckningar</Text>
              <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline />
              <Pressable style={[styles.bigbtn, busy ? styles.disabled : null]} onPress={submitReport} disabled={busy}>
                <Text style={styles.bigbtnText}>{busy ? "Skickar…" : "Skicka rapport"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background, paddingTop: 56, paddingHorizontal: 16 },
  brand: { fontSize: 18, fontWeight: "800", color: palette.primary },
  body: { flex: 1, marginTop: 12 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { backgroundColor: palette.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
  label: { fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: "#fff" },
  bigbtn: { backgroundColor: palette.primary, borderRadius: 12, padding: 16, marginTop: 12, alignItems: "center" },
  bigbtnText: { color: palette.onPrimary, fontWeight: "700", fontSize: 16 },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.primary },
  disabled: { opacity: 0.6 },
  muted: { opacity: 0.7, marginTop: 10 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  navItem: { fontWeight: "600" },
});
