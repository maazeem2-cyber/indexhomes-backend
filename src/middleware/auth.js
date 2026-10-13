import { supabaseAnon, supabaseAdmin } from "../lib/supabase.js";
import { assertSupabaseConfigured } from "../lib/env.js";
import { fail } from "../lib/response.js";

export async function optionalAuth(req, _res, next) {
  try {
    assertSupabaseConfigured();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      req.user = null;
      return next();
    }
    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data.user) {
      req.user = null;
      return next();
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    req.user = { ...data.user, profile, accessToken: token };
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function requireAuth(req, res, next) {
  try {
    assertSupabaseConfigured();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return fail(res, "Authentication required", 401);

    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data.user) return fail(res, "Invalid or expired token", 401);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) return fail(res, profileError.message, 500);
    if (!profile) return fail(res, "Profile not found", 404);
    if (profile.is_active === false) {
      return fail(res, "This account has been deactivated", 403);
    }

    req.user = { ...data.user, profile, accessToken: token };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.profile?.role;
    if (!role || !roles.includes(role)) {
      return fail(res, "Insufficient permissions", 403);
    }
    return next();
  };
}
