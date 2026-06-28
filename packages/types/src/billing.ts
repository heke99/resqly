import { z } from "zod";
import { isoDateTimeSchema, moneySchema, uuidSchema } from "./common";
import { invoiceBasisStatusSchema, invoiceLineTypeSchema, payerTypeSchema } from "./enums";

export const invoiceLineSchema = z.object({
  type: invoiceLineTypeSchema,
  description: z.string(),
  quantity: z.number().default(1),
  unit_amount: moneySchema,
  total: moneySchema,
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceBasisSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_job_id: uuidSchema,
  payer_type: payerTypeSchema,
  status: invoiceBasisStatusSchema.default("draft"),
  lines: z.array(invoiceLineSchema),
  subtotal: moneySchema,
  vat: moneySchema,
  total: moneySchema,
  created_at: isoDateTimeSchema,
});
export type InvoiceBasis = z.infer<typeof invoiceBasisSchema>;

export const billingUsageEventSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  kind: z.enum([
    "case_fee",
    "bankid_signing",
    "tow_job",
    "api_call",
    "saas_license",
    "maps_request",
  ]),
  quantity: z.number().default(1),
  occurred_at: isoDateTimeSchema,
});
export type BillingUsageEvent = z.infer<typeof billingUsageEventSchema>;
