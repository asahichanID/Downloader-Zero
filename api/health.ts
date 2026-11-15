export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    status: 'online',
    service: 'DownloaderZero (DZ) Media Engine',
    version: '2026.1',
    platforms: ['youtube', 'tiktok', 'twitter', 'facebook', 'instagram', 'pinterest', 'spotify', 'terabox'],
    environment: 'vercel-serverless'
  });
}
