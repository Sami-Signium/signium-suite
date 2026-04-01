export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { prompt, type } = req.body;

    const maxTokens = {
      'linkedin': 3000,
      'whitepaper-outline': 1500,
      'whitepaper-full': 6000,
      'newsletter': 4000,
      'press': 2000
    }[type] || 2000;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        system: `Du bist der PR & Communication Assistant von Signium Austria. Du erstellst hochwertige, professionelle Kommunikationsinhalte für einen Managing Partner einer Executive Search Firma (Signium Austria, DACH/CEE Markt). Alle Inhalte müssen substanziell, direkt und glaubwürdig sein. Keine generischen Floskeln. Signium Austria ist Teil von Signium International (40+ Länder weltweit).`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
