import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { apiPost } from "./supabase";

export const LOCATION_TASK = "resqly-driver-location";

// Background task: while the driver is online, forward the latest position so
// dispatch radius checks and customer ETA stay current even when the app is
// in the background. Registered once at module load (TaskManager requirement).
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Array<{ coords: { latitude: number; longitude: number } }> };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  await apiPost("/api/v1/drivers/me/location", {
    location: { lat: latest.coords.latitude, lng: latest.coords.longitude },
  }).catch(() => undefined);
});

/**
 * Start background location updates if the driver granted "always" access.
 * Battery-friendly: balanced accuracy, min 60s / 250m between updates.
 * Returns true when background tracking is active.
 */
export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== "granted") return false;
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (started) return true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 250,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Resqly Förare",
        notificationBody: "Du är i tjänst – din position delas för aktiva uppdrag.",
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop background location updates (driver went offline). */
export async function stopBackgroundLocation(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    /* best-effort */
  }
}
