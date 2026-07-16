function isNonPublicLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }

  return host === "::"
    || host === "::1"
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("fe8")
    || host.startsWith("fe9")
    || host.startsWith("fea")
    || host.startsWith("feb")
    || host.startsWith("ff");
}

/** Static URL validation. Delivery workers also resolve DNS immediately before
 * every request to prevent DNS rebinding toward private infrastructure. */
export function validatePublicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Mottagaradressen är inte en giltig URL.");
  }
  if (url.protocol !== "https:") throw new Error("Mottagaradressen måste använda HTTPS.");
  if (url.username || url.password) throw new Error("Mottagaradressen får inte innehålla användarnamn eller lösenord.");
  if (url.port && url.port !== "443") throw new Error("Endast standardporten för HTTPS är tillåten.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Lokala eller interna mottagaradresser är inte tillåtna.");
  }
  if (isNonPublicLiteral(host)) {
    throw new Error("Privata eller reserverade IP-adresser är inte tillåtna.");
  }
  return url;
}
