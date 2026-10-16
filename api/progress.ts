export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const jobId = (req.query?.jobId as string) || (req.query?.id as string) || '';
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
}
