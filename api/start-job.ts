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
    const neoKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
    const isAudio = normalizedFormat === 'mp3';
    const qualityMap: Record<string, string> = {
      '2160': '720p',
      '1440': '720p',
      '1080': '720p',
      '720': '720p',
      '480': '480p',
      '360': '360p',
      'mp3': '128kbps'
    };
    const neoQ = qualityMap[normalizedFormat] || (isAudio ? '128kbps' : '720p');
    const neoType = isAudio ? 'audio' : 'video';
    const neoEp = `https://api.neoxr.eu/api/youtube?url=${encodeURIComponent(url)}&type=${neoType}&quality=${neoQ}&apikey=${encodeURIComponent(neoKey)}`;

    try {
      const neoRes = await fetch(neoEp, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      if (neoRes.ok) {
        const neoJson = await neoRes.json();
        if (neoJson && neoJson.status && neoJson.data?.url) {
          res.json({
            success: true,
            id: null,
            downloadUrl: neoJson.data.url,
            format: normalizedFormat,
            text: `Siap diunduh (${neoJson.data.quality || normalizedFormat})!`
          });
          return;
        }
      }
    } catch (neoErr) {
      console.warn('[api/start-job] Neoxr start-job error:', neoErr);
    }

    res.status(502).json({
      success: false,
      error: 'Gagal memproses media untuk resolusi ini. Silakan coba kembali.'
    });
    return;
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
