/** Read a required environment variable or throw a descriptive error. */
export function requireEnv(name: string, source: NodeJS.ProcessEnv = process.env): string {
  const value = source[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(
  name: string,
  fallback = "",
  source: NodeJS.ProcessEnv = process.env,
): string {
  const value = source[name];
  return value === undefined || value === "" ? fallback : value;
}

export function boolEnv(name: string, fallback = false, source: NodeJS.ProcessEnv = process.env) {
  const value = source[name];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}
