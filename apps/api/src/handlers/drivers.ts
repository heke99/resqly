import {
  driverDeviceInputSchema,
  driverLocationInputSchema,
  offerRejectInputSchema,
} from "@resqly/types";
import { forbidden, notFound } from "@resqly/utils";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import { acceptJobForDriver } from "./tow";

function requireDriver(ctx: ApiContext): string {
  if (!ctx.driverId) throw forbidden("An authenticated driver token is required for this action");
  return ctx.driverId;
}

async function requireActiveDriverProfile(ctx: ApiContext, driverId: string) {
  const profile = await ctx.repo.getDriverProfile(driverId);
  if (!profile || profile.status !== "active") {
    throw forbidden("No active driver profile for this user");
  }
  return profile;
}

export async function goOnline(ctx: ApiContext, online: boolean): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  const profile = await requireActiveDriverProfile(ctx, driverId);
  await ctx.repo.setDriverOnline(driverId, online);
  await ctx.repo.recordAudit({
    tenant_id: profile.tenant_id,
    actor_user_id: ctx.userId ?? null,
    action: "update",
    entity_type: "tow_driver",
    entity_id: driverId,
    fields: ["is_online"],
    metadata: { is_online: online },
  });
  return { status: 200, body: { driver_id: driverId, is_online: online } };
}

export async function updateLocation(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  await requireActiveDriverProfile(ctx, driverId);
  const input = driverLocationInputSchema.parse(body);
  await ctx.repo.updateDriverLocation(driverId, input.location.lat, input.location.lng);
  return { status: 200, body: { ok: true } };
}

export async function registerDevice(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  const userId = ctx.userId;
  if (!userId) throw forbidden("An authenticated user access token is required");
  const input = driverDeviceInputSchema.parse(body);
  await ctx.repo.upsertDriverDevice(driverId, userId, {
    expo_push_token: input.expo_push_token,
    platform: input.platform,
    device_name: input.device_name ?? null,
  });
  return { status: 201, body: { ok: true } };
}

export async function listOffers(ctx: ApiContext): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  const offers = await ctx.repo.listDriverOffers(driverId);
  return { status: 200, body: { offers } };
}

export async function acceptOffer(ctx: ApiContext, offerId: string): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  const offer = await ctx.repo.getOfferById(offerId);
  if (!offer) throw notFound("Offer not found");
  if (offer.driver_id !== driverId) throw forbidden("This offer belongs to another driver");
  return acceptJobForDriver(ctx, offer.tow_job_id, driverId);
}

export async function rejectOffer(
  ctx: ApiContext,
  offerId: string,
  body: unknown,
): Promise<RouteResult> {
  const driverId = requireDriver(ctx);
  const input = offerRejectInputSchema.parse(body ?? {});
  const offer = await ctx.repo.getOfferById(offerId);
  if (!offer) throw notFound("Offer not found");
  if (offer.driver_id !== driverId) throw forbidden("This offer belongs to another driver");
  await ctx.repo.rejectOffer(offer.tow_job_id, driverId, input.reason ?? null);
  await ctx.repo.recordAudit({
    tenant_id: offer.tenant_id,
    actor_user_id: ctx.userId ?? null,
    action: "update",
    entity_type: "tow_job_offer",
    entity_id: offer.id,
    fields: ["status"],
    metadata: { status: "rejected", reason: input.reason ?? null, driver_id: driverId },
  });
  return { status: 200, body: { status: "rejected" } };
}
