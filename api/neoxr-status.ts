import { checkNeoxrApiKeyStatus } from './_utils/scraper.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    let apiKey = parsedUrl.searchParams.get('apiKey') || '';
    let force = parsedUrl.searchParams.get('force') === '1';

    if (req.method === 'POST' && req.body) {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {}
      }
      if (typeof body?.apiKey === 'string') apiKey = body.apiKey;
      if (body?.force === true || body?.force === '1') force = true;
    }

    const status = await checkNeoxrApiKeyStatus(apiKey, force);
    res.status(200).json(status);
  } catch (err: any) {
    res.status(200).json({
      success: false,
      isLimited: false,
      hasCustomKey: false,
      checkedAt: Date.now(),
      error: err?.message || 'Status check failed'
    });
  }
}
