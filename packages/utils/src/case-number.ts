export interface CaseNumberParts {
  prefix: string;
  year: number;
  sequence: number;
  /** Zero-padding width for the running sequence. */
  padding?: number;
}

/**
 * Format a case number from its parts, e.g. { prefix: "IF", year: 2026,
 * sequence: 184 } -> "IF-2026-000184". The race-safe sequence allocation
 * itself happens in Postgres (see packages/database); this only formats.
 */
export function formatCaseNumber({ prefix, year, sequence, padding = 6 }: CaseNumberParts): string {
  const normalizedPrefix = prefix.trim().toUpperCase();
  const padded = String(sequence).padStart(padding, "0");
  return `${normalizedPrefix}-${year}-${padded}`;
}

const CASE_NUMBER_RE = /^([A-Z0-9]+)-(\d{4})-(\d+)$/;

export function parseCaseNumber(value: string): CaseNumberParts | null {
  const match = CASE_NUMBER_RE.exec(value.trim().toUpperCase());
  if (!match) return null;
  return {
    prefix: match[1]!,
    year: Number(match[2]),
    sequence: Number(match[3]),
    padding: match[3]!.length,
  };
}
