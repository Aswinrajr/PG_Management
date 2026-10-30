import type { Request } from 'express';
import { AppError } from '../../lib/errors.js';
import { renderDocument } from '../../lib/pdf.js';
import { assertPropertyAccess } from '../../middleware/auth.js';
import { Organization } from '../orgs/model.js';
import { ResidentProfile } from '../stays/model.js';
import { Invoice, Payment } from './model.js';

type Tenant = NonNullable<Request['tenant']>;

const day = (date: Date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function context(orgId: string, residentUserId: unknown) {
  const [org, profile] = await Promise.all([
    Organization.findById(orgId, { name: 1, gstin: 1, gstEnabled: 1 }).lean(),
    ResidentProfile.findOne({ orgId, userId: residentUserId }, { fullName: 1 }).lean(),
  ]);
  return { orgName: org?.name ?? '', gstin: org?.gstEnabled ? org.gstin : undefined, billTo: profile?.fullName ?? '' };
}

export async function invoicePdf(tenant: Tenant, id: string) {
  const invoice = await Invoice.findOne({ orgId: tenant.orgId, _id: id }).lean();
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  assertPropertyAccess(tenant, String(invoice.propertyId));
  return {
    filename: `${invoice.number}.pdf`,
    data: await renderDocument({
      ...(await context(tenant.orgId, invoice.residentUserId)),
      title: invoice.taxPaise > 0 ? 'Tax invoice' : 'Invoice',
      number: invoice.number,
      meta: [['Due date', day(invoice.dueDate)], ['Status', invoice.status.replace('_', ' ')]],
      rows: invoice.lineItems.map((l) => ({ label: l.label ?? '', amountPaise: l.amountPaise ?? 0 })),
      totals: [
        ['Subtotal', invoice.subtotalPaise],
        ...(invoice.taxPaise > 0 ? ([['CGST', invoice.gst?.cgstPaise ?? 0], ['SGST', invoice.gst?.sgstPaise ?? 0]] as [string, number][]) : []),
        ['Total', invoice.totalPaise],
        ['Paid', invoice.paidPaise],
        ['Balance', invoice.balancePaise],
      ],
    }),
  };
}

export async function receiptPdf(tenant: Tenant, id: string) {
  const payment = await Payment.findOne({ orgId: tenant.orgId, _id: id }).lean();
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);
  assertPropertyAccess(tenant, String(payment.propertyId));
  return {
    filename: `${payment.receiptNumber}.pdf`,
    data: await renderDocument({
      ...(await context(tenant.orgId, payment.residentUserId)),
      title: 'Payment receipt',
      number: payment.receiptNumber,
      meta: [['Paid on', day(payment.paidAt)], ['Mode', payment.mode.replace('_', ' ')], ...(payment.reference ? ([['Reference', payment.reference]] as [string, string][]) : [])],
      rows: [{ label: 'Payment received', amountPaise: payment.amountPaise }],
      totals: [['Total', payment.amountPaise]],
      footer: 'This is a computer-generated receipt.',
    }),
  };
}
