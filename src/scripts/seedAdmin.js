import { env, assertSupabaseConfigured } from "../lib/env.js";
import { supabaseAdmin } from "../lib/supabase.js";

async function main() {
  assertSupabaseConfigured();

  if (!env.ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_PASSWORD in backend/.env before seeding admin");
  }

  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;
  const displayName = env.ADMIN_DISPLAY_NAME;

  const existing = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const found = existing.data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let userId = found?.id;

  if (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, role: "buyer" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("Created auth user", email);
  } else {
    console.log("Auth user already exists", email);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ role: "admin", display_name: displayName, email_verified: true })
    .eq("id", userId)
    .select()
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    const { error: insertError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      display_name: displayName,
      role: "admin",
      email_verified: true,
    });
    if (insertError) throw insertError;
  }

  console.log("Admin ready:", email, "(role=admin)");
  console.log("Sign in via /api/v1/auth/login with ADMIN_EMAIL / ADMIN_PASSWORD");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
