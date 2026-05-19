module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, message, url, user_id } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });

  try {
    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      url: url || 'https://braincast-v3.vercel.app',
    };

    if (user_id) {
      payload.filters = [{ field: 'tag', key: 'user_id', relation: '=', value: user_id }];
    } else {
      payload.included_segments = ['All'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${process.env.ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.errors) return res.status(400).json({ success: false, errors: data.errors });
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
