export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const { format, url } = body || {};
    if (!url) {
      res.status(400).json({ success: false, error: 'URL target wajib disertakan.' });
      return;
    }

    const response = await fetch(
      `https://loader.to/ajax/download.php?format=${encodeURIComponent(format || '1080')}&url=${encodeURIComponent(url)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      res.status(502).json({ success: false, error: 'Gagal memulai konversi media.' });
      return;
    }

    const data = await response.json();
    res.json({
      success: true,
      id: data.id || null,
      downloadUrl: data.download_url || null,
      text: data.text || ''
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
