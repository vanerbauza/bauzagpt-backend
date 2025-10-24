import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();
const app = express();
app.use(cors({ origin: ["https://www.bauzagpt.com","https://bauzagpt.com"] }));

// ⚠️ El webhook necesita RAW, por eso esta ruta va antes del express.json()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
app.post("/webhook", express.raw({ type: "application/json" }), (req,res)=>{
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (e) { console.error("Firma inválida:", e.message); return res.status(400).send(`Webhook Error: ${e.message}`); }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    console.log("✅ Pago OK:", { session_id: s.id, total: s.amount_total, email: s.customer_details?.email, ref: s.client_reference_id });
  } else {
    console.log("Evento:", event.type);
  }
  res.json({ received:true });
});

// Rutas normales (después)
app.use(express.json());
app.get("/health",(_,res)=>res.json({ ok:true, ts:Date.now() }));

app.listen(process.env.PORT || 8080, ()=>console.log("API up"));
