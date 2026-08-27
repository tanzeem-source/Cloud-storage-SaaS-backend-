import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { supabase } from "./config/supabase";
import multer from 'multer';
import authRoutes from './routes/authRoutes';
import fileRoutes from './routes/fileRoutes';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',authRoutes);
app.use('/api/files', fileRoutes);

//handle multer's file-size-exceeded error gracefully instead of it crashing/returning a generic 500
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds 50MB limit' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.get("/health", async (_req, res) => {
  const { error } = await supabase.from("users").select("id").limit(1);
  res.json({ ok: !error, dbError: error?.message ?? null });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
