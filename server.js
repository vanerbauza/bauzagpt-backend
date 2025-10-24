// server.js — BauzaGPT Backend (ESM)
// Requisitos en package.json:  "type": "module"
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ──────────────────────────────────────────────────────────────
// Utilidades de ruta
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────
// Config env
const {
  PORT               = 3000,
  MONGODB_URI        = '',
  CORS_ORIGIN        = 'https://www.bauzagpt.com',
  STORAGE_MODE       = 'local',              // local | s3 (solo local en este server.js)
  STORAGE_LOCAL_DIR  = 'storage',
  ADMIN_API_KEY      = ''
} = process.env;

// ──────────────────────────────────────────────────────────────
// App base
const app = express();
app.use(cors({ origin: [CORS_ORIGIN], credentials: true }));
app.use(express.json());

// Logs de peticiones (útil para Render)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Sirve archivos generados (solo modo local)
if (STORAGE_MODE === 'local') {
  const dir = path.join(__dirname, STORAGE_LOCAL_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  app.use('/storage', express.static(dir));
}

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ──────────────────────────────────────────────────────────────
/** MODELO Order (Mongoose) **/
const OrderSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  plan:        { type: String, enum: ['BASICO','PRO'], required: true },
  status:      { type: String, enum: ['pending_payment','paid','processing','ready','failed'], default: 'pending_payment' },
  amountMXN:   { type: Number, default: 0 },
  paymentRef:  { type: String, default: null },
  artifacts:   {
    pdfUrl: String,
    zipUrl: String
  },
  downloadToken: {
    value:     String,
    expiresAt: Date,
    used:      { type: Boolean, default: false }
  }
}, { timestamps: true });

const Order = mongoose.model('Order', OrderSchema);

// ──────────────────────────────────────────────────────────────
/** Helpers **/
import crypto from 'crypto';
function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getUserId(req) {
  // En producción valida JWT/cookie. Para pruebas, aceptamos header x-user-id
  return req.userId || req.headers['x-user-id'] || null;
}

// ──────────────────────────────────────────────────────────────
/** JOB OSINT simulado (genera PDF/ZIP y deja listo) **/
async function runOsintAndFinalize(orderId) {
  try {
    const o = await Order.findById(orderId);
    if (!o) throw new Error('Order not found');
    if (o.status !== 'paid' && o.status !== 'processing') {
      console.log('OSINT skip: estado', o.status);
      return;
    }
    o.status = 'processing';
    await o.save();

    // Simula “pipeline”: genera 2 archivos locales
    const outDir = path.join(__dirname, STORAGE_LOCAL_DIR);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const pdfPath = path.join(outDir, `${o._id}.pdf`);
    const zipPath = path.join(outDir, `${o._id}.zip`);

    fs.writeFileSync(pdfPath, `Reporte OSINT ${o.plan}\nOrden: ${o._id}\nFecha: ${new Date().toISOString()}\n`);
    fs.writeFileSync(zipPath, `ZIP con JSON/CSV/PDF para ${o._id}\n`);

    // URLs públicas (en local las exponemos vía /storage)
    const pdfUrl = `/storage/${o._id}.pdf`;
    const zipUrl = `/storage/${o._id}.zip`;

    o.artifacts = { pdfUrl, zipUrl };
    o.status    = 'ready';
    await o.save();

    console.log(`OSINT listo: ${o._id}`);
  } catch (e) {
    console.error('OSINT job error:', e?.stack || e);
    await Order.findByIdAndUpdate(orderId, { $set: { status: 'failed' } });
  }
}

// ──────────────────────────────────────────────────────────────
/** Rutas API **/

// Crear orden
app.post('/api/orders', async (req, res) => {
  try {
    const userId = getUserId(req);
    const plan   = (req.body?.plan || '').toUpperCase();

    if (!userId) return res.status(401).json({ error: 'auth required' });
    if (!['BASICO','PRO'].includes(plan)) return res.status(400).json({ error: 'plan inválido' });

    const amountMXN = plan === 'PRO' ? 20 : 10;
    const token     = newToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 4); // 4h

    const o = await Order.create({
      userId, plan, amountMXN,
      status: 'pending_payment',
      downloadToken: { value: token, expiresAt, used: false }
    });

    // (Opcional) métodos de pago desde backend (no expongas números fijos en el HTML)
    const paymentMethods = [
      { id: 'bbva_spin', label: 'BBVA Spin', instructions: 'Transfiere y guarda el folio.' },
      { id: 'nu',        label: 'Banco Nu',  instructions: 'SPEI, adjunta folio.' },
      { id: 'oxxo',      label: 'OXXO',      instructions: 'Deposita y guarda ticket.' },
      { id: 'bitso',     label: 'Bitso',     instructions: 'Envío a @ivanbauza, guarda hash.' },
      { id: 'paypal',    label: 'PayPal',    instructions: 'PayPal.Me/@ivanbauza' }
    ];

    res.status(201).json({
      orderId: o._id.toString(),
      status:  o.status,
      amountMXN,
      paymentMethods,
      downloadTokenPreview: true
    });
  } catch (e) {
    console.error('POST /api/orders error:', e?.stack || e);
    res.status(500).json({ error: 'internal' });
  }
});

// Admin: marcar pagado y disparar job
app.post('/api/admin/orders/:id/mark-paid', async (req, res) => {
  try {
    const key = (req.get('Authorization') || '').replace('Bearer ', '');
    if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const orderId = req.params.id;
    const ref     = req.body?.paymentRef || null;

    const o = await Order.findById(orderId);
    if (!o) return res.status(404).json({ error: 'not found' });

    o.status     = 'paid';
    o.paymentRef = ref;
    await o.save();

    // Encola/lanza de inmediato
    setImmediate(() => runOsintAndFinalize(orderId));

    res.json({ ok: true, status: 'paid' });
  } catch (e) {
    console.error('mark-paid error:', e?.stack || e);
    res.status(500).json({ error: 'internal' });
  }
});

// Consultar estado
app.get('/api/orders/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'auth required' });

    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (o.userId !== userId) return res.status(403).json({ error: 'forbidden' });

    res.json({ status: o.status, artifacts: o.artifacts || null });
  } catch (e) {
    console.error('GET /api/orders/:id error:', e?.stack || e);
    res.status(500).json({ error: 'internal' });
  }
});

// Descargar (redirige sin exponer token en el front)
app.get('/api/orders/:id/download', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'auth required' });

    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (o.userId !== userId) return res.status(403).json({ error: 'forbidden' });
    if (o.status !== 'ready' || !o.artifacts?.zipUrl) return res.status(409).json({ error: 'not ready' });

    // Si quisieras token de un solo uso, aquí lo validarías y marcarías como "used"
    return res.redirect(o.artifacts.zipUrl);
  } catch (e) {
    console.error('download error:', e?.stack || e);
    res.status(500).json({ error: 'internal' });
  }
});

// ──────────────────────────────────────────────────────────────
/** Arranque con logs claros (sin llamadas externas extra) **/
async function start() {
  try {
    if (!MONGODB_URI) {
      console.warn('[WARN] MONGODB_URI no definido. El backend no podrá guardar órdenes.');
    } else {
      // Conexión a Mongo
      await mongoose.connect(MONGODB_URI, {
        // opciones modernas; evita TLS raros del pasado
        serverSelectionTimeoutMS: 15000
      });
      console.log('Mongo conectado');
    }

    app.listen(PORT, () => console.log('API lista en puerto', PORT));
  } catch (e) {
    console.error('Error al iniciar:', e?.stack || e);
    process.exit(1);
  }
}

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.stack || e));
process.on('uncaughtException',  (e) => console.error('uncaughtException:',  e?.stack || e));

start();
