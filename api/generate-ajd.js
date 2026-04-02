import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';

const TEMPLATE_URL = 'https://raw.githubusercontent.com/Sami-Signium/signium-suite/refs/heads/main/template.docx';

function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\u2019/g, '&#x2019;')
    .replace(/\u201c/g, '&#x201C;').replace(/\u201d/g, '&#x201D;')
    .replace(/\u2013/g, '&#x2013;').replace(/\u2014/g, '&#x2014;');
}

const NAVY = '0F2E66';

function titlePara(text, size='72') {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="${NAVY}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function metaPara(text, align='left') {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="888888"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function sectionHeading(text) {
  return `<w:p><w:pPr><w:pStyle w:val="berschrift2"/><w:spacing w:before="320" w:after="120" w:line="276" w:lineRule="auto"/><w:contextualSpacing/><w:rPr><w:b/><w:iCs/><w:color w:val="${NAVY}"/><w:spacing w:val="15"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:iCs/><w:color w:val="${NAVY}"/><w:spacing w:val="15"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>`;
}

function subheadingPara(text) {
  return `<w:p><w:pPr><w:spacing w:before="180" w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="1A1A1A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function bodyPara(text) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="160" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="1A1A1A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function bulletPara(text) {
  const clean = text.replace(/^[•\-– ]+/, '').trim();
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="0" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="1A1A1A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(clean)}</w:t></w:r></w:p>`;
}

function spacer() {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr></w:p>`;
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function buildDocumentXml(data, sectPr, numXml) {
  const lang = data.language || 'DE';
  const isDE = lang === 'DE';

  const lbl = {
    company:    isDE ? 'DAS UNTERNEHMEN'      : 'THE COMPANY',
    position:   isDE ? 'DIE POSITION'         : 'THE POSITION',
    purpose:    isDE ? 'Positionsbeschreibung' : 'Position Purpose',
    tasks:      isDE ? 'Ihre Aufgaben'        : 'Main Accountabilities',
    reporting:  isDE ? 'BERICHTSLINIE'        : 'REPORTING',
    candidate:  isDE ? 'IHR PROFIL'           : 'YOUR PROFILE',
    brings:     isDE ? 'Sie bringen mit'      : 'Your Profile',
    represented:isDE ? 'vertreten durch SIGNIUM' : 'represented by SIGNIUM',
  };

  const title = data.title || 'Position';
  const words = title.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');

  const companyParas = (data.company_text || '')
    .split(/\n\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(p => p);

  const parts = [];

  // ── COVER PAGE ──────────────────────────────────────────────────────────────
  parts.push(spacer());
  parts.push(spacer());
  parts.push(spacer());
  parts.push(spacer());
  parts.push(spacer());
  parts.push(titlePara(line1, '72'));
  if (line2) parts.push(titlePara(line2, '72'));
  parts.push(spacer());
  parts.push(metaPara(lbl.represented, 'left'));
  parts.push(metaPara(data.date || 'April 2026', 'right'));
  parts.push(pageBreak());

  // ── DAS UNTERNEHMEN ─────────────────────────────────────────────────────────
  parts.push(sectionHeading(lbl.company));
  companyParas.forEach(p => parts.push(bodyPara(p)));
  parts.push(spacer());

  // ── DIE POSITION ────────────────────────────────────────────────────────────
  parts.push(sectionHeading(lbl.position));
  parts.push(subheadingPara(lbl.purpose));
  if (data.position_intro) parts.push(bodyPara(data.position_intro));
  parts.push(spacer());

  // Ihre Aufgaben
  parts.push(subheadingPara(lbl.tasks));
  (data.accountabilities || []).filter(a => a.trim()).forEach(a => parts.push(bulletPara(a)));
  parts.push(spacer());

  // ── BERICHTSLINIE ───────────────────────────────────────────────────────────
  if (data.reporting) {
    parts.push(sectionHeading(lbl.reporting));
    parts.push(bodyPara(data.reporting));
    parts.push(spacer());
  }

  // ── IHR PROFIL ──────────────────────────────────────────────────────────────
  parts.push(sectionHeading(lbl.candidate));
  if (data.profile_intro) parts.push(subheadingPara(lbl.brings));
  (data.profile_bullets || []).filter(b => b.trim()).forEach(b => parts.push(bulletPara(b)));
  parts.push(spacer());

  const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  mc:Ignorable="w14 w15">
  <w:body>
    ${parts.join('\n    ')}
    ${sectPr}
  </w:body>
</w:document>`;

  return body;
}

function buildNumberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="multilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x2022;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="1"/>
  </w:num>
</w:numbering>`;
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

    // ── Web research ────────────────────────────────────────────────────────
    let companyText = ajdData.company_text || '';
    if (companyName) {
      try {
        const r = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Recherchiere "${companyName}" und schreibe ein ansprechendes Unternehmensprofil in ${isDE ? 'Deutsch' : 'Englisch'} für ein Executive Search Dokument (Anonymous Job Description).

Schreibe GENAU 3 Absätze getrennt durch Leerzeilen:
- Absatz 1: Marktposition, Kerngeschäft, was das Unternehmen macht
- Absatz 2: Größe (Mitarbeiter, Umsatz), internationale Präsenz, Standorte
- Absatz 3: Wachstum, Strategie, warum es ein attraktiver Arbeitgeber ist

Anonymisiert: "unser Mandant" statt Firmenname. Kandidatenorientierter, enthusiastischer Ton.
Antworte NUR mit den 3 Absätzen, keine Erklärungen, keine Überschriften.` }]
        });
        const researched = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (researched) companyText = researched;
      } catch(e) { console.error('Research failed:', e.message); }
    }

    // ── Load Briefpapier template ───────────────────────────────────────────
    const templateRes = await fetch(TEMPLATE_URL);
    if (!templateRes.ok) throw new Error('Template fetch failed: ' + templateRes.status);
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Extract sectPr from template (preserves headers/footers/page setup)
    const docXml = await zip.file('word/document.xml').async('string');
    const sectPrMatch = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    let sectPr = sectPrMatch ? sectPrMatch[0] : '<w:sectPr/>';
    // Override margins: 2.5cm left/right, 2.5cm top, 2cm bottom (standard document margins)
    // 1cm = 567 DXA approx
    sectPr = sectPr.replace(/<w:pgMar[^/]*\/>/,
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="850" w:footer="444" w:gutter="0"/>');

    // ── Build new document XML ──────────────────────────────────────────────
    const finalData = { ...ajdData, company_text: companyText };
    const newDocXml = buildDocumentXml(finalData, sectPr);

    // ── Update zip ──────────────────────────────────────────────────────────
    zip.file('word/document.xml', newDocXml);
    zip.file('word/numbering.xml', buildNumberingXml());

    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const b64 = docxBuffer.toString('base64');
    const filename = `AJD_${(ajdData.title || 'Position').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.docx`;

    return res.status(200).json({ docx: b64, filename });

  } catch (err) {
    console.error('generate-ajd error:', err);
    return res.status(500).json({ error: err.message });
  }
}
