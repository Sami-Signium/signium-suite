import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { mode, fileBase64, mediaType, notes, mandate, candidates, language, candidateName, anonymizedProfile, candidateFiles } = req.body;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── MODE 1: Analyze JD → LinkedIn criteria + AJD data ────────────────────
    if (mode === 'jd') {
      const userContent = [];
      if (fileBase64 && mediaType) {
        userContent.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } });
      }

      const notesText = notes ? `\n\nNotizen des Beraters:\n${notes}` : '';
      const mandateText = mandate ? `\n\nMandat aus Datenbank:\nPosition: ${mandate.position_title}\nUnternehmen: ${mandate.client_company}\nBeschreibung: ${mandate.position_description}` : '';
      const lang = language || 'DE';
      const isDE = lang === 'DE';

      userContent.push({ type: 'text', text: `Analysiere dieses Jobprofil sorgfältig und erstelle folgende Outputs in ${isDE ? 'Deutsch' : 'Englisch'}:

1. LINKEDIN SUCHKRITERIEN (copy-paste fertig für LinkedIn Recruiter)
2. SCHRITT-FÜR-SCHRITT LINKEDIN ANLEITUNG (dummy-sicher)
3. STRUKTURIERTE DATEN für ein anonymisiertes Jobprofil (AJD) im Signium Executive Search Stil:
   - Positionstitel
   - Unternehmensbeschreibung als kurze Stichworte (wird später durch Web-Recherche ergänzt)
   - Einleitungssatz zur Position (ansprechend, kandidatenorientiert)
   - Aufgaben als Bullet Points (${isDE ? '"Sie..." Formulierung' : '"You will..." format'})
   - Reporting/Berichtslinie als Fließtext (extrahiert aus dem Dokument)
   - Kandidatenprofil als Bullet Points (${isDE ? '"Sie bringen mit..." Formulierung' : '"You bring..." format'})
   - Klientenname (für die Web-Recherche, wird NICHT im AJD angezeigt)
${notesText}${mandateText}

Antworte NUR im JSON Format:
{
  "jobTitles": ["..."],
  "keywords": ["..."],
  "seniority": "...",
  "industries": ["..."],
  "geography": ["..."],
  "yearsExperience": "...",
  "education": "...",
  "linkedinGuide": "Schritt 1:...",
  "ajdData": {
    "title": "...",
    "clientCompany": "...",
    "company_text": "kurze Stichworte zum Unternehmen für Web-Recherche",
    "position_intro": "ansprechender Einleitungssatz zur Position",
    "accountabilities": ["Sie...", "Sie...", "Sie..."],
    "reporting": "Berichtslinie als Fließtext",
    "profile_intro": "kurzer Einleitungssatz zum Kandidatenprofil",
    "profile_bullets": ["...", "...", "..."],
    "date": "${new Date().toLocaleDateString(isDE ? 'de-AT' : 'en-US', {month: 'long', year: 'numeric'})}",
    "language": "${lang}"
  }
}` });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: userContent }]
      });

      const text = response.content[0].text;
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(s, e + 1));
      return res.status(200).json(parsed);
    }

    // ── MODE 2: Screen candidates via PDF ─────────────────────────────────────
    if (mode === 'screen-pdf') {
      const userContent = [];
      userContent.push({ type: 'text', text: `Du bist ein erfahrener Executive Search Berater bei Signium Austria.

MANDAT:
Position: ${mandate.position_title}
Unternehmen: ${mandate.client_company}
Anforderungen: ${mandate.requirements || ''}
Suchkriterien: ${mandate.search_criteria || ''}

Analysiere die beigefügten LinkedIn Profile (PDF) und bewerte jeden Kandidaten gegen das Mandat.` });

      for (const cf of (candidateFiles || [])) {
        userContent.push({ type: 'text', text: `\n=== KANDIDAT: ${cf.name} ===` });
        userContent.push({ type: 'document', source: { type: 'base64', media_type: cf.mediaType || 'application/pdf', data: cf.base64 } });
      }

      userContent.push({ type: 'text', text: `
Für jeden Kandidaten:
- fitScore: 0-100
- strengths: 3 konkrete Stärken bezogen auf das Mandat
- gaps: 2-3 Lücken
- recommendation: "Ja" / "Bedingt" / "Nein"
- summary: 2-3 Sätze

Antworte NUR im JSON Format:
{
  "candidates": [{"name":"...","fitScore":0,"strengths":[],"gaps":[],"recommendation":"...","summary":"..."}],
  "topPick": "...",
  "rankingNote": "..."
}` });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: userContent }]
      });

      const text = response.content[0].text;
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(s, e + 1));
      return res.status(200).json(parsed);
    }

    // ── MODE 3: Screen candidates via text ────────────────────────────────────
    if (mode === 'screen') {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Du bist ein erfahrener Executive Search Berater bei Signium Austria.

MANDAT:
Position: ${mandate.position_title}
Unternehmen: ${mandate.client_company}
Anforderungen: ${mandate.requirements || ''}

KANDIDATEN:
${candidates}

Bewerte jeden Kandidaten. Für jeden:
- fitScore: 0-100
- strengths: 3 Stärken
- gaps: 2-3 Lücken
- recommendation: "Ja" / "Bedingt" / "Nein"
- summary: 2-3 Sätze

Antworte NUR im JSON Format:
{
  "candidates": [{"name":"...","fitScore":0,"strengths":[],"gaps":[],"recommendation":"...","summary":"..."}],
  "topPick": "...",
  "rankingNote": "..."
}`
        }]
      });

      const text = response.content[0].text;
      const clean = text.replace(/```json|```/g, '').trim();
      const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(s, e + 1));
      return res.status(200).json(parsed);
    }

    // ── MODE 4: Outreach mail ─────────────────────────────────────────────────
    if (mode === 'outreach') {
      const lang = language || 'DE';
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Schreibe eine professionelle LinkedIn Outreach-Nachricht von Dr. Sami Hamid, Managing Partner bei Signium Austria.

Kandidat: ${candidateName}
Anonymisiertes Jobprofil: ${anonymizedProfile}
Sprache: ${lang === 'EN' ? 'Englisch' : 'Deutsch'}

Die Nachricht soll:
- Persönlich und direkt sein
- Das anonymisierte Jobprofil kurz und präzise beschreiben ohne den Klienten zu nennen
- Neugier wecken ohne zu viel zu verraten
- Maximal 120 Wörter
- Mit konkretem Call-to-Action enden (kurzes Telefonat)

Nur die fertige Nachricht, keine Erklärungen.`
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
