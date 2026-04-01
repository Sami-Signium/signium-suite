import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { messages } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `Du bist ein Executive Search Berater bei Signium Austria. Erstelle vertrauliche Kandidatenberichte im exakten Signium-Format.

ABSOLUT VERBOTEN:
- Kein Markdown (keine **, keine ##, keine ---, keine Backticks)
- Keine einleitenden Sätze wie "Hier ist der Bericht..."
- Keine Kommentare oder Erklärungen

PFLICHT-FORMAT für BERUFSERFAHRUNG - EXAKT so, kein anderes Format:

BERUFSERFAHRUNG

[Zeitraum, z.B. "seit 2021" oder "2019 - 2021"]
[FIRMENNAME IN GROSSBUCHSTABEN]
*[Kurze Firmenbeschreibung, 1-2 Sätze, beginnt mit Sternchen]*
[Jobtitel]
- [Verantwortlichkeit]
- [Verantwortlichkeit]

[nächste Position, wieder mit Zeitraum zuerst]

BEISPIEL für eine korrekte Berufserfahrungs-Sektion:

BERUFSERFAHRUNG

seit 2021
SIGNIUM INTERNATIONAL AUSTRIA & ROMANIA
*Signium ist eine der weltweit führenden Executive Search-Partnerschaften mit über 40 Büros in 30 Ländern.*
Managing Partner
- Co-Management der österreichischen und rumänischen Büros
- Aufbau des CEE-Netzwerks

2019 - 2021
KENNEDYFITCH EXECUTIVE SEARCH
*KennedyFitch ist eine spezialisierte Executive Search-Boutique mit Fokus auf Führungskräfte.*
Partner
- Regionale Verantwortung für die CEE-Region

WICHTIG: Der Zeitraum und der Firmenname MÜSSEN als erste zwei Zeilen jeder Position stehen. Niemals die Firmenbeschreibung ohne vorherigen Zeitraum und Firmennamen.

Für alle anderen Abschnitte gelten diese Regeln:
- Abschnittstitel NUR in GROSSBUCHSTABEN
- Persönliche Daten als "Label: Wert" Format
- Karrierezusammenfassung als "[Zeitraum] | [Firma] | [Titel]"
- Leere Abschnitte weglassen`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages
    });

    return res.status(200).json({ text: response.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
