// api/fetch-article.js
// Fetches and extracts full article text from a news URL
// Called by the in-app reader when user taps a card

export default async function handler(req, res) {
  // Allow CORS from our app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // Fetch the article HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Braincast/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();

    // Extract article content using simple heuristics
    const content = extractArticle(html, url);

    return res.status(200).json({
      success: true,
      title:   content.title,
      body:    content.body,
      source:  new URL(url).hostname.replace('www.', ''),
    });

  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
    });
  }
}

function extractArticle(html, url) {
  // Remove scripts, styles, nav, footer, ads
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract title
  let title = '';
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  title = (ogTitle?.[1] || h1?.[1] || titleTag?.[1] || '').trim();

  // Extract article body — look for article/main tags first
  let body = '';
  const articleMatch = clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch    = clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  const source = articleMatch?.[1] || mainMatch?.[1] || clean;

  // Extract all paragraph text
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(source)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, '')   // strip inner tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 40) paragraphs.push(text);
  }

  // Take first 8 paragraphs (enough for a good read)
  body = paragraphs.slice(0, 8).join('\n\n');

  // Fallback if no paragraphs found
  if (!body) {
    body = clean
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
  }

  return { title, body };
}
