import { z } from "zod";

export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

export const timestampsSchema = z.object({
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** WGS84 coordinate. Longitude first is *not* used here — we keep lat/lng explicit. */
export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Horizontal accuracy in metres, when reported by the device. */
  accuracy_m: z.number().nonnegative().optional(),
});
export type Coordinate = z.infer<typeof coordinateSchema>;

export const moneySchema = z.object({
  /** Amount in minor units (e.g. öre). Integer to avoid float drift. */
  amount_minor: z.number().int(),
  currency: z.string().length(3).default("SEK"),
});
export type Money = z.infer<typeof moneySchema>;

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Standard envelope returned by the partner API for errors. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
