import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { mode, fileBase64, mediaType, notes, candidates, language } = req.body;
  const lang = language || 'DE';

  try {
    // ── MODE 1: JD-ANALYSE → LinkedIn-Kriterien + anonymisiertes Jobprofil ──
    if (mode === 'jd') {
      const userContent = [];

      if (fileBase64 && mediaType) {
        if (mediaType === 'application/pdf') {
          userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
        } else {
          // Word doc: just include as document
          userContent.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } });
        }
      }

      const notesText = notes ? `\n\nZusätzliche Berater-Notizen:\n${notes}` : '';

      userContent.push({
        type: 'text',
        text: `Analysiere das hochgeladene Jobprofil / Briefing-Dokument.${notesText}

Gib mir deine Antwort als valides JSON mit exakt dieser Struktur:

{
  "position": "Jobtitel",
  "company_description": "anonymisierte Unternehmensbeschreibung (kein Firmenname, nur Branche/Größe/Kontext)",
  "sector": "Branche",
  "location": "Standort/Region",
  "languages_required": ["Deutsch", "Englisch"],
  
  "linkedin_criteria": {
    "job_titles": ["Titel 1", "Titel 2", "Titel 3"],
    "keywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
    "seniority": ["Director", "VP", "C-Level"],
    "years_experience": "10+",
    "industries": ["Branche 1", "Branche 2"],
    "geography": ["Austria", "Germany", "Switzerland"],
    "education": "Master's Degree"
  },
  
  "linkedin_instructions": [
    "Schritt 1: Gehe auf linkedin.com/talent und melde dich an",
    "Schritt 2: Klicke oben auf 'Projekte' → 'Neues Projekt erstellen' → Projektname eingeben (z.B. '[Position] – [Kürzel Firma]') → 'Projekt erstellen'",
    "Schritt 3: Klicke im Projekt auf 'Talentsuche' (oder 'Find Candidates')",
    "Schritt 4: Im Feld 'Berufsbezeichnung' gib ein: [konkreter Titel aus job_titles] → Enter",
    "Schritt 5: Klicke auf '+ Filter hinzufügen' → Seitenleiste öffnet sich",
    "Schritt 6: Unter 'Keywords' gib ein: [konkrete Keywords aus linkedin_criteria] – jedes Wort einzeln bestätigen mit Enter",
    "Schritt 7: Unter 'Standort' wähle: [konkrete Länder aus geography]",
    "Schritt 8: Unter 'Branche' wähle: [konkrete Branchen aus industries]",
    "Schritt 9: Unter 'Berufserfahrung' wähle: [years_experience]",
    "Schritt 10: Klicke auf 'Suche anwenden'",
    "Schritt 11: Gefällt dir ein Profil → klicke auf den Namen → 'In Projekt speichern'"
  ],
  
  "ajd": {
    "position": "Jobtitel",
    "company_context": "Unternehmen ist ein führender Anbieter von [Branche] mit [X] Mitarbeitern und einem Umsatz von [EUR X Mio.]. [2-3 Sätze strategischer Kontext, kein Firmenname]",
    "role_context": "Im Rahmen von [Wachstum/Nachfolge/Transformation] sucht unser Klient eine erfahrene Führungspersönlichkeit für die Position [Titel].",
    "responsibilities": [
      "Verantwortungsbereich 1",
      "Verantwortungsbereich 2",
      "Verantwortungsbereich 3",
      "Verantwortungsbereich 4",
      "Verantwortungsbereich 5"
    ],
    "requirements": [
      "Anforderung 1",
      "Anforderung 2",
      "Anforderung 3",
      "Anforderung 4",
      "Anforderung 5"
    ],
    "leadership_profile": "Beschreibung des idealen Führungsprofils (Persönlichkeit, Führungsstil, kultureller Fit) in 2-3 Sätzen.",
    "offer": "Attraktives Vergütungspaket bestehend aus fixem Grundgehalt und variablen Komponenten, angepasst an die Senioritätsstufe. Vollständige Managementverantwortung in einem internationalen Umfeld."
  }
}

Wichtig beim AJD: KEIN Firmenname, keine identifizierenden Details. Der Text soll professionell und ansprechend für Top-Kandidaten sein.`
      });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: userContent }]
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Kein JSON in der Antwort');
      const data = JSON.parse(jsonMatch[0]);

      return res.status(200).json({ success: true, data });
    }

    // ── MODE 2: KANDIDATEN-SCREENING ──
    if (mode === 'screen') {
      const { mandate, candidates } = req.body;
      if (!candidates || candidates.length === 0) return res.status(400).json({ error: 'Keine Kandidaten übergeben' });

      const screeningPrompt = `Du bist ein erfahrener Executive Search Berater bei Signium Austria.

Suchprofil / Mandat:
${mandate}

Bewerte die folgenden Kandidaten-Profile nach ihrem Fit für dieses Mandat.

Kandidaten:
${candidates.map((c, i) => `--- Kandidat ${i + 1}: ${c.name || 'Anonym'} ---\n${c.text}`).join('\n\n')}

Gib deine Antwort als JSON:
{
  "candidates": [
    {
      "name": "Name oder 'Kandidat 1'",
      "fit_score": 85,
      "fit_label": "Sehr guter Fit",
      "strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
      "gaps": ["Lücke 1", "Lücke 2"],
      "recommendation": "Kurze Empfehlung in 2 Sätzen",
      "inmail_de": "Persönlicher InMail-Text auf Deutsch (3-4 Sätze, mit Namen, aktueller Position, warum sie passen)",
      "inmail_en": "Personalized InMail text in English (3-4 sentences)"
    }
  ],
  "ranking_summary": "Kurzes Gesamtfazit mit Top-Empfehlung"
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: screeningPrompt }]
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Kein JSON in der Antwort');
      const data = JSON.parse(jsonMatch[0]);

      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'Unbekannter mode' });

  } catch (err) {
    console.error('SCOUT error:', err);
    return res.status(500).json({ error: err.message });
  }
}
