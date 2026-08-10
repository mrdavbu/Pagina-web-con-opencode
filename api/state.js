import { Redis } from '@upstash/redis';

const EDITOR_CODE = process.env.EDITOR_CODE || '';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
});

function authorized(req) {
  if (!EDITOR_CODE) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${EDITOR_CODE}`;
}

export default async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(500).json({ error: 'Redis no configurado. Crea una base Upstash Redis y conecta sus variables.' });
  }

  if (req.method === 'GET') {
    const [config, entries] = await Promise.all([
      redis.get('config'),
      redis.get('entries')
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      config: config ?? null,
      entries: entries ?? [],
      protected: !!EDITOR_CODE
    });
  }

  if (req.method === 'POST') {
    if (!authorized(req)) {
      return res.status(403).json({ error: 'Código de edición incorrecto' });
    }
    const { config, entries } = req.body || {};
    const tasks = [];
    if (config !== undefined) tasks.push(redis.set('config', config));
    if (entries !== undefined) tasks.push(redis.set('entries', entries));
    await Promise.all(tasks);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
