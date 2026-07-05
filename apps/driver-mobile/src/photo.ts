/**
 * Photo picking via expo-image-picker, loaded dynamically (same pattern as
 * push.ts) so the app still runs in environments without the native module.
 */

export interface PickedPhoto {
  base64: string;
  contentType: "image/jpeg";
}

interface ImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ status: string }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ status: string }>;
  launchCameraAsync(options: Record<string, unknown>): Promise<{
    canceled: boolean;
    assets?: Array<{ base64?: string | null }>;
  }>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<{
    canceled: boolean;
    assets?: Array<{ base64?: string | null }>;
  }>;
}

async function loadPicker(): Promise<ImagePickerModule | null> {
  try {
    return (await import("expo-image-picker")) as unknown as ImagePickerModule;
  } catch {
    return null;
  }
}

const PICK_OPTIONS = {
  mediaTypes: "images",
  quality: 0.6,
  base64: true,
  allowsEditing: false,
};

export async function takePhoto(): Promise<PickedPhoto | null> {
  const picker = await loadPicker();
  if (!picker) return null;
  const perm = await picker.requestCameraPermissionsAsync();
  if (perm.status !== "granted") return null;
  const result = await picker.launchCameraAsync(PICK_OPTIONS);
  const base64 = result.canceled ? null : result.assets?.[0]?.base64 ?? null;
  return base64 ? { base64, contentType: "image/jpeg" } : null;
}

export async function pickPhotoFromLibrary(): Promise<PickedPhoto | null> {
  const picker = await loadPicker();
  if (!picker) return null;
  const perm = await picker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") return null;
  const result = await picker.launchImageLibraryAsync(PICK_OPTIONS);
  const base64 = result.canceled ? null : result.assets?.[0]?.base64 ?? null;
  return base64 ? { base64, contentType: "image/jpeg" } : null;
}
