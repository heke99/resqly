import type { CSSProperties, ReactNode } from "react";
import type { TenantThemeTokens } from "@resqly/types";
import { themeToCssVars, DEFAULT_THEME_TOKENS } from "@resqly/white-label";

/** Applies white-label CSS variables to a wrapper around the app. */
export function ThemeRoot({
  tokens,
  children,
}: {
  tokens?: Partial<TenantThemeTokens>;
  children: ReactNode;
}) {
  const merged: TenantThemeTokens = {
    tenant_id: "",
    ...DEFAULT_THEME_TOKENS,
    ...(tokens ?? {}),
  };
  const vars = themeToCssVars(merged) as unknown as CSSProperties;
  return (
    <div
      style={{
        ...vars,
        background: "var(--rs-color-background)",
        color: "var(--rs-color-text)",
        fontFamily: "var(--rs-font-family)",
        minHeight: "100vh",
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, margin: 0 }}>{title}</h1>
        {subtitle ? <p style={{ margin: "4px 0 0", opacity: 0.7 }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--rs-color-surface)",
        borderRadius: "var(--rs-radius-base)",
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </Card>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const primary = variant === "primary";
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        background: primary ? "var(--rs-color-primary)" : "transparent",
        color: primary ? "var(--rs-color-on-primary)" : "var(--rs-color-primary)",
        border: primary ? "none" : "1px solid var(--rs-color-primary)",
        borderRadius: "var(--rs-radius-base)",
        padding: "10px 16px",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.06)",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

type ChipTone = "neutral" | "info" | "success" | "warning" | "danger";

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: "rgba(100,116,139,0.14)", fg: "#475569" },
  info: { bg: "rgba(37,99,235,0.14)", fg: "#1d4ed8" },
  success: { bg: "rgba(22,163,74,0.16)", fg: "#15803d" },
  warning: { bg: "rgba(217,119,6,0.16)", fg: "#b45309" },
  danger: { bg: "rgba(220,38,38,0.16)", fg: "#b91c1c" },
};

/** Maps a status-ish string to a semantic tone for consistent status chips. */
export function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (["completed", "invoiced", "closed", "accepted", "active", "delivered", "sent", "verified", "approved"].includes(s))
    return "success";
  if (["manual_review", "more_info_required", "awaiting_bankid", "awaiting_handler", "pending", "offered", "matching"].includes(s))
    return "warning";
  if (["cancelled", "rejected", "failed", "expired", "suspended", "terminated"].includes(s)) return "danger";
  if (["driver_en_route", "driver_arrived", "transporting", "vehicle_loaded", "in_progress", "submitted", "received"].includes(s))
    return "info";
  return "neutral";
}

export function StatusChip({ status, tone }: { status: string; tone?: ChipTone }) {
  const t = CHIP_TONES[tone ?? statusTone(status)];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 12,
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

/** KPI grid that lays out StatCards responsively. */
export function KpiGrid({ children, min = 180 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

/** A GET filter bar; children are inputs/selects with `name` attributes. */
export function Filters({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <form
        method="get"
        action={action}
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}
      >
        {children}
        <button
          type="submit"
          style={{
            background: "var(--rs-color-primary)",
            color: "var(--rs-color-on-primary)",
            border: "none",
            borderRadius: "var(--rs-radius-base)",
            padding: "9px 16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
      </form>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.8 }}>
      {label}
      {children}
    </label>
  );
}

/** Simple horizontal bar breakdown (no external chart dependency). */
export function Bars({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <p style={{ opacity: 0.6, fontSize: 14 }}>No data for this period.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "160px 1fr 48px", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13, textTransform: "capitalize" }}>{d.label.replaceAll("_", " ")}</span>
          <span style={{ background: "rgba(0,0,0,0.06)", borderRadius: 999, height: 10, overflow: "hidden" }}>
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.round((d.value / max) * 100)}%`,
                background: "var(--rs-color-primary)",
              }}
            />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card style={{ textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
      {hint ? <p style={{ opacity: 0.7, marginTop: 8 }}>{hint}</p> : null}
    </Card>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, empty }: { columns: Column<T>[]; rows: T[]; empty?: string }) {
  if (rows.length === 0) {
    return <EmptyState title={empty ?? "No data yet"} hint="Records you create will appear here." />;
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: "left", padding: "12px 16px", fontSize: 13, opacity: 0.7 }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "12px 16px", fontSize: 14 }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function Sidebar({ brand, items }: { brand: string; items: Array<{ href: string; label: string }> }) {
  return (
    <nav
      style={{
        width: 240,
        background: "var(--rs-color-surface)",
        padding: 20,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 24, color: "var(--rs-color-primary)" }}>{brand}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it) => (
          <li key={it.href}>
            <a
              href={it.href}
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      {sidebar}
      <main style={{ flex: 1, padding: 32, maxWidth: 1200 }}>{children}</main>
    </div>
  );
}
