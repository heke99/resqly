import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { towStatusLabel } from "@resqly/ui";
import { getSupabase, apiPost, apiGet } from "./src/supabase";
import { getExpoPushToken, devicePlatform } from "./src/push";
import { palette } from "./src/theme";

type Screen = "login" | "denied" | "offers" | "detail";

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
  { label: "I'm on my way", status: "driver_en_route" },
  { label: "I've arrived", status: "driver_arrived" },
  { label: "Vehicle loaded", status: "vehicle_loaded" },
  { label: "Transporting", status: "transporting" },
  { label: "Delivered", status: "delivered" },
];

function mapsUrl(lat: number, lng: number): string {
  // Apple Maps on iOS-style links also work; Google universal link is broadly supported.
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Resqly Driver</Text>
      <View style={styles.body}>
        {screen === "login" ? (
          <Login onDriver={() => setScreen("offers")} onDenied={() => setScreen("denied")} />
        ) : null}
        {screen === "denied" ? <AccessDenied onBack={() => setScreen("login")} /> : null}
        {screen === "offers" ? (
          <Offers
            onOpen={(offer, jobId) => {
              setActiveOffer(offer);
              setActiveJobId(jobId);
              setScreen("detail");
            }}
          />
        ) : null}
        {screen === "detail" && activeJobId ? (
          <JobDetail offer={activeOffer} jobId={activeJobId} onBack={() => setScreen("offers")} />
        ) : null}
      </View>
      <View style={styles.nav}>
        <Pressable onPress={() => setScreen("offers")}>
          <Text style={styles.navItem}>Offers</Text>
        </Pressable>
        <Pressable onPress={() => setScreen("login")}>
          <Text style={styles.navItem}>Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Login({ onDriver, onDenied }: { onDriver: () => void; onDenied: () => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verifyDriver() {
    const ctx = await apiGet<RoleContext>("/api/v1/me/role-context");
    if (ctx?.driver && ctx.capabilities.driver) onDriver();
    else onDenied();
  }

  async function signIn() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await verifyDriver();
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Driver sign in</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.bigbtn} onPress={signIn} disabled={busy}>
        <Text style={styles.bigbtnText}>{busy ? "Signing in…" : "Log in"}</Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView>
      <Text style={styles.h1}>Driver access required</Text>
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>This account is not set up as a tow driver.</Text>
        <Text style={styles.muted}>
          Ask your tow company administrator to invite you as a driver in the Resqly portal. Once you have a driver
          profile, sign in again to go online and receive jobs.
        </Text>
      </View>
      <Pressable style={styles.bigbtn} onPress={onBack}>
        <Text style={styles.bigbtnText}>Back to sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

function Offers({ onOpen }: { onOpen: (offer: Offer, jobId: string) => void }) {
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const locationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOffers = useCallback(async () => {
    const res = await apiGet<{ offers: Offer[] }>("/api/v1/drivers/me/offers");
    setOffers(res?.offers ?? []);
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
      /* best-effort */
    }
  }, []);

  async function toggleOnline(next: boolean) {
    setMessage(null);
    if (next) {
      const perm = await Location.requestForegroundPermissionsAsync();
      const res = await apiPost("/api/v1/drivers/me/online", {});
      if (!res || !res.ok) {
        setMessage("Could not go online. Check your driver profile.");
        return;
      }
      setOnline(true);
      await registerPush();
      if (perm.status === "granted") {
        await pushLocation();
        locationTimer.current = setInterval(() => void pushLocation(), 20000);
      }
      await loadOffers();
    } else {
      await apiPost("/api/v1/drivers/me/offline", {});
      setOnline(false);
      if (locationTimer.current) clearInterval(locationTimer.current);
      locationTimer.current = null;
    }
  }

  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => void loadOffers(), 12000);
    return () => clearInterval(t);
  }, [online, loadOffers]);

  useEffect(() => {
    return () => {
      if (locationTimer.current) clearInterval(locationTimer.current);
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{online ? "Online" : "Offline"}</Text>
        <Switch value={online} onValueChange={(v) => void toggleOnline(v)} />
      </View>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      <FlatList
        data={offers}
        keyExtractor={(o) => o.offer_id}
        ListHeaderComponent={<Text style={styles.h1}>New offers</Text>}
        ListEmptyComponent={
          <Text style={styles.muted}>{online ? "No offers right now. Stay online to receive jobs." : "Go online to receive job offers."}</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onOpen(item, item.tow_job_id)}>
            <Text style={{ fontWeight: "700" }}>{(item.problem_type ?? "Assistance").replaceAll("_", " ")}</Text>
            <Text style={styles.muted}>
              {item.approx_area ? `Area ${item.approx_area} • ` : ""}
              {item.payer_type === "customer_private" ? "Direct" : "Insurance"} • Priority {item.priority}
            </Text>
            <Text style={styles.muted}>Tap to review and accept →</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function JobDetail({ offer, jobId, onBack }: { offer: Offer | null; jobId: string; onBack: () => void }) {
  const supabase = getSupabase();
  const [share, setShare] = useState<CustomerShare | null>(null);
  const [status, setStatus] = useState<string>("offered");
  const [message, setMessage] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [work, setWork] = useState("Vehicle towed to destination");
  const [waiting, setWaiting] = useState("0");
  const [notes, setNotes] = useState("");

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

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  async function accept() {
    if (!offer) return;
    const res = await apiPost(`/api/v1/drivers/offers/${offer.offer_id}/accept`, {});
    if (res && res.ok) {
      setStatus("accepted");
      setMessage("Accepted. Customer details unlocked.");
      await loadShare();
    } else {
      setMessage("Could not accept — the job may have been taken.");
    }
  }

  async function reject() {
    if (!offer) return;
    await apiPost(`/api/v1/drivers/offers/${offer.offer_id}/reject`, { reason: "unavailable" });
    onBack();
  }

  async function setJobStatus(next: string) {
    await apiPost(`/api/v1/tow/jobs/${jobId}/status`, { status: next });
    setStatus(next);
  }

  async function submitReport() {
    await apiPost(`/api/v1/tow/jobs/${jobId}/complete`, {
      work_performed: work || "Completed",
      vehicle_picked_up: true,
      waiting_minutes: Number(waiting) || 0,
      comments: notes || undefined,
    });
    setStatus("invoiced");
    setShowReport(false);
    setMessage("Completion report submitted.");
  }

  const accepted = Boolean(share);

  return (
    <ScrollView>
      <Pressable onPress={onBack}>
        <Text style={{ color: palette.primary, fontWeight: "700" }}>‹ Back to offers</Text>
      </Pressable>
      <Text style={styles.h1}>{towStatusLabel(status as never)}</Text>

      {!accepted ? (
        <View>
          <Text style={styles.muted}>
            Before accepting you only see approximate area, problem type and priority — never the customer&apos;s
            personal details or identity number.
          </Text>
          <View style={styles.card}>
            <Text style={{ fontWeight: "700" }}>{(offer?.problem_type ?? "Assistance").replaceAll("_", " ")}</Text>
            {offer?.approx_area ? <Text>Approx area: {offer.approx_area}</Text> : null}
            <Text>Type: {offer?.payer_type === "customer_private" ? "Direct / private" : "Insurance"}</Text>
            <Text>Priority: {offer?.priority ?? "normal"}</Text>
          </View>
          <Pressable style={styles.bigbtn} onPress={accept}>
            <Text style={styles.bigbtnText}>Accept</Text>
          </Pressable>
          <Pressable style={[styles.bigbtn, styles.secondary]} onPress={reject}>
            <Text style={[styles.bigbtnText, { color: palette.primary }]}>Reject</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <View style={styles.card}>
            <Text style={{ fontWeight: "700" }}>{share!.customer_name}</Text>
            <Text>{share!.registration_number}</Text>
            <Text>{share!.problem_summary}</Text>
            {share!.pickup_address ? <Text>Pickup: {share!.pickup_address}</Text> : null}
            {share!.destination_address ? <Text>Destination: {share!.destination_address}</Text> : null}
            {share!.customer_notes ? <Text>Notes: {share!.customer_notes}</Text> : null}
            <Text style={styles.muted}>No personal identity number or BankID details are ever shown.</Text>
          </View>
          <Pressable style={styles.bigbtn} onPress={() => Linking.openURL(`tel:${share!.customer_phone}`)}>
            <Text style={styles.bigbtnText}>Call customer</Text>
          </Pressable>
          {share!.pickup_lat != null && share!.pickup_lng != null ? (
            <Pressable
              style={[styles.bigbtn, styles.secondary]}
              onPress={() => Linking.openURL(mapsUrl(share!.pickup_lat as number, share!.pickup_lng as number))}
            >
              <Text style={[styles.bigbtnText, { color: palette.primary }]}>Navigate to pickup</Text>
            </Pressable>
          ) : null}
          {STATUS_BUTTONS.map((b) => (
            <Pressable key={b.status} style={[styles.bigbtn, styles.secondary]} onPress={() => setJobStatus(b.status)}>
              <Text style={[styles.bigbtnText, { color: palette.primary }]}>{b.label}</Text>
            </Pressable>
          ))}
          {!showReport ? (
            <Pressable style={styles.bigbtn} onPress={() => setShowReport(true)}>
              <Text style={styles.bigbtnText}>Complete & submit report</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={{ fontWeight: "700" }}>Completion report</Text>
              <Text style={styles.label}>Work performed</Text>
              <TextInput style={styles.input} value={work} onChangeText={setWork} />
              <Text style={styles.label}>Waiting time (minutes)</Text>
              <TextInput style={styles.input} value={waiting} onChangeText={setWaiting} keyboardType="number-pad" />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline />
              <Pressable style={styles.bigbtn} onPress={submitReport}>
                <Text style={styles.bigbtnText}>Submit report</Text>
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
  muted: { opacity: 0.7, marginTop: 10 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  navItem: { fontWeight: "600" },
});
