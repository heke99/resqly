import { jsonError } from "../../../../_lib";
import { POST as signIncident } from "../sign/route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const production = (process.env.APP_ENV ?? process.env.NODE_ENV) === "production";
  if (
    production ||
    process.env.NODE_ENV === "production" ||
    process.env.BANKID_MOCK_ENABLED !== "true"
  ) {
    return jsonError(404, "Sidan hittades inte.");
  }
  return signIncident(request, context);
}
