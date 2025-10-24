// mailer.js
import nodemailer from "nodemailer";

export function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) throw new Error("Falta SMTP_HOST");
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

export async function sendReportEmail(to, link, target) {
  const from = process.env.FROM_EMAIL || "BauzaGPT <no-reply@bauzagpt.com>";
  const transport = createTransport();
  const html = `
    <p>¡Gracias por tu compra en <b>BauzaGPT</b>!</p>
    <p>Tu informe OSINT para <b>${target}</b> está listo.</p>
    <p>Puedes descargarlo aquí:</p>
    <p><a href="${link}">${link}</a></p>
    <p>— Equipo BauzaGPT</p>
  `;
  await transport.sendMail({
    from, to, subject: "Tu informe OSINT — BauzaGPT", html
  });
}
