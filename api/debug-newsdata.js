export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const KEY = process.env.WORLDNEWS_KEY;
  const results = {};

  const queries = [
    { label: 'AT Personalwechsel', text: 'Vorstand CEO Geschäftsführer Wechsel', country: 'at', language: 'de' },
    { label: 'AT M&A', text: 'Übernahme Fusion Akquisition', country: 'at', language: 'de' },
    { label: 'DE Personalwechsel', text: 'Vorstandswechsel CEO CFO Wechsel', country: 'de', language: 'de' },
    { label: 'CEE PL', text: 'CEO appointed managing director merger', country: 'pl', language: 'en' },
    { label: 'CEE RO', text: 'CEO appointed managing director merger', country: 'ro', language: 'en' },
  ];

  for (const q of queries) {
    try {
      const url = `https://api.worldnewsapi.com/search-news?api-key=${KEY}&text=${encodeURIComponent(q.text)}&source-country=${q.country}&language=${q.language}&number=5&sort=publish-time&sort-direction=DESC`;
      const r = await fetch(url);
      const d = await r.json();
      results[q.label] = {
        total: d.available,
        titles: (d.news || []).map(a => ({ title: a.title, date: a.publish_date, url: a.url }))
      };
    } catch(e) {
      results[q.label] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
