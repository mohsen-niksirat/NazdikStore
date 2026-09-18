/**
 * P21 — Vendor product image attachment (in-memory metadata + data URL).
 */
const productImages = new Map();

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);

function sniffImage(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf.subarray(0, 3).equals(JPEG_SIG)) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(PNG_SIG)) return 'image/png';
  return null;
}

function attachP21Routes(ctx, match, json, readBody, authUser) {
  match('POST', '/vendors/me/products/:productId/image', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const body = await readBody(req);
    const dataUrl = body.dataUrl;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return json(res, 400, {
        success: false,
        error: { code: 'VALIDATION_FAILED', message: 'dataUrl required' },
      });
    }
    const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) {
      return json(res, 400, {
        success: false,
        error: { code: 'INVALID_DATA_URL', message: 'data:image/...;base64 required' },
      });
    }
    let buf;
    try {
      buf = Buffer.from(m[2], 'base64');
    } catch {
      return json(res, 400, { success: false, error: { code: 'INVALID_BASE64' } });
    }
    if (buf.length > 5 * 1024 * 1024) {
      return json(res, 400, {
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'max 5MB' },
      });
    }
    const head = buf.subarray(0, 256).toString('utf8');
    if (/<svg|<script|<html/i.test(head)) {
      return json(res, 400, { success: false, error: { code: 'MALICIOUS_PAYLOAD' } });
    }
    const mime = sniffImage(buf);
    if (!mime) {
      return json(res, 400, {
        success: false,
        error: { code: 'UNSUPPORTED_MIME', message: 'JPEG/PNG only' },
      });
    }
    const rec = {
      productId: params.productId,
      vendorProfileId: `vp_${user.sub}`,
      mime,
      bytes: buf.length,
      dataUrl: `data:${mime};base64,${m[2]}`,
      updatedAt: new Date().toISOString(),
    };
    productImages.set(params.productId, rec);
    return json(res, 200, {
      success: true,
      data: {
        productId: rec.productId,
        mime: rec.mime,
        bytes: rec.bytes,
        dataUrl: rec.dataUrl,
      },
    });
  });

  match('GET', '/media/product/:productId', (req, res, params) => {
    const rec = productImages.get(params.productId);
    if (!rec) return json(res, 404, { success: false, error: { code: 'NOT_FOUND' } });
    return json(res, 200, {
      success: true,
      data: {
        productId: rec.productId,
        mime: rec.mime,
        bytes: rec.bytes,
        dataUrl: rec.dataUrl,
      },
    });
  });
}

module.exports = { attachP21Routes, productImages };
