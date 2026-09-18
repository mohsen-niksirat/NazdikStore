/**
 * Enterprise Phase 14 — escrow API + disputes + reconciliation.
 */
const shared = require('@nazdik/shared');

const escrows = new Map();
const disputes = new Map();
const ledgerBuckets = {
  gross: 0,
  escrowHeld: 0,
  vendorCredit: 0,
  platformCommission: 0,
  refunds: 0,
};

function attachEscrowRoutes(ctx, match, json, readBody, authUser) {
  match('POST', '/escrow/hold', async (req, res) => {
    const body = await readBody(req);
    const gross = Number(body.grossToman) || 0;
    const entry = shared.createEscrow({
      paymentId: body.paymentId || `pay_${Date.now().toString(36)}`,
      orderId: body.orderId,
      vendorProfileId: body.vendorProfileId,
      consumerId: body.consumerId,
      grossToman: gross,
    });
    if (escrows.has(entry.paymentId)) {
      return json(res, 409, { success: false, error: { code: 'CONFLICT' } });
    }
    escrows.set(entry.paymentId, entry);
    ledgerBuckets.gross += gross;
    ledgerBuckets.escrowHeld += gross;
    return json(res, 200, { success: true, data: entry });
  });

  match('POST', '/escrow/:paymentId/release', async (req, res, params) => {
    const entry = escrows.get(params.paymentId);
    if (!entry) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    const body = await readBody(req);
    const orderStatus = body.orderStatus || 'PENDING_ACCEPTANCE';
    const check = shared.canReleaseEscrow(entry, orderStatus, Date.now());
    if (!check.ok) {
      return json(res, 409, {
        success: false,
        error: { code: check.reason || 'IN_ESCROW', message: 'وجه هنوز در امانی است' },
      });
    }
    const parts = shared.computeCommission(entry.grossToman);
    const released = shared.releaseEscrow(entry);
    escrows.set(entry.paymentId, released);
    ledgerBuckets.escrowHeld = Math.max(0, ledgerBuckets.escrowHeld - entry.grossToman);
    ledgerBuckets.vendorCredit += parts.netToman;
    ledgerBuckets.platformCommission += parts.commissionToman;

    ctx.wallet.postEntry({
      ownerId: entry.vendorProfileId,
      ownerType: 'VENDOR',
      type: 'VENDOR_CREDIT',
      amountToman: parts.netToman,
      idempotencyKey: `escrow:${entry.paymentId}:vendor`,
      paymentId: entry.paymentId,
      orderId: entry.orderId,
    });
    ctx.wallet.postEntry({
      ownerId: 'platform',
      ownerType: 'PLATFORM',
      type: 'COMMISSION',
      amountToman: parts.commissionToman,
      idempotencyKey: `escrow:${entry.paymentId}:platform`,
      paymentId: entry.paymentId,
    });

    return json(res, 200, {
      success: true,
      data: {
        escrow: released,
        commissionToman: parts.commissionToman,
        netToman: parts.netToman,
      },
    });
  });

  match('GET', '/escrow/:paymentId', (req, res, params) => {
    const e = escrows.get(params.paymentId);
    if (!e) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    return json(res, 200, { success: true, data: e });
  });

  match('POST', '/orders/:orderId/dispute', async (req, res, params) => {
    const user = authUser(ctx, req);
    const body = await readBody(req);
    const orderId = params.orderId;
    if (disputes.has(orderId) && disputes.get(orderId).status === 'OPEN') {
      return json(res, 409, { success: false, error: { code: 'DISPUTE_EXISTS' } });
    }
    for (const e of escrows.values()) {
      if (e.orderId === orderId && e.state === 'HELD') {
        escrows.set(e.paymentId, shared.markDisputed(e));
        ledgerBuckets.escrowHeld = Math.max(0, ledgerBuckets.escrowHeld - e.grossToman);
      }
    }
    const rec = {
      orderId,
      openedBy: (user && user.sub) || body.consumerId,
      reason: String(body.reason || '').slice(0, 500),
      evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 5) : [],
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    disputes.set(orderId, rec);
    return json(res, 200, { success: true, data: rec });
  });

  match('POST', '/admin/disputes/:orderId/resolve', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user || user.role !== 'ADMIN') {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const body = await readBody(req);
    const dispute = disputes.get(params.orderId);
    if (!dispute) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    const amount = Number(body.refundToman) || 0;
    const mode = body.mode || 'full';
    let paymentId = body.paymentId || null;
    if (!paymentId) {
      for (const e of escrows.values()) {
        if (e.orderId === params.orderId) paymentId = e.paymentId;
      }
    }
    const entry = paymentId ? escrows.get(paymentId) : null;
    if (entry) {
      const refunded = shared.refundEscrow(entry);
      escrows.set(entry.paymentId, refunded);
      const refundAmt = mode === 'full' ? entry.grossToman : amount;
      ledgerBuckets.refunds += refundAmt;
      ctx.wallet.postEntry({
        ownerId: entry.consumerId,
        ownerType: 'USER',
        type: 'REFUND_OUT',
        amountToman: refundAmt,
        idempotencyKey: `dispute:${params.orderId}:refund`,
        paymentId: entry.paymentId,
      });
      dispute.resolved = { mode, refundToman: refundAmt, at: new Date().toISOString() };
      dispute.status = 'RESOLVED';
    }
    return json(res, 200, { success: true, data: { dispute, entry } });
  });

  match('GET', '/admin/ledger/identity', (req, res) => {
    let held = 0;
    for (const e of escrows.values()) {
      if (e.state === 'HELD' || e.state === 'DISPUTED') held += e.grossToman;
    }
    const ident = shared.ledgerIdentity({
      grossToman: ledgerBuckets.gross,
      escrowHeld: held,
      vendorCredit: ledgerBuckets.vendorCredit,
      platformCommission: ledgerBuckets.platformCommission,
      refunds: ledgerBuckets.refunds,
    });
    return json(res, 200, {
      success: true,
      data: {
        balanced: ident.balanced,
        lhs: ident.lhs,
        rhs: ident.rhs,
        delta: ident.delta,
        buckets: {
          gross: ledgerBuckets.gross,
          escrowHeldComputed: held,
          vendorCredit: ledgerBuckets.vendorCredit,
          platformCommission: ledgerBuckets.platformCommission,
          refunds: ledgerBuckets.refunds,
        },
      },
    });
  });

  match('POST', '/admin/settlements/reconcile', async (req, res) => {
    const body = await readBody(req);
    const report = shared.reconcileSettlements(body.psp || [], body.internal || []);
    return json(res, 200, { success: true, data: report });
  });

  match('GET', '/admin/escrows', (req, res) => {
    return json(res, 200, { success: true, data: Array.from(escrows.values()) });
  });
}

module.exports = { attachEscrowRoutes, escrows, ledgerBuckets };
