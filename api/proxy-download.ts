export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    const targetUrl = query.url || req.query?.url || '';
    const rawFilename = query.filename || req.query?.filename || 'DownloaderZero_Media.mp4';

    if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    // Determine correct Referer per platform CDN
    let referer = 'https://www.google.com/';
    if (targetUrl.includes('tiktok') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
      referer = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('facebook') || targetUrl.includes('fbcdn')) {
      referer = 'https://www.facebook.com/';
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      referer = 'https://www.instagram.com/';
    } else if (targetUrl.includes('youtube') || targetUrl.includes('googlevideo')) {
      referer = 'https://www.youtube.com/';
    } else if (targetUrl.includes('pinterest') || targetUrl.includes('pinimg')) {
      referer = 'https://www.pinterest.com/';
    } else if (targetUrl.includes('spotify') || targetUrl.includes('scdn.co')) {
      referer = 'https://open.spotify.com/';
    }

    let remoteRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': referer
      }
    });

    // If forbidden (anti-hotlink), retry without Referer header
    if (remoteRes.status === 403) {
      remoteRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
    }

    if (!remoteRes.ok || !remoteRes.body) {
      res.status(remoteRes.status || 500).send('Gagal mengunduh berkas dari tautan sumber.');
      return;
    }

    const rawContentType = remoteRes.headers.get('content-type') || '';
    if (rawContentType.includes('application/json') || (rawContentType.includes('text/html') && !sanitizedFilename.endsWith('.html'))) {
      res.status(400).send('Tautan unduhan tidak valid atau berkas belum siap dari server sumber.');
      return;
    }

    // Determine proper MIME type instead of generic octet-stream
    let mimeType = 'application/octet-stream';
    if (sanitizedFilename.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (sanitizedFilename.endsWith('.mp3')) mimeType = 'audio/mpeg';
    else if (sanitizedFilename.endsWith('.jpg') || sanitizedFilename.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (sanitizedFilename.endsWith('.png')) mimeType = 'image/png';
    else if (sanitizedFilename.endsWith('.zip')) mimeType = 'application/zip';
    else if (rawContentType && !rawContentType.includes('text/')) mimeType = rawContentType;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const contentLength = remoteRes.headers.get('content-length');
    const contentEncoding = remoteRes.headers.get('content-encoding');
    if (contentLength && !contentEncoding) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = remoteRes.body.getReader();
    req.on?.('close', () => {
      try {
        reader.cancel();
      } catch {}
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send(`Download gagal: ${err.message}`);
    }
  }
}
