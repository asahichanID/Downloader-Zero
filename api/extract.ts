import type { IncomingMessage, ServerResponse } from 'http';
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
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
      return;
    }

    const data = await extractMedia(url);
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('Vercel API error:', err);
    res.status(400).json({
      success: false,
      error: err.message || 'Gagal mengekstrak media dari URL.'
    });
  }
}
