import { supabaseAdmin } from "../lib/supabase.js";
import { computeDisplayPrice } from "../lib/pricing.js";

export async function getPlatformIndex() {
  const { data, error } = await supabaseAdmin
    .from("platform_index")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function getIndexSnapshots(range = "all") {
  let since = null;
  const now = Date.now();
  if (range === "24h") since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("index_snapshots")
    .select("current_index, total_platform_value, total_units_issued, recorded_at")
    .order("recorded_at", { ascending: true });

  if (since) query = query.gte("recorded_at", since);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function withDisplayPrice(plot, indexRow) {
  const display_price = computeDisplayPrice(
    plot.base_price,
    indexRow.current_index,
    indexRow.starting_index
  );
  return { ...plot, display_price, currency: "GBP" };
}
