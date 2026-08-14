import { describe, expect, it } from "vitest";
import { isConfirmedClick, isConfirmedOpen, summariseEmails, type DashboardEvent, type TrackedEmail } from "../eventFilters";

function event(overrides: Partial<DashboardEvent>): DashboardEvent {
  return {
    id: "evt-1",
    email_id: "email-1",
    link_id: null,
    type: "open",
    at: "2026-08-14T16:30:00.000Z",
    confidence: 100,
    is_proxy: false,
    is_self: false,
    client: "desktop",
    ...overrides,
  };
}

describe("isConfirmedOpen", () => {
  it("counts a genuine, high-confidence open", () => {
    expect(isConfirmedOpen(event({ type: "open", is_self: false, confidence: 100 }))).toBe(true);
  });

  it("excludes a self-open even at full confidence", () => {
    expect(isConfirmedOpen(event({ type: "open", is_self: true, confidence: 100 }))).toBe(false);
  });

  it("excludes a low-confidence open", () => {
    expect(isConfirmedOpen(event({ type: "open", is_self: false, confidence: 25 }))).toBe(false);
  });

  it("excludes a prefetch entirely", () => {
    expect(isConfirmedOpen(event({ type: "prefetch", is_self: false, confidence: 0 }))).toBe(false);
  });
});

describe("isConfirmedClick", () => {
  it("counts a genuine click", () => {
    expect(isConfirmedClick(event({ type: "click", is_self: false }))).toBe(true);
  });

  it("excludes a self-click", () => {
    expect(isConfirmedClick(event({ type: "click", is_self: true }))).toBe(false);
  });
});

describe("summariseEmails", () => {
  const email: TrackedEmail = {
    id: "email-1",
    thread_id: "thread-1",
    subject: "Testing Boss",
    recipient_count: 1,
    sent_at: "2026-08-14T16:28:00.000Z",
    tracking_enabled: true,
  };

  it("does not count the sender's own opens and clicks", () => {
    const events = [
      event({ id: "e1", type: "prefetch", is_self: false, confidence: 0, at: "2026-08-14T16:29:17.000Z" }),
      event({ id: "e2", type: "open", is_self: true, confidence: 0, at: "2026-08-14T16:30:00.000Z" }),
      event({ id: "e3", type: "click", is_self: true, at: "2026-08-14T16:31:00.000Z" }),
    ];
    const [summary] = summariseEmails([email], events);
    expect(summary.opens).toBe(0);
    expect(summary.clicks).toBe(0);
    expect(summary.lastOpenAt).toBeNull();
  });

  it("counts a genuine recipient open once it arrives", () => {
    const events = [
      event({ id: "e1", type: "prefetch", is_self: false, confidence: 0, at: "2026-08-14T16:29:17.000Z" }),
      event({ id: "e2", type: "open", is_self: false, confidence: 100, at: "2026-08-14T16:40:00.000Z" }),
    ];
    const [summary] = summariseEmails([email], events);
    expect(summary.opens).toBe(1);
    expect(summary.lastOpenAt).toBe("2026-08-14T16:40:00.000Z");
  });
});
