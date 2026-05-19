module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const { action, user_id } = req.query;

  async function db(method, table, body, query = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : '',
      },
      body: body ? JSON.stringify(body) : null,
    });
    return r.status === 204 ? null : r.json();
  }

  try {
    if (action === 'add' && req.method === 'POST') {
      const { keyword } = req.body;
      if (!keyword || !user_id) return res.status(400).json({ error: 'Missing fields' });
      const result = await db('POST', 'monitored_keywords', { keyword: keyword.toLowerCase().trim(), user_id });
      return res.status(200).json({ success: true, data: result });
    }

    if (action === 'remove' && req.method === 'POST') {
      const { keyword } = req.body;
      await db('DELETE', 'monitored_keywords', null, `?keyword=eq.${encodeURIComponent(keyword)}&user_id=eq.${encodeURIComponent(user_id)}`);
      return res.status(200).json({ success: true });
    }

    if (action === 'list' && req.method === 'GET') {
      const data = await db('GET', 'monitored_keywords', null, `?user_id=eq.${encodeURIComponent(user_id)}&order=created_at.desc`);
      return res.status(200).json({ success: true, keywords: data });
    }

    if (action === 'check' && req.method === 'GET') {
      const keywords = await db('GET', 'monitored_keywords', null, `?user_id=eq.${encodeURIComponent(user_id)}`);
      if (!keywords?.length) return res.status(200).json({ success: true, new_articles: [] });

      const newArticles = [];
      for (const kw of keywords) {
        const articles = await fetchNews(kw.keyword);
        for (const article of articles) {
          const existing = await db('GET', 'seen_articles', null, `?keyword=eq.${encodeURIComponent(kw.keyword)}&article_url=eq.${encodeURIComponent(article.url)}`);
          if (!existing?.length) {
            await db('POST', 'seen_articles', { keyword: kw.keyword, article_url: article.url, article_title: article.title });
            newArticles.push({ ...article, keyword: kw.keyword });
          }
        }
      }
      return res.status(200).json({ success: true, new_articles: newArticles });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function fetchNews(keyword) {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.contents) return [];
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(data.contents)) !== null) {
      const item = match[1];
      const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/i)?.[1]?.trim() || '';
      const link = item.match(/<link[^>]*>([^<]+)/i)?.[1]?.trim() || '';
      if (title && link) articles.push({ title, url: link });
    }
    return articles.slice(0, 10);
  } catch (e) { return []; }
}
