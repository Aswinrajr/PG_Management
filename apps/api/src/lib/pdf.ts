import { formatINR } from '@roomora/types';
import PDFDocument from 'pdfkit';

const INDIGO = '#4F46E5';
const MUTED = '#475569';

interface Row {
  label: string;
  amountPaise: number;
}

interface PdfInput {
  title: string;
  number: string;
  orgName: string;
  gstin?: string | null;
  billTo: string;
  meta: [string, string][];
  rows: Row[];
  totals: [string, number][];
  footer?: string;
}

/** Rupee glyphs are missing from the built-in PDF font, so amounts print as Rs. */
const money = (paise: number) => formatINR(paise).replace('₹', 'Rs. ');

export function renderDocument(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(INDIGO).fontSize(20).font('Helvetica-Bold').text(input.orgName);
    if (input.gstin) doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(`GSTIN ${input.gstin}`);
    doc.moveDown(1.5);
    doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text(input.title);
    doc.fontSize(10).font('Helvetica').text(input.number);
    doc.moveDown();
    doc.fillColor(MUTED).text(`Billed to: ${input.billTo}`);
    for (const [label, value] of input.meta) doc.text(`${label}: ${value}`);
    doc.moveDown();

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.fillColor('#0F172A').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(label, left, y, { width: width - 120 });
      doc.text(value, left + width - 120, y, { width: 120, align: 'right' });
      doc.moveDown(0.5);
    };
    for (const r of input.rows) row(r.label, money(r.amountPaise));
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#E2E8F0').stroke();
    doc.moveDown(0.5);
    for (const [label, paise] of input.totals) row(label, money(paise), true);

    if (input.footer) {
      doc.moveDown(2).fillColor(MUTED).fontSize(9).font('Helvetica').text(input.footer, left);
    }
    doc.end();
  });
}
