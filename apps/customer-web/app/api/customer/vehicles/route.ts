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
  const { data: existing, error: existingError } = await db
    .from("vehicles" as never)
    .select("id, registration_number")
    .eq("owner_user_id", user.id)
    .eq("registration_number", registrationNumber)
    .maybeSingle();
  if (existingError) return jsonError(503, "Fordon kunde inte kontrolleras just nu.");
  if (existing) {
    return NextResponse.json(
      { vehicle_id: (existing as { id: string }).id, registration_number: registrationNumber, duplicate: true },
      { status: 200 },
    );
  }

  const { count, error: countError } = await db
    .from("vehicles" as never)
    .select("id", { count: "exact", head: true } as never)
    .eq("owner_user_id", user.id);
  if (countError) return jsonError(503, "Dina fordon kunde inte räknas just nu.");

  const { data: vehicle, error } = await db
    .from("vehicles" as never)
    .insert({
      owner_user_id: user.id,
      registration_number: registrationNumber,
      make,
      model,
      is_default: (count ?? 0) === 0,
      created_by_user_id: user.id,
    } as never)
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: concurrent, error: concurrentError } = await db
        .from("vehicles" as never)
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("registration_number", registrationNumber)
        .maybeSingle();
      if (concurrentError) return jsonError(503, "Uppgifterna kunde inte kontrolleras just nu. Försök igen.");
      if (concurrent) {
        return NextResponse.json(
          { vehicle_id: (concurrent as { id: string }).id, registration_number: registrationNumber, duplicate: true },
          { status: 200 },
        );
      }
    }
    return jsonError(400, "Fordonet kunde inte sparas. Försök igen.");
  }
  const vehicleId = (vehicle as { id: string }).id;

  const { error: auditError } = await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    actor_kind: "user",
    action: "create",
    entity_type: "vehicle",
    entity_id: vehicleId,
    fields: ["registration_number"],
  } as never);
  if (auditError) {
    await db.from("vehicles" as never).delete().eq("id", vehicleId).eq("owner_user_id", user.id);
    return jsonError(503, "Fordonet kunde inte sparas med full spårbarhet. Försök igen.");
  }

  return NextResponse.json(
    { vehicle_id: vehicleId, registration_number: registrationNumber, duplicate: false },
    { status: 201 },
  );
}
