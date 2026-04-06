import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  PageNumber, Header, Footer, TabStopType, TabStopPosition, PageBreak
} from 'docx';

// Signium CI Colors
const NAVY = '081D4D';
const ORANGE = 'FF6A42';
const WHITE = 'FFFFFF';
const LIGHT_GRAY = 'F5F6F8';
const MID_GRAY = 'E8E9EC';
const TEXT_DARK = '1A1A2E';
const TEXT_MUTED = '6B7280';

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// Page width A4 with 2cm margins: 11906 - 2*1134 = 9638 DXA
const PAGE_W = 9638;

function sp(n = 1) {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: n * 80, after: 0 } });
}

function divider(color = NAVY) {
  return new Paragraph({
    children: [new TextRun('')],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color, space: 1 } },
    spacing: { before: 100, after: 100 }
  });
}

function sectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: WHITE, size: 20, font: 'Gill Sans MT' })],
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    spacing: { before: 200, after: 0 },
    indent: { left: 160, right: 160 },
    contextualSpacing: true
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', color: TEXT_DARK, ...opts })],
    spacing: { before: 60, after: 60 },
    indent: { left: 160, right: 160 }
  });
}

function bulletItem(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', color: TEXT_DARK })],
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    indent: { left: 560, right: 160 }
  });
}

function labelValue(label, value) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: 2200 }],
    children: [
      new TextRun({ text: label, bold: true, size: 20, font: 'Calibri', color: NAVY }),
      new TextRun({ text: '\t' }),
      new TextRun({ text: value || '—', size: 20, font: 'Calibri', color: TEXT_DARK })
    ],
    spacing: { before: 60, after: 60 },
    indent: { left: 160, right: 160 }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ajdData } = req.body;
    if (!ajdData) return res.status(400).json({ error: 'ajdData fehlt' });

    const d = ajdData;
    const today = new Date().toLocaleDateString('de-AT', { year: 'numeric', month: 'long', day: 'numeric' });

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{
            level: 0,
            format: 'bullet',
            text: '▪',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 560, hanging: 280 } } }
          }]
        }]
      },
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 20, color: TEXT_DARK } }
        }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: PAGE_W }],
                children: [
                  new TextRun({ text: 'SIGNIUM', bold: true, size: 18, font: 'Gill Sans MT', color: NAVY }),
                  new TextRun({ text: ' | Stein & Partner GmbH', size: 18, font: 'Gill Sans MT', color: TEXT_MUTED }),
                  new TextRun({ text: '\t' }),
                  new TextRun({ text: 'Anonymes Jobprofil', size: 16, font: 'Calibri', color: TEXT_MUTED, italics: true })
                ],
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ORANGE, space: 1 } },
                spacing: { after: 0 }
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: PAGE_W }],
                children: [
                  new TextRun({ text: 'Streng vertraulich — nur für interne Nutzung', size: 16, font: 'Calibri', color: TEXT_MUTED, italics: true }),
                  new TextRun({ text: '\t' }),
                  new TextRun({ text: today, size: 16, font: 'Calibri', color: TEXT_MUTED })
                ],
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: MID_GRAY, space: 1 } },
                spacing: { before: 80 }
              })
            ]
          })
        },
        children: [

          // ── COVER BLOCK ──
          new Paragraph({
            children: [new TextRun({ text: 'ANONYMES JOBPROFIL', bold: true, size: 14, font: 'Gill Sans MT', color: TEXT_MUTED, allCaps: true })],
            spacing: { before: 0, after: 80 }
          }),
          new Paragraph({
            children: [new TextRun({ text: d.ajd.position, bold: true, size: 44, font: 'Petrona', color: NAVY })],
            spacing: { before: 0, after: 120 }
          }),
          divider(ORANGE),
          sp(),

          // ── STECKBRIEF ──
          new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [Math.floor(PAGE_W / 2), Math.ceil(PAGE_W / 2)],
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorders,
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                    margins: { top: 160, bottom: 160, left: 200, right: 200 },
                    width: { size: Math.floor(PAGE_W / 2), type: WidthType.DXA },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'POSITION', size: 14, bold: true, font: 'Gill Sans MT', color: TEXT_MUTED, allCaps: true })], spacing: { after: 40 } }),
                      new Paragraph({ children: [new TextRun({ text: d.ajd.position, size: 22, bold: true, font: 'Calibri', color: NAVY })], spacing: { after: 0 } })
                    ]
                  }),
                  new TableCell({
                    borders: noBorders,
                    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
                    margins: { top: 160, bottom: 160, left: 200, right: 200 },
                    width: { size: Math.ceil(PAGE_W / 2), type: WidthType.DXA },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: 'SEKTOR / STANDORT', size: 14, bold: true, font: 'Gill Sans MT', color: TEXT_MUTED, allCaps: true })], spacing: { after: 40 } }),
                      new Paragraph({ children: [new TextRun({ text: `${d.sector || '—'} | ${d.location || '—'}`, size: 22, bold: true, font: 'Calibri', color: NAVY })], spacing: { after: 0 } })
                    ]
                  })
                ]
              })
            ]
          }),

          sp(2),

          // ── KONTEXT ──
          sectionHeader('Das Unternehmen'),
          sp(0.5),
          bodyText(d.ajd.company_context),
          sp(0.5),
          bodyText(d.ajd.role_context),
          sp(),

          // ── AUFGABEN ──
          sectionHeader('Aufgaben & Verantwortung'),
          sp(0.5),
          ...(d.ajd.responsibilities || []).map(r => bulletItem(r)),
          sp(),

          // ── ANFORDERUNGEN ──
          sectionHeader('Anforderungsprofil'),
          sp(0.5),
          ...(d.ajd.requirements || []).map(r => bulletItem(r)),
          sp(),

          // ── FÜHRUNGSPROFIL ──
          sectionHeader('Führungsprofil & Persönlichkeit'),
          sp(0.5),
          bodyText(d.ajd.leadership_profile),
          sp(),

          // ── ANGEBOT ──
          sectionHeader('Das Angebot'),
          sp(0.5),
          bodyText(d.ajd.offer),
          sp(2),

          // ── KONTAKT ──
          divider(NAVY),
          sp(0.5),
          new Paragraph({
            children: [new TextRun({ text: 'Ihr Ansprechpartner', size: 18, font: 'Gill Sans MT', color: TEXT_MUTED, bold: true })],
            spacing: { after: 60 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Sami Hamid', size: 22, bold: true, font: 'Calibri', color: NAVY })],
            spacing: { after: 20 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Managing Partner | Signium Austria – Stein & Partner GmbH', size: 20, font: 'Calibri', color: TEXT_DARK })],
            spacing: { after: 20 }
          }),
          new Paragraph({
            children: [new TextRun({ text: 'E: s.hamid@signium.com  |  T: +43 1 xxx xxxx  |  signium.com', size: 18, font: 'Calibri', color: TEXT_MUTED, italics: true })],
            spacing: { after: 0 }
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const base64 = buffer.toString('base64');
    const filename = `AJD_${(d.ajd.position || 'Position').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getFullYear()}.docx`;

    return res.status(200).json({ success: true, docx: base64, filename });

  } catch (err) {
    console.error('generate-ajd error:', err);
    return res.status(500).json({ error: err.message });
  }
}
