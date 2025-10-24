// pdf.js
import PDFDocument from "pdfkit";
import fs from "fs";

export async function buildReportPDF(reportData, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(18).text("BAUZA GPT — Informe OSINT", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Target: ${reportData.target}`);
    doc.text(`Generado: ${reportData.generatedAt}`);
    doc.moveDown();

    doc.fontSize(14).text("urls:");
    doc.moveDown(0.5);

    reportData.findings.forEach((f, i) => {
      doc.fontSize(12).text(`${i+1}. [${f.type}] ${f.value}`);
      if (f.source) doc.fillColor("#9ca3af").text(`   Fuente: ${f.source}`).fillColor("#000000");
      doc.moveDown(0.5);
    });

    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("urls", acept);
  });
}
