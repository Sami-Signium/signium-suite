import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';

const TEMPLATE_URL = 'https://raw.githubusercontent.com/Sami-Signium/signium-suite/refs/heads/main/template.docx';

function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\u2019/g, '&#x2019;')
    .replace(/\u201c/g, '&#x201C;')
    .replace(/\u201d/g, '&#x201D;')
    .replace(/\u2013/g, '&#x2013;')
    .replace(/\u2014/g, '&#x2014;');
}

function bodyPara(text) {
  return `<w:p>
    <w:pPr>
      <w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/>
      <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      <w:jc w:val="both"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>
        <w:sz w:val="24"/><w:szCs w:val="28"/>
      </w:rPr>
      <w:t xml:space="preserve">${esc(text)}</w:t>
    </w:r>
  </w:p>`;
}

function subheadingPara(text) {
  return `<w:p>
    <w:pPr>
      <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      <w:contextualSpacing/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>
        <w:sz w:val="24"/><w:szCs w:val="22"/>
      </w:rPr>
      <w:t xml:space="preserve">${esc(text)}</w:t>
    </w:r>
  </w:p>`;
}

function bulletPara(text) {
  return `<w:p>
    <w:pPr>
      <w:numPr><w:ilvl w:val="0"/><w:numId w:val="40"/></w:numPr>
      <w:jc w:val="both"/>
      <w:rPr>
        <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>
        <w:sz w:val="24"/><w:szCs w:val="22"/>
      </w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorHAnsi"/>
        <w:sz w:val="24"/><w:szCs w:val="22"/>
      </w:rPr>
      <w:t xml:space="preserve">${esc(text.replace(/^[•\-– ]+/, ''))}</w:t>
    </w:r>
  </w:p>`;
}

function sectionHeading(text) {
  return `<w:p>
    <w:pPr>
      <w:pStyle w:val="berschrift2"/>
      <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      <w:contextualSpacing/>
      <w:rPr>
        <w:b/><w:iCs/>
        <w:color w:val="0F2E66"/>
        <w:spacing w:val="15"/>
        <w:sz w:val="28"/><w:szCs w:val="28"/>
      </w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/><w:iCs/>
        <w:color w:val="0F2E66"/>
        <w:spacing w:val="15"/>
        <w:sz w:val="28"/><w:szCs w:val="28"/>
      </w:rPr>
      <w:t>${esc(text)}</w:t>
    </w:r>
  </w:p>`;
}

function spacer() {
  return `<w:p><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:p>`;
}

function removeParaContaining(xml, marker) {
  const re = new RegExp(`<w:p[ >][^]*?${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?</w:p>`, 'g');
  return xml.replace(re, '');
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

    const lbl = {
      company:    isDE ? 'DAS UNTERNEHMEN' : 'THE COMPANY',
      position:   isDE ? 'DIE POSITION'    : 'THE POSITION',
      purpose:    isDE ? 'Positionsbeschreibung' : 'Position Purpose',
      tasks:      isDE ? 'Ihre Aufgaben'   : 'Main Accountabilities',
      reporting:  isDE ? 'BERICHTSLINIE'   : 'REPORTING',
      candidate:  isDE ? 'IHR PROFIL'      : 'YOUR PROFILE',
      brings:     isDE ? 'Sie bringen mit' : 'Your Profile',
      represented:isDE ? 'vertreten durch SIGNIUM' : 'represented by SIGNIUM',
    };

    // ── Web research ──────────────────────────────────────────────────────────
    let companyText = ajdData.company_text || '';
    if (companyName) {
      try {
        const r = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Recherchiere "${companyName}" und schreibe ein ansprechendes Unternehmensprofil in ${isDE ? 'Deutsch' : 'Englisch'} für ein Executive Search Dokument. 3-4 zusammenhängende Absätze. Anonymisiert: "unser Mandant" statt Firmenname. Marktposition, Größe, Wachstum, Perspektiven hervorheben. Kandidatenorientierter Ton. Antworte NUR mit dem fertigen Text.` }]
        });
        const researched = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (researched) companyText = researched;
      } catch(e) { console.error('Research failed:', e.message); }
    }

    // ── Load template ─────────────────────────────────────────────────────────
    const templateRes = await fetch(TEMPLATE_URL);
    if (!templateRes.ok) throw new Error('Template fetch failed: ' + templateRes.status);
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);
    let xml = await zip.file('word/document.xml').async('string');

    // ── Replace title ─────────────────────────────────────────────────────────
    const title = ajdData.title || 'Position';
    const words = title.split(' ');
    const mid = Math.ceil(words.length / 2);
    xml = xml.replace(/>Director Operational </, `>${esc(words.slice(0,mid).join(' '))}<`);
    xml = xml.replace(/>Excellence</, `>${esc(words.slice(mid).join(' '))}<`);

    // ── Replace date ──────────────────────────────────────────────────────────
    xml = xml.replace(/>October, 2024</, `>${esc(ajdData.date || 'April 2026')}<`);

    // ── Replace "represented by SIGNIUM" ──────────────────────────────────────
    xml = xml.replace(/>represented by SIGNIUM </, `>${esc(lbl.represented)}<`);

    // ── Replace section headings ──────────────────────────────────────────────
    xml = xml.replace(/>THE COMPANY</, `>${lbl.company}<`);
    xml = xml.replace(/>THE POSITION</, `>${lbl.position}<`);
    xml = xml.replace(/>THE CANDIDATE</, `>${lbl.candidate}<`);
    xml = xml.replace(/>Position Purpose</, `>${lbl.purpose}<`);

    // ── Replace company paragraphs ────────────────────────────────────────────
    const companyParas = companyText.split('\n').filter(p => p.trim());
    const old1 = 'A leading provider of flexible packaging solutions, our client is dedicated to innovation, sustainability, and operational excellence, serving diverse industries such as food, pharmaceuticals, and consumer goods. With a strong global presence and a commitment to continuous improvement, the company delivers high-quality, sustainable packaging solutions that meet the changing needs of its customers.';
    const old2 = 'Employing over 9,000 people and generating more than EUR 2 billion in annual sales, the company operates production sites in multiple regions. Its Aluminum division, with production units across Central and Eastern Europe, including facilities in Croatia, the Czech Republic, Poland, Tunisia, and Turkey, contributes over EUR 600 million in sales. ';
    const old3 = "Our client is in the process of acquiring a company active in aluminum-based packaging, integrating its 10 production sites into its Aluminum Division (Consumer Packaging). The acquisition is expected to be finalized by late this year or early next year, pending approval from European competition authorities. This move would expand the Aluminum Division&#x2019;s turnover by approximately EUR 400 million, bringing the total to around EUR 1 billion. The integration aims to enhance operational efficiency, profitability, and growth while retaining key talent and ensuring leadership continuity to support the company&#x2019;s long-term strategic goals.";

    xml = xml.replace(old1, esc(companyParas[0] || ''));
    xml = xml.replace(old2, esc(companyParas[1] || ''));
    xml = xml.replace(old3, esc(companyParas[2] || ''));

    // ── Replace position intro ────────────────────────────────────────────────
    const oldPos = "The &#x201C;Director Operational Excellence Aluminum division&#x201D; will be part of an Operational Expert Pool in the Aluminum division, to facilitate the expected integration of a strategic acquisition into the company&#x2019;s current portfolio of production facilitities. Within the business unit, this role will focus on driving operational excellence, enhancing productivity, transferring technologies, and optimizing costs, with an additional emphasis on improving client coverage and refining the product portfolio. The position holder will play a pivotal role in ensuring a smooth transition, supporting leadership continuity, and delivering on the objectives of the company&#x2019;s expanded operations.";
    xml = xml.replace(oldPos, esc(ajdData.position_intro || ''));

    // ── Replace Main Accountabilities with bullets ────────────────────────────
    const accs = ajdData.accountabilities || [];
    const bulletsBlock = sectionHeading(lbl.tasks) + '\n' +
      accs.filter(a => a.trim()).map(a => bulletPara(a)).join('\n') + '\n' + spacer();

    const maPos = xml.indexOf('>Main Accountabilities<');
    const reportingPos = xml.indexOf('>REPORTING', maPos > 0 ? maPos : 0);
    const candidatePos = xml.indexOf('>THE CANDIDATE<', maPos > 0 ? maPos : 0);
    const endPos = reportingPos > 0 ? reportingPos : candidatePos;

    if (maPos > 0 && endPos > 0) {
      const paraStart = xml.lastIndexOf('<w:p ', maPos);
      const paraBeforeEnd = xml.lastIndexOf('<w:p ', endPos);
      const paraEnd = xml.indexOf('</w:p>', paraBeforeEnd) + '</w:p>'.length;
      xml = xml.slice(0, paraStart) + bulletsBlock + xml.slice(paraEnd);
    }

    // ── Remove REPORTING block ────────────────────────────────────────────────
    const repPos = xml.indexOf('>REPORTING');
    const candPos = xml.indexOf('>THE CANDIDATE<');
    if (repPos > 0 && candPos > repPos) {
      const repParaStart = xml.lastIndexOf('<w:p ', repPos);
      const candParaStart = xml.lastIndexOf('<w:p ', candPos);
      xml = xml.slice(0, repParaStart) + xml.slice(candParaStart);
    }

    // ── Build profile + reporting block ──────────────────────────────────────
    let profileBlock = '';
    if (ajdData.reporting) {
      profileBlock += sectionHeading(lbl.reporting) + '\n';
      profileBlock += bodyPara(ajdData.reporting) + '\n';
      profileBlock += spacer() + '\n';
    }
    if (ajdData.profile_intro) {
      profileBlock += subheadingPara(lbl.brings) + '\n';
    }
    const bullets = ajdData.profile_bullets || [];
    profileBlock += bullets.filter(b => b.trim()).map(b => bulletPara(b)).join('\n') + '\n';
    profileBlock += spacer();

    // ── Replace Professional Skills section ───────────────────────────────────
    const profPos = xml.indexOf('>Professional Skills &amp; Competencies<');
    if (profPos > 0) {
      const sectPrPos = xml.indexOf('<w:sectPr', profPos);
      const endMarker = sectPrPos > 0 ? sectPrPos : xml.indexOf('</w:body>', profPos);
      const profParaStart = xml.lastIndexOf('<w:p ', profPos);
      xml = xml.slice(0, profParaStart) + profileBlock + '\n' + xml.slice(endMarker);
    }

    // ── Final cleanup: remove remaining English template text ─────────────────
    const englishMarkers = [
      'Our client is in the process',
      'The future Director',
      'position base is flexible',
      'REPORTING &amp; INTERNAL',
      'The future '
    ];
    for (const marker of englishMarkers) {
      const pos = xml.indexOf(marker);
      if (pos > 0) {
        const pStart = xml.lastIndexOf('<w:p ', pos);
        const pEnd = xml.indexOf('</w:p>', pos) + '</w:p>'.length;
        if (pStart > 0 && pEnd > pStart) {
          xml = xml.slice(0, pStart) + xml.slice(pEnd);
        }
      }
    }

    // ── Pack and return ───────────────────────────────────────────────────────
    zip.file('word/document.xml', xml);
    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const b64 = docxBuffer.toString('base64');
    const filename = `AJD_${(ajdData.title || 'Position').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.docx`;

    return res.status(200).json({ docx: b64, filename });

  } catch (err) {
    console.error('generate-ajd error:', err);
    return res.status(500).json({ error: err.message });
  }
}
