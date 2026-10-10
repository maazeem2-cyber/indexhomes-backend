import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPlatformIndex } from "../services/indexService.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/metrics", async (_req, res, next) => {
  try {
    assertSupabaseConfigured();
    const index = await getPlatformIndex();

    const [{ count: users }, { count: available }, { count: sold }, { count: sales }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
        supabaseAdmin
          .from("plots")
          .select("*", { count: "exact", head: true })
          .eq("status", "available"),
        supabaseAdmin
          .from("plots")
          .select("*", { count: "exact", head: true })
          .eq("status", "sold"),
        supabaseAdmin.from("sales").select("*", { count: "exact", head: true }),
      ]);

    return ok(res, {
      users: users || 0,
      plots_available: available || 0,
      plots_sold: sold || 0,
      sales: sales || 0,
      index,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/promote", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const email = req.body?.email;
    if (!email) return fail(res, "email is required", 422);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ role: "admin" })
      .eq("email", email)
      .select()
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "User not found", 404);

    return ok(res, { profile: data });
  } catch (err) {
    return next(err);
  }
});

export default router;
