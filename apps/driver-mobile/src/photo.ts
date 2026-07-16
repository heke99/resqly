/**
 * Photo picking via expo-image-picker. Photos are returned as local URIs and
 * uploaded directly to private Supabase Storage with a one-time signed token.
 * Base64 is deliberately disabled so normal mobile photos never hit the JSON
 * API body limit or consume ~33% extra memory.
 */

export interface PickedPhoto {
  uri: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
  sizeBytes: number;
}

interface PickerAsset {
  uri: string;
  fileSize?: number | null;
  mimeType?: string | null;
}
interface ImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ status: string }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ status: string }>;
  launchCameraAsync(options: Record<string, unknown>): Promise<{ canceled: boolean; assets?: PickerAsset[] }>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<{ canceled: boolean; assets?: PickerAsset[] }>;
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
  base64: false,
  allowsEditing: false,
};

function normalizeAsset(asset: PickerAsset | undefined): PickedPhoto | null {
  if (!asset?.uri) return null;
  const mime = asset.mimeType?.toLowerCase();
  const contentType: PickedPhoto["contentType"] =
    mime === "image/png" || mime === "image/webp" || mime === "image/heic" ? mime : "image/jpeg";
  return { uri: asset.uri, contentType, sizeBytes: Math.max(0, Number(asset.fileSize ?? 0)) };
}

export async function takePhoto(): Promise<PickedPhoto | null> {
  const picker = await loadPicker();
  if (!picker) return null;
  const perm = await picker.requestCameraPermissionsAsync();
  if (perm.status !== "granted") return null;
  const result = await picker.launchCameraAsync(PICK_OPTIONS);
  return result.canceled ? null : normalizeAsset(result.assets?.[0]);
}

export async function pickPhotoFromLibrary(): Promise<PickedPhoto | null> {
  const picker = await loadPicker();
  if (!picker) return null;
  const perm = await picker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") return null;
  const result = await picker.launchImageLibraryAsync(PICK_OPTIONS);
  return result.canceled ? null : normalizeAsset(result.assets?.[0]);
}
