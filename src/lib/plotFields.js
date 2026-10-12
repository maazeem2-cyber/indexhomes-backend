import { z } from "zod";

export const plotStatuses = ["available", "sold", "reserved"];

export const plotBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  base_price: z.coerce.number().finite().nonnegative(),
  location: z.string().trim().min(2).max(120),
  status: z.enum(["available", "sold", "reserved"]).default("available"),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  just_added: z.coerce.boolean().optional().default(true),
  image_url: z.string().url().optional().nullable(),
});

export function parseTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export function parsePlotBody(body, { partial = false } = {}) {
  const tags = parseTags(body.tags);
  const payload = {
    ...body,
    tags,
    just_added:
      body.just_added === undefined
        ? undefined
        : body.just_added === true ||
          body.just_added === "true" ||
          body.just_added === "1" ||
          body.just_added === "on",
  };

  const schema = partial ? plotBodySchema.partial() : plotBodySchema;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ") || "Invalid plot data";
    const err = new Error(message);
    err.status = 422;
    throw err;
  }
  return parsed.data;
}
