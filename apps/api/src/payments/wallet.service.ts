import { Injectable } from '@nestjs/common';

export interface WalletAccount {
  id: string;
  ownerId: string;
  ownerType: 'USER' | 'VENDOR' | 'PLATFORM';
  balanceToman: number;
}

export interface LedgerEntryRecord {
  id: string;
  walletId: string;
  type: 'PAYMENT_IN' | 'COMMISSION' | 'VENDOR_CREDIT' | 'REFUND_OUT' | 'PAYOUT' | 'ADJUSTMENT';
  amountToman: number; // signed
  idempotencyKey: string;
  paymentId?: string;
  orderId?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface SettlementRecord {
  id: string;
  vendorProfileId: string;
  grossToman: number;
  commissionToman: number;
  netToman: number;
  paymentId?: string;
  settledAt: string;
}

/** Platform commission rate (0–1). Override with PLATFORM_COMMISSION_BPS */
export function commissionRate(): number {
  const bps = Number(process.env.PLATFORM_COMMISSION_BPS ?? 1000); // 10%
  return Math.min(0.5, Math.max(0, bps / 10000));
}

export function computeSettlement(grossToman: number): {
  commissionToman: number;
  netToman: number;
} {
  const commissionToman = Math.round(grossToman * commissionRate());
  return { commissionToman, netToman: grossToman - commissionToman };
}

/**
 * Wallet subsystem — platform balance, refunds, vendor settlement.
 * Memory ledger with unique idempotency keys; production maps to Prisma tables.
 */
@Injectable()
export class WalletService {
  private wallets = new Map<string, WalletAccount>();
  private entries = new Map<string, LedgerEntryRecord>(); // by idempotencyKey
  private settlements: SettlementRecord[] = [];

  clearMemory(): void {
    this.wallets.clear();
    this.entries.clear();
    this.settlements = [];
  }

  ensureWallet(ownerId: string, ownerType: WalletAccount['ownerType'] = 'USER'): WalletAccount {
    let w = this.wallets.get(ownerId);
    if (!w) {
      w = {
        id: `wal_${ownerId}`,
        ownerId,
        ownerType,
        balanceToman: 0,
      };
      this.wallets.set(ownerId, w);
    }
    return w;
  }

  getBalance(ownerId: string): number {
    return this.wallets.get(ownerId)?.balanceToman ?? 0;
  }

  getWallet(ownerId: string): WalletAccount | null {
    return this.wallets.get(ownerId) ?? null;
  }

  /**
   * Post a ledger entry. If idempotencyKey already exists → no-op (return existing).
   * amountToman is signed: positive credit, negative debit.
   */
  postEntry(input: {
    ownerId: string;
    ownerType?: WalletAccount['ownerType'];
    type: LedgerEntryRecord['type'];
    amountToman: number;
    idempotencyKey: string;
    paymentId?: string;
    orderId?: string;
    meta?: Record<string, unknown>;
  }): { entry: LedgerEntryRecord; applied: boolean; balance: number } {
    const existing = this.entries.get(input.idempotencyKey);
    if (existing) {
      return {
        entry: existing,
        applied: false,
        balance: this.getBalance(input.ownerId),
      };
    }

    const wallet = this.ensureWallet(input.ownerId, input.ownerType);
    wallet.balanceToman += input.amountToman;

    const entry: LedgerEntryRecord = {
      id: `led_${input.idempotencyKey}`,
      walletId: wallet.id,
      type: input.type,
      amountToman: input.amountToman,
      idempotencyKey: input.idempotencyKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
      meta: input.meta,
      createdAt: new Date().toISOString(),
    };
    this.entries.set(input.idempotencyKey, entry);
    return { entry, applied: true, balance: wallet.balanceToman };
  }

  listEntries(ownerId: string): LedgerEntryRecord[] {
    return Array.from(this.entries.values())
      .filter((e) => e.walletId === this.ensureWallet(ownerId).id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Credit platform + vendor after successful payment webhook.
   * Idempotent via paymentId keys.
   */
  applySuccessfulPayment(input: {
    paymentId: string;
    orderId: string;
    vendorProfileId: string;
    grossToman: number;
  }): {
    alreadyApplied: boolean;
    platformCredit: number;
    vendorCredit: number;
    commissionToman: number;
  } {
    const { commissionToman, netToman } = computeSettlement(input.grossToman);

    const platformKey = `pay:${input.paymentId}:platform`;
    const vendorKey = `pay:${input.paymentId}:vendor`;
    const settleKey = `settle:${input.paymentId}`;

    const platform = this.postEntry({
      ownerId: 'platform',
      ownerType: 'PLATFORM',
      type: 'PAYMENT_IN',
      amountToman: commissionToman,
      idempotencyKey: platformKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
    });

    const vendor = this.postEntry({
      ownerId: input.vendorProfileId,
      ownerType: 'VENDOR',
      type: 'VENDOR_CREDIT',
      amountToman: netToman,
      idempotencyKey: vendorKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
    });

    const alreadyApplied = !platform.applied && !vendor.applied;

    if (!this.settlements.find((s) => s.paymentId === input.paymentId)) {
      this.settlements.push({
        id: settleKey,
        vendorProfileId: input.vendorProfileId,
        grossToman: input.grossToman,
        commissionToman,
        netToman,
        paymentId: input.paymentId,
        settledAt: new Date().toISOString(),
      });
    }

    return {
      alreadyApplied,
      platformCredit: commissionToman,
      vendorCredit: netToman,
      commissionToman,
    };
  }

  /** Refund consumer from platform (or reverse vendor credit) */
  refund(input: {
    paymentId: string;
    consumerId: string;
    vendorProfileId: string;
    amountToman: number;
  }): { applied: boolean; consumerBalance: number } {
    const key = `refund:${input.paymentId}`;
    const existing = this.entries.get(key);
    if (existing) {
      return { applied: false, consumerBalance: this.getBalance(input.consumerId) };
    }

    // Debit vendor if they have balance, else platform absorbs
    const vendorBal = this.getBalance(input.vendorProfileId);
    if (vendorBal >= input.amountToman) {
      this.postEntry({
        ownerId: input.vendorProfileId,
        ownerType: 'VENDOR',
        type: 'REFUND_OUT',
        amountToman: -input.amountToman,
        idempotencyKey: `${key}:vendor_debit`,
        paymentId: input.paymentId,
      });
    } else {
      this.postEntry({
        ownerId: 'platform',
        ownerType: 'PLATFORM',
        type: 'REFUND_OUT',
        amountToman: -input.amountToman,
        idempotencyKey: `${key}:platform_debit`,
        paymentId: input.paymentId,
      });
    }

    const consumer = this.postEntry({
      ownerId: input.consumerId,
      ownerType: 'USER',
      type: 'REFUND_OUT',
      amountToman: input.amountToman,
      idempotencyKey: key,
      paymentId: input.paymentId,
    });

    return { applied: consumer.applied, consumerBalance: this.getBalance(input.consumerId) };
  }

  listSettlements(vendorProfileId?: string): SettlementRecord[] {
    return this.settlements.filter((s) => !vendorProfileId || s.vendorProfileId === vendorProfileId);
  }
}
