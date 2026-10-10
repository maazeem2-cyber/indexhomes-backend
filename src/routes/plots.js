import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { getPlatformIndex, withDisplayPrice } from "../services/indexService.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", optionalAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const status = req.query.status || "available";
    const location = req.query.location;
    const q = (req.query.q || "").toString().trim();

    let query = supabaseAdmin.from("plots").select("*").order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (location) query = query.ilike("location", `%${location}%`);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) return fail(res, error.message, 500);

    const indexRow = await getPlatformIndex();
    const plots = (data || []).map((p) => withDisplayPrice(p, indexRow));

    return ok(res, { plots, index: indexRow });
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

router.post("/seed", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    assertSupabaseConfigured();
    const { count } = await supabaseAdmin
      .from("plots")
      .select("*", { count: "exact", head: true });

    if ((count || 0) > 0) {
      return ok(res, { message: "Plots already exist", count });
    }

    const seeds = [
      { name: "Oakwood Rise", description: "Modern 2-bed apartment", base_price: 1000, location: "London", tags: ["modern", "2-bed"], just_added: true, image_url: "/images/plot-oakwood.jpg" },
      { name: "Cedar Court", description: "Spacious 3-bed home", base_price: 1500, location: "Manchester", tags: ["family", "3-bed"], just_added: true, image_url: "/images/plot-cedar.jpg" },
      { name: "Willow Gardens", description: "Premium view property", base_price: 2000, location: "Birmingham", tags: ["premium", "view"], just_added: true, image_url: "/images/plot-willow.jpg" },
      { name: "Birch Place", description: "Cosy 1-bed starter", base_price: 1200, location: "Leeds", tags: ["starter", "1-bed"], just_added: false, image_url: "/images/plot-birch.jpg" },
      { name: "Elm Drive", description: "Luxury 4-bed detached", base_price: 2500, location: "Bristol", tags: ["luxury", "4-bed"], just_added: false, image_url: "/images/plot-elm.jpg" },
      { name: "Ash Grove", description: "Family home with garden", base_price: 1800, location: "Sheffield", tags: ["family", "garden"], just_added: false, image_url: "/images/plot-ash.jpg" },
    ].map((p) => ({ ...p, status: "available", published_at: new Date().toISOString() }));

    const { data, error } = await supabaseAdmin.from("plots").insert(seeds).select();
    if (error) return fail(res, error.message, 500);

    return ok(res, { plots: data }, 201);
  } catch (err) {
    return next(err);
  }
});

export default router;
