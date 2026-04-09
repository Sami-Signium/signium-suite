export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name: _name, full_name, role, company, email, language = 'de', context = '' } = req.body;
    const name = _name || full_name || '';
    if (!name || !company) return res.status(400).json({ error: 'name and company required' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const SERPER_KEY = process.env.SERPER_API_KEY;

    // Step 1: Web search for company + person context
    let searchContext = '';
    if (SERPER_KEY) {
      try {
        const queries = [
          `${company} leadership strategy 2024 2025`,
          `${name} ${company} CEO`,
        ];
        const searchResults = await Promise.all(queries.map(q =>
          fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, num: 3, hl: 'de' })
          }).then(r => r.json()).catch(() => null)
        ));

        const snippets = searchResults
          .filter(Boolean)
          .flatMap(r => (r.organic || []).slice(0, 3).map(s => `${s.title}: ${s.snippet}`))
          .filter(Boolean)
          .slice(0, 6)
          .join('\n');

        if (snippets) searchContext = `\n\nAktuelle Informationen aus dem Web:\n${snippets}`;
      } catch (e) {
        // Search failed, continue without
      }
    }

    // Step 2: Generate letter with Claude
    const isDE = language === 'de';

    const systemPrompt = isDE
      ? `Du bist Dr. Sami Hamid, Managing Partner bei Signium Austria. Du schreibst einen persönlichen, professionellen Akquisitionsbrief an einen CEO oder Führungsverantwortlichen, um den Leadership Performance Radar (LPR) vorzustellen.

Stil: McKinsey-Niveau. Prägnant, keine Floskeln, kein Consulting-Jargon. Direkt und substanziell. Nicht mehr als 250 Wörter im Briefkörper.

Der LPR ist ein Diagnostik-Instrument das misst, wie stark die Führungskultur des CEO durch die Organisation wirkt — auf C-1 und C-2 Ebene. Nicht den CEO selbst, sondern die Transmission seiner Führung. Früherkennung bevor Kennzahlen es zeigen.

Der Brief soll:
1. Mit einer konkreten, situationsbezogenen Beobachtung zum Unternehmen beginnen (kein generisches "Sehr geehrter")
2. Den Leadership Performance Radar (LPR) natürlich einführen
3. Einen konkreten nächsten Schritt vorschlagen (30-minütiges Gespräch)
4. Mit vollständiger Signatur von Dr. Sami Hamid enden

Signatur:
Dr. Sami Hamid
Managing Partner
Signium Austria – Stein & Partner GmbH
sami.hamid@signium.com
+43 1 2256354 52
signium.com`
      : `You are Dr. Sami Hamid, Managing Partner at Signium Austria. You are writing a personal, professional acquisition letter to a CEO or senior executive to introduce the Leadership Performance Radar (LPR).

Style: McKinsey level. Concise, no platitudes, no consulting jargon. Direct and substantive. No more than 250 words in the body.

The LPR is a diagnostic instrument that measures how effectively the CEO's leadership culture flows through the organisation — at C-1 and C-2 level. Not the CEO themselves, but the transmission of their leadership. Early warning before metrics reveal it.

The letter should:
1. Open with a concrete, situation-specific observation about the company (no generic opener)
2. Introduce the Leadership Performance Radar (LPR) naturally
3. Propose a concrete next step (30-minute conversation)
4. Close with full signature from Dr. Sami Hamid

Signature:
Dr. Sami Hamid
Managing Partner
Signium Austria – Stein & Partner GmbH
sami.hamid@signium.com
+43 1 2256354 52
signium.com`;

    const userPrompt = isDE
      ? `Schreibe einen LPR-Akquisitionsbrief an:

Name: ${name}
Rolle: ${role || 'CEO'}
Unternehmen: ${company}
${context ? `Zusätzlicher Kontext: ${context}` : ''}
${searchContext}

Analysiere zuerst kurz intern welche LPR-Situation am besten passt:
- Performance und Potenzial fallen auseinander
- Vor strategischer Transformation
- Nach Führungswechsel  
- Als strategisches Steuerungsinstrument

Dann schreibe den Brief. Beginne direkt mit der Anrede. Kein Betreff, keine Metakommentare.`
      : `Write an LPR acquisition letter to:

Name: ${name}
Role: ${role || 'CEO'}
Company: ${company}
${context ? `Additional context: ${context}` : ''}
${searchContext}

First briefly analyse internally which LPR situation fits best:
- Performance and potential are diverging
- Ahead of strategic transformation
- Following a leadership transition
- As a strategic management instrument

Then write the letter. Begin directly with the salutation. No subject line, no meta-commentary.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const claudeData = await claudeRes.json();
    const brief = claudeData.content?.[0]?.text || '';

    if (!brief) return res.status(500).json({ error: 'No brief generated' });

    res.status(200).json({ brief, language });

  } catch (err) {
    console.error('LPR Brief error:', err);
    res.status(500).json({ error: err.message });
  }
}
