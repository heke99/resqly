// Optional Expo push integration.
//
// expo-notifications is added on-device via `expo install expo-notifications`.
// We load it dynamically so the app type-checks and runs in environments where
// the native module is not present (it simply skips push registration there).

interface ExpoNotificationsModule {
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<{ data: string }>;
  setNotificationHandler?: (handler: unknown) => void;
  addNotificationReceivedListener?: (cb: (event: unknown) => void) => { remove: () => void };
  addNotificationResponseReceivedListener?: (
    cb: (event: { notification?: { request?: { content?: { data?: Record<string, unknown> } } } }) => void,
  ) => { remove: () => void };
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
    const token = await mod.getExpoPushTokenAsync({ projectId: process.env.EXPO_PUBLIC_PROJECT_ID });
    return token.data ?? null;
  } catch {
    return null;
  }
}

export interface OfferPushData {
  type?: string;
  offer_id?: string;
  tow_job_id?: string;
}

/**
 * Listen for incoming offer pushes. `onReceived` fires for pushes arriving
 * while the app is open (refresh the offer list); `onOpened` fires when the
 * driver taps a push (deep-open the offer). Returns a cleanup function.
 */
export async function listenForOfferPushes(handlers: {
  onReceived?: () => void;
  onOpened?: (data: OfferPushData) => void;
}): Promise<() => void> {
  const mod = await loadModule();
  if (!mod) return () => undefined;
  try {
    mod.setNotificationHandler?.({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const subs: Array<{ remove: () => void }> = [];
    if (mod.addNotificationReceivedListener && handlers.onReceived) {
      subs.push(mod.addNotificationReceivedListener(() => handlers.onReceived?.()));
    }
    if (mod.addNotificationResponseReceivedListener && handlers.onOpened) {
      subs.push(
        mod.addNotificationResponseReceivedListener((event) => {
          const data = (event.notification?.request?.content?.data ?? {}) as OfferPushData;
          handlers.onOpened?.(data);
        }),
      );
    }
    return () => subs.forEach((s) => s.remove());
  } catch {
    return () => undefined;
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
