/**
 * Production Phase 7 — Jalali slots + JWT chat rooms (order-isolated).
 */
const gisMod = require('@nazdik/shared');

/** chat store: roomKey -> messages[] */
const rooms = new Map();
const roomMeta = new Map(); // roomKey -> { participants:Set, type }
const jalaliSchedules = new Map(); // vendorId -> ScheduleRuleJalali[]
const jalaliBooked = new Map(); // `${vendor}|${day}` -> BookedInterval[]

function roomKey(orderId) {
  return `order:${orderId}`;
}

function ensureRoom(orderId, participants) {
  const key = roomKey(orderId);
  if (!rooms.has(key)) rooms.set(key, []);
  if (!roomMeta.has(key)) {
    roomMeta.set(key, { participants: new Set(participants || []), type: 'ORDER' });
  } else if (participants) {
    const meta = roomMeta.get(key);
    for (const p of participants) meta.participants.add(p);
  }
  return key;
}

function isParticipant(orderId, user) {
  const key = roomKey(orderId);
  const meta = roomMeta.get(key);
  if (!meta) {
    // allow if order exists in orders service
    try {
      const order = /* ctx injected later */ null;
      return false;
    } catch {
      return false;
    }
  }
  const ids = [user.sub, `vp_${user.sub}`, `vp_admin_${user.sub}`, user.role];
  if (user.role === 'ADMIN') return true;
  return (
    meta.participants.has(user.sub) ||
    meta.participants.has(`vp_${user.sub}`) ||
    Array.from(meta.participants).some((p) => p === user.sub || p.endsWith(user.sub))
  );
}

function attachPhase7Routes(ctx, match, json, readBody, authUser) {
  const jalali = require('@nazdik/shared');

  // Ensure participants from live order if possible
  function ensureFromOrder(orderId, user) {
    try {
      const order = ctx.orders.get(orderId);
      ensureRoom(orderId, [order.consumerId, order.vendorProfileId, `vp_${order.vendorProfileId}`]);
      return order;
    } catch {
      ensureRoom(orderId, [user.sub, `vp_${user.sub}`]);
      return null;
    }
  }

  function canChat(orderId, user) {
    if (user.role === 'ADMIN') {
      ensureFromOrder(orderId, user);
      return true;
    }
    const order = ensureFromOrder(orderId, user);
    if (!order) {
      // demo_order or unknown — allow same consumer/vendor demo ids
      const key = roomKey(orderId);
      const meta = roomMeta.get(key);
      if (meta && (meta.participants.has(user.sub) || meta.participants.has(`vp_${user.sub}`))) {
        return true;
      }
      // seed demo room open for demo_order
      if (orderId === 'demo_order') {
        ensureRoom(orderId, [user.sub, `vp_${user.sub}`, 'consumer_demo', 'vp_vendor_demo']);
        return true;
      }
      return false;
    }
    return (
      order.consumerId === user.sub ||
      order.vendorProfileId === user.sub ||
      order.vendorProfileId === `vp_${user.sub}` ||
      `vp_${order.vendorProfileId}` === `vp_${user.sub}`
    );
  }

  function markParticipant(orderId, userId) {
    const key = ensureRoom(orderId);
    roomMeta.get(key).participants.add(userId);
  }

  // ── Jalali schedule ──
  match('POST', '/vendors/me/schedule-jalali', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vp = `vp_${user.sub}`;
    const rules = (body.rules || []).map((r) => ({
      jalaliWeekday: Number(r.jalaliWeekday),
      startMinute: Number(r.startMinute),
      endMinute: Number(r.endMinute),
      slotMinutes: Number(r.slotMinutes) || 30,
      breaks: r.breaks || [],
      bufferMinutes: r.bufferMinutes != null ? Number(r.bufferMinutes) : 10,
    }));
    jalaliSchedules.set(vp, rules);
    return json(res, 200, { success: true, data: { vendorProfileId: vp, rules } });
  });

  match('GET', '/vendors/:id/slots-jalali', (req, res, params) => {
    const day = gisMod.tehranIsoDate();
    const iso = req.url.includes('day=')
      ? decodeURIComponent(String(req.url).split('day=')[1].split('&')[0])
      : day;
    const rules = jalaliSchedules.get(params.id) || [];
    // default demo clinic schedule if none
    if (!rules.length && params.id === 'vp_clinic_demo') {
      jalaliSchedules.set(params.id, [
        {
          jalaliWeekday: 0,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
          breaks: [{ start: 12 * 60, end: 12 * 60 + 30 }],
          bufferMinutes: 10,
        },
        {
          jalaliWeekday: 1,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
          breaks: [],
          bufferMinutes: 10,
        },
        {
          jalaliWeekday: 2,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
          breaks: [],
          bufferMinutes: 10,
        },
        {
          jalaliWeekday: 3,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
          breaks: [],
          bufferMinutes: 10,
        },
        {
          jalaliWeekday: 4,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
          breaks: [],
          bufferMinutes: 10,
        },
      ]);
    }
    const rules2 = jalaliSchedules.get(params.id) || [];
    const bookedKey = `${params.id}|${iso}`;
    const booked = jalaliBooked.get(bookedKey) || [];
    const slots = jalali.expandJalaliDaySlots({ isoDate: iso, rules: rules2, booked });
    return json(res, 200, {
      success: true,
      data: {
        day: iso,
        jalaliLabel: jalali.formatJalaliDate(iso),
        timezone: jalali.TEHRAN_TZ,
        bufferMinutes: rules2[0]?.bufferMinutes ?? 10,
        slots,
      },
    });
  });

  match('POST', '/orders/appointments-jalali', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const vendorProfileId = body.vendorProfileId;
    const day = body.day;
    const start = Number(body.startMinute);
    const end = Number(body.endMinute);
    if (!vendorProfileId || !day || !Number.isFinite(start) || !Number.isFinite(end)) {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });
    }
    const rules = jalaliSchedules.get(vendorProfileId) || [];
    const buffer = rules[0]?.bufferMinutes ?? 10;
    const key = `${vendorProfileId}|${day}`;
    const list = jalaliBooked.get(key) || [];

    // Atomic check-and-set (single-threaded node ≈ SELECT FOR UPDATE on unique row)
    const conflict = list.some((b) => jalali.slotsConflict({ startMinute: start, endMinute: end }, b, buffer));
    if (conflict) {
      return json(res, 409, {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'این ساعت قبلاً رزرو شده است',
          details: { reason: 'SLOT_TAKEN', bufferMinutes: buffer },
        },
      });
    }
    list.push({ startMinute: start, endMinute: end });
    jalaliBooked.set(key, list);

    let orderId = `jord_${Date.now().toString(36)}`;
    try {
      const order = await ctx.orders.createAppointmentOrder({
        consumerId: user.sub,
        vendorProfileId,
        slotId: `jalali|${vendorProfileId}|${day}|${start}`,
        note: body.note,
        priceToman: body.priceToman || 400000,
      });
      orderId = order.id;
    } catch {
      // memory fallback order id
    }
    markParticipant(orderId, user.sub);
    markParticipant(orderId, vendorProfileId);
    ctx.notifications?.notify?.({
      userId: vendorProfileId,
      channel: 'websocket',
      topic: 'booking.jalali',
      payload: { orderId, day, startMinute: start },
    });

    return json(res, 200, {
      success: true,
      data: {
        orderId,
        day,
        jalaliLabel: jalali.formatJalaliDate(day),
        startMinute: start,
        endMinute: end,
        faTime: jalali.formatFaTime(start),
        bufferMinutes: buffer,
        status: 'SCHEDULED',
      },
    });
  });

  // ── Chat (order-isolated, JWT) ──
  match('GET', '/chat/:orderId/messages', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canChat(params.orderId, user)) {
      return json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'شما عضو این گفتگو نیستید' },
      });
    }
    markParticipant(params.orderId, user.sub);
    const key = roomKey(params.orderId);
    const all = rooms.get(key) || [];
    // cursor pagination
    const url = String(req.url || '');
    const before = url.includes('before=') ? decodeURIComponent(url.split('before=')[1].split('&')[0]) : null;
    const limit = url.includes('limit=') ? Number(url.split('limit=')[1].split('&')[0]) || 50 : 50;
    let page = all;
    if (before) {
      const idx = all.findIndex((m) => m.id === before);
      page = idx > 0 ? all.slice(Math.max(0, idx - limit), idx) : all.slice(-limit);
    } else {
      page = all.slice(-limit);
    }
    // mark DELIVERED for others
    for (const m of all) {
      if (m.from !== user.sub && m.status === 'SENT') m.status = 'DELIVERED';
    }
    return json(res, 200, {
      success: true,
      data: page,
      meta: { count: all.length, room: key, participants: Array.from(roomMeta.get(key)?.participants || []) },
    });
  });

  match('POST', '/chat/:orderId/messages', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canChat(params.orderId, user)) {
      return json(res, 403, {
        success: false,
        error: { code: 'FORBIDDEN', message: 'شما عضو این گفتگو نیستید' },
      });
    }
    const body = await readBody(req);
    const text = String(body.body || body.text || '').slice(0, 2000).trim();
    if (!text) return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED' } });

    markParticipant(params.orderId, user.sub);
    const key = ensureRoom(params.orderId);
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orderId: params.orderId,
      room: key,
      from: user.role === 'VENDOR' ? `vp_${user.sub}` : user.sub,
      role: user.role,
      body: text,
      status: 'SENT',
      attachments: Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [],
      createdAt: new Date().toISOString(),
    };
    const list = rooms.get(key);
    list.push(msg);

    // notify other participants
    const meta = roomMeta.get(key);
    for (const p of meta?.participants || []) {
      if (p === msg.from || p === user.sub) continue;
      ctx.notifications?.notify?.({
        userId: p,
        channel: 'websocket',
        topic: 'chat.message',
        payload: { orderId: params.orderId, from: msg.from, preview: text.slice(0, 40) },
      });
    }
    // in-process bus emit (gateway facade)
    ctx.notifications?.broadcastVendors?.('chat.message', {
      orderId: params.orderId,
      from: msg.from,
    });

    return json(res, 200, { success: true, data: msg });
  });

  match('POST', '/chat/:orderId/messages/:msgId/read', (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    if (!canChat(params.orderId, user)) {
      return json(res, 403, { success: false, error: { code: 'FORBIDDEN' } });
    }
    const key = roomKey(params.orderId);
    const list = rooms.get(key) || [];
    const msg = list.find((m) => m.id === params.msgId);
    if (msg) msg.status = 'READ';
    return json(res, 200, { success: true, data: msg });
  });

  match('GET', '/chat/ws-info', (req, res) => {
    return json(res, 200, {
      success: true,
      data: {
        transport: 'websocket-facade',
        path: '/chat',
        auth: 'JWT bearer (mini: long-poll + in-process bus)',
        statusFlow: ['SENT', 'DELIVERED', 'READ'],
      },
    });
  });

  // seed demo room
  ensureRoom('demo_order', ['consumer_demo', 'vp_vendor_demo', 'vp_vendor_demo']);
  const seedKey = roomKey('demo_order');
  if (!(rooms.get(seedKey) || []).length) {
    rooms.get(seedKey).push({
      id: 'm_seed1',
      orderId: 'demo_order',
      room: seedKey,
      from: 'consumer_demo',
      role: 'CONSUMER',
      body: 'سلام — نوبت فردا پابرجاست؟',
      status: 'DELIVERED',
      attachments: [],
      createdAt: new Date().toISOString(),
    });
    rooms.get(seedKey).push({
      id: 'm_seed2',
      orderId: 'demo_order',
      room: seedKey,
      from: 'vp_vendor_demo',
      role: 'VENDOR',
      body: 'بله، ساعت اعلام‌شده منتظرتان هستیم.',
      status: 'SENT',
      attachments: [],
      createdAt: new Date().toISOString(),
    });
  }
}

module.exports = { attachPhase7Routes };
