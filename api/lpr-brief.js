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
    const language = body.language || 'de';
    const context = body.context || '';

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key missing' });
    if (!name) return res.status(400).json({ error: 'name required' });

    const isDE = language === 'de';

    const folderUrl = isDE
      ? 'https://signium-suite.vercel.app/lpr-de'
      : 'https://signium-suite.vercel.app/lpr-en';

    const folderSentence = isDE
      ? `Weitere Informationen zum Leadership Performance Radar (LPR) von Signium erhalten Sie unter: ${folderUrl}`
      : `For more information about the Signium Leadership Performance Radar (LPR), please visit: ${folderUrl}`;

    const systemPrompt = isDE
      ? `Du bist Dr. Sami Hamid, Managing Partner bei Signium Austria. Schreibe einen prägnanten, professionellen Akquisitionsbrief (max. 200 Wörter) um den Leadership Performance Radar (LPR) vorzustellen. Der LPR misst wie stark die Führungskultur des CEO durch die Organisation wirkt — auf C-1 und C-2 Ebene. Bevor die Zahlen es zeigen — der LPR.

Füge früh im Brief — nach der Einleitung — folgenden Satz über Signium ein: "Signium ist eine der führenden internationalen Executive Search Beratungen mit über 40 Büros weltweit — und seit 30 Jahren spezialisiert auf Führungskräfte und Boards im DACH und CEE Raum."

Stil: direkt, keine Floskeln, McKinsey-Niveau. NUR Plain Text — absolut keine Markdown-Zeichen wie **, ##, *, Bindestriche als Aufzählungszeichen.

Beginne direkt mit der Anrede. Baue einen klaren Call-to-Action ein: Bitte den Empfänger konkret um ein 30-minütiges Gespräch. Füge dann vor der Signatur folgenden Satz ein:
"${folderSentence}"`
      : `You are Dr. Sami Hamid, Managing Partner at Signium Austria. Write a concise, professional acquisition letter (max. 200 words) introducing the Leadership Performance Radar (LPR). The LPR measures how effectively the CEO's leadership culture flows through the organisation at C-1 and C-2 level. Before the numbers reveal it — the LPR.

Include early in the letter — after the opening — this sentence about Signium: "Signium is one of the leading international executive search firms, with over 40 offices worldwide — and for 30 years specialising in senior leadership and boards across the DACH and CEE region."

Style: direct, no platitudes, McKinsey level. Plain text ONLY — no markdown like **, ##, *, bullet hyphens.

Start directly with the salutation. Include a clear call-to-action: ask the recipient specifically for a 30-minute conversation. Then before the signature include:
"${folderSentence}"`;

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
    let brief = data.content?.[0]?.text || '';
    if (!brief) return res.status(500).json({ error: 'No brief generated' });

    // Strip markdown
    brief = brief
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/^- /gm, '')
      .replace(/^• /gm, '');

    res.status(200).json({ brief, language });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
