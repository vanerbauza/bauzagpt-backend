const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const STORAGE = path.join(__dirname, 'storage');
const PROOFS  = path.join(STORAGE, 'proofs');
const OUTPUTS = path.join(STORAGE, 'outputs');
fs.mkdirSync(PROOFS,  { recursive: true });
fs.mkdirSync(OUTPUTS, { recursive: true });

const ORDERS = new Map(); // orderId -> { query, plan, status, token?, proof_path?, output_path?, wa_phone? }
const upload = multer({ dest: PROOFS });

// 1) crear orden preliminar
app.post('/api/orders/init', (req, res) => {
  const { query, plan } = req.body || {};
  if (!query || !plan) return res.status(400).json({ error: 'query y plan son requeridos' });
  const order_id = uuidv4();
  ORDERS.set(order_id, { query, plan, status: 'pending' });
  res.json({ order_id, status: 'pending' });
});

// 2) subir comprobante
app.post('/api/orders/proof', upload.single('file'), (req, res) => {
  const { order_id, wa_phone } = req.body || {};
  if (!order_id || !ORDERS.has(order_id)) return res.status(400).json({ error: 'orden inválida' });
  if (!req.file) return res.status(400).json({ error: 'falta archivo' });

  const info = ORDERS.get(order_id);
  info.proof_path = req.file.path;
  if (wa_phone) info.wa_phone = wa_phone;
  ORDERS.set(order_id, info);

  res.json({ ok: true, message: 'comprobante recibido', order_id });
});

// 3) confirmar orden (simula validación admin)
app.post('/api/orders/confirm', (req, res) => {
  const { order_id } = req.body || {};
  if (!order_id || !ORDERS.has(order_id)) return res.status(400).json({ error: 'orden inválida' });

  const info = ORDERS.get(order_id);
  if (info.status !== 'pending') return res.status(400).json({ error: 'orden ya confirmada o inválida' });

  const token = uuidv4();
  const outPath = path.join(OUTPUTS, `${token}.txt`);
  fs.writeFileSync(outPath, `Reporte simulado\nQuery: ${info.query}\nPlan: ${info.plan}\n`);

  info.status = 'approved';
  info.token = token;
  info.output_path = outPath;
  ORDERS.set(order_id, info);

  res.json({ ok: true, download_url: `${BASE_URL}/api/download/${token}` });
});

// 4) descarga por token
app.get('/api/download/:token', (req, res) => {
  const file = path.join(OUTPUTS, `${req.params.token}.txt`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'archivo no encontrado' });
  res.download(file, 'resultado.txt');
});

app.get('/', (_, res) => res.send('BAUZA GPT backend OK'));
app.listen(PORT, () => console.log(`Backend on ${BASE_URL}`));
