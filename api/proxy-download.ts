export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const targetUrl = (req.query?.url as string) || '';
    const rawFilename = (req.query?.filename as string) || 'DownloaderZero_Media.mp4';

    if (!targetUrl || !targetUrl.startsWith('http')) {
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

    const contentLength = remoteRes.headers.get('content-length');

    // Force automatic direct attachment download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = remoteRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send(`Download gagal: ${err.message}`);
    }
  }
}
