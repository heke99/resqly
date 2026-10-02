/** Provider responses can contain a personal number even inside `raw`. */
export function redactBankidValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBankidValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/^(personal[_-]?number|personnummer|ssn|qr[_-]?start[_-]?secret|subscription[_-]?token|api[_-]?key|authorization)$/i.test(
            key,
          ),
      )
      .map(([key, child]) => [key, redactBankidValue(child)]),
  );
}
