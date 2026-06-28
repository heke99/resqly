import { describe, expect, it } from "vitest";
import { renderTemplate, resolveNotification, type NotificationTemplate } from "./templates";
import { createMockDispatcher } from "./channels";
import {
  buildWebhookEnvelope,
  selectWebhookTargets,
  signWebhook,
  verifyWebhook,
  WEBHOOK_SIGNATURE_HEADER,
} from "./webhooks";

describe("templates", () => {
  it("substitutes placeholders and ignores unknowns", () => {
    expect(renderTemplate("Hi {{name}}, case {{case}}", { name: "Anna", case: "IF-1" })).toBe(
      "Hi Anna, case IF-1",
    );
    expect(renderTemplate("{{missing}} done", {})).toBe(" done");
  });

  const templates: NotificationTemplate[] = [
    { channel: "sms", template_key: "tow_assigned", locale: "sv-SE", body: "Bärgare {{driver}} på väg" },
    { channel: "sms", template_key: "tow_assigned", locale: "en-US", body: "Driver {{driver}} en route" },
  ];

  it("resolves by locale with fallback", () => {
    const en = resolveNotification(templates, {
      key: "tow_assigned",
      channel: "sms",
      locale: "en-US",
      vars: { driver: "Erik" },
    });
    expect(en?.body).toBe("Driver Erik en route");

    const missingLocale = resolveNotification(templates, {
      key: "tow_assigned",
      channel: "sms",
      locale: "de-DE",
      vars: { driver: "Erik" },
      fallbackLocale: "sv-SE",
    });
    expect(missingLocale?.body).toBe("Bärgare Erik på väg");
  });

  it("returns null when no template exists", () => {
    expect(
      resolveNotification(templates, { key: "nope", channel: "sms", locale: "sv-SE", vars: {} }),
    ).toBeNull();
  });
});

describe("dispatcher", () => {
  it("routes a message to the matching mock adapter", async () => {
    const { dispatcher, adapters } = createMockDispatcher();
    const res = await dispatcher.send({ channel: "sms", to: "+46700000000", body: "hi" });
    expect(res.delivered).toBe(true);
    expect(adapters.sms.sent).toHaveLength(1);
    expect(adapters.push.sent).toHaveLength(0);
  });
});

describe("webhooks", () => {
  it("signs and verifies an envelope", () => {
    const env = buildWebhookEnvelope("tow.accepted", "t1", { jobId: "j1" });
    const { body, signature, headers } = signWebhook("secret", env);
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(signature);
    expect(verifyWebhook("secret", body, signature)).toBe(true);
    expect(verifyWebhook("secret", body + "x", signature)).toBe(false);
  });

  it("selects only active webhooks subscribed to the event", () => {
    const hooks = [
      { id: "a", events: ["tow.accepted"], active: true },
      { id: "b", events: ["tow.completed"], active: true },
      { id: "c", events: ["tow.accepted"], active: false },
    ];
    expect(selectWebhookTargets(hooks, "tow.accepted").map((h) => h.id)).toEqual(["a"]);
  });
});
