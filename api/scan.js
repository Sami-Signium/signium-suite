export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const NEWS_API_KEY = process.env.NEWSAPI_KEY;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    const from = fromDate.toISOString().split('T')[0];

    const queries = [
      { q: '(Vorstand OR Geschaeftsfuehrer OR Aufsichtsrat OR CEO OR CFO) AND (Wien OR Oesterreich OR Austria)', language: 'de', label: 'AT' },
      { q: '(Vorstandswechsel OR "neuer Vorstandsvorsitzender" OR "neuer Geschaeftsfuehrer") AND (DAX OR MDAX OR Deutschland)', language: 'de', label: 'DE' },
      { q: '(CEO OR CFO OR "managing director" OR merger OR acquisition) AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia)', language: 'en', label: 'CEE' },
    ];

    const allArticles = [];
    for (const q of queries) {
      try {
        const params = new URLSearchParams({
          q: q.q, language: q.language, sortBy: 'publishedAt',
          pageSize: 20, from, apiKey: NEWS_API_KEY
        });
        const r = await fetch('https://newsapi.org/v2/everything?' + params);
        const d = await r.json();
        (d.articles || []).forEach(a => allArticles.push({
          title: a.title, description: a.description || '',
          url: a.url, source: q.label
        }));
      } catch(e) {}
    }

    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (!a.title || seen.has(a.title)) return false;
      seen.add(a.title); return true;
    });

    if (!unique.length) return res.status(200).json({ text: '[]' });

    const summaries = unique.slice(0, 50).map((a, i) =>
      `[${i}] [${a.source}] ${a.title}${a.description ? ' | ' + a.description : ''} | URL: ${a.url}`
    ).join('\n');

    const articleMap = {};
    unique.slice(0, 50).forEach((a, i) => { articleMap[i] = a.url; });

    const prompt = `Du bist ein Analyst für Executive Search in DACH und CEE. Analysiere die folgenden Nachrichtenartikel und extrahiere ALLE relevanten Business-Ereignisse.

WICHTIG: Extrahiere JEDEN Artikel der eines der folgenden Ereignisse enthält — auch wenn du dir nicht 100% sicher bist:

MANAGEMENT-EREIGNISSE (höchste Priorität):
- Neue CEO, CFO, COO, CIO, CHRO, CSO, CDO Ernennung oder Abgang
- Neuer Geschäftsführer, Vorstandsvorsitzender, Generaldirektor
- Neues Vorstandsmitglied, Aufsichtsratsmitglied
- Führungswechsel, Nachfolge, Rücktritt von Führungskräften
- "übernimmt", "wird", "ernannt", "berufen", "tritt zurück", "verlässt"

FUNDING-EREIGNISSE:
- Finanzierungsrunden (Series A, B, C etc.)
- Venture Capital, Private Equity Investments
- Kapitalerhöhung, Investitionsrunde
- "erhält", "sichert", "Millionen", "Investition", "Finanzierung"

M&A EREIGNISSE:
- Fusionen, Übernahmen, Akquisitionen
- "übernimmt", "fusioniert", "kauft", "merger", "acquisition"

EXPANSION / RESTRUKTURIERUNG:
- Neue Standorte, Markteintritte
- Stellenabbau, Umstrukturierung

Antworte NUR mit einem validen JSON Array — kein Text davor oder danach:
[{"article_index": 0, "company": "Firmenname", "trigger_type": "CEO-Wechsel", "description": "Kurze Beschreibung auf Deutsch"}]

Erlaubte trigger_type Werte:
"CEO-Wechsel", "CFO-Wechsel", "COO-Wechsel", "CIO-Wechsel", "CHRO-Wechsel", "CSO-Wechsel", "Geschäftsführer-Wechsel", "Neuer Vorstand", "Aufsichtsrat-Bestellung", "Aufsichtsrat-Rücktritt", "M&A / Fusion", "Funding", "Restrukturierung", "DACH-Expansion", "Sonstige"

Artikel:
${summaries}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.find(b => b.type === 'text')?.text || '[]';
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    let items = [];
    try { if (s >= 0 && e > s) items = JSON.parse(raw.substring(s, e + 1)); } catch(err) {}

    items = items.map(it => ({
      ...it,
      source_url: (it.article_index !== undefined && articleMap[it.article_index]) ? articleMap[it.article_index] : null
    }));

    return res.status(200).json({ text: JSON.stringify(items), articleCount: unique.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
