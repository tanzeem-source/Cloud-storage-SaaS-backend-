import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";

import authRoutes from "./routes/authRoutes";
import fileRoutes from "./routes/fileRoutes";
import folderRoutes from "./routes/folderRoutes";
import shareRoutes from "./routes/shareRoutes";
import searchRoutes from "./routes/searchRoutes";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/search", searchRoutes);

app.get("/health", async (_req, res) => {
  const { supabase } = require("./config/supabase");
  const { error } = await supabase.from("users").select("id").limit(1);
  res.json({ ok: !error, dbError: error?.message ?? null });
});

// ... your error-handling middleware (multer + generic) ...
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds 50MB limit" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
