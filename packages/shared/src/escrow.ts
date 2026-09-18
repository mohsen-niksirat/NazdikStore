/**
 * Enterprise Phase 14 — Escrow ledger, disputes, settlement identity.
 */

export type EscrowState = 'HELD' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';

export interface EscrowEntry {
  paymentId: string;
  orderId: string;
  vendorProfileId: string;
  consumerId: string;
  grossToman: number;
  state: EscrowState;
  heldAt: number;
  releasedAt?: number;
  autoReleaseAt?: number; // heldAt + 24h
}

export const AUTO_RELEASE_MS = 24 * 60 * 60 * 1000;

export function computeCommission(grossToman: number, bps = 1000): {
  commissionToman: number;
  netToman: number;
} {
  const commissionToman = Math.round((grossToman * bps) / 10000);
  return { commissionToman, netToman: grossToman - commissionToman };
}

export function createEscrow(opts: {
  paymentId: string;
  orderId: string;
  vendorProfileId: string;
  consumerId: string;
  grossToman: number;
  now?: number;
}): EscrowEntry {
  const now = opts.now ?? Date.now();
  return {
    paymentId: opts.paymentId,
    orderId: opts.orderId,
    vendorProfileId: opts.vendorProfileId,
    consumerId: opts.consumerId,
    grossToman: opts.grossToman,
    state: 'HELD',
    heldAt: now,
    autoReleaseAt: now + AUTO_RELEASE_MS,
  };
}

export function canReleaseEscrow(
  entry: EscrowEntry,
  orderStatus: string,
  now = Date.now(),
): { ok: boolean; reason?: string } {
  if (entry.state === 'RELEASED') return { ok: false, reason: 'ALREADY_RELEASED' };
  if (entry.state === 'REFUNDED') return { ok: false, reason: 'REFUNDED' };
  if (entry.state === 'DISPUTED') return { ok: false, reason: 'DISPUTED' };
  if (orderStatus === 'COMPLETED') return { ok: true };
  if (entry.autoReleaseAt != null && now >= entry.autoReleaseAt) return { ok: true };
  return { ok: false, reason: 'IN_ESCROW' };
}

export function releaseEscrow(entry: EscrowEntry, now = Date.now()): EscrowEntry {
  return { ...entry, state: 'RELEASED', releasedAt: now };
}

export function markDisputed(entry: EscrowEntry): EscrowEntry {
  return { ...entry, state: 'DISPUTED' };
}

export function refundEscrow(entry: EscrowEntry, now = Date.now()): EscrowEntry {
  return { ...entry, state: 'REFUNDED', releasedAt: now };
}

/**
 * Identity: Gross = Escrow_Held + Vendor_Credit + Platform_Commission + Refunds
 */
export function ledgerIdentity(input: {
  grossToman: number;
  escrowHeld: number;
  vendorCredit: number;
  platformCommission: number;
  refunds: number;
}): { balanced: boolean; lhs: number; rhs: number; delta: number } {
  const lhs = input.grossToman;
  const rhs =
    input.escrowHeld + input.vendorCredit + input.platformCommission + input.refunds;
  const delta = lhs - rhs;
  return { balanced: Math.abs(delta) < 1, lhs, rhs, delta };
}

export interface PspSettlementRow {
  externalId: string;
  amountToman: number;
  status: string;
}

export interface InternalPaymentRow {
  paymentId: string;
  authority: string;
  amountToman: number;
  status: string;
}

export function reconcileSettlements(
  psp: PspSettlementRow[],
  internal: InternalPaymentRow[],
): {
  matched: number;
  missingInInternal: PspSettlementRow[];
  missingInPsp: InternalPaymentRow[];
  amountMismatch: Array<{ externalId: string; psp: number; internal: number }>;
} {
  const byAuth = new Map(internal.map((p) => [p.authority, p]));
  const missingInInternal: PspSettlementRow[] = [];
  const amountMismatch: Array<{ externalId: string; psp: number; internal: number }> = [];
  const matchedIds = new Set<string>();
  let matched = 0;

  for (const row of psp) {
    const hit = byAuth.get(row.externalId);
    if (!hit) {
      missingInInternal.push(row);
      continue;
    }
    matchedIds.add(hit.paymentId);
    if (hit.amountToman !== row.amountToman) {
      amountMismatch.push({ externalId: row.externalId, psp: row.amountToman, internal: hit.amountToman });
    } else {
      matched += 1;
    }
  }
  const missingInPsp = internal.filter((p) => !byAuth.has(p.authority) || !matchedIds.has(p.paymentId) && !psp.some((x) => x.externalId === p.authority));
  // simplify: internal payments not present in PSP list
  const pspIds = new Set(psp.map((p) => p.externalId));
  const missPsp = internal.filter((p) => !pspIds.has(p.authority));

  return { matched, missingInInternal, missingInPsp: missPsp, amountMismatch };
}

export const PRODUCTION_ESCROW_PHASE = 14;
