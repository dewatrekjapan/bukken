// 自己実現支援AI 中継サーバー（Cloudflare Workers）
// 役割: Anthropic API キーをサーバー側に隠し、アクセスコードごとに利用量を制限してブラウザからの呼び出しを中継する。
// 設定: wrangler secret put ANTHROPIC_API_KEY / ACCESS_CODES（カンマ区切り）、KV バインディング QUOTA、
//       vars: DAILY_REQUESTS（コード1つあたり1日の上限回数）、ALLOWED_ORIGIN、ALLOWED_MODELS（カンマ区切り）
const PATHS = new Set(['/v1/messages', '/v1/messages/count_tokens']);

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, anthropic-version, anthropic-beta',
      'access-control-max-age': '86400',
    };
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (req.method !== 'POST' || !PATHS.has(url.pathname)) return json(404, { error: { message: 'not found' } });

    // 認証: Authorization: Bearer <アクセスコード>
    const code = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const codes = (env.ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!code || !codes.includes(code)) return json(401, { error: { type: 'authentication_error', message: 'アクセスコードが無効です' } });

    // モデル制限（高額モデルの利用をサーバー側で禁止）
    let body;
    try { body = await req.json(); } catch { return json(400, { error: { message: 'invalid json' } }); }
    const allowed = (env.ALLOWED_MODELS || 'claude-opus-5,claude-sonnet-5,claude-haiku-4-5').split(',').map(s => s.trim());
    if (!allowed.includes(body.model)) return json(400, { error: { message: `このサービスでは ${body.model} は使えません。利用可能: ${allowed.join(', ')}` } });

    // 利用量制限（count_tokens は数えない）
    if (url.pathname === '/v1/messages' && env.QUOTA) {
      const key = `q:${code}:${new Date().toISOString().slice(0, 10)}`;
      const used = Number((await env.QUOTA.get(key)) || 0);
      const limit = Number(env.DAILY_REQUESTS || 20);
      if (used >= limit) return json(429, { error: { type: 'rate_limit_error', message: `本日の利用上限（${limit}回）に達しました` } });
      await env.QUOTA.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
    }

    const h = new Headers({ 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01' });
    const beta = req.headers.get('anthropic-beta');
    if (beta) h.set('anthropic-beta', beta);
    const r = await fetch('https://api.anthropic.com' + url.pathname, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const out = new Headers(r.headers);
    for (const k in cors) out.set(k, cors[k]);
    return new Response(r.body, { status: r.status, headers: out });
  },
};
