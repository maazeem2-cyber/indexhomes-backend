import { randomUUID } from "crypto";
import { supabaseAdmin } from "../lib/supabase.js";

const BUCKET = "plot-images";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function ensurePlotImagesBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets || []).some((b) => b.id === BUCKET || b.name === BUCKET);
  if (exists) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw createError;
  }
}

export async function uploadPlotImage(file) {
  if (!file?.buffer?.length) {
    const err = new Error("Image file is required");
    err.status = 422;
    throw err;
  }
  if (!ALLOWED.has(file.mimetype)) {
    const err = new Error("Image must be JPEG, PNG, WebP, or GIF");
    err.status = 422;
    throw err;
  }
  if (file.size > 10 * 1024 * 1024) {
    const err = new Error("Image must be 10MB or smaller");
    err.status = 422;
    throw err;
  }

  await ensurePlotImagesBucket();

  const ext = extFromMime(file.mimetype);
  const path = `plots/${randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
