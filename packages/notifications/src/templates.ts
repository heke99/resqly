import type { NotificationChannel } from "@resqly/types";

export interface NotificationTemplate {
  channel: NotificationChannel;
  template_key: string;
  locale: string;
  subject?: string | null;
  body: string;
}

/** Replace {{placeholders}} with values; unknown placeholders become empty. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
}

export interface ResolvedNotification {
  subject: string | null;
  body: string;
}

/**
 * Resolve and render a tenant notification. Falls back across locale so a tenant
 * without a localized template still gets a message. Returns null if no template
 * exists for the key/channel at all.
 */
export function resolveNotification(
  templates: NotificationTemplate[],
  params: {
    key: string;
    channel: NotificationChannel;
    locale: string;
    vars: Record<string, string | number>;
    fallbackLocale?: string;
  },
): ResolvedNotification | null {
  const match =
    templates.find(
      (t) =>
        t.template_key === params.key &&
        t.channel === params.channel &&
        t.locale === params.locale,
    ) ??
    templates.find(
      (t) =>
        t.template_key === params.key &&
        t.channel === params.channel &&
        t.locale === (params.fallbackLocale ?? "sv-SE"),
    ) ??
    templates.find((t) => t.template_key === params.key && t.channel === params.channel);

  if (!match) return null;
  return {
    subject: match.subject ? renderTemplate(match.subject, params.vars) : null,
    body: renderTemplate(match.body, params.vars),
  };
}
