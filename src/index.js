import app from "./app.js";
import { env } from "./lib/env.js";

app.listen(env.PORT, () => {
  console.log(`IndexHomes API listening on http://localhost:${env.PORT}`);
  console.log(`Health: http://localhost:${env.PORT}/health`);
  if (!env.SUPABASE_URL) {
    console.warn("Supabase env not set yet — API routes will return 503 until configured.");
  }
});
