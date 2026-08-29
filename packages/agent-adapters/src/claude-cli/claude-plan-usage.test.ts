import { describe, expect, it } from "vitest";
import { mapClaudePlanUsage } from "./claude-plan-usage";

const updatedAt = "2026-08-13T00:00:00.000Z";

describe("mapClaudePlanUsage", () => {
  it("returns null when plan limits do not apply", () => {
    expect(mapClaudePlanUsage(null, updatedAt)).toBeNull();
    expect(
      mapClaudePlanUsage(
        { rate_limits_available: false, rate_limits: null },
        updatedAt,
      ),
    ).toBeNull();
    // Available but empty: an API-key session must not render a quota section.
    expect(
      mapClaudePlanUsage(
        { rate_limits_available: true, rate_limits: {} },
        updatedAt,
      ),
    ).toBeNull();
  });

  it("maps plan windows, per-model buckets and credits", () => {
    const record = mapClaudePlanUsage(
      {
        subscription_type: "pro",
        rate_limits_available: true,
        rate_limits: {
          five_hour: {
            utilization: 50,
            resets_at: "2026-08-13T05:00:00.000Z",
          },
          seven_day: { utilization: 20, resets_at: null },
          seven_day_opus: { utilization: 8, resets_at: null },
          model_scoped: [{ display_name: "Fable", utilization: 3 }],
          extra_usage: {
            is_enabled: true,
            monthly_limit: 5000,
            used_credits: 1875,
            currency: "USD",
          },
        },
      },
      updatedAt,
    );

    expect(record).toEqual({
      updatedAt,
      planLabel: "pro",
      credits: { usedAmount: 18.75, limitAmount: 50, currency: "USD" },
      windows: [
        {
          kind: "five-hour",
          usedPercent: 50,
          resetsAt: "2026-08-13T05:00:00.000Z",
        },
        { kind: "weekly", usedPercent: 20 },
        { kind: "weekly", usedPercent: 8, label: "Opus" },
        { kind: "weekly", usedPercent: 3, label: "Fable" },
      ],
    });
  });

  it("skips windows without a utilization and disabled credits", () => {
    const record = mapClaudePlanUsage(
      {
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 12 },
          seven_day: { utilization: null },
          extra_usage: {
            is_enabled: false,
            monthly_limit: 50,
            used_credits: 0,
          },
        },
      },
      updatedAt,
    );

    expect(record).toEqual({
      updatedAt,
      windows: [{ kind: "five-hour", usedPercent: 12 }],
    });
  });
});
