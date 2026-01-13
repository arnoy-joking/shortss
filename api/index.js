export default async function handler(req, res) {
  // --- CORS HEADERS (The Fix) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow ALL domains
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle "OPTIONS" preflight request immediately
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // -----------------------------

  const { url, cookies } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL' });
  }

  // Extract current ID
  const currentIdMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  const currentId = currentIdMatch ? currentIdMatch[1] : null;

  // Prepare Cookies
  const defaultCookie = 'CONSENT=YES+cb.20210328-17-p0.en+FX+417; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiAo_CmBg;';
  const headersCookies = cookies || defaultCookie;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': headersCookies
      }
    });

    const html = await response.text();

    // REGEX PATTERN: Look for shorts/ID followed by " or \
    const regex = /shorts(?:\\\/|\/)([a-zA-Z0-9_-]{11})(?=["\\])/g;

    const uniqueIds = new Set();
    let match;

    while ((match = regex.exec(html)) !== null) {
      const videoId = match[1];
      if (videoId !== currentId) {
        uniqueIds.add(videoId);
      }
    }

    const nextVideos = Array.from(uniqueIds).map(id => ({
      videoId: id,
      url: `https://www.youtube.com/shorts/${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    }));

    return res.status(200).json({
      count: nextVideos.length,
      currentVideoId: currentId,
      nextVideos: nextVideos
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server Error', details: error.message });
  }
}
