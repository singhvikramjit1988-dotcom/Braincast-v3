module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, headlines } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const systemPrompt = `You are Braincast AI — a smart, concise news assistant. You help users understand current news and world events.

${headlines ? `Today's top headlines from the user's feed:\n${headlines}` : ''}

Guidelines:
- Be concise but informative (3-5 sentences for most answers)
- Reference specific headlines when relevant
- If asked about something not in the headlines, answer from your knowledge
- Use simple language, no jargon
- Never say "As an AI" or "I cannot"`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const reply = data.content?.[0]?.text || 'No response received.';
    return res.status(200).json({ success: true, reply });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
