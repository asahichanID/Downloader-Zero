import NodeID3 from 'node-id3';

// In-memory process cache for Spotify MP3 files (automatically purged 15 seconds after completion)
const spotifyProcessCache = new Map<string, { buffer: Buffer; timestamp: number }>();

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
    const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    const isSpotify =
      query.platform === 'spotify' ||
      req.query?.platform === 'spotify' ||
      targetUrl.includes('spotify.com') ||
      targetUrl.includes('spotify.link') ||
      (sanitizedFilename.endsWith('.mp3') && (Boolean(query.title || req.query?.title) || Boolean(query.artist || req.query?.artist)));

    // Handle Spotify with Neo audio download + embedded ID3 metadata & cover art
    if (isSpotify) {
      let directAudioUrl = targetUrl;
      const neoxrKey = ((query.apiKey as string) || (req.query?.apiKey as string) || process.env.NEOXR_API_KEY || 'j3i3mg').trim();

      // If targetUrl is still a Spotify web URL, resolve to Neo full MP3 URL
      if (directAudioUrl.includes('spotify.com') || directAudioUrl.includes('spotify.link')) {
        try {
          const neoRes = await fetch(
            `https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(directAudioUrl)}&apikey=${encodeURIComponent(neoxrKey)}`,
            {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(14000)
            }
          );
          if (neoRes.ok) {
            const neoJson = await neoRes.json();
            const fullSongUrl = neoJson.data?.url || neoJson.data?.download || neoJson.data?.link;
            if (fullSongUrl && typeof fullSongUrl === 'string' && fullSongUrl.startsWith('http') && !fullSongUrl.includes('mp3-preview')) {
              directAudioUrl = fullSongUrl;
            }
          }
        } catch (e) {
          console.warn('[Spotify Download] Neo direct resolve notice:', e);
        }
      }

      // Fetch raw audio stream from Neo
      const audioRes = await fetch(directAudioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        }
      });

      if (!audioRes.ok) {
        res.status(audioRes.status || 500).send('Gagal mengunduh audio Spotify dari server sumber.');
        return;
      }

      const audioArrayBuffer = await audioRes.arrayBuffer();
      const rawAudioBuffer = Buffer.from(audioArrayBuffer);

      // Fetch Cover Art buffer if cover URL is provided
      const coverUrl = (query.cover || req.query?.cover) as string;
      let coverBuffer: Buffer | null = null;
      let coverMime = 'image/jpeg';
      if (coverUrl && typeof coverUrl === 'string' && coverUrl.startsWith('http')) {
        try {
          const cRes = await fetch(coverUrl, { signal: AbortSignal.timeout(7000) });
          if (cRes.ok) {
            coverBuffer = Buffer.from(await cRes.arrayBuffer());
            coverMime = cRes.headers.get('content-type') || 'image/jpeg';
          }
        } catch (covErr) {
          console.warn('[Spotify Download] Cover image download notice:', covErr);
        }
      }

      // Embed ID3 tags (Title, Artist, Album, Genre, Year, Cover Art)
      const tags: any = {
        title: (query.title || req.query?.title || 'Spotify Track') as string,
        artist: (query.artist || req.query?.artist || 'Spotify Artist') as string,
        album: (query.album || req.query?.album || 'Spotify Music') as string,
        genre: (query.genre || req.query?.genre || 'Pop') as string,
        year: (((query.year || req.query?.year || new Date().getFullYear().toString()) as string)).slice(0, 4),
        comment: {
          language: 'eng',
          text: 'Downloaded with DownloaderZero via Neo'
        }
      };

      if (coverBuffer) {
        tags.image = {
          mime: coverMime,
          type: { id: 3, name: 'front cover' },
          description: 'Album Cover Art',
          imageBuffer: coverBuffer
        };
      }

      let finalMp3Buffer: Buffer = rawAudioBuffer;
      try {
        const tagged = NodeID3.write(tags, rawAudioBuffer);
        if (tagged && tagged.length > 0) {
          finalMp3Buffer = tagged;
        }
      } catch (id3Err) {
        console.error('[Spotify Download] ID3 tagging failed, streaming raw audio:', id3Err);
      }

      // Store in process cache and schedule 15-second purge
      const processKey = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      spotifyProcessCache.set(processKey, { buffer: finalMp3Buffer, timestamp: Date.now() });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', finalMp3Buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, X-Process-Id, X-Cache-Lifetime');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Process-Id', processKey);
      res.setHeader('X-Cache-Lifetime', '15s');

      res.send(finalMp3Buffer);

      // Hapus cache proses 15 detik setelah selesai
      setTimeout(() => {
        if (spotifyProcessCache.has(processKey)) {
          spotifyProcessCache.delete(processKey);
          console.log(`[Spotify Process Cache] 🗑️ 15 seconds elapsed: Process cache ${processKey} removed successfully.`);
        }
      }, 15000);

      return;
    }

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
