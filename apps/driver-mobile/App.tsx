import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import { towStatusLabel } from "@roadside/ui";
import { getSupabase, apiPost } from "./src/supabase";
import { palette } from "./src/theme";

type Screen = "login" | "jobs" | "detail";

interface Job {
  id: string;
  status: string;
  priority: string;
  payer_type: string;
  driver_id: string | null;
}

interface CustomerShare {
  customer_name: string;
  customer_phone: string;
  registration_number: string;
  problem_summary: string;
  pickup_address: string | null;
  destination_address: string | null;
  customer_notes: string | null;
}

const STATUS_BUTTONS: Array<{ label: string; status: string }> = [
  { label: "I Am On My Way", status: "driver_en_route" },
  { label: "I Have Arrived", status: "driver_arrived" },
  { label: "Vehicle Loaded", status: "vehicle_loaded" },
  { label: "On The Way To Destination", status: "transporting" },
  { label: "Delivered", status: "delivered" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("jobs");
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>Roadside Driver</Text>
      <View style={styles.body}>
        {screen === "login" ? <Login onDone={() => setScreen("jobs")} /> : null}
        {screen === "jobs" ? (
          <Jobs
            onOpen={(j) => {
              setActiveJob(j);
              setScreen("detail");
            }}
          />
        ) : null}
        {screen === "detail" && activeJob ? <JobDetail job={activeJob} onBack={() => setScreen("jobs")} /> : null}
      </View>
      <View style={styles.nav}>
        <Pressable onPress={() => setScreen("jobs")}>
          <Text style={styles.navItem}>Jobs</Text>
        </Pressable>
        <Pressable onPress={() => setScreen("login")}>
          <Text style={styles.navItem}>Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [duty, setDuty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else onDone();
  }

  return (
    <ScrollView>
      <Text style={styles.h1}>Driver account</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.bigbtn} onPress={signIn}>
        <Text style={styles.bigbtnText}>Log in</Text>
      </Pressable>
      <Pressable style={[styles.bigbtn, styles.secondary]} onPress={() => setDuty(!duty)}>
        <Text style={[styles.bigbtnText, { color: palette.primary }]}>
          {duty ? "On duty" : "Off duty"} — tap to toggle
        </Text>
      </Pressable>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  );
}

function Jobs({ onOpen }: { onOpen: (j: Job) => void }) {
  const supabase = getSupabase();
  const [jobs, setJobs] = useState<Job[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    // RLS only returns jobs offered to or assigned to this driver.
    const { data } = await supabase
      .from("tow_jobs")
      .select("id, status, priority, payer_type, driver_id")
      .order("created_at", { ascending: false });
    setJobs((data as Job[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <FlatList
      data={jobs}
      keyExtractor={(j) => j.id}
      ListHeaderComponent={<Text style={styles.h1}>Jobs</Text>}
      ListEmptyComponent={<Text style={styles.muted}>No jobs offered to you right now.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <Text style={{ fontWeight: "700" }}>{towStatusLabel(item.status as never)}</Text>
          <Text style={styles.muted}>
            Priority: {item.priority} • Payer: {item.payer_type}
          </Text>
          <Text style={styles.muted}>
            {item.driver_id ? "Assigned to you" : "Offered — review and accept"}
          </Text>
        </Pressable>
      )}
    />
  );
}

function JobDetail({ job, onBack }: { job: Job; onBack: () => void }) {
  const supabase = getSupabase();
  const [share, setShare] = useState<CustomerShare | null>(null);
  const [status, setStatus] = useState<string>(job.status);
  const [message, setMessage] = useState<string | null>(null);

  const loadShare = useCallback(async () => {
    if (!supabase) return;
    // The customer share row only exists AFTER accept; never before.
    const { data } = await supabase
      .from("tow_job_customer_shares")
      .select("*")
      .eq("tow_job_id", job.id)
      .maybeSingle();
    setShare((data as CustomerShare | null) ?? null);
  }, [supabase, job.id]);

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

  async function accept() {
    const driverId = job.driver_id ?? "";
    const res = await apiPost(`/api/v1/tow/jobs/${job.id}/accept`, { driver_id: driverId });
    setMessage(res ? "Accepted. Customer details unlocked." : "Backend not configured.");
    setStatus("accepted");
    await loadShare();
  }
  async function reject() {
    await apiPost(`/api/v1/tow/jobs/${job.id}/reject`, { driver_id: job.driver_id ?? "" });
    onBack();
  }
  async function setJobStatus(next: string) {
    await apiPost(`/api/v1/tow/jobs/${job.id}/status`, { status: next });
    setStatus(next);
  }
  async function complete() {
    await apiPost(`/api/v1/tow/jobs/${job.id}/complete`, {
      work_performed: "Completed",
      vehicle_picked_up: true,
    });
    setStatus("completed");
  }

  const accepted = Boolean(share);

  return (
    <ScrollView>
      <Pressable onPress={onBack}>
        <Text style={{ color: palette.primary }}>{"< Back to jobs"}</Text>
      </Pressable>
      <Text style={styles.h1}>{towStatusLabel(status as never)}</Text>

      {!accepted ? (
        <View>
          <Text style={styles.muted}>
            Before accepting you see only area, problem type and priority — never the customer's
            personal details.
          </Text>
          <View style={styles.card}>
            <Text>Priority: {job.priority}</Text>
            <Text>Payer: {job.payer_type}</Text>
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
          {STATUS_BUTTONS.map((b) => (
            <Pressable key={b.status} style={[styles.bigbtn, styles.secondary]} onPress={() => setJobStatus(b.status)}>
              <Text style={[styles.bigbtnText, { color: palette.primary }]}>{b.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.bigbtn} onPress={complete}>
            <Text style={styles.bigbtnText}>Complete Job</Text>
          </Pressable>
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
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16 },
  bigbtn: { backgroundColor: palette.primary, borderRadius: 12, padding: 16, marginTop: 12, alignItems: "center" },
  bigbtnText: { color: palette.onPrimary, fontWeight: "700", fontSize: 16 },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.primary },
  muted: { opacity: 0.7, marginTop: 10 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  navItem: { fontWeight: "600" },
});
