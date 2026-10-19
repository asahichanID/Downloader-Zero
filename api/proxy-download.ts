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

    let targetUrl = query.url || req.query?.url || '';
    if (!targetUrl || !targetUrl.startsWith('http')) {
      const rawReqUrl = req.url || '';
      const urlMatch = rawReqUrl.match(/[?&]url=([^&]+)/);
      if (urlMatch && urlMatch[1]) {
        try {
          targetUrl = decodeURIComponent(urlMatch[1]);
        } catch {
          targetUrl = urlMatch[1];
        }
      }
    }

    if (targetUrl) {
      targetUrl = targetUrl.trim().replace(/^["']|["']$/g, '');
      if (targetUrl.startsWith('//')) {
        targetUrl = 'https:' + targetUrl;
      }
      if (targetUrl.startsWith('http%3A') || targetUrl.startsWith('https%3A')) {
        try {
          targetUrl = decodeURIComponent(targetUrl);
        } catch {}
      }
    }

    const rawFilename = query.filename || req.query?.filename || 'DownloaderZero_Media.mp4';

    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    // Auto-resolve Spotify track page to real full MP3 song via Neoxr
    if (targetUrl.includes('spotify.com/track/') || targetUrl.includes('spotify.com/intl-') || targetUrl.includes('spotify.link')) {
      try {
        const neoxrKey = ((query.apiKey as string) || (req.query?.apiKey as string) || process.env.NEOXR_API_KEY || 'j3i3mg').trim();
        const neoRes = await fetch(`https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(targetUrl)}&apikey=${encodeURIComponent(neoxrKey)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(12000)
        });
        if (neoRes.ok) {
          const neoJson = await neoRes.json();
          const fullSongUrl = neoJson.data?.url || neoJson.data?.download || neoJson.data?.link;
          if (fullSongUrl && typeof fullSongUrl === 'string' && fullSongUrl.startsWith('http') && !fullSongUrl.includes('mp3-preview')) {
            targetUrl = fullSongUrl;
          }
        }
      } catch (spErr) {
        console.warn('Neoxr spotify track resolve notice:', spErr);
      }
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
    } else if (targetUrl.includes('open.spotify.com')) {
      referer = 'https://open.spotify.com/';
    } else if (targetUrl.includes('scdn.co') || targetUrl.includes('neoxr.eu') || targetUrl.includes('pages.dev')) {
      referer = '';
    }

    let remoteRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*',
        ...(referer ? { 'Referer': referer } : {})
      }
    });

    // If forbidden (anti-hotlink), retry without Referer header
    if (remoteRes.status === 403 || remoteRes.status === 401) {
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
    const isHtml = rawContentType.includes('text/html');
    const isKnownMediaUrl = targetUrl.includes('pages.dev') || targetUrl.includes('neoxr') || targetUrl.includes('scdn.co');
    if (rawContentType.includes('application/json') || (isHtml && !isKnownMediaUrl && !sanitizedFilename.endsWith('.html'))) {
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
