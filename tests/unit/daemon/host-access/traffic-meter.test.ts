import {
  createTrafficMeter,
  incomingTrafficCategory,
  outgoingTrafficCategory,
  trafficTransport,
} from "@cocurdex/daemon/internal/host-access/traffic-meter";
import { describe, expect, it } from "vitest";

describe("traffic categories", () => {
  it("attributes a response to the method of the request it answers", () => {
    const pending = new Map<unknown, string>();
    expect(
      incomingTrafficCategory({ id: 7, method: "session.list" }, pending),
    ).toBe("rpc:session.list");

    expect(outgoingTrafficCategory({ id: 7, result: [] }, pending)).toBe(
      "rpc:session.list",
    );
    expect(pending.size).toBe(0);
    expect(outgoingTrafficCategory({ id: 7, result: [] }, pending)).toBe(
      "other",
    );
  });

  it("names pushed events by their event type", () => {
    const event = { type: "daemon.event", event: { type: "message.delta" } };
    expect(outgoingTrafficCategory(event, new Map())).toBe(
      "event:message.delta",
    );
  });

  it("tells relayed sockets from direct ones by their address", () => {
    expect(trafficTransport("relay:relay.example.invalid")).toBe("relay");
    expect(trafficTransport("192.0.2.10")).toBe("direct");
    expect(trafficTransport(null)).toBe("direct");
  });
});

describe("createTrafficMeter", () => {
  it("sums by category, ranks the largest first, and starts over on reset", () => {
    const times = [
      new Date("2026-11-02T00:00:00.000Z"),
      new Date("2026-11-02T01:00:00.000Z"),
    ];
    const meter = createTrafficMeter(() => times.shift() ?? new Date(0));
    meter.recordMessage("relay", "sent", "event:message.delta", 120);
    meter.recordMessage("relay", "sent", "event:message.delta", 80);
    meter.recordMessage("relay", "sent", "rpc:session.get", 5000);
    meter.recordFrame("relay", "sent", 5300);

    const final = meter.reset();
    expect(final.since).toBe("2026-11-02T00:00:00.000Z");
    expect(final.frames).toEqual([
      { transport: "relay", direction: "sent", frames: 1, bytes: 5300 },
    ]);
    expect(final.messages.map((entry) => entry.category)).toEqual([
      "rpc:session.get",
      "event:message.delta",
    ]);
    expect(final.messages[1]).toMatchObject({ messages: 2, bytes: 200 });

    expect(meter.report()).toEqual({
      since: "2026-11-02T01:00:00.000Z",
      frames: [],
      messages: [],
    });
  });
});
