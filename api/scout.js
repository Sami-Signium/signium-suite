import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { mode, fileBase64, mediaType, notes, mandate, candidates, language } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── MODE 1: Extract JD + generate LinkedIn criteria ──────────────────────
    if (mode === 'jd') {
      const messages = [];

      // Build user message with optional file
      const userContent = [];

      if (fileBase64 && mediaType) {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: mediaType, data: fileBase64 }
        });
      }

      const notesText = notes ? `\n\nPersönliche Notizen des Beraters:\n${notes}` : '';
      const mandateText = mandate ? `\n\nBereits vorhandenes Mandat aus Datenbank:\nPosition: ${mandate.position_title}\nUnternehmen: ${mandate.client_company}\nBeschreibung: ${mandate.position_description}\nSuchfelder: ${mandate.search_criteria}` : '';

      userContent.push({
        type: 'text',
        text: `Analysiere dieses Jobprofil und erstelle:

1. LINKEDIN SUCHKRITERIEN (copy-paste fertig für LinkedIn Recruiter):
   - Job Titles (3-5 Varianten)
   - Keywords (10-15 relevante Begriffe)
   - Seniority Level
   - Industries (3-5)
   - Geography
   - Years of Experience
   - Education

2. SCHRITT-FÜR-SCHRITT LINKEDIN ANLEITUNG (dummy-sicher, auf Basis der Suchkriterien):
   Erkläre genau wo man jeden Suchbegriff eingibt.

3. ANONYMISIERTES JOBPROFIL (für Outreach-Mails, ohne Firmenname):
   Kurze Beschreibung der Position ohne den Klienten zu nennen.

Sprache: ${language === 'EN' ? 'Englisch' : 'Deutsch'}
${notesText}
${mandateText}

Antworte im JSON Format:
{
  "jobTitles": ["..."],
  "keywords": ["..."],
  "seniority": "...",
  "industries": ["..."],
  "geography": ["..."],
  "yearsExperience": "...",
  "education": "...",
  "linkedinGuide": "...",
  "anonymizedProfile": "..."
}`
      });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userContent }]
      });

      const text = response.content[0].text;
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(s, e + 1));
      return res.status(200).json(parsed);
    }

    // ── MODE 2: Screen candidates against mandate ─────────────────────────────
    if (mode === 'screen') {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Du bist ein erfahrener Executive Search Berater bei Signium Austria.

MANDAT:
Position: ${mandate.position_title}
Unternehmen: ${mandate.client_company}
Anforderungen: ${mandate.requirements || ''}
Suchkriterien: ${mandate.search_criteria || ''}

KANDIDATEN ZU BEWERTEN:
${candidates}

Bewerte jeden Kandidaten und erstelle ein Ranking. Für jeden Kandidaten:
- Fit-Score (0-100)
- Stärken (3 Punkte)
- Lücken (2-3 Punkte)
- Empfehlung (Ja / Bedingt / Nein)
- Kurzbegründung (2-3 Sätze)

Antworte im JSON Format:
{
  "candidates": [
    {
      "name": "...",
      "fitScore": 85,
      "strengths": ["...", "...", "..."],
      "gaps": ["...", "..."],
      "recommendation": "Ja",
      "summary": "..."
    }
  ],
  "topPick": "Name des besten Kandidaten",
  "rankingNote": "Kurze Gesamteinschätzung"
}`
        }]
      });

      const text = response.content[0].text;
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(s, e + 1));
      return res.status(200).json(parsed);
    }

    // ── MODE 3: Generate outreach mail ────────────────────────────────────────
    if (mode === 'outreach') {
      const { candidateName, anonymizedProfile, language: lang } = req.body;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Schreibe eine professionelle LinkedIn Outreach-Nachricht von Sami Hamid, Managing Partner bei Signium Austria.

Kandidat: ${candidateName}
Anonymisiertes Jobprofil: ${anonymizedProfile}
Sprache: ${lang === 'EN' ? 'Englisch' : 'Deutsch'}

Die Nachricht soll:
- Persönlich und direkt sein (kein generisches "Ich habe Ihr Profil gesehen")
- Das anonymisierte Jobprofil kurz beschreiben ohne den Klienten zu nennen
- Neugier wecken
- Maximal 150 Wörter
- Mit konkretem Call-to-Action enden

Nur die Nachricht, keine Erklärungen.`
        }]
      });

      return res.status(200).json({ text: response.content[0].text });
    }

    return res.status(400).json({ error: 'Unknown mode' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
