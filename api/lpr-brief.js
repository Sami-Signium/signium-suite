export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const name = body.name || body.full_name || '';
    const company = body.company || '';
    const role = body.role || 'CEO';
    const email = body.email || '';
    const language = body.language || 'de';
    const context = body.context || '';

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key missing' });
    if (!name) return res.status(400).json({ error: 'name required', received: JSON.stringify(body) });

    const isDE = language === 'de';

    const systemPrompt = isDE
      ? `Du bist Dr. Sami Hamid, Managing Partner bei Signium Austria. Schreibe einen prägnanten, professionellen Akquisitionsbrief (max. 200 Wörter) um den Leadership Performance Radar (LPR) vorzustellen. Der LPR misst wie stark die Führungskultur des CEO durch die Organisation wirkt — auf C-1 und C-2 Ebene. Stil: direkt, keine Floskeln, McKinsey-Niveau. Beginne direkt mit der Anrede. Schließe mit vollständiger Signatur: Dr. Sami Hamid, Managing Partner, Signium Austria, sami.hamid@signium.com, +43 1 2256354 52`
      : `You are Dr. Sami Hamid, Managing Partner at Signium Austria. Write a concise, professional acquisition letter (max. 200 words) introducing the Leadership Performance Radar (LPR). The LPR measures how effectively the CEO's leadership culture flows through the organisation at C-1 and C-2 level. Style: direct, no platitudes, McKinsey level. Start directly with the salutation. Close with full signature: Dr. Sami Hamid, Managing Partner, Signium Austria, sami.hamid@signium.com, +43 1 2256354 52`;

    const userPrompt = isDE
      ? `Schreibe einen LPR-Brief an ${name}, ${role} bei ${company}.${context ? ' Kontext: ' + context : ''}`
      : `Write an LPR letter to ${name}, ${role} at ${company}.${context ? ' Context: ' + context : ''}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await claudeRes.json();
    const brief = data.content?.[0]?.text || '';
    if (!brief) return res.status(500).json({ error: 'No brief generated', claudeResponse: data });

    res.status(200).json({ brief, language });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
