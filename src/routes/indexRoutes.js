import { Router } from "express";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { getIndexSnapshots, getPlatformIndex } from "../services/indexService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    assertSupabaseConfigured();
    const index = await getPlatformIndex();
    return ok(res, {
      starting_index: Number(index.starting_index),
      current_index: Number(index.current_index),
      total_platform_value: Number(index.total_platform_value),
      total_units_issued: Number(index.total_units_issued),
      updated_at: index.updated_at,
      formula: {
        index: "Total Paid Sales ÷ Total Units Issued",
        display_price: "Base × (Current Index ÷ Starting Index)",
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const range = ["24h", "7d", "30d", "all"].includes(req.query.range)
      ? req.query.range
      : "all";
    const snapshots = await getIndexSnapshots(range);
    const index = await getPlatformIndex();

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const current = Number(last?.current_index ?? index.current_index);
    const previous = Number(first?.current_index ?? index.starting_index);
    const change_pct =
      previous === 0 ? 0 : Number((((current - previous) / previous) * 100).toFixed(2));

    return ok(res, {
      range,
      current_index: current,
      change_pct,
      rising: change_pct >= 0,
      updated_at: index.updated_at,
      points: snapshots.map((s) => ({
        t: s.recorded_at,
        v: Number(s.current_index),
      })),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
