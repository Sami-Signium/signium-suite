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

    // Inject strict format instructions into the system prompt
    const systemPrompt = `Du bist ein erfahrener Executive Search Berater bei Signium Austria und erstellst vertrauliche Kandidatenberichte im exakten Signium-Format.

WICHTIGE FORMAT-REGELN:
- Kein Markdown (keine **, keine ##, keine ---)
- Abschnittstitel NUR in GROSSBUCHSTABEN, allein auf einer Zeile
- Leere Abschnitte komplett weglassen

PFLICHT-STRUKTUR des Berichts:

PERSOENLICHE ANGABEN
Name: [Vollständiger Name]
Geburtsdatum: [Jahr oder Datum]
Wohnort: [Stadt, Land]
Nationalität: [Nationalität]
Sprachen: [Sprache 1 (Niveau), Sprache 2 (Niveau), ...]
Familienstand: [Status]

AUSBILDUNG UND QUALIFIKATIONEN
[Jahr]: [Abschluss], [Institution]
[Jahr]: [Abschluss], [Institution]

VERGUETUNG UND VERFUEGBARKEIT
Aktuelles Fixgehalt: [Betrag]
Variable Vergütung: [Betrag oder %]
Kündigungsfrist: [Dauer]

KARRIERE ZUSAMMENFASSUNG
[Zeitraum] | [Unternehmen] | [Titel]
[Zeitraum] | [Unternehmen] | [Titel]

KANDIDATENBEWERTUNG

FACHLICHES RESUEMEE
[3-4 Absätze Fließtext aus Berater-Perspektive]

BEWERTUNG
[2-3 Absätze über Persönlichkeit und Führungsstil]

BERUFSERFAHRUNG
[WICHTIG: Für jede Position EXAKT dieses Format verwenden:]

[Zeitraum z.B. "seit 2021" oder "2019-2021"]
[Firmenname]
*[Kurze Firmenbeschreibung in Kursiv, 1-2 Sätze]*
[Jobtitel]
- [Hauptverantwortlichkeit 1]
- [Hauptverantwortlichkeit 2]
- [Hauptverantwortlichkeit 3]

[Nächste Position folgt mit Leerzeile]`;

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
