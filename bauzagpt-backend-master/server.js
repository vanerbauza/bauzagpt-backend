import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const OUTPUTS = path.join(__dirname, "storage", "outputs");
fs.mkdirSync(OUTPUTS, { recursive: true });

// Simulación de base en memoria
const ORDERS = {};

app.post("/api/orders/init", (req, res) => {
  const { query, plan } = req.body;
  const id = crypto.randomUUID();
  ORDERS[id] = { query, plan, status: "pending" };
  res.json({ order_id: id, status: "pending" });
});

const upload = multer({ dest: path.join(__dirname, "storage", "proofs") });
app.post("/api/orders/proof", upload.single("file"), (req, res) => {
  const { order_id } = req.body;
  if (!ORDERS[order_id]) return res.json({ error: "orden inválida" });
  ORDERS[order_id].proof = req.file.filename;
  res.json({ ok: true, message: "comprobante recibido", order_id });
});

app.post("/api/orders/confirm", (req, res) => {
  const { order_id } = req.body;
  const order = ORDERS[order_id];
  if (!order) return res.json({ error: "orden inválida" });

  const token = crypto.randomUUID();
  const outPath = path.join(OUTPUTS, `${token}.txt`);
  fs.writeFileSync(outPath, `Resultado para: ${order.query}\nPlan: ${order.plan}`);
  const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
  res.json({ ok: true, order_id, download_url: `${BASE}/api/download/${token}` });
});

app.get("/api/download/:token", (req, res) => {
  const file = path.join(OUTPUTS, `${req.params.token}.txt`);
  if (!fs.existsSync(file)) return res.status(404).send("Archivo no encontrado");
  res.download(file, "resultado.txt");
});

app.listen(PORT, () => console.log(`Backend on http://localhost:${PORT}`));
