export default async function handler(req, res) {
  // 1. Get URL and optional Cookies from query parameters
  const { url, cookies } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL' });
  }

  // Extract current ID to filter it out later
  const currentIdMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  const currentId = currentIdMatch ? currentIdMatch[1] : null;

  // 2. Prepare Cookies
  // Default cookie ensures we bypass the "Before you continue" Google consent page
  const defaultCookie = 'CONSENT=YES+cb.20210328-17-p0.en+FX+417; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiAo_CmBg;';
  
  // Use user provided cookies if available, otherwise use default
  const headersCookies = cookies || defaultCookie;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        // Inject the cookies here
        'Cookie': headersCookies
      }
    });

    const html = await response.text();

    // 3. THE PATTERN
    // shorts(?:\\\/|\/)  -> Matches "shorts/" or "shorts\/"
    // ([a-zA-Z0-9_-]{11}) -> Captures exactly 11 chars (The ID)
    // (?=["\\])           -> Lookahead: Ensures it ends with a quote or backslash (\x22)
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
