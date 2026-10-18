import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { extractMedia } from './src/services/scraper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'DownloaderZero (DZ) Media Engine',
      version: '2026.1',
      platforms: ['youtube', 'tiktok', 'facebook', 'instagram', 'pinterest', 'spotify']
    });
  });

  // 2. Extract media metadata and formats (API key is loaded from server environment)
  app.post('/api/extract', async (req: Request, res: Response) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
        return;
      }

      const media = await extractMedia(url);
      res.json({ success: true, data: media });
    } catch (err: any) {
      console.error('Extraction error:', err.message);
      res.status(400).json({
        success: false,
        error: err.message || 'Terjadi kesalahan saat memproses URL. Silakan coba lagi.'
      });
    }
  });

  // 2b. Start async job for YouTube conversion
  app.post('/api/start-job', async (req: Request, res: Response) => {
    try {
      const { format, url } = req.body || {};
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
  });

  // 3. Progress check for async processing (e.g. YouTube loader.to jobs)
  app.get('/api/progress/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'Job ID tidak valid.' });
        return;
      }

      const loaderRes = await fetch(`https://loader.to/ajax/progress.php?id=${encodeURIComponent(jobId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!loaderRes.ok) {
        res.json({ success: false, progress: 0, statusText: 'Menunggu antrean...' });
        return;
      }

      const data = await loaderRes.json();
      const progress = typeof data.progress === 'number' ? Math.min(100, Math.round(data.progress / 10)) : 0;
      const isComplete = data.success === 1 && !!data.download_url;

      res.json({
        success: true,
        progress: isComplete ? 100 : progress,
        downloadUrl: data.download_url || undefined,
        statusText: data.text || (isComplete ? 'Selesai!' : 'Sedang memproses konversi...')
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Proxy stream for instant automatic download attachment
  app.get('/api/proxy-download', async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      const rawFilename = (req.query.filename as string) || 'DownloaderZero_Media.mp4';

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
      } else if (targetUrl.includes('spotify') || targetUrl.includes('scdn.co')) {
        referer = 'https://open.spotify.com/';
      }

      let response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': referer
        }
      });

      // If forbidden, retry without Referer
      if (response.status === 403) {
        response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': '*/*'
          }
        });
      }

      if (!response.ok || !response.body) {
        res.status(response.status || 500).send('Gagal mengunduh media dari tautan sumber.');
        return;
      }

      const rawContentType = response.headers.get('content-type') || '';
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

      const contentLength = response.headers.get('content-length');
      const contentEncoding = response.headers.get('content-encoding');
      if (contentLength && !contentEncoding) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream chunks directly to user's browser
      const reader = response.body.getReader();
      req.on('close', () => {
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
      console.error('Proxy download stream error:', err);
      if (!res.headersSent) {
        res.status(500).send(`Download gagal: ${err.message}`);
      }
    }
  });

  // 5. Mount Vite in dev, or serve dist in production
  if (!isProduction) {
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DownloaderZero] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
