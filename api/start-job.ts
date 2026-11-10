import { detectPlatform, resolveTikTokDownload } from './_utils/scraper.ts';

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

    const { format, url, server, apiKey, platform, formatId, resolution, type } = body || {};
    if (!url) {
      res.status(400).json({ success: false, error: 'URL target wajib disertakan.' });
      return;
    }

    const serverMode = (server === 'server1' || server === 'server2' || server === 'auto') ? server : 'auto';

    // 1. TikTok on-demand resolution (Pemakaian API setelah pemilihan format)
    if (platform === 'tiktok' || detectPlatform(url) === 'tiktok') {
      try {
        const resolved = await resolveTikTokDownload(
          url,
          formatId || 'tt-1080',
          resolution || format || '1080p',
          type || (format === 'mp3' ? 'audio' : 'video'),
          serverMode,
          apiKey
        );
        res.json({
          success: true,
          id: null,
          downloadUrl: resolved.downloadUrl,
          format: resolution || format || '1080p',
          text: `Siap diunduh (${resolved.quality || 'Kualitas Tinggi'})!`
        });
        return;
      } catch (ttErr: any) {
        console.error('[api/start-job] TikTok resolution error:', ttErr.message);
        res.status(502).json({
          success: false,
          error: ttErr.message || 'Gagal menyiapkan unduhan TikTok dari server yang dipilih.'
        });
        return;
      }
    }

    const normalizedFormat = normalizeLoaderFormat(format);

    // Server 1 handler (Primary)
    const tryServer1 = async () => {
      const envKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
      const key = (apiKey || envKey || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
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
      const neoEp = `https://api.neoxr.eu/api/youtube?url=${encodeURIComponent(url)}&type=${neoType}&quality=${neoQ}&apikey=${encodeURIComponent(key)}`;

      const neoRes = await fetch(neoEp, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      if (neoRes.ok) {
        const neoJson = await neoRes.json();
        if (neoJson && neoJson.status && neoJson.data?.url) {
          return {
            success: true,
            id: null,
            downloadUrl: neoJson.data.url,
            format: normalizedFormat,
            text: `Siap diunduh (${neoJson.data.quality || normalizedFormat})!`
          };
        }
      }
      throw new Error('Server 1 tidak menghasilkan unduhan.');
    };

    // Server 2 handler (Alternative / loader engine)
    const tryServer2 = async () => {
      const loaderRes = await fetch(`https://loader.to/ajax/download.php?button=1&start=1&format=${encodeURIComponent(normalizedFormat)}&url=${encodeURIComponent(url)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (loaderRes.ok) {
        const loaderJson = await loaderRes.json();
        if (loaderJson && (loaderJson.id || loaderJson.download_url)) {
          return {
            success: true,
            id: loaderJson.id || null,
            downloadUrl: loaderJson.download_url || undefined,
            format: normalizedFormat,
            text: loaderJson.text || 'Memulai konversi Server 2...'
          };
        }
      }
      throw new Error('Server 2 tidak dapat memulai proses konversi.');
    };

    if (serverMode === 'server1') {
      const result = await tryServer1();
      res.json(result);
      return;
    }

    if (serverMode === 'server2') {
      const result = await tryServer2();
      res.json(result);
      return;
    }

    // Auto mode
    try {
      const result1 = await tryServer1();
      res.json(result1);
      return;
    } catch (err1) {
      console.warn('[api/start-job] Server 1 failed, fallback to Server 2:', err1);
      try {
        const result2 = await tryServer2();
        res.json(result2);
        return;
      } catch (err2) {
        console.warn('[api/start-job] Server 2 failed:', err2);
      }
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
