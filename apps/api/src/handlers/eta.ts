import { etaCalculateInputSchema, etaMatrixInputSchema } from "@resqly/types";
import { MapsClient } from "@resqly/maps";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";

function mapsFor(ctx: ApiContext): MapsClient {
  return new MapsClient({
    serverKey: ctx.config.maps.serverKey,
    routesEnabled: ctx.config.maps.routesEnabled,
    routeMatrixEnabled: ctx.config.maps.routeMatrixEnabled,
    tenantId: ctx.tenantId,
  });
}

export async function calculateEta(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = etaCalculateInputSchema.parse(body);
  const eta = await mapsFor(ctx).calculateRouteEta(input.origin, input.destination);
  return { status: 200, body: eta };
}

export async function calculateEtaMatrix(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = etaMatrixInputSchema.parse(body);
  const matrix = await mapsFor(ctx).calculateRouteMatrix(input.origins, input.destinations);
  return { status: 200, body: { matrix } };
}
