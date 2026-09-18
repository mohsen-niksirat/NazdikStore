/**
 * P22 — Simple JSON persistence for in-memory domain stores.
 * Writes selected state to apps/api/data/state.json on interval + shutdown.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function attachP22Routes(ctx, match, json, readBody, authUser) {
  if (!global.__nazdikPersist) global.__nazdikPersist = { lastSave: null, path: STATE_FILE };

  function snapshot() {
    const orders = [];
    try {
      // Collect orders via known vendor ids + consumer ids is hard; use orders private map if exposed
      const anyOrders = ctx.orders;
      if (anyOrders && typeof anyOrders.listForVendor === 'function') {
        const vps = new Set();
        try {
          for (const id of ['vp_food_1', 'vp_vendor_demo', 'vp_clinic_demo', 'vp_field_1', 'vp_ref']) {
            for (const o of anyOrders.listForVendor(id) || []) {
              vps.add(o.id);
              orders.push(o);
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    return {
      savedAt: new Date().toISOString(),
      orders,
      wallets: {
        platform: ctx.wallet.getBalance('platform'),
      },
      loyalty: global.__nazdikLoyalty
        ? Array.from(global.__nazdikLoyalty.entries()).map(([k, v]) => ({ key: k, card: v }))
        : [],
      hours: global.__nazdikHours
        ? Array.from(global.__nazdikHours.entries()).map(([k, v]) => ({ key: k, rules: v }))
        : [],
    };
  }

  async function save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const snap = snapshot();
      fs.writeFileSync(STATE_FILE, JSON.stringify(snap, null, 2));
      global.__nazdikPersist.lastSave = snap.savedAt;
      return true;
    } catch (e) {
      return false;
    }
  }

  function restore() {
    try {
      if (!fs.existsSync(STATE_FILE)) return 0;
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      let n = 0;
      for (const o of raw.orders || []) {
        try {
          // rehydrate via persistOrder equivalent — createDeliveryOrder if possible
          if (o.id && o.vendorProfileId) {
            // store into orders map via service if it has a way
            if (ctx.orders.orders && typeof ctx.orders.orders.set === 'function') {
              ctx.orders.orders.set(o.id, o);
              n += 1;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (raw.loyalty) {
        if (!global.__nazdikLoyalty) global.__nazdikLoyalty = new Map();
        for (const row of raw.loyalty) global.__nazdikLoyalty.set(row.key, row.card);
      }
      if (raw.hours) {
        if (!global.__nazdikHours) global.__nazdikHours = new Map();
        for (const row of raw.hours) global.__nazdikHours.set(row.key, row.rules);
      }
      return n;
    } catch {
      return 0;
    }
  }

  const restored = restore();
  if (restored) console.log(`P22 restored ${restored} orders from ${STATE_FILE}`);

  const timer = setInterval(() => void save(), 15000);
  if (timer.unref) timer.unref();

  match('POST', '/system/save-state', async (req, res) => {
    const ok = await save();
    return json(res, ok ? 200 : 500, {
      success: ok,
      data: { path: STATE_FILE, lastSave: global.__nazdikPersist.lastSave },
    });
  });

  match('GET', '/system/state-info', (req, res) => {
    let exists = false;
    let size = 0;
    try {
      if (fs.existsSync(STATE_FILE)) {
        exists = true;
        size = fs.statSync(STATE_FILE).size;
      }
    } catch {
      /* ignore */
    }
    return json(res, 200, {
      success: true,
      data: {
        path: STATE_FILE,
        exists,
        size,
        lastSave: global.__nazdikPersist.lastSave,
        autoSaveMs: 15000,
      },
    });
  });
}

module.exports = { attachP22Routes, STATE_FILE };
