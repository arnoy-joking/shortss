export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL' });
  }

  try {
    // --- STEP 1: Fetch the HTML Skeleton ---
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const html = await response.text();

    // --- STEP 2: Extract Credentials & Sequence Params ---
    
    // A. Get API Key
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

    // B. Get Client Version (e.g., 2.2024...)
    const clientVerMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    const clientVer = clientVerMatch ? clientVerMatch[1] : '2.20230622.06.00'; // Fallback

    // C. Get Sequence Params (The key to the next videos)
    // In your HTML source, this is inside window['ytCommand'] -> sequenceParams
    const seqParamsMatch = html.match(/"sequenceParams":"([^"]+)"/);
    const sequenceParams = seqParamsMatch ? seqParamsMatch[1] : null;

    if (!apiKey || !sequenceParams) {
      return res.status(500).json({ 
        error: 'Could not extract API keys or Sequence Params. YouTube might have changed the layout.',
        debug_keys: { apiKey: !!apiKey, sequenceParams: !!sequenceParams }
      });
    }

    // --- STEP 3: Call YouTube Internal API (RPC) ---
    // We simulate the call the browser would have made to fetch the next videos
    
    const apiUrl = `https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence?key=${apiKey}`;
    const apiBody = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: clientVer,
          hl: "en",
          gl: "US",
        }
      },
      params: sequenceParams
    };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody)
    });

    const apiData = await apiResponse.json();

    // --- STEP 4: Parse the API Response ---

    const entries = apiData.entries || [];
    
    const nextVideos = entries.map(entry => {
      const endpoint = entry.reelWatchEndpoint;
      if (!endpoint) return null;

      // Sometimes data is in overlay, sometimes in command metadata
      const overlay = entry.overlay?.reelPlayerOverlayRenderer;
      const header = overlay?.reelPlayerHeaderSupportedRenderers?.reelPlayerHeaderRenderer;
      
      // Try to find title in accessibility label (common in API responses)
      // e.g. "Video Title by Channel Name 1 day ago"
      const label = header?.accessibility?.accessibilityData?.label || "Unknown";

      // Thumbnails
      const thumbs = endpoint.thumbnail?.thumbnails || [];
      const thumbUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : null;

      return {
        id: endpoint.videoId,
        url: `https://www.youtube.com/shorts/${endpoint.videoId}`,
        description_snippet: label,
        thumbnail: thumbUrl
      };
    }).filter(v => v !== null);

    return res.status(200).json({
      count: nextVideos.length,
      nextVideos: nextVideos
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server Error', details: error.message });
  }
}
