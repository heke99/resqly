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
