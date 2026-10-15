export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const targetUrl = (req.query?.url as string) || '';
    const rawFilename = (req.query?.filename as string) || 'DownloaderZero_Media';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    const remoteRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!remoteRes.ok || !remoteRes.body) {
      res.status(remoteRes.status).send('Gagal mengunduh berkas dari sumber.');
      return;
    }

    const contentType = remoteRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = remoteRes.headers.get('content-length');

    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.setHeader('Content-Type', contentType);
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
