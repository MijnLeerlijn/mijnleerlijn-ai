import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { maakFakePayload } from "@/lib/support/fake-payload";

// getPayload wordt hier NIET globaal gemockt naar een vaste fake — elke
// test bouwt zijn eigen maakFakePayload()-seed op, zodat de
// eigenaarscontrole (source: 'helpdesk' + user: null) écht doorlopen wordt
// i.p.v. gestubd.
let huidigePayload: ReturnType<typeof maakFakePayload>["payload"];
vi.mock("payload", () => ({
  getPayload: vi.fn(async () => huidigePayload),
}));
vi.mock("@/payload.config", () => ({ default: {} }));

function maakRequest(body: unknown, ip?: string) {
  return new NextRequest("http://localhost:3000/api/helpdesk/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ip ? { "x-real-ip": ip } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  const { payload } = maakFakePayload({
    "assistant-conversations": [
      { id: 1, source: "helpdesk", user: null, feedbackRating: "geen" },
      { id: 2, source: "assistant", user: 5, feedbackRating: "geen" },
    ],
  });
  huidigePayload = payload;
});

describe("POST /api/helpdesk/feedback", () => {
  it("slaat feedback op voor een anonieme helpdesk-conversatie", async () => {
    const response = await POST(maakRequest({ conversationId: 1, rating: "nuttig" }, "203.0.113.20"));

    expect(response.status).toBe(200);
    const gesprek = await huidigePayload.findByID({ collection: "assistant-conversations", id: 1 });
    expect(gesprek.feedbackRating).toBe("nuttig");
  });

  it("weigert feedback op een intern (/assistant) gesprek — voorkomt misbruik via een geraden id", async () => {
    const response = await POST(maakRequest({ conversationId: 2, rating: "nuttig" }, "203.0.113.21"));

    expect(response.status).toBe(404);
    const gesprek = await huidigePayload.findByID({ collection: "assistant-conversations", id: 2 });
    expect(gesprek.feedbackRating).toBe("geen");
  });

  it("weigert een onbekende rating-waarde", async () => {
    const response = await POST(maakRequest({ conversationId: 1, rating: "geweldig" }, "203.0.113.22"));
    expect(response.status).toBe(400);
  });

  it("weigert een ontbrekend conversationId", async () => {
    const response = await POST(maakRequest({ rating: "nuttig" }, "203.0.113.23"));
    expect(response.status).toBe(400);
  });
});
