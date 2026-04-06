import Anthropic from '@anthropic-ai/sdk';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY});
  const{mode,fileBase64,mediaType,notes,mandate,candidates}=req.body;

  try{
    // ── MODE 1: JD ANALYSE ──
    if(mode==='jd'){
      const userContent=[];
      if(fileBase64&&mediaType){
        userContent.push({type:'document',source:{type:'base64',media_type:mediaType,data:fileBase64}});
      }
      userContent.push({type:'text',text:`Analysiere das hochgeladene Jobprofil/Briefing-Dokument.${notes?'\n\nZusätzliche Berater-Notizen:\n'+notes:''}

Antworte NUR mit einem validen JSON-Objekt, kein Markdown, keine Erklärungen.

{
  "position": "Jobtitel",
  "sector": "Branche",
  "location": "Standort",

  "linkedin_criteria": {
    "job_titles": ["Titel 1", "Titel 2", "Titel 3"],
    "keywords": ["Keyword 1", "Keyword 2", "Keyword 3", "Keyword 4", "Keyword 5"],
    "seniority": ["Director", "VP"],
    "years_experience": "10+",
    "industries": ["Branche 1", "Branche 2"],
    "geography": ["Austria", "Germany", "Switzerland"],
    "education": "Master's Degree"
  },

  "linkedin_instructions": [
    "Schritt 1: Gehe auf linkedin.com/talent und melde dich an",
    "Schritt 2: Klicke oben auf 'Projekte' → 'Neues Projekt erstellen' → Projektname eingeben (z.B. '[Position] – [Kürzel Firma]') → 'Projekt erstellen'",
    "Schritt 3: Klicke im Projekt auf 'Talentsuche'",
    "Schritt 4: Im Feld 'Berufsbezeichnung' gib ein: [konkreter Titel] → Enter",
    "Schritt 5: Klicke auf '+ Filter hinzufügen'",
    "Schritt 6: Unter 'Keywords' gib ein: [konkrete Keywords] – jedes Wort einzeln bestätigen",
    "Schritt 7: Unter 'Standort' wähle: [konkrete Länder]",
    "Schritt 8: Unter 'Branche' wähle: [konkrete Branchen]",
    "Schritt 9: Unter 'Berufserfahrung' wähle: [years_experience]",
    "Schritt 10: Klicke auf 'Suche anwenden'",
    "Schritt 11: Gefällt dir ein Profil → klicke auf den Namen → 'In Projekt speichern'"
  ],

  "ajd": {
    "position": "Jobtitel",
    "company_context": "FLIESSTEXT: 2-3 Sätze über das Unternehmen — kein Firmenname, nur Branche/Größe/Kontext/Marktposition. Professionell und ansprechend formuliert.",
    "role_context": "FLIESSTEXT: 2 Sätze über den Kontext der Suche (Wachstum/Nachfolge/Transformation) und die Einbettung der Rolle.",
    "responsibilities_text": "FLIESSTEXT: 1 zusammenhängender Absatz (4-6 Sätze) der alle Hauptaufgaben und Verantwortlichkeiten beschreibt. Kein Stichwortliste, kein Bullet-Format — vollständige Sätze die den Scope der Rolle vermitteln.",
    "requirements_text": "FLIESSTEXT: 1 zusammenhängender Absatz (4-6 Sätze) der Ausbildung, Erfahrung, fachliche Kenntnisse und Soft Skills beschreibt. Kein Stichwortliste — vollständige Sätze.",
    "leadership_profile": "FLIESSTEXT: 2-3 Sätze über das ideale Führungsprofil, Persönlichkeit, Führungsstil.",
    "offer": "FLIESSTEXT: 2-3 Sätze über das Vergütungspaket und die Attraktivität der Rolle."
  }
}`});

      const response=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:3000,messages:[{role:'user',content:userContent}]});
      const text=response.content[0].text;
      const jsonMatch=text.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error('Kein JSON in der Antwort');
      const data=JSON.parse(jsonMatch[0]);
      return res.status(200).json({success:true,data});
    }

    // ── MODE 2: KANDIDATEN SCREENING ──
    if(mode==='screen'){
      const{mandate,candidates}=req.body;
      if(!candidates||candidates.length===0) return res.status(400).json({error:'Keine Kandidaten'});

      const userContent=[];
      userContent.push({type:'text',text:`Du bist Senior Executive Search Berater bei Signium Austria.

Suchprofil:
${mandate}

Bewerte die folgenden Kandidaten-Profile. Für jeden Kandidaten mit PDF-Upload analysiere das Dokument inhaltlich.

${candidates.map((c,i)=>`--- Kandidat ${i+1}: ${c.name||'Anonym'} ---\n${c.text||'(PDF hochgeladen)'}`).join('\n\n')}

Antworte NUR mit JSON:
{
  "candidates": [
    {
      "name": "Name",
      "fit_score": 85,
      "fit_label": "Sehr guter Fit",
      "strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
      "gaps": ["Lücke 1", "Lücke 2"],
      "recommendation": "2 Sätze Empfehlung",
      "inmail_de": "Persönlicher InMail-Text DE (3-4 Sätze)",
      "inmail_en": "Personalized InMail text EN (3-4 sentences)"
    }
  ],
  "ranking_summary": "Gesamtfazit 2-3 Sätze"
}`});

      // Add PDF documents for candidates
      candidates.forEach((c,i)=>{
        if(c.fileBase64&&c.mediaType){
          userContent.push({type:'document',source:{type:'base64',media_type:c.mediaType,data:c.fileBase64}});
        }
      });

      const response=await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:userContent}]});
      const text=response.content[0].text;
      const jsonMatch=text.match(/\{[\s\S]*\}/);
      if(!jsonMatch) throw new Error('Kein JSON');
      const data=JSON.parse(jsonMatch[0]);
      return res.status(200).json({success:true,data});
    }

    return res.status(400).json({error:'Unbekannter mode'});
  }catch(err){
    console.error('SCOUT error:',err);
    return res.status(500).json({error:err.message});
  }
}
