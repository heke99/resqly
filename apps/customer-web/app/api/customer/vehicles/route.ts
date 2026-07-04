import { NextResponse } from "next/server";
import { isValidSwedishReg, jsonError, normalizeReg, requireCustomer } from "../_lib";

/**
 * Create a vehicle for the signed-in customer. All vehicle creation goes
 * through this route (web + mobile) so validation, normalization, duplicate
 * handling and audit are enforced in one place.
 */
export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const rawReg = typeof body.registration_number === "string" ? body.registration_number : "";
  const registrationNumber = normalizeReg(rawReg);
  if (!registrationNumber) return jsonError(400, "Ange fordonets registreringsnummer.");
  if (!isValidSwedishReg(registrationNumber)) {
    return jsonError(400, "Registreringsnumret ser inte rätt ut. Ange det i formatet ABC123.");
  }
  const make = typeof body.make === "string" && body.make.trim() ? body.make.trim().slice(0, 80) : null;
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim().slice(0, 80) : null;

  // Duplicate handling: the same customer cannot register the same plate twice.
  const { data: existing } = await db
    .from("vehicles" as never)
    .select("id, registration_number")
    .eq("owner_user_id", user.id)
    .eq("registration_number", registrationNumber)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { vehicle_id: (existing as { id: string }).id, registration_number: registrationNumber, duplicate: true },
      { status: 200 },
    );
  }

  const { count } = await db
    .from("vehicles" as never)
    .select("id", { count: "exact", head: true } as never)
    .eq("owner_user_id", user.id);

  const { data: vehicle, error } = await db
    .from("vehicles" as never)
    .insert({
      owner_user_id: user.id,
      registration_number: registrationNumber,
      make,
      model,
      is_default: (count ?? 0) === 0,
    } as never)
    .select("id")
    .single();
  if (error) return jsonError(400, "Fordonet kunde inte sparas. Försök igen.");
  const vehicleId = (vehicle as { id: string }).id;

  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "create",
    entity_type: "vehicle",
    entity_id: vehicleId,
    fields: ["registration_number"],
  } as never);

  return NextResponse.json(
    { vehicle_id: vehicleId, registration_number: registrationNumber, duplicate: false },
    { status: 201 },
  );
}
