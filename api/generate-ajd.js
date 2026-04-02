import Anthropic from '@anthropic-ai/sdk';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, LevelFormat, WidthType } from 'docx';

const NAVY = '0F2E66';
const DARK = '1A1A1A';

function sectionHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, size: 28, font: 'Calibri Light', characterSpacing: 15 })],
    spacing: { after: 120, line: 276, lineRule: 'auto' },
    contextualSpacing: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 4 } }
  });
}

function subheading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: 'Calibri', color: DARK })],
    spacing: { after: 120, before: 200, line: 276, lineRule: 'auto' },
    contextualSpacing: true,
  });
}

function bodyPara(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, font: 'Calibri', color: DARK })],
    spacing: { after: 120, line: 276, lineRule: 'auto' },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function bulletPara(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.replace(/^[•\-– ]+/, ''), size: 24, font: 'Calibri', color: DARK })],
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80, line: 276, lineRule: 'auto' },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function spacer() {
  return new Paragraph({ children: [], spacing: { after: 120 } });
}

function buildDoc(data) {
  const lang = data.language || 'DE';
  const isDE = lang === 'DE';

  const lbl = {
    company:    isDE ? 'DAS UNTERNEHMEN'   : 'THE COMPANY',
    position:   isDE ? 'DIE POSITION'      : 'THE POSITION',
    purpose:    isDE ? 'Positionsbeschreibung' : 'Position Purpose',
    tasks:      isDE ? 'Ihre Aufgaben'     : 'Main Accountabilities',
    reporting:  isDE ? 'BERICHTSLINIE'     : 'REPORTING',
    candidate:  isDE ? 'IHR PROFIL'        : 'YOUR PROFILE',
    brings:     isDE ? 'Sie bringen mit'   : 'Your Profile',
    represented:isDE ? 'vertreten durch SIGNIUM' : 'represented by SIGNIUM',
  };

  const title = data.title || 'Position';
  const words = title.split(' ');
  const mid = Math.ceil(words.length / 2);
  const titleLine1 = words.slice(0, mid).join(' ');
  const titleLine2 = words.slice(mid).join(' ');

  const children = [
    // Header line
    new Paragraph({
      children: [new TextRun({ text: 'Job Description', size: 20, font: 'Calibri', color: '888888' })],
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
      spacing: { after: 600 }
    }),

    // Title
    new Paragraph({
      children: [new TextRun({ text: titleLine1, size: 72, font: 'Calibri Light', color: NAVY, bold: false })],
      alignment: AlignmentType.LEFT,
      spacing: { before: 400, after: 0 }
    }),
    ...(titleLine2 ? [new Paragraph({
      children: [new TextRun({ text: titleLine2, size: 72, font: 'Calibri Light', color: NAVY })],
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 400 }
    })] : []),

    // Represented by
    new Paragraph({
      children: [new TextRun({ text: lbl.represented, size: 24, font: 'Calibri', color: '888888' })],
      alignment: AlignmentType.LEFT,
      spacing: { before: 200, after: 100 }
    }),

    // Date
    new Paragraph({
      children: [new TextRun({ text: data.date || new Date().toLocaleDateString(isDE ? 'de-AT' : 'en-US', { month: 'long', year: 'numeric' }), size: 24, font: 'Calibri', color: '888888' })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400, after: 800 }
    }),

    // ── DAS UNTERNEHMEN ──
    sectionHeading(lbl.company),
    spacer(),
    ...(data.company_text || '').split('\n').filter(p => p.trim()).map(p => bodyPara(p)),
    spacer(),

    // ── DIE POSITION ──
    sectionHeading(lbl.position),
    spacer(),
    subheading(lbl.purpose),
    bodyPara(data.position_intro || ''),
    spacer(),
    subheading(lbl.tasks),
    ...(data.accountabilities || []).filter(a => a.trim()).map(a => bulletPara(a)),
    spacer(),

    // ── BERICHTSLINIE ──
    ...(data.reporting ? [
      sectionHeading(lbl.reporting),
      spacer(),
      bodyPara(data.reporting),
      spacer(),
    ] : []),

    // ── IHR PROFIL ──
    sectionHeading(lbl.candidate),
    spacer(),
    ...(data.profile_intro ? [subheading(lbl.brings)] : []),
    ...(data.profile_bullets || []).filter(b => b.trim()).map(b => bulletPara(b)),
    spacer(),

    // Footer
    new Paragraph({
      children: [new TextRun({ text: 'signium.com', size: 20, font: 'Calibri', color: '888888' })],
      alignment: AlignmentType.RIGHT,
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 4 } },
      spacing: { before: 600 }
    }),
  ];

  return new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 80, line: 276, lineRule: 'auto' } },
            run: { font: 'Calibri', size: 24 }
          }
        }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children
    }]
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { ajdData } = req.body;
    if (!ajdData) return res.status(400).json({ error: 'Missing ajdData' });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const lang = ajdData.language || 'DE';
    const isDE = lang === 'DE';
    const companyName = ajdData.clientCompany || '';

    // ── Web research for company description ─────────────────────────────────
    let companyText = ajdData.company_text || '';

    if (companyName) {
      try {
        const researchRes = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Recherchiere "${companyName}" im Web und schreibe ein ansprechendes Unternehmensprofil in ${isDE ? 'Deutsch' : 'Englisch'} für ein Executive Search Dokument.

Das Profil soll:
- 3-4 Absätze sein
- Marktposition, Kerngeschäft, Produkte/Services beschreiben
- Größe (Mitarbeiter, Umsatz) wenn verfügbar nennen
- Internationale Präsenz und Perspektiven hervorheben
- Den Kandidaten ansprechen und Interesse wecken
- Anonym bleiben: "unser Mandant" statt Firmenname
- Professioneller Executive Search Ton

Antworte NUR mit dem fertigen Text, keine Erklärungen.`
          }]
        });

        const researched = researchRes.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();

        if (researched) companyText = researched;
      } catch (e) {
        console.error('Web research failed:', e.message);
        // Fall back to original text
      }
    }

    // ── Build DOCX ───────────────────────────────────────────────────────────
    const finalData = { ...ajdData, company_text: companyText };
    const doc = buildDoc(finalData);
    const buffer = await Packer.toBuffer(doc);
    const b64 = buffer.toString('base64');
    const title = ajdData.title || 'Position';
    const filename = `AJD_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.docx`;

    return res.status(200).json({ docx: b64, filename });

  } catch (err) {
    console.error('generate-ajd error:', err);
    return res.status(500).json({ error: err.message });
  }
}
