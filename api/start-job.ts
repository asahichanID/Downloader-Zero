function normalizeLoaderFormat(raw: string | undefined): string {
  if (!raw) return '1080';
  const f = String(raw).toLowerCase().trim();
  if (f === '4k' || f === '2160' || f === '2160p' || f.includes('2160') || f.includes('4k')) return '2160';
  if (f === '2k' || f === '1440' || f === '1440p' || f.includes('1440') || f.includes('2k') || f.includes('qhd')) return '1440';
  if (f === '1080' || f === '1080p' || f.includes('1080')) return '1080';
  if (f === '720' || f === '720p' || f.includes('720')) return '720';
  if (f === '480' || f === '480p' || f.includes('480')) return '480';
  if (f === '360' || f === '360p' || f.includes('360')) return '360';
  if (f === 'mp3' || f === 'audio' || f.includes('mp3') || f.includes('audio')) return 'mp3';
  return f.replace(/p$/i, '');
}

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

    const normalizedFormat = normalizeLoaderFormat(format);
    const response = await fetch(
      `https://loader.to/ajax/download.php?format=${encodeURIComponent(normalizedFormat)}&url=${encodeURIComponent(url)}`,
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
    if (data.errors || (!data.id && !data.download_url)) {
      res.status(502).json({
        success: false,
        error: data.message || (data.errors && JSON.stringify(data.errors)) || 'Gagal memulai konversi resolusi yang dipilih.'
      });
      return;
    }

    res.json({
      success: true,
      id: data.id || null,
      downloadUrl: data.download_url || null,
      format: normalizedFormat,
      text: data.text || ''
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
