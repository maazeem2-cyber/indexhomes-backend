import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}. Copy .env.example to .env and fill values.`);
  }
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || "development",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  SUPABASE_URL: isProd ? required("SUPABASE_URL") : process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: isProd ? required("SUPABASE_ANON_KEY") : process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: isProd
    ? required("SUPABASE_SERVICE_ROLE_KEY")
    : process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "Maazeem2@icloud.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ADMIN_DISPLAY_NAME: process.env.ADMIN_DISPLAY_NAME || "IndexHomes Admin",
  // Used for Supabase email confirmation / password-reset redirects
  FRONTEND_URL: (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, ""),
};

export function assertSupabaseConfigured() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    const err = new Error(
      "Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in backend/.env"
    );
    err.status = 503;
    throw err;
  }
}
