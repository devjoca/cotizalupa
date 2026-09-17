import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "#/server/monitoring";

describe("Sentry privacy boundary", () => {
  it("removes request, identity, context, and breadcrumb data", () => {
    const scrubbed = scrubSentryEvent({
      event_id: "event-1",
      message: "safe operational code",
      request: { data: "document contents", headers: { authorization: "x" } },
      user: { email: "person@example.com", ip_address: "127.0.0.1" },
      extra: { reportToken: "secret" },
      contexts: { quotation: { text: "document contents" } },
      breadcrumbs: [{ message: "uploaded quote.pdf" }],
      transaction: "/orders/private-token",
      modules: { private: "1" },
      tags: { operation: "analysis" },
    } as unknown as Parameters<typeof scrubSentryEvent>[0]);

    expect(scrubbed).toMatchObject({
      event_id: "event-1",
      message: "safe operational code",
      tags: { operation: "analysis" },
    });
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.contexts).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.transaction).toBeUndefined();
    expect(scrubbed.modules).toBeUndefined();
  });
});
