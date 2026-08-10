export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const code = req.body?.code || '';
  const ok = !!process.env.EDITOR_CODE && code === process.env.EDITOR_CODE;
  return res.json({ ok });
}
