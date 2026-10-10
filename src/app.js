import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./lib/env.js";
import { ok, fail } from "./lib/response.js";
import authRoutes from "./routes/auth.js";
import plotsRoutes from "./routes/plots.js";
import indexRoutes from "./routes/indexRoutes.js";
import adminRoutes from "./routes/admin.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGINS.includes("*") || env.CORS_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      if (env.NODE_ENV !== "production") {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (_req, res) =>
  ok(res, {
    service: "indexhomes-api",
    version: "1.0.0",
    status: "ok",
    mobile_ready: true,
  })
);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/plots", plotsRoutes);
app.use("/api/v1/index", indexRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use((_req, res) => fail(res, "Not found", 404));

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  fail(res, err.message || "Internal server error", status);
});

export default app;
