import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { assertSupabaseConfigured, env } from "../lib/env.js";
import { ok, fail } from "../lib/response.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(2).max(80),
  role: z.enum(["buyer", "seller"]).default("buyer"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const body = registerSchema.parse(req.body);

    const { data, error } = await supabaseAnon.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        emailRedirectTo: `${env.FRONTEND_URL}/auth/confirmed`,
        data: {
          display_name: body.display_name,
          role: body.role,
        },
      },
    });

    if (error) return fail(res, error.message, 400);

    return ok(
      res,
      {
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email,
              email_confirmed: Boolean(data.user.email_confirmed_at),
            }
          : null,
        session: data.session
          ? {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at,
              token_type: data.session.token_type,
            }
          : null,
        message: data.session
          ? "Registered"
          : "Registered. Check your email to verify before signing in.",
      },
      201
    );
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid input", 422);
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const body = loginSchema.parse(req.body);

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) return fail(res, error.message, 401);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    return ok(res, {
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed: Boolean(data.user.email_confirmed_at),
        profile,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid input", 422);
    return next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const refresh_token = req.body?.refresh_token;
    if (!refresh_token) return fail(res, "refresh_token is required", 422);

    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });
    if (error) return fail(res, error.message, 401);

    return ok(res, {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  return ok(res, {
    id: req.user.id,
    email: req.user.email,
    email_confirmed: Boolean(req.user.email_confirmed_at),
    profile: req.user.profile,
  });
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await supabaseAdmin.auth.admin.signOut(req.user.accessToken);
    return ok(res, { message: "Signed out" });
  } catch (err) {
    return next(err);
  }
});

export default router;
