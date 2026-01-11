// api/index.js

export default async function handler(req, res) {
  // 1. Get URL from query parameter
  const { url } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL (?url=...)' });
  }

  try {
    // 2. Fetch the HTML content using a User-Agent to ensure we get the Desktop/Mobile web version
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = await response.text();

    // 3. Extract the 'ytInitialReelWatchSequenceResponse' variable using Regex
    // The HTML provided shows: var ytInitialReelWatchSequenceResponse = '...';
    const regex = /var ytInitialReelWatchSequenceResponse\s*=\s*'([^']+)';/;
    const match = html.match(regex);

    if (!match || !match[1]) {
      return res.status(500).json({ error: 'Could not find Shorts sequence data in HTML' });
    }

    // 4. Decode the raw string
    // YouTube obfuscates the JSON string using Hex escapes (e.g., \x7b for { and \x22 for ")
    const rawString = match[1];
    
    // We unescape the hex values to get valid JSON string
    const jsonString = rawString.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // 5. Parse JSON
    // Note: The string might contain escaped backslashes for the JSON string content, 
    // basic JSON.parse might fail if double encoded, but usually works on the hex-decoded string.
    let parsedData;
    try {
        parsedData = JSON.parse(jsonString);
    } catch (e) {
        // Fallback: sometimes purely unwrapping hex isn't enough depending on nested quotes
        // This cleaning step helps fix common JSON string issues in scraped data
        const cleanedJson = jsonString.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        parsedData = JSON.parse(cleanedJson);
    }

    // 6. Extract relevant Video Data
    // The structure is typically: entries -> [ { command, reelWatchEndpoint, ... } ]
    const entries = parsedData.entries || [];

    const nextVideos = entries.map(entry => {
      const endpoint = entry.reelWatchEndpoint;
      const prefetch = entry.unserializedPrefetchData?.playerResponse?.videoDetails;

      if (!endpoint) return null;

      // Extract high-quality thumbnail if available
      const thumbnails = endpoint.thumbnail?.thumbnails || [];
      const bestThumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : null;

      return {
        videoId: endpoint.videoId,
        url: `https://www.youtube.com/shorts/${endpoint.videoId}`,
        title: prefetch?.title || 'Unknown Title',
        author: prefetch?.author || 'Unknown Author',
        viewCount: prefetch?.viewCount || '0',
        thumbnail: bestThumbnail,
        // The sequence param is needed if you want to paginate further via API
        sequenceParams: endpoint.sequenceParams 
      };
    }).filter(item => item !== null); // Remove empty entries

    // 7. Return JSON response
    return res.status(200).json({
      count: nextVideos.length,
      currentVideoId: parsedData.replacementEndpoint?.reelWatchEndpoint?.videoId || 'unknown',
      nextVideos: nextVideos
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to scrape data', details: error.message });
  }
}
