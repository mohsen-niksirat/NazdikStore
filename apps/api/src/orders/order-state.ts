/**
 * Unified order lifecycle state machine — Phase 4.
 *
 *   PENDING_ACCEPTANCE
 *     ├─► PREPARING      (delivery / RFQ accepted)
 *     ├─► SCHEDULED      (appointment booked)
 *     └─► CANCELLED
 *   PREPARING | SCHEDULED
 *     ├─► IN_PROGRESS
 *     └─► CANCELLED
 *   IN_PROGRESS
 *     ├─► COMPLETED
 *     └─► DISPUTED
 *   DISPUTED
 *     ├─► COMPLETED
 *     └─► CANCELLED
 *   COMPLETED | CANCELLED  → terminal (no further transitions)
 */

export const ORDER_STATUSES = [
  'PENDING_ACCEPTANCE',
  'PREPARING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_KINDS = ['APPOINTMENT', 'DELIVERY', 'RFQ'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

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
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    const err = new Error(`INVALID_TRANSITION:${from}->${to}`) as Error & {
      code: string;
      from: OrderStatus;
      to: OrderStatus;
    };
    err.code = 'INVALID_TRANSITION';
    err.from = from;
    err.to = to;
    throw err;
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/** Default status after order creation based on kind/booking path */
export function initialStatusForKind(kind: OrderKind, mode?: 'booked' | 'vendor_accept'): OrderStatus {
  if (kind === 'APPOINTMENT' || mode === 'booked') return 'SCHEDULED';
  return 'PENDING_ACCEPTANCE';
}

/** Status that unlocks Phase 3 reviews via CompletedEngagement */
export function unlocksReview(status: OrderStatus): boolean {
  return status === 'COMPLETED';
}
