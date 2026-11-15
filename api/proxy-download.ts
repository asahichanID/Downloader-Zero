import NodeID3 from 'node-id3';
import { extractMedia } from './_utils/scraper.ts';

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

    // Check raw request URL to avoid truncation by unencoded ampersands
    const rawReqUrl = req.url || '';
    const urlParamIdx = rawReqUrl.indexOf('url=');
    if (urlParamIdx !== -1) {
      let extracted = rawReqUrl.slice(urlParamIdx + 4);
      const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey|inline)=/);
      if (nextParamMatch && nextParamMatch.index !== undefined) {
        extracted = extracted.slice(0, nextParamMatch.index);
      }
      try {
        const decoded = decodeURIComponent(extracted);
        if (decoded.startsWith('http')) {
          targetUrl = decoded;
        }
      } catch {
        if (extracted.startsWith('http')) {
          targetUrl = extracted;
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

    // If targetUrl points to a loader.to ajax endpoint, resolve to real download URL
    if (targetUrl.includes('loader.to/ajax/download.php') || targetUrl.includes('loader.to')) {
      try {
        const lRes = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(8000)
        });
        if (lRes.ok) {
          const lData = await lRes.json();
          if (lData.download_url && typeof lData.download_url === 'string' && lData.download_url.startsWith('http')) {
            targetUrl = lData.download_url;
          }
        }
      } catch (lErr) {
        console.warn('[proxy-download] loader.to direct resolution notice:', lErr);
      }
    }

    const rawFilename = query.filename || req.query?.filename || 'DownloaderZero_Media.mp4';
    const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const platform = ((query.platform || req.query?.platform || '') as string).toLowerCase();
    const sourceUrl = (query.sourceUrl || req.query?.sourceUrl || '') as string;
    const isInline = query.inline === '1' || req.query?.inline === '1' || query.inline === 'true';
    const rangeHeader = typeof req.headers?.range === 'string' ? req.headers.range : undefined;

    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    const isSpotify =
      platform === 'spotify' ||
      query.platform === 'spotify' ||
      req.query?.platform === 'spotify' ||
      targetUrl.includes('spotify.com') ||
      targetUrl.includes('spotify.link') ||
      (!platform && sanitizedFilename.endsWith('.mp3') && (Boolean(query.title || req.query?.title) || Boolean(query.artist || req.query?.artist)));

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
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Process-Id, X-Cache-Lifetime');
      res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Process-Id', processKey);
      res.setHeader('X-Cache-Lifetime', '15s');

      if (rangeHeader) {
        const totalLen = finalMp3Buffer.length;
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
          if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
            const sliced = finalMp3Buffer.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
            res.setHeader('Content-Length', sliced.length);
            res.send(sliced);
          } else {
            res.setHeader('Content-Length', totalLen);
            res.send(finalMp3Buffer);
          }
        } else {
          res.setHeader('Content-Length', totalLen);
          res.send(finalMp3Buffer);
        }
      } else {
        res.setHeader('Content-Length', finalMp3Buffer.length);
        res.send(finalMp3Buffer);
      }

      // Hapus cache proses 15 detik setelah selesai
      setTimeout(() => {
        if (spotifyProcessCache.has(processKey)) {
          spotifyProcessCache.delete(processKey);
          console.log(`[Spotify Process Cache] 🗑️ 15 seconds elapsed: Process cache ${processKey} removed successfully.`);
        }
      }, 15000);

      return;
    }

    // Multi-Platform CDN Fetch Cascade
    let platformReferer = '';
    if (targetUrl.includes('tikwm.com')) {
      platformReferer = 'https://www.tikwm.com/';
    } else if (targetUrl.includes('tiktokcdn') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
      platformReferer = '';
    } else if (targetUrl.includes('tiktok.com')) {
      platformReferer = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('facebook') || targetUrl.includes('fbcdn')) {
      platformReferer = 'https://www.facebook.com/';
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      platformReferer = 'https://www.instagram.com/';
    } else if (targetUrl.includes('youtube') || targetUrl.includes('googlevideo')) {
      platformReferer = 'https://www.youtube.com/';
    } else if (targetUrl.includes('pinterest') || targetUrl.includes('pinimg')) {
      platformReferer = 'https://www.pinterest.com/';
    } else if (targetUrl.includes('terabox') || targetUrl.includes('1024tera') || targetUrl.includes('4funbox')) {
      platformReferer = 'https://www.terabox.app/';
    } else if (targetUrl.includes('snapcdn.app')) {
      platformReferer = 'https://dl.snapcdn.app/';
    } else if (targetUrl.includes('twimg.com') || targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
      platformReferer = 'https://x.com/';
    }

    const fetchCandidateConfigs: Array<{ headers: Record<string, string> }> = [
      // Strategy 1: Clean browser request without Referer (standard for most signed media CDNs)
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Mode': 'no-cors'
        }
      },
      // Strategy 2: With specific platform referer
      ...(platformReferer ? [{
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Referer': platformReferer
        }
      }] : []),
      // Strategy 3: Mobile Safari User-Agent
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
          'Accept': '*/*',
          ...(platformReferer ? { 'Referer': platformReferer } : {})
        }
      }
    ];

    let remoteRes: globalThis.Response | null = null;
    let lastStatus = 0;

    for (const cfg of fetchCandidateConfigs) {
      try {
        const reqHeaders: Record<string, string> = { ...cfg.headers };
        if (rangeHeader) {
          reqHeaders['Range'] = rangeHeader;
        }
        const resCandidate = await fetch(targetUrl, {
          headers: reqHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000)
        });
        if (resCandidate.ok && resCandidate.body) {
          remoteRes = resCandidate;
          break;
        } else {
          lastStatus = resCandidate.status;
        }
      } catch (e: any) {
        console.warn('[proxy-download] Candidate fetch notice:', e?.message || e);
      }
    }

    // If CDN link expired or returned 403/404/410, attempt on-the-fly re-resolution via extractMedia
    if ((!remoteRes || !remoteRes.ok) && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      try {
        console.log(`[proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
        const freshMedia = await extractMedia(sourceUrl);
        if (freshMedia && freshMedia.formats && freshMedia.formats.length > 0) {
          const bestFormat = freshMedia.formats.find((f) => f.isDirect && f.url && f.url.startsWith('http')) || freshMedia.formats[0];
          if (bestFormat && bestFormat.url && bestFormat.url !== targetUrl && bestFormat.url.startsWith('http')) {
            targetUrl = bestFormat.url;
            for (const cfg of fetchCandidateConfigs) {
              try {
                const reqHeaders: Record<string, string> = { ...cfg.headers };
                if (rangeHeader) {
                  reqHeaders['Range'] = rangeHeader;
                }
                const resCandidate = await fetch(targetUrl, {
                  headers: reqHeaders,
                  redirect: 'follow',
                  signal: AbortSignal.timeout(15000)
                });
                if (resCandidate.ok && resCandidate.body) {
                  remoteRes = resCandidate;
                  break;
                }
              } catch {}
            }
          }
        }
      } catch (reErr) {
        console.warn('[proxy-download] On-the-fly re-resolution notice:', reErr);
      }
    }

    if (!remoteRes || !remoteRes.ok || !remoteRes.body) {
      res.status(lastStatus || 500).json({ success: false, error: 'Gagal mengunduh berkas dari tautan sumber.' });
      return;
    }

    const reader = remoteRes.body.getReader();
    const { done: initialDone, value: firstChunk } = await reader.read();

    if (initialDone || !firstChunk || firstChunk.length === 0) {
      res.status(502).json({ success: false, error: 'Berkas kosong dari server sumber.' });
      return;
    }

    // Check first chunk for text/html or JSON error signatures
    const sampleText = Buffer.from(firstChunk.slice(0, 512)).toString('utf-8').trim();
    const isHtmlDoc =
      sampleText.startsWith('<!DOCTYPE html') ||
      sampleText.startsWith('<!doctype html') ||
      sampleText.startsWith('<html') ||
      sampleText.includes('<title>Error') ||
      sampleText.includes('Attention Required! | Cloudflare');
    const isJsonError =
      sampleText.startsWith('{"docs_url"') ||
      sampleText.startsWith('{"error_code"') ||
      sampleText.startsWith('{"success":false') ||
      (sampleText.startsWith('{') && sampleText.includes('"status":false'));

    if (isHtmlDoc || isJsonError) {
      console.warn('[api/proxy-download] Upstream served HTML/JSON error text instead of binary media:', sampleText.slice(0, 150));
      res.status(502).json({
        success: false,
        error: 'Tautan unduhan tidak menghasilkan berkas media yang valid dari server sumber.'
      });
      return;
    }

    const rawContentType = remoteRes.headers.get('content-type') || '';

    // Determine proper MIME type instead of generic octet-stream
    let mimeType = 'application/octet-stream';
    if (sanitizedFilename.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (sanitizedFilename.endsWith('.mp3')) mimeType = 'audio/mpeg';
    else if (sanitizedFilename.endsWith('.jpg') || sanitizedFilename.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (sanitizedFilename.endsWith('.png')) mimeType = 'image/png';
    else if (sanitizedFilename.endsWith('.zip')) mimeType = 'application/zip';
    else if (rawContentType && !rawContentType.includes('text/')) mimeType = rawContentType;

    if (remoteRes.status === 206) {
      res.status(206);
      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      isInline
        ? `inline; filename="${sanitizedFilename}"`
        : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges');
    res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const contentLength = remoteRes.headers.get('content-length');
    const contentEncoding = remoteRes.headers.get('content-encoding');
    if (contentLength && !contentEncoding && !isNaN(Number(contentLength))) {
      res.setHeader('Content-Length', contentLength);
    }

    req.on?.('close', () => {
      try {
        reader.cancel();
      } catch {}
    });

    // Write verified first chunk, then stream the rest
    res.write(Buffer.from(firstChunk));

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
      res.status(500).json({ success: false, error: `Download gagal: ${err.message}` });
    }
  }
}
