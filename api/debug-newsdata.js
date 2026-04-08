export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const WORLD_NEWS_KEY = process.env.WORLDNEWS_KEY;
  const results = {};

  const queries = [
    { label: 'AT Personalwechsel', text: 'Vorstand CEO Geschäftsführer Wechsel', sourceCountry: 'at', language: 'de' },
    { label: 'AT M&A', text: 'Übernahme Fusion Akquisition Österreich', sourceCountry: 'at', language: 'de' },
    { label: 'DE Personalwechsel', text: 'Vorstandswechsel CEO CFO Wechsel Ernennung', sourceCountry: 'de', language: 'de' },
    { label: 'CEE English', text: 'CEO appointed managing director merger acquisition', sourceCountry: 'pl,ro,hu,cz,sk', language: 'en' },
  ];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        'api-key': WORLD_NEWS_KEY,
        text: q.text,
        'source-country': q.sourceCountry,
        language: q.language,
        number: 10,
        sort: 'publish-time',
        'sort-direction': 'DESC'
      });
      const r = await fetch('https://api.worldnewsapi.com/search-news?' + params);
      const d = await r.json();
      results[q.label] = {
        totalFound: d.available,
        titles: (d.news || []).map(a => ({
          title: a.title,
          source: a.source_country,
          url: a.url,
          date: a.publish_date
        }))
      };
    } catch(e) {
      results[q.label] = { error: e.message };
    }
  }

  return res.status(200).json(results);
}
