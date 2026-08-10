import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [config, entries] = await Promise.all([
      kv.get('config'),
      kv.get('entries')
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      config: config ?? null,
      entries: entries ?? []
    });
  }

  if (req.method === 'POST') {
    const { config, entries } = req.body || {};
    const tasks = [];
    if (config !== undefined) tasks.push(kv.set('config', config));
    if (entries !== undefined) tasks.push(kv.set('entries', entries));
    await Promise.all(tasks);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
