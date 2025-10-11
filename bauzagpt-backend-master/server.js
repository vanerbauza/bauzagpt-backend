// =============================
// BauzaGPT Backend - v1.0
// =============================

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración básica
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const OUTPUTS = path.join(process.cwd(), "storage");

// Crea carpeta "storage" si no existe
if (!fs.existsSync(OUTPUTS)) fs.mkdirSync(OUTPUTS);

// Configura multer (para archivos subidos)
const upload = multer({ dest: path.join(OUTPUTS, "proofs") });

// Base de datos temporal (en memoria)
const orders = new Map();

// =============================
// ENDPOINTS
// =============================

// 1️⃣ Crear orden
app.post("/api/orders/init", (req, res) => {
  const { query, plan } = req.body;
  if (!query || !plan) return res.status(400).json({ error: "Faltan datos" });

  const id = crypto.randomUUID();
  orders.set(id, { query, plan, status: "pending" });

  res.json({ order_id: id, status: "pending" });
});

// 2️⃣ Subir comprobante
app.post("/api/orders/proof", upload.single("file"), (req, res) => {
  const { order_id } = req.body;
  if (!orders.has(order_id))
    return res.status(400).json({ error: "orden inválida" });

  if (!req.file)
    return res.status(400).json({ error: "no se recibió archivo" });

  orders.get(order_id).proof = req.file.filename;
  res.json({ ok: true, message: "comprobante recibido", order_id });
});

// 3️⃣ Confirmar orden (simula validación y genera resultado)
app.post("/api/orders/confirm", (req, res) => {
  const { order_id } = req.body;
  const order = orders.get(order_id);
  if (!order) return res.status(400).json({ error: "orden inválida" });

  const resultFile = `${order_id}.txt`;
  const outPath = path.join(OUTPUTS, resultFile);
  fs.writeFileSync(
    outPath,
    `🔍 Resultado de búsqueda BauzaGPT\n\nConsulta: ${order.query}\nPlan: ${order.plan}\nEstado: COMPLETADO`
  );

  order.status = "completed";
  order.result = resultFile;
  res.json({
    ok: true,
    message: "orden completada",
    download_url: `${BASE_URL}/api/download/${order_id}`,
  });
});

// 4️⃣ Descargar resultado
app.get("/api/download/:id", (req, res) => {
  const { id } = req.params;
  const order = orders.get(id);
  if (!order || !order.result)
    return res.status(404).json({ error: "archivo no encontrado" });

  const filePath = path.join(OUTPUTS, order.result);
  res.download(filePath);
});

// =============================
// Arranque del servidor
// =============================
app.listen(PORT, () =>
  console.log(`✅ Backend de BauzaGPT listo en ${BASE_URL}`)
);
