import type { NotificationChannel } from "@resqly/types";

export interface OutboundNotification {
  channel: NotificationChannel;
  to: string;
  subject?: string | null;
  body: string;
  tenantId?: string;
}

export interface NotificationResult {
  channel: NotificationChannel;
  delivered: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(message: OutboundNotification): Promise<NotificationResult>;
}

/**
 * Mock adapter that records sends instead of contacting a real provider. The
 * production adapters (FCM/APNs, SMS gateway, email provider) implement the same
 * interface and are swapped in via configuration.
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly sent: OutboundNotification[] = [];
  constructor(readonly channel: NotificationChannel) {}
  async send(message: OutboundNotification): Promise<NotificationResult> {
    this.sent.push(message);
    return { channel: this.channel, delivered: true, providerMessageId: `mock_${this.sent.length}` };
  }
}

export class NotificationDispatcher {
  private readonly adapters = new Map<NotificationChannel, ChannelAdapter>();

  constructor(adapters: ChannelAdapter[]) {
    for (const a of adapters) this.adapters.set(a.channel, a);
  }

  async send(message: OutboundNotification): Promise<NotificationResult> {
    const adapter = this.adapters.get(message.channel);
    if (!adapter) {
      return { channel: message.channel, delivered: false };
    }
    return adapter.send(message);
  }
}

/** A dispatcher wired entirely to mock adapters (default for dev/test). */
export function createMockDispatcher(): {
  dispatcher: NotificationDispatcher;
  adapters: Record<NotificationChannel, MockChannelAdapter>;
} {
  const channels: NotificationChannel[] = ["push", "sms", "email", "in_app", "webhook"];
  const adapters = Object.fromEntries(
    channels.map((c) => [c, new MockChannelAdapter(c)]),
  ) as Record<NotificationChannel, MockChannelAdapter>;
  return { dispatcher: new NotificationDispatcher(Object.values(adapters)), adapters };
}
