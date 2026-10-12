import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertSupabaseConfigured } from "../lib/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { ensurePlotImagesBucket } from "../services/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLOTS = [
  {
    name: "Oakwood Rise",
    description: "Modern 2-bed apartment",
    base_price: 1000.0,
    location: "London",
    tags: ["neighbourhood", "modern", "2-bed"],
    just_added: true,
    file: "plot-oakwood.jpg",
  },
  {
    name: "Cedar Court",
    description: "Spacious 3-bed home",
    base_price: 1500.0,
    location: "Manchester",
    tags: ["family", "3-bed"],
    just_added: true,
    file: "plot-cedar.jpg",
  },
  {
    name: "Willow Gardens",
    description: "Premium view property",
    base_price: 2000.0,
    location: "Birmingham",
    tags: ["premium", "view"],
    just_added: true,
    file: "plot-willow.jpg",
  },
  {
    name: "Birch Place",
    description: "Cosy 1-bed starter",
    base_price: 1200.0,
    location: "Leeds",
    tags: ["starter", "1-bed"],
    just_added: false,
    file: "plot-birch.jpg",
  },
  {
    name: "Elm Drive",
    description: "Luxury 4-bed detached",
    base_price: 2500.0,
    location: "Bristol",
    tags: ["luxury", "4-bed"],
    just_added: false,
    file: "plot-elm.jpg",
  },
  {
    name: "Ash Grove",
    description: "Family home with garden",
    base_price: 1800.0,
    location: "Sheffield",
    tags: ["family", "garden"],
    just_added: false,
    file: "plot-ash.jpg",
  },
];

function resolveImageDir() {
  const candidates = [
    path.resolve(__dirname, "../../../indexhomes-frontend/public/images"),
    path.resolve(__dirname, "../../../../indexhomes-frontend/public/images"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error("Could not find indexhomes-frontend/public/images");
}

async function uploadImage(imageDir, filename) {
  const fullPath = path.join(imageDir, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing image file: ${fullPath}`);
  }
  const buffer = fs.readFileSync(fullPath);
  const storagePath = `plots/seed-${filename}`;

  const { error } = await supabaseAdmin.storage.from("plot-images").upload(storagePath, buffer, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from("plot-images").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  assertSupabaseConfigured();
  await ensurePlotImagesBucket();

  const imageDir = resolveImageDir();
  console.log("Using images from", imageDir);

  let created = 0;
  let updated = 0;

  for (const plot of PLOTS) {
    const image_url = await uploadImage(imageDir, plot.file);
    const row = {
      name: plot.name,
      description: plot.description,
      base_price: plot.base_price,
      location: plot.location,
      tags: plot.tags,
      just_added: plot.just_added,
      status: "available",
      owner_id: null,
      image_url,
      published_at: new Date().toISOString(),
    };

    const { data: existing, error: findError } = await supabaseAdmin
      .from("plots")
      .select("id")
      .eq("name", plot.name)
      .eq("location", plot.location)
      .maybeSingle();
    if (findError) throw findError;

    if (existing?.id) {
      const { error } = await supabaseAdmin.from("plots").update(row).eq("id", existing.id);
      if (error) throw error;
      updated += 1;
      console.log("Updated", plot.name);
    } else {
      const { error } = await supabaseAdmin.from("plots").insert(row);
      if (error) throw error;
      created += 1;
      console.log("Created", plot.name);
    }
  }

  console.log(`Done. Created ${created}, updated ${updated}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
