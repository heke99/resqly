import { AppError } from "./errors";

/**
 * Minimal transition guard for status machines. Generic over the status string
 * union so each domain (incident, tow job, ...) supplies its own type.
 */
export class TransitionGuard<S extends string> {
  constructor(private readonly transitions: Record<S, readonly S[]>) {}

  canTransition(from: S, to: S): boolean {
    if (from === to) return true;
    return (this.transitions[from] ?? []).includes(to);
  }

  isTerminal(state: S): boolean {
    return (this.transitions[state] ?? []).length === 0;
  }

  assertTransition(from: S, to: S): void {
    if (!this.canTransition(from, to)) {
      throw new AppError("conflict", `Illegal status transition: ${from} -> ${to}`);
    }
  }

  allowedFrom(from: S): readonly S[] {
    return this.transitions[from] ?? [];
  }
}
