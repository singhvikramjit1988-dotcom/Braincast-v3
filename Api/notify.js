// api/notify.js
// Sends push notifications via OneSignal
// POST /api/notify — send a notification to all subscribers or specific user

const ONESIGNAL_APP_ID  = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, message, url, user_id } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required' });
  }

  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      url: url || 'https://braincast-v3.vercel.app',
      chrome_web_icon: 'https://braincast-v3.vercel.app/icon.png',
    };

    // Send to specific user or all subscribers
    if (user_id) {
      payload.filters = [{ field: 'tag', key: 'user_id', relation: '=', value: user_id }];
    } else {
      payload.included_segments = ['All'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.errors) {
      return res.status(400).json({ success: false, errors: data.errors });
    }

    return res.status(200).json({ success: true, id: data.id, recipients: data.recipients });

  } catch (err) {
    console.error('Notify error:', err);
    return res.status(500).json({ error: err.message });
  }
}
