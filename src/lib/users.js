import { env } from "./env.js";

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isSuperAdminEmail(email) {
  return normalizeEmail(email) === normalizeEmail(env.ADMIN_EMAIL);
}

export const PROFILE_PUBLIC_FIELDS =
  "id, email, display_name, role, email_verified, is_active, created_at, updated_at";
