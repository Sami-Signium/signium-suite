export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const OTS_KEY = process.env.OTS_KEY;
  const results = {};

  const queries = [
    { label: 'Personalwechsel', q: 'Vorstand CEO Geschäftsführer Wechsel Ernennung' },
    { label: 'M&A', q: 'Übernahme Fusion Akquisition' },
    { label: 'Aufsichtsrat', q: 'Aufsichtsrat Bestellung Rücktritt' },
  ];

  for (const q of queries) {
    try {
      const url = `https://api.ots.at/v1/search?q=${encodeURIComponent(q.q)}&api_key=${OTS_KEY}&limit=5`;
      const r = await fetch(url);
      const text = await r.text();
      try {
        const d = JSON.parse(text);
        results[q.label] = {
          total: d.total || d.count || (d.items || d.results || d.data || []).length,
          titles: (d.items || d.results || d.data || []).slice(0, 5).map(a => ({
            title: a.title || a.headline || a.name,
            date: a.date || a.published_at || a.created_at,
            url: a.url || a.link
          }))
        };
      } catch(e) {
        results[q.label] = { raw: text.substring(0, 500) };
      }
    } catch(e) {
      results[q.label] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
