import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { supabase } from "./config/supabase";
import authRoutes from './routes/authRoutes';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',authRoutes);

app.get("/health", async (_req, res) => {
  const { error } = await supabase.from("users").select("id").limit(1);
  res.json({ ok: !error, dbError: error?.message ?? null });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
