import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPlatformIndex } from "../services/indexService.js";
import { parsePagination, paginationMeta } from "../lib/pagination.js";

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

router.get("/users", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const q = (req.query.q || "").toString().trim();
    const role = (req.query.role || "").toString().trim();
    const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });

    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, role, email_verified, created_at, updated_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (role && ["buyer", "seller", "admin"].includes(role)) {
      query = query.eq("role", role);
    }
    if (q) {
      query = query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) return fail(res, error.message, 500);
    return ok(res, {
      users: data || [],
      pagination: paginationMeta({ page, limit, count }),
    });
  } catch (err) {
    return next(err);
  }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const role = req.body?.role;
    const display_name = req.body?.display_name;

    const updates = {};
    if (role) {
      if (!["buyer", "seller", "admin"].includes(role)) {
        return fail(res, "role must be buyer, seller, or admin", 422);
      }
      updates.role = role;
    }
    if (typeof display_name === "string" && display_name.trim()) {
      updates.display_name = display_name.trim();
    }
    if (!Object.keys(updates).length) {
      return fail(res, "No changes provided", 422);
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, email, display_name, role, email_verified, created_at, updated_at")
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "User not found", 404);
    return ok(res, { user: data });
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
