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
      // AT Management - Wien als Anker
      { q: '(Vorstand OR CEO OR CFO OR Aufsichtsrat) AND Wien', language: 'de', label: 'AT' },
      // AT M&A
      { q: '(Fusion OR Übernahme OR Akquisition) AND Wien', language: 'de', label: 'AT' },
      // DE Management
      { q: '(Vorstandswechsel OR "neuer CEO" OR "neuer CFO") AND (Deutschland OR Berlin OR München OR Frankfurt)', language: 'de', label: 'DE' },
      // DE M&A
      { q: '(Übernahme OR Fusion OR Akquisition) AND (DAX OR MDAX OR Deutschland)', language: 'de', label: 'DE' },
      // CEE Management - streng geografisch
      { q: '("new CEO" OR "new CFO" OR "appoints CEO" OR "CEO appointed") AND (Warsaw OR Bucharest OR Budapest OR Prague OR Bratislava)', language: 'en', label: 'CEE' },
      // CEE M&A - streng geografisch
      { q: '(acquisition OR merger) AND (Warsaw OR Bucharest OR Budapest OR Prague OR Bratislava)', language: 'en', label: 'CEE' },
    ];

    const allArticles = [];
    for (const q of queries) {
      try {
        const params = new URLSearchParams({
          q: q.q, language: q.language, sortBy: 'publishedAt',
          pageSize: 25, from, apiKey: NEWS_API_KEY
        });
        const r = await fetch('https://newsapi.org/v2/everything?' + params);
        const d = await r.json();
        (d.articles || []).forEach(a => allArticles.push({
          title: a.title, description: a.description || '',
          url: a.url, source: q.label
        }));
      } catch(e) {}
    }

    // Deduplizierung nach Titel
    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (!a.title || seen.has(a.title)) return false;
      seen.add(a.title); return true;
    });

    if (!unique.length) return res.status(200).json({ text: '[]', articleCount: 0 });

    const summaries = unique.slice(0, 100).map((a, i) =>
      `[${i}] [${a.source}] ${a.title}${a.description ? ' | ' + a.description : ''} | URL: ${a.url}`
    ).join('\n');

    const articleMap = {};
    unique.slice(0, 100).forEach((a, i) => { articleMap[i] = a.url; });

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
        messages: [{ role: 'user', content: `Du bist Analyst bei einer Executive Search Firma. Extrahiere relevante Business-Events aus diesen Artikeln.

WICHTIG: Jede Firma nur EINMAL aufnehmen — auch wenn mehrere Artikel über dieselbe Firma berichten.
Geografischer Fokus: Österreich, Deutschland, Schweiz, Polen, Rumänien, Ungarn, Tschechien, Slowakei. Internationale Firmen ohne DACH/CEE Bezug IGNORIEREN.

Relevante Events: CEO/CFO/COO/CHRO Wechsel, Vorstandswechsel, Aufsichtsrat, M&A, Funding, Restrukturierung, DACH/CEE Expansion.

Gib NUR ein JSON Array zurück:
[{"article_index": 0, "company":"Firmenname","trigger_type":"CEO-Wechsel","description":"Kurze deutsche Beschreibung"}]

Erlaubte trigger_type Werte: "CEO-Wechsel", "CFO-Wechsel", "CHRO-Wechsel", "COO-Wechsel", "Geschaeftsfuehrer-Wechsel", "Neuer Vorstand", "Aufsichtsrat-Bestellung", "Aufsichtsrat-Ruecktritt", "M&A / Fusion", "Funding", "Restrukturierung", "DACH-Expansion", "Sonstige"

Artikel:\n` + summaries }]
      })
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.find(b => b.type === 'text')?.text || '[]';
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    let items = [];
    try { if (s >= 0 && e > s) items = JSON.parse(raw.substring(s, e + 1)); } catch(err) {}

    // Deduplizierung nach Firma + trigger_type
    const seenCompanies = new Set();
    items = items.filter(it => {
      const key = `${it.company}|${it.trigger_type}`;
      if (!it.company || seenCompanies.has(key)) return false;
      seenCompanies.add(key); return true;
    });

    items = items.map(it => ({
      ...it,
      source_url: (it.article_index !== undefined && articleMap[it.article_index]) ? articleMap[it.article_index] : null
    }));

    return res.status(200).json({ text: JSON.stringify(items), articleCount: unique.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
