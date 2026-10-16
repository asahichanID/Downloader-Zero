import 'dotenv/config';
import { extractMedia } from '../src/services/scraper.ts';

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    let body = req.body;

    // Handle string body if not parsed automatically by serverless runtime
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // keep as is
      }
    } else if (!body) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) {
          body = JSON.parse(raw);
        }
      } catch {
        // keep as is
      }
    }

    let url = body?.url;
    if (!url) {
      const parsedUrl = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
      url = parsedUrl.searchParams.get('url');
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
      return;
    }

    const data = await extractMedia(url);
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('API Extraction Error:', err?.message || err);
    res.status(400).json({
      success: false,
      error: err.message || 'Gagal mengekstrak media dari URL.'
    });
  }
}
