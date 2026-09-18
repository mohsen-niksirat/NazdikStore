/**
 * P23 — Consumer address book (in-memory + localStorage on client).
 */
const addresses = new Map(); // userId -> Address[]

function attachP23Routes(ctx, match, json, readBody, authUser) {
  match('GET', '/me/addresses', (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    return json(res, 200, { success: true, data: addresses.get(user.sub) || [] });
  });

  match('POST', '/me/addresses', async (req, res) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const label = String(body.label || 'خانه').slice(0, 40);
    const line = String(body.line || '').slice(0, 200);
    if (!line) {
      return json(res, 400, { success: false, error: { code: 'VALIDATION_FAILED', message: 'نشانی لازم است' } });
    }
    const rec = {
      id: `addr_${Date.now().toString(36)}`,
      label,
      line,
      city: String(body.city || 'تهران').slice(0, 40),
      lat: Number(body.lat) || null,
      lng: Number(body.lng) || null,
      isDefault: Boolean(body.isDefault),
    };
    const list = addresses.get(user.sub) || [];
    if (rec.isDefault) list.forEach((a) => (a.isDefault = false));
    list.push(rec);
    addresses.set(user.sub, list);
    return json(res, 200, { success: true, data: rec });
  });
}

module.exports = { attachP23Routes };
