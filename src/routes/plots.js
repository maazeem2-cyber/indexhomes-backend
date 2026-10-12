import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { getPlatformIndex, withDisplayPrice } from "../services/indexService.js";
import { optionalAuth } from "../middleware/auth.js";
import { parsePagination, paginationMeta } from "../lib/pagination.js";

const router = Router();

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const status = req.query.status || "available";
    const location = req.query.location;
    const q = (req.query.q || "").toString().trim();
    const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 24 });

    let query = supabaseAdmin
      .from("plots")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status !== "all") query = query.eq("status", status);
    if (location) query = query.ilike("location", `%${location}%`);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error, count } = await query;
    if (error) return fail(res, error.message, 500);

    const indexRow = await getPlatformIndex();
    const plots = (data || []).map((p) => withDisplayPrice(p, indexRow));

    return ok(res, {
      plots,
      index: indexRow,
      pagination: paginationMeta({ page, limit, count }),
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/meta/locations", optionalAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    // Distinct locations from a bounded sample of recent available plots keeps this fast at scale.
    // For millions of rows, prefer a dedicated locations table later.
    const { data, error } = await supabaseAdmin
      .from("plots")
      .select("location")
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return fail(res, error.message, 500);

    const locations = [...new Set((data || []).map((row) => row.location).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
    return ok(res, { locations });
  } catch (err) {
    return next(err);
  }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const { data, error } = await supabaseAdmin
      .from("plots")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "Plot not found", 404);

    const indexRow = await getPlatformIndex();
    return ok(res, { plot: withDisplayPrice(data, indexRow), index: indexRow });
  } catch (err) {
    return next(err);
  }
});

export default router;
