/**
 * D1 — Feed engagement likes/saves (memory + localStorage on client).
 */
const likes = new Map(); // postId -> Set userId
const saves = new Map(); // postId -> Set userId

function attachD1Routes(ctx, match, json, readBody, authUser) {
  function key(postId, userId) {
    return `${postId}:${userId}`;
  }

  match('POST', '/feed/:postId/like', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const set = likes.get(params.postId) || new Set();
    const k = key(params.postId, user.sub);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    likes.set(params.postId, set);
    return json(res, 200, {
      success: true,
      data: { postId: params.postId, liked: set.has(k), likeCount: set.size },
    });
  });

  match('POST', '/feed/:postId/save', async (req, res, params) => {
    const user = authUser(ctx, req);
    if (!user) return json(res, 401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const set = saves.get(params.postId) || new Set();
    const k = key(params.postId, user.sub);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    saves.set(params.postId, set);
    return json(res, 200, {
      success: true,
      data: { postId: params.postId, saved: set.has(k), saveCount: set.size },
    });
  });

  match('GET', '/feed/:postId/engagement', (req, res, params) => {
    const user = authUser(ctx, req);
    const lk = likes.get(params.postId) || new Set();
    const sv = saves.get(params.postId) || new Set();
    const k = user ? key(params.postId, user.sub) : null;
    return json(res, 200, {
      success: true,
      data: {
        likeCount: lk.size,
        saveCount: sv.size,
        liked: k ? lk.has(k) : false,
        saved: k ? sv.has(k) : false,
      },
    });
  });
}

module.exports = { attachD1Routes };
