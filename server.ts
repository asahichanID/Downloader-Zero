import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { extractMedia } from './src/services/scraper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'DownloaderZero (DZ) Media Engine',
      version: '2026.1',
      platforms: ['youtube', 'tiktok', 'facebook', 'instagram']
    });
  });

  // 2. Extract media metadata and formats
  app.post('/api/extract', async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
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

  // 4. Proxy stream for instant download attachment
  app.get('/api/proxy-download', async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      const rawFilename = (req.query.filename as string) || 'DownloaderZero_Media';

      if (!targetUrl || !targetUrl.startsWith('http')) {
        res.status(400).send('Target URL tidak valid.');
        return;
      }

      const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok || !response.body) {
        res.status(response.status).send('Gagal mengunduh media dari sumber.');
        return;
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const contentLength = response.headers.get('content-length');

      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream directly to client
      const reader = response.body.getReader();
      const stream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await stream();
    } catch (err: any) {
      console.error('Proxy download error:', err);
      if (!res.headersSent) {
        res.status(500).send(`Download gagal: ${err.message}`);
      }
    }
  });

  // 5. Mount Vite in dev, or serve dist in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
