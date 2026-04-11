export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const OTS_KEY = process.env.OTS_KEY;
    const url = `https://www.ots.at/api/?AppID=${OTS_KEY}&Suchbegriff=Vorstand&Anzahl=5&Zeitraum=48&outputFormat=json`;
    
    const r = await fetch(url);
    const text = await r.text();
    
    return res.status(200).json({ 
      status: r.status, 
      ok: r.ok,
      raw: text.substring(0, 2000)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
