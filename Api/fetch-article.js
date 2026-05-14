module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Braincast/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const content = extractArticle(html);
    return res.status(200).json({ success: true, ...content });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}

function extractArticle(html) {
  let title = '';
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  title = (ogTitle?.[1] || h1?.[1] || titleTag?.[1] || '').trim();

  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  const articleMatch = clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const source = articleMatch?.[1] || clean;

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(source)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 40) paragraphs.push(text);
  }

  return { title, body: paragraphs.slice(0, 8).join('\n\n') };
}
