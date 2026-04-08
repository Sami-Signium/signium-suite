export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const NEWSDATA_KEY = process.env.NEWSDATA_KEY;
  const results = {};

  const queries = [
    { label: 'AT-DE Personalwechsel', q: 'Vorstand CEO Wechsel', language: 'de', country: 'at,de' },
    { label: 'AT-DE M&A', q: 'Übernahme Fusion Österreich Deutschland', language: 'de', country: 'at,de' },
    { label: 'CEE English', q: 'CEO appointed managing director', language: 'en', country: 'pl,ro,hu,cz,sk' },
  ];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        apikey: NEWSDATA_KEY,
        q: q.q,
        language: q.language,
        country: q.country,
        timeframe: '7',
        size: 10
      });
      const r = await fetch('https://newsdata.io/api/1/news?' + params);
      const d = await r.json();
      // Show raw response to diagnose errors
      results[q.label] = d;
    } catch(e) {
      results[q.label] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
