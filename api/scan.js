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
      // Management DACH — mit korrekten Umlauten
      {
        q: '(CEO OR CFO OR COO OR CIO OR CHRO OR CSO OR "Vorstandsvorsitzender" OR "Geschäftsführer" OR "Vertriebsvorstand" OR "Aufsichtsrat") AND (Wien OR Österreich OR Austria OR München OR Hamburg OR Zürich)',
        language: 'de', label: 'MGMT-AT'
      },
      // Management Deutschland
      {
        q: '(Vorstandswechsel OR "neuer CEO" OR "neuer CFO" OR "neuer COO" OR "neuer CHRO" OR "neuer Geschäftsführer" OR "neuer Vorstandsvorsitzender" OR "Aufsichtsrat bestellt") AND (Deutschland OR DAX OR MDAX)',
        language: 'de', label: 'MGMT-DE'
      },
      // Management CEE English
      {
        q: '(CEO OR CFO OR COO OR CHRO OR CIO OR "managing director" OR "appointed" OR "named" OR "board member") AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia OR Austria)',
        language: 'en', label: 'MGMT-CEE'
      },
      // M&A DACH
      {
        q: '(Übernahme OR Fusion OR Akquisition OR "M&A" OR merger OR acquisition) AND (Österreich OR Austria OR Deutschland OR Schweiz)',
        language: 'de', label: 'MA-DACH'
      },
      // M&A CEE
      {
        q: '(merger OR acquisition OR takeover OR "strategic partnership") AND (Poland OR Romania OR Hungary OR "Czech Republic" OR Slovakia OR Austria)',
        language: 'en', label: 'MA-CEE'
      },
      // Funding
      {
        q: '(Finanzierung OR Investment OR "Series A" OR "Series B" OR "Venture Capital" OR Investition OR Kapitalerhöhung) AND (Österreich OR Austria OR Deutschland OR CEE)',
        language: 'de', label: 'FUNDING-DE'
      },
      // Funding EN
      {
        q: '(funding OR "venture capital" OR "series A" OR "series B" OR "raised" OR "investment round") AND (Austria OR Germany OR Poland OR Romania OR Hungary OR "Czech Republic")',
        language: 'en', label: 'FUNDING-EN'
      },
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

    const summaries = unique.slice(0, 40).map((a, i) =>
      `[${i}] [${a.source}] ${a.title}${a.description ? ' | ' + a.description : ''} | URL: ${a.url}`
    ).join('\n');

    const articleMap = {};
    unique.slice(0, 40).forEach((a, i) => { articleMap[i] = a.url; });

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
        messages: [{ role: 'user', content: `Extract business events from these news articles for Executive Search in DACH and CEE markets.

Relevant events: management changes (CEO/CFO/COO/CIO/CHRO/CSO/Geschäftsführer appointments or resignations), board appointments/resignations, M&A/mergers/acquisitions, funding rounds, restructuring, expansion.

Return ONLY a valid JSON array, no other text:
[{"article_index": 0, "company":"Company Name","trigger_type":"CEO-Wechsel","description":"Brief description in German"}]

Use ONLY these trigger_type values:
"CEO-Wechsel", "CFO-Wechsel", "COO-Wechsel", "CIO-Wechsel", "CHRO-Wechsel", "CSO-Wechsel", "Geschäftsführer-Wechsel", "Neuer Vorstand", "Aufsichtsrat-Bestellung", "Aufsichtsrat-Rücktritt", "M&A / Fusion", "Funding", "Restrukturierung", "DACH-Expansion", "Sonstige"

News articles:
${summaries}` }]
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
