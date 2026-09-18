/**
 * Vendor financial / ops helpers — Production Phase 8.
 * Sheba (IBAN IR) ISO 7064 Mod 97-10, settlement math, kanban transitions.
 */

/** Order lifecycle (mirrors apps/api order-state) */
export type OrderStatus =
  | 'PENDING_ACCEPTANCE'
  | 'PREPARING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ACCEPTANCE: ['PREPARING', 'SCHEDULED', 'CANCELLED'],
  PREPARING: ['IN_PROGRESS', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Remove IR prefix and non-digits */
export function normalizeSheba(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^IR/, '')
    .replace(/[^0-9]/g, '');
}

/**
 * Iranian Sheba: IR + 24 digits, ISO 7064 Mod 97-10.
 * Algorithm: move 4 leading digits (bank code area) to end, append 1828
 * (IR=18, 28), mod 97 === 1.
 */
export function isValidSheba(raw: string): boolean {
  const s = normalizeSheba(raw);
  if (!/^\d{24}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged + '1828'; // IR → 18 28
  // Mod 97 on large number: chunked
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const block = remainder + numeric.slice(i, i + 7);
    remainder = Number(block) % 97;
  }
  return remainder === 1;
}

export function formatSheba(raw: string): string {
  const s = normalizeSheba(raw);
  if (s.length !== 24) return raw;
  return `IR${s}`;
}

export function formatShebaDisplay(raw: string): string {
  const s = normalizeSheba(raw);
  if (s.length !== 24) return raw;
  return `IR${s.match(/.{1,4}/g)?.join(' ')}`;
}

export interface VendorLedgerSummary {
  grossToman: number;
  commissionToman: number;
  netToman: number;
  commissionBps: number;
  paidToman: number;
  withdrawableToman: number;
}

export function commissionBps(): number {
  return Number(process.env.PLATFORM_COMMISSION_BPS ?? 1000);
}

export function summarizeLedger(input: {
  grossToman: number;
  alreadyPaidToman?: number;
  bps?: number;
}): VendorLedgerSummary {
  const bps = input.bps ?? commissionBps();
  const commissionToman = Math.round((input.grossToman * bps) / 10000);
  const netToman = input.grossToman - commissionToman;
  const paid = input.alreadyPaidToman ?? 0;
  return {
    grossToman: input.grossToman,
    commissionToman,
    netToman,
    commissionBps: bps,
    paidToman: paid,
    withdrawableToman: Math.max(0, netToman - paid),
  };
}

export type PayoutStatus = 'REQUESTED' | 'PROCESSING' | 'PAID' | 'REJECTED';

export interface PayoutRequest {
  id: string;
  vendorProfileId: string;
  sheba: string;
  amountToman: number;
  status: PayoutStatus;
  createdAt: string;
  note?: string;
}

export const KANBAN_COLUMNS: Array<{
  key: OrderStatus;
  fa: string;
}> = [
  { key: 'PENDING_ACCEPTANCE', fa: 'در انتظار' },
  { key: 'PREPARING', fa: 'آماده‌سازی' },
  { key: 'IN_PROGRESS', fa: 'در راه / انجام' },
  { key: 'COMPLETED', fa: 'تکمیل' },
];

export function nextKanbanStatus(current: OrderStatus): OrderStatus | null {
  const order: OrderStatus[] = ['PENDING_ACCEPTANCE', 'PREPARING', 'IN_PROGRESS', 'COMPLETED'];
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return null;
  const next = order[i + 1];
  return canTransition(current, next) ? next : null;
}

export function faStockLabel(inStock: boolean): string {
  return inStock ? 'موجود' : 'تمام شد / ناموجود';
}

export const PRODUCTION_VENDOR_PHASE = 8;
