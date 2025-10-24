import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { runOsint } from "./osint.js";
import { buildReportPDF } from "./pdf.js";
import { initFirebaseAdmin, uploadFileFromPath } from "./storage.js";
import { sendReportEmail } from "./mailer.js";

dotenv.config();
const app = express();
app.use(cors({ origin: ["https://www.bauzagpt.com","https://bauzagpt.com"] }));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ⚠️ webhook RAW ANTES de express.json()
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (e) {
    console.error("❌ Firma inválida:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const email = s.customer_details?.email || "";
    const ref   = s.client_reference_id || ""; // uid o 'q' (target)
    console.log("✅ Pago OK:", { session_id: s.id, email, ref, total: s.amount_total });

    // ➜ dispara proceso asíncrono (no bloquees el webhook)
    processOsintAndDeliver(ref, email, s.id).catch(err => {
      console.error("Error procesando OSINT:", err);
    });
  } else {
    console.log("Evento:", event.type);
  }

  res.json({ received: true });
});

// Resto de rutas JSON DESPUÉS:
app.use(express.json());
app.get("/health", (_,res)=>res.json({ ok:true, ts:Date.now() }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=>console.log("API up on", PORT));

/** ========== Trabajo asíncrono: OSINT + PDF + Upload + Email ========== */
async function processOsintAndDeliver(target, toEmail, sessionId) {
  if (!target) { console.warn("Sin target/ref. Omite."); return; }
  if (!toEmail) { console.warn("Sin email cliente. Omite envío."); return; }

  // 1) Corre OSINT
  const report = await runOsint(target);

  // 2) Genera PDF en /tmp
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const outPath = path.join("/tmp", `bauzagpt_${sessionId}.pdf`);
  await buildReportPDF(report, outPath);

  // 3) Sube a Firebase Storage y obtiene link
  initFirebaseAdmin();
  const remotePath = `reports/${sessionId}.pdf`;
  const link = await uploadFileFromPath(outPath, remotePath);

  // 4) Envía correo con el link
  await sendReportEmail(toEmail, link, target);

  // 5) Limpieza local
  try { fs.unlinkSync(outPath); } catch {}
  console.log("📦 Informe entregado a", toEmail, "→", link);
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API lista en puerto', PORT));

