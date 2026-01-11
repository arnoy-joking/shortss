export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL (?url=...)' });
  }

  try {
    // 1. Fetch with Headers to bypass "Consent" screen and simulate a real browser
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        // This cookie is CRITICAL for server-side fetching to bypass the Google Consent Page
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+417; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiAo_CmBg;', 
      }
    });

    const html = await response.text();

    // Debug: Check if we got the consent page instead of the video
    if (html.includes('consent.youtube.com')) {
      return res.status(403).json({ error: 'YouTube blocked the request with a Consent Page. Vercel IP is restricted.' });
    }

    // 2. Regex to find the Sequence Variable
    // Matches: var ytInitialReelWatchSequenceResponse = '...';
    const regex = /var ytInitialReelWatchSequenceResponse\s*=\s*'([^']+)';/;
    const match = html.match(regex);

    if (!match || !match[1]) {
      return res.status(200).json({ 
        count: 0, 
        message: 'Sequence variable not found. YouTube might have treated this request as a bot.',
        debug: 'Try running this locally to see if it works. Vercel IPs are often flagged.'
      });
    }

    // 3. Decode the Hex-Escaped String (e.g. \x7b -> {)
    const rawString = match[1];
    const jsonString = rawString.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // 4. Parse the JSON
    let parsedData;
    try {
      parsedData = JSON.parse(jsonString);
    } catch (e) {
      return res.status(500).json({ error: 'JSON Parse Error', details: e.message });
    }

    // 5. Extract Entries
    const entries = parsedData.entries || [];
    
    // Map the data
    const nextVideos = entries.map(entry => {
      const endpoint = entry.reelWatchEndpoint;
      if (!endpoint) return null;

      // The prefetch data usually contains the title/channel info
      // Check both 'unserializedPrefetchData' and standard 'overlay' locations
      const videoDetails = entry.unserializedPrefetchData?.playerResponse?.videoDetails;

      const thumbnails = endpoint.thumbnail?.thumbnails || [];
      const bestThumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : null;

      return {
        videoId: endpoint.videoId,
        url: `https://www.youtube.com/shorts/${endpoint.videoId}`,
        title: videoDetails?.title || 'Unknown Title',
        author: videoDetails?.author || 'Unknown Channel',
        viewCount: videoDetails?.viewCount || '0',
        thumbnail: bestThumbnail
      };
    }).filter(item => item !== null);

    return res.status(200).json({
      count: nextVideos.length,
      nextVideos: nextVideos
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server Error', details: error.message });
  }
}
