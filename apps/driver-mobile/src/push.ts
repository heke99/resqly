// Optional Expo push integration.
//
// expo-notifications is added on-device via `expo install expo-notifications`.
// We load it dynamically so the app type-checks and runs in environments where
// the native module is not present (it simply skips push registration there).

interface ExpoNotificationsModule {
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<{ data: string }>;
}

async function loadModule(): Promise<ExpoNotificationsModule | null> {
  try {
    const name = "expo-notifications";
    const mod = (await import(name)) as unknown as ExpoNotificationsModule;
    return mod ?? null;
  } catch {
    return null;
  }
}

/** Returns an Expo push token, or null if unavailable / permission denied. */
export async function getExpoPushToken(): Promise<string | null> {
  const mod = await loadModule();
  if (!mod) return null;
  try {
    let status = (await mod.getPermissionsAsync()).status;
    if (status !== "granted") status = (await mod.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    const token = await mod.getExpoPushTokenAsync();
    return token.data ?? null;
  } catch {
    return null;
  }
}

export function devicePlatform(): "ios" | "android" | "web" | "unknown" {
  // Resolved lazily to avoid importing react-native Platform at module scope.
  try {
    const name = "react-native";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require(name) as { Platform?: { OS?: string } };
    const os = rn.Platform?.OS;
    if (os === "ios" || os === "android" || os === "web") return os;
  } catch {
    /* ignore */
  }
  return "unknown";
}
