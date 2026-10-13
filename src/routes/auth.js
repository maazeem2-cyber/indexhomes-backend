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

    if (profile && profile.is_active === false) {
      await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        ban_duration: "876000h",
      });
      return fail(res, "This account has been deactivated. Contact support for help.", 403);
    }

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

router.post("/forgot-password", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const email = z.string().email().parse(req.body?.email);
    const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo: `${env.FRONTEND_URL}/auth/reset-password`,
    });
    if (error) return fail(res, error.message, 400);
    return ok(res, {
      message: "If that email is registered, you will receive a password reset link shortly.",
    });
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid email", 422);
    return next(err);
  }
});

router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const display_name = z.string().min(2).max(80).parse(req.body?.display_name);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name })
      .eq("id", req.user.id)
      .select("*")
      .maybeSingle();

    if (error) return fail(res, error.message, 500);
    if (!data) return fail(res, "Profile not found", 404);

    await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: {
        ...(req.user.user_metadata || {}),
        display_name,
      },
    });

    return ok(res, { profile: data });
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid input", 422);
    return next(err);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const schema = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8),
      confirm_password: z.string().min(8),
    });
    const body = schema.parse(req.body);
    if (body.new_password !== body.confirm_password) {
      return fail(res, "New password and confirmation do not match", 422);
    }
    if (body.current_password === body.new_password) {
      return fail(res, "New password must be different from the current password", 422);
    }

    const email = req.user.email;
    if (!email) return fail(res, "Account email is missing", 400);

    const { error: verifyError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password: body.current_password,
    });
    if (verifyError) return fail(res, "Current password is incorrect", 401);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: body.new_password,
    });
    if (error) return fail(res, error.message, 400);

    return ok(res, { message: "Password updated successfully" });
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid input", 422);
    return next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    assertSupabaseConfigured();
    const schema = z.object({
      access_token: z.string().min(10),
      refresh_token: z.string().optional(),
      new_password: z.string().min(8),
      confirm_password: z.string().min(8),
    });
    const body = schema.parse(req.body);
    if (body.new_password !== body.confirm_password) {
      return fail(res, "New password and confirmation do not match", 422);
    }

    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(body.access_token);
    if (userError || !userData.user) return fail(res, "Reset link is invalid or expired", 401);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
      password: body.new_password,
    });
    if (error) return fail(res, error.message, 400);

    return ok(res, { message: "Password has been reset. You can sign in with your new password." });
  } catch (err) {
    if (err.name === "ZodError") return fail(res, err.errors[0]?.message || "Invalid input", 422);
    return next(err);
  }
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
