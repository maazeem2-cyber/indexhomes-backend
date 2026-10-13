import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPlatformIndex } from "../services/indexService.js";
import { parsePagination, paginationMeta } from "../lib/pagination.js";
import { isSuperAdminEmail, PROFILE_PUBLIC_FIELDS } from "../lib/users.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

async function loadProfile(id) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_PUBLIC_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function protectSuperAdmin(profile) {
  if (profile && isSuperAdminEmail(profile.email)) {
    return "The super admin account cannot be modified, deactivated, or deleted.";
  }
  return null;
}

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
      .select(PROFILE_PUBLIC_FIELDS, {
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
    const existing = await loadProfile(req.params.id);
    if (!existing) return fail(res, "User not found", 404);

    const superMsg = protectSuperAdmin(existing);
    if (superMsg && (req.body?.role !== undefined || req.body?.is_active !== undefined)) {
      return fail(res, superMsg, 403);
    }

    const role = req.body?.role;
    const display_name = req.body?.display_name;
    const is_active = req.body?.is_active;

    const updates = {};
    if (role !== undefined) {
      if (isSuperAdminEmail(existing.email)) {
        return fail(res, "The super admin role cannot be changed.", 403);
      }
      if (!["buyer", "seller", "admin"].includes(role)) {
        return fail(res, "role must be buyer, seller, or admin", 422);
      }
      updates.role = role;
    }
    if (typeof display_name === "string" && display_name.trim()) {
      updates.display_name = display_name.trim();
    }
    if (typeof is_active === "boolean") {
      if (isSuperAdminEmail(existing.email)) {
        return fail(res, "The super admin account cannot be deactivated.", 403);
      }
      if (req.user.id === existing.id && is_active === false) {
        return fail(res, "You cannot deactivate your own account.", 403);
      }
      updates.is_active = is_active;
    }
    if (!Object.keys(updates).length) {
      return fail(res, "No changes provided", 422);
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select(PROFILE_PUBLIC_FIELDS)
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "User not found", 404);

    if (typeof is_active === "boolean") {
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        ban_duration: is_active ? "none" : "876000h",
      });
      if (banError) return fail(res, banError.message, 500);
    }

    return ok(res, { user: data });
  } catch (err) {
    return next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const existing = await loadProfile(req.params.id);
    if (!existing) return fail(res, "User not found", 404);

    const superMsg = protectSuperAdmin(existing);
    if (superMsg) return fail(res, superMsg, 403);

    if (req.user.id === existing.id) {
      return fail(res, "You cannot delete your own account.", 403);
    }

    const [{ count: ownedPlots }, { count: sales }] = await Promise.all([
      supabaseAdmin
        .from("plots")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", existing.id),
      supabaseAdmin
        .from("sales")
        .select("*", { count: "exact", head: true })
        .eq("buyer_id", existing.id),
    ]);

    if ((ownedPlots || 0) > 0 || (sales || 0) > 0) {
      return fail(
        res,
        "This user has purchase history or owned plots. Deactivate the account instead of deleting it.",
        409
      );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(existing.id);
    if (error) return fail(res, error.message, 500);

    return ok(res, { deleted: true, id: existing.id });
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
