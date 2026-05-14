// api/monitor.js
// Handles keyword monitoring:
// POST /api/monitor?action=add     — save a keyword
// POST /api/monitor?action=remove  — delete a keyword  
// GET  /api/monitor?action=list    — get all keywords for a user
// GET  /api/monitor?action=check   — check for new articles on all keywords

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Simple Supabase REST helper
async function supabase(method, table, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  return res.status === 204 ? null : res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, user_id } = req.query;

  try {
    // ── ADD keyword ──
    if (action === 'add' && req.method === 'POST') {
      const { keyword } = req.body;
      if (!keyword || !user_id) return res.status(400).json({ error: 'keyword and user_id required' });

      const result = await supabase('POST', 'monitored_keywords', {
        keyword: keyword.toLowerCase().trim(),
        user_id,
      });
      return res.status(200).json({ success: true, data: result });
    }

    // ── REMOVE keyword ──
    if (action === 'remove' && req.method === 'POST') {
      const { keyword } = req.body;
      if (!keyword || !user_id) return res.status(400).json({ error: 'keyword and user_id required' });

      await supabase('DELETE', 'monitored_keywords', null,
        `?keyword=eq.${encodeURIComponent(keyword)}&user_id=eq.${encodeURIComponent(user_id)}`
      );
      return res.status(200).json({ success: true });
    }

    // ── LIST keywords ──
    if (action === 'list' && req.method === 'GET') {
      if (!user_id) return res.status(400).json({ error: 'user_id required' });

      const data = await supabase('GET', 'monitored_keywords', null,
        `?user_id=eq.${encodeURIComponent(user_id)}&order=created_at.desc`
      );
      return res.status(200).json({ success: true, keywords: data });
    }

    // ── CHECK for new articles ──
    if (action === 'check' && req.method === 'GET') {
      if (!user_id) return res.status(400).json({ error: 'user_id required' });

      // Get all keywords for this user
      const keywords = await supabase('GET', 'monitored_keywords', null,
        `?user_id=eq.${encodeURIComponent(user_id)}`
      );

      if (!keywords?.length) return res.status(200).json({ success: true, new_articles: [] });

      const newArticles = [];

      for (const kw of keywords) {
        const articles = await fetchGoogleNews(kw.keyword);
        for (const article of articles) {
          // Check if we've seen this article before
          const existing = await supabase('GET', 'seen_articles', null,
            `?keyword=eq.${encodeURIComponent(kw.keyword)}&article_url=eq.${encodeURIComponent(article.url)}`
          );

          if (!existing?.length) {
            // New article — save it and add to results
            await supabase('POST', 'seen_articles', {
              keyword:       kw.keyword,
              article_url:   article.url,
              article_title: article.title,
            });
            newArticles.push({ ...article, keyword: kw.keyword });
          }
        }
      }

      return res.status(200).json({ success: true, new_articles: newArticles });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    console.error('Monitor error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Fetch Google News RSS for a keyword
async function fetchGoogleNews(keyword) {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
    const res  = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.contents) return [];

    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(data.contents)) !== null) {
      const item  = match[1];
      const title = item.match(/<title[^>]*><!\[CDATA\[([^\]]+)\]\]><\/title>/i)?.[1]
                 || item.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
      const link  = item.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]
                 || item.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1] || '';
      const pubDate = item.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i)?.[1] || '';
      if (title && link) articles.push({ title: title.trim(), url: link.trim(), pubDate });
    }
    return articles.slice(0, 10);
  } catch (e) {
    return [];
  }
}
