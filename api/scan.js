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
      // AT Management DE - ohne Wien-Zwang, österreichische Begriffe
      { q: '(Vorstand OR Geschäftsführer OR Aufsichtsrat OR CEO OR CFO OR CHRO OR COO) AND (Österreich OR Austria OR OMV OR Verbund OR Erste OR Raiffeisen OR Voestalpine OR Telekom OR AMS OR Wien)', language: 'de', label: 'AT' },
      // AT Management EN - internationale Medien berichten auf Englisch
      { q: '(CEO OR CFO OR "chief executive" OR "managing director" OR "board") AND (Austria OR Vienna OR OMV OR Verbund OR Voestalpine OR Raiffeisen OR "Erste Group")', language: 'en', label: 'AT' },
      // AT M&A DE
      { q: '(Fusion OR Übernahme OR Akquisition OR Beteiligung) AND (Österreich OR Austria OR Wien)', language: 'de', label: 'AT' },
      // AT M&A EN
      { q: '(acquisition OR merger OR takeover) AND (Austria OR Vienna OR Austrian)', language: 'en', label: 'AT' },
      // DE Management
      { q: '(Vorstandswechsel OR "neuer Vorstandsvorsitzender" OR "neuer CEO" OR "neuer CFO" OR "neuer CHRO" OR Aufsichtsratsvorsitzender) AND (DAX OR MDAX OR Deutschland OR Germany)', language: 'de', label: 'DE' },
      // DE M&A
      { q: '(Übernahme OR Fusion OR Akquisition) AND (DAX OR MDAX OR Deutschland)', language: 'de', label: 'DE' },
      // CEE Management EN
      { q: '("new CEO" OR "new CFO" OR "appoints CEO" OR "CEO appointed" OR "new managing director") AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia OR Warsaw OR Bucharest OR Budapest OR Prague)', language: 'en', label: 'CEE' },
      // CEE M&A EN
      { q: '(acquisition OR merger OR takeover) AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia)', language: 'en', label: 'CEE' },
    ];

    const allArticles = [];
    for (const q of queries) {
      try {
        const params = new URLSearchParams({
          q: q.q, language: q.language, sortBy: 'publishedAt',
          pageSize: 100, from, apiKey: NEWS_API_KEY
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

    const summaries = unique.slice(0, 150).map((a, i) =>
      `[${i}] [${a.source}] ${a.title}${a.description ? ' | ' + a.description : ''} | URL: ${a.url}`
    ).join('\n');

    const articleMap = {};
    unique.slice(0, 150).forEach((a, i) => { articleMap[i] = a.url; });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        messages: [{ role: 'user', content: `Du bist Analyst bei einer Executive Search Firma in Wien. Extrahiere relevante Business-Events aus diesen Artikeln.

WICHTIG: Jede Firma nur EINMAL aufnehmen — auch wenn mehrere Artikel über dieselbe Firma berichten.

Geografischer Fokus: Österreich, Deutschland, Schweiz, Polen, Rumänien, Ungarn, Tschechien, Slowakei.
Internationale Firmen (USA, UK, Asien etc.) NUR aufnehmen wenn sie explizit DACH/CEE Bezug haben.

Relevante Events — ALLE aufnehmen:
- Führungswechsel: CEO, CFO, COO, CHRO, CSO, Vorstandsvorsitzender, Geschäftsführer, Managing Director
- Aufsichtsrat: Neue Mitglieder, Rücktritte, Vorsitzwechsel
- M&A: Übernahmen, Fusionen, Beteiligungen, Akquisitionen
- Funding: Finanzierungsrunden, Kapitalerhöhungen
- Restrukturierung: Stellenabbau, Umstrukturierung, Insolvenz
- Expansion: Markteintritt DACH/CEE, neue Standorte

Gib NUR ein JSON Array zurück, ohne Markdown, ohne Erklärungen:
[{"article_index": 0, "company":"Firmenname","trigger_type":"CEO-Wechsel","description":"Kurze deutsche Beschreibung max 2 Sätze"}]

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
