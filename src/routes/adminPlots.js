import { Router } from "express";
import multer from "multer";
import { supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPlatformIndex, withDisplayPrice } from "../services/indexService.js";
import { uploadPlotImage } from "../services/storage.js";
import { parsePlotBody } from "../lib/plotFields.js";
import { parsePagination, paginationMeta } from "../lib/pagination.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const status = req.query.status || "all";
    const location = req.query.location;
    const q = (req.query.q || "").toString().trim();
    const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });

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
    return ok(res, {
      plots: (data || []).map((p) => withDisplayPrice(p, indexRow)),
      index: indexRow,
      pagination: paginationMeta({ page, limit, count }),
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const fields = parsePlotBody(req.body);

    let image_url = fields.image_url || null;
    if (req.file) {
      image_url = await uploadPlotImage(req.file);
    }
    if (!image_url) {
      return fail(res, "A plot image is required", 422);
    }

    const row = {
      name: fields.name,
      description: fields.description,
      base_price: fields.base_price,
      location: fields.location,
      status: fields.status || "available",
      tags: fields.tags || [],
      just_added: fields.just_added !== false,
      image_url,
      published_at: new Date().toISOString(),
      owner_id: null,
    };

    const { data, error } = await supabaseAdmin.from("plots").insert(row).select().single();
    if (error) return fail(res, error.message, 500);

    const indexRow = await getPlatformIndex();
    return ok(res, { plot: withDisplayPrice(data, indexRow) }, 201);
  } catch (err) {
    return next(err);
  }
});

router.patch("/:id", upload.single("image"), async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const fields = parsePlotBody(req.body, { partial: true });
    const updates = { ...fields };

    if (req.file) {
      updates.image_url = await uploadPlotImage(req.file);
    }

    if (Object.keys(updates).length === 0) {
      return fail(res, "No changes provided", 422);
    }

    if (updates.status === "available") {
      updates.owner_id = null;
    }

    const { data, error } = await supabaseAdmin
      .from("plots")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "Plot not found", 404);

    const indexRow = await getPlatformIndex();
    return ok(res, { plot: withDisplayPrice(data, indexRow) });
  } catch (err) {
    return next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const { data, error } = await supabaseAdmin
      .from("plots")
      .delete()
      .eq("id", req.params.id)
      .select("id")
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "Plot not found", 404);
    return ok(res, { deleted: true, id: data.id });
  } catch (err) {
    return next(err);
  }
});

export default router;
