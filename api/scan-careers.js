// api/scan-careers.js - v3 debug
// PAUL Career Scanner — mit Workday API + HTML Fallback
// Vercel Hobby Plan: 1 von max. 12 Functions

const SUPABASE_URL         = 'https://ftdxhswcnghlmcagrsox.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL         = 'claude-haiku-4-5-20251001';

const WORKDAY_TENANTS = {
  'agrana':         { tenant: 'agrana',     site: 'Careers' },
  'kapsch':         { tenant: 'kapsch',     site: 'onestepahead_kapsch' },
  'fronius':        { tenant: 'fronius',    site: 'Job_Board' },
  'andritz':        { tenant: 'andritz',    site: 'ANDRITZ_Careers' },
  'borealis':       { tenant: 'borealis',   site: 'Borealis' },
  'omv':            { tenant: 'omv',        site: 'OMV_Careers' },
  'voestalpine':    { tenant: 'voestalpine',site: 'voestalpine' },
  'verbund':        { tenant: 'verbund',    site: 'Verbund' },
  'lenzing':        { tenant: 'lenzing',    site: 'Lenzing' },
  'palfinger':      { tenant: 'palfinger',  site: 'Palfinger' },
  'zumtobel':       { tenant: 'zumtobel',   site: 'Zumtobel' },
  'wienerberger':   { tenant: 'wienerberger',site: 'Wienerberger' },
  'rosenbauer':     { tenant: 'rosenbauer', site: 'Rosenbauer' },
  'frequentis':     { tenant: 'frequentis', site: 'Frequentis' },
  'blum':           { tenant: 'blum',       site: 'Blum' },
  'alpla':          { tenant: 'alpla',      site: 'ALPLA' },
  'bwt':            { tenant: 'bwt',        site: 'BWT' },
  'engel':          { tenant: 'engelglobal',site: 'Engel' },
  'doka':           { tenant: 'doka',       site: 'Doka' },
  'greiner':        { tenant: 'greiner',    site: 'Greiner' },
};

async function sbSelect(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }
  });
  if (!r.ok) throw new Error(`Supabase SELECT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase INSERT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbUpsert(table, body, onConflict) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbUpdate(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase UPDATE ${table}: ${await r.text()}`);
  return r.json();
}

const LEADERSHIP_PROMPT = `Du bist ein Executive Search Spezialist. Analysiere die Liste von Stellentiteln und extrahiere NUR Leitungspositionen mit einem geschaetzten Jahresgehalt ueber EUR 125.000.

EINSCHLIESSEN:
- C-Level: CEO, CFO, COO, CTO, CHRO, CMO, CDO, CRO, CPO, CIO, CSO
- Geschaeftsfuehrer/in, Managing Director, Generaldirektor, Vorstand
- Bereichsleiter/in, Division Head, Head of [Bereich]
- Abteilungsleiter/in (nur bei grossen Unternehmen / strategischen Abteilungen)
- Country Manager, Regional Director, Market Lead
- Vice President, Senior Vice President
- General Counsel, Head of Strategy, Head of M&A

AUSSCHLIESSEN:
- Team Lead / Gruppenleiter (operative Ebene)
- Sachbearbeiter, Specialist, Analyst, Coordinator
- Junior, Trainee, Werkstudent, Praktikant
- Techniker, Meister, Fachkraft (ohne Leitungsfunktion)

Antworte AUSSCHLIESSLICH mit einem JSON-Array. Kein Text davor oder danach. Keine Erklaerung. Keine Markdown-Formatierung.
Format:
[{"title":"Positionstitel","department":"Bereich oder null","level":"C-Level|Geschaeftsfuehrung|Bereichsleitung|Abteilungsleitung|Sonstige Leitungsfunktion","job_url":"URL oder null"}]

Wenn keine passenden Positionen gefunden: antworte mit []`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { action } = req.query;
  try {
    if (action === 'upload-targets') return await uploadTargets(req, res);
    if (action === 'scan-one')       return await scanOneCompany(req, res);
    if (action === 'scan-all')       return await scanAllCompanies(req, res);
    if (action === 'get-vacancies')  return await getVacancies(req, res);
    if (action === 'get-targets')    return await getTargets(req, res);
    if (action === 'get-stats')      return await getStats(req, res);
    if (action === 'mark-outreach')  return await markOutreach(req, res);
    if (action === 'generate-mail')  return await generateOutreachMail(req, res);
    if (action === 'update-workday') return await updateWorkdayTenant(req, res);
    return res.status(400).json({ error: 'Unbekannte action' });
  } catch (err) {
    console.error('[scan-careers]', err);
    return res.status(500).json({ error: err.message });
  }
}

function detectWorkdayTenant(companyName, careerUrl) {
  const name = companyName.toLowerCase();
  if (careerUrl && careerUrl.includes('myworkdayjobs.com')) {
    const match = careerUrl.match(/https?:\/\/([^.]+)\.wd\d+\.myworkdayjobs\.com\/([^/?]+)/);
    if (match) return { tenant: match[1], site: match[2], wd: careerUrl.match(/wd(\d+)/)?.[1] || '3' };
  }
  for (const [key, val] of Object.entries(WORKDAY_TENANTS)) {
    if (name.includes(key)) return { ...val, wd: '3' };
  }
  return null;
}

async function fetchWorkdayJobs(tenant, site, wd = '3') {
  const url = `https://${tenant}.wd${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; CareerScanner/1.0)' },
      body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: "" })
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`Workday HTTP ${r.status}`);
    const data = await r.json();
    return data.jobPostings || [];
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Workday API Fehler: ${err.message}`);
  }
}

async function fetchCareerPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CareerScanner/1.0)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8' }
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Seite nicht erreichbar: ${err.message}`);
  }
}

async function analyzeWithClaude(content, companyName, baseUrl, isWorkday = false) {
  const maxContentLength = isWorkday ? 6000 : 5000;
  const trimmedContent = content.length > maxContentLength
    ? content.substring(0, maxContentLength) + '\n[...gekuerzt...]'
    : content;

  const userPrompt = isWorkday
    ? `Unternehmen: ${companyName}\nBasis-URL: ${baseUrl}\n\nStellenangebote:\n${trimmedContent}`
    : `Unternehmen: ${companyName}\nBasis-URL: ${baseUrl}\n\nKarriereseiteninhalt:\n${trimmedContent}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, system: LEADERSHIP_PROMPT, messages: [{ role: 'user', content: userPrompt }] })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';

  if (!rawText) {
    throw new Error(`Claude leere Antwort. API data: ${JSON.stringify(data).substring(0, 300)}`);
  }

  const text = rawText.trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { }
    }
    throw new Error(`JSON parse failed. Claude antwortete: "${text.substring(0, 300)}"`);
  }
}

async function scanTarget(target) {
  const startTime = Date.now();
  const log = { target_id: target.id, company_name: target.company_name, status: 'error', vacancies_found: 0, new_vacancies: 0, filled_vacancies: 0 };

  try {
    let jobs = [];
    let scanMethod = 'html';
    const workday = detectWorkdayTenant(target.company_name, target.career_url);

    if (workday) {
      try {
        const postings = await fetchWorkdayJobs(workday.tenant, workday.site, workday.wd);
        scanMethod = 'workday';
        if (postings.length > 0) {
          const titleList = postings.slice(0, 100).map(p =>
            `${p.title} | ${p.locationsText || ''} | ${p.externalPath ? 'https://' + workday.tenant + '.wd' + workday.wd + '.myworkdayjobs.com' + p.externalPath : ''}`
          ).join('\n');
          jobs = await analyzeWithClaude(titleList, target.company_name, target.career_url, true);
          jobs = jobs.map(job => {
            const match = postings.find(p => p.title === job.title || p.title?.includes(job.title?.split(' ')[0]));
            if (match?.externalPath) job.job_url = `https://${workday.tenant}.wd${workday.wd}.myworkdayjobs.com${match.externalPath}`;
            return job;
          });
        }
      } catch (workdayErr) {
        log.status = 'error';
        log.error_message = workdayErr.message;
        await writeLog(log, startTime);
        return { ...log, error: workdayErr.message, scan_method: 'workday' };
      }
    }

    if (scanMethod !== 'workday' && target.career_url) {
      try {
        const pageText = await fetchCareerPage(target.career_url);
        if (pageText && pageText.length > 100) {
          jobs = await analyzeWithClaude(pageText, target.company_name, target.career_url, false);
        } else {
          log.status = 'skipped';
          log.error_message = 'Seite leer';
          await writeLog(log, startTime);
          return { ...log };
        }
      } catch (htmlErr) {
        log.status = 'error';
        log.error_message = htmlErr.message;
        await writeLog(log, startTime);
        return { ...log, error: htmlErr.message };
      }
    }

    log.vacancies_found = jobs.length;
    if (!jobs.length) {
      log.status = 'no_jobs';
      await sbUpdate('career_targets', `id=eq.${target.id}`, { last_scanned_at: new Date().toISOString() });
      await writeLog(log, startTime);
      return { ...log, jobs: [], scan_method: scanMethod };
    }

    const existing = await sbSelect('career_vacancies', `target_id=eq.${target.id}&is_active=eq.true`);
    const existingTitles = new Set(existing.map(e => e.job_title.toLowerCase().trim()));
    const foundTitles    = new Set(jobs.map(j => j.title.toLowerCase().trim()));

    let newCount = 0;
    for (const job of jobs) {
      if (!existingTitles.has(job.title.toLowerCase().trim())) {
        try {
          await sbInsert('career_vacancies', { target_id: target.id, company_name: target.company_name, job_title: job.title, department: job.department || null, job_level: job.level || null, job_url: job.job_url || target.career_url, is_active: true, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
          newCount++;
        } catch(e) { /* Duplikat */ }
      } else {
        await sbUpdate('career_vacancies', `target_id=eq.${target.id}&job_title=eq.${encodeURIComponent(job.title)}`, { last_seen_at: new Date().toISOString() });
      }
    }

    let filledCount = 0;
    for (const ex of existing) {
      if (!foundTitles.has(ex.job_title.toLowerCase().trim())) {
        await sbUpdate('career_vacancies', `id=eq.${ex.id}`, { is_active: false, filled_at: new Date().toISOString() });
        filledCount++;
      }
    }

    await sbUpdate('career_targets', `id=eq.${target.id}`, { last_scanned_at: new Date().toISOString() });
    log.status = 'success';
    log.new_vacancies = newCount;
    log.filled_vacancies = filledCount;
    await writeLog(log, startTime);
    return { ...log, jobs, scan_method: scanMethod };

  } catch (err) {
    log.error_message = err.message;
    await writeLog(log, startTime);
    return { ...log, error: err.message };
  }
}

async function uploadTargets(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { companies } = req.body;
  if (!Array.isArray(companies) || !companies.length) return res.status(400).json({ error: 'companies[] fehlt' });
  const rows = companies.map((c, i) => ({
    company_name: String(c.company_name || '').trim(), career_url: String(c.career_url || '').trim(),
    country: String(c.country || 'AT').trim(), industry: c.industry || null,
    revenue_mio: c.revenue_mio ? parseFloat(c.revenue_mio) : null, employees: c.employees ? parseInt(c.employees) : null,
    priority: c.priority ? parseInt(c.priority) : 2, source: c.source || null, notes: c.notes || null,
    internal_id: c.internal_id || `IMPORT-${Date.now()}-${i}`, active: c.active !== 'N' && c.active !== false, updated_at: new Date().toISOString()
  })).filter(r => r.company_name);
  await sbUpsert('career_targets', rows, 'internal_id');
  return res.json({ success: true, uploaded: rows.length, message: `${rows.length} Unternehmen importiert/aktualisiert` });
}

async function scanOneCompany(req, res) {
  const { target_id } = req.method === 'POST' ? req.body : req.query;
  if (!target_id) return res.status(400).json({ error: 'target_id fehlt' });
  const rows = await sbSelect('career_targets', `id=eq.${target_id}`);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  return res.json(await scanTarget(rows[0]));
}

async function scanAllCompanies(req, res) {
  const limit = parseInt(req.query.limit || '10'), offset = parseInt(req.query.offset || '0');
  let params = `active=eq.true&order=priority.asc,company_name.asc&limit=${limit}&offset=${offset}`;
  if (req.query.priority) params += `&priority=eq.${req.query.priority}`;
  const targets = await sbSelect('career_targets', params);
  const results = [];
  for (const target of targets) { results.push(await scanTarget(target)); await sleep(500); }
  return res.json({ total_scanned: results.length, total_new_vacancies: results.reduce((s, r) => s + (r.new_vacancies || 0), 0), total_filled: results.reduce((s, r) => s + (r.filled_vacancies || 0), 0), errors: results.filter(r => r.status === 'error').length, workday_used: results.filter(r => r.scan_method === 'workday').length, results });
}

async function getVacancies(req, res) {
  const { min_days = 0, level, limit = 200 } = req.query;
  let params = `is_active=eq.true&order=first_seen_at.asc&limit=${limit}`;
  if (level) params += `&job_level=eq.${encodeURIComponent(level)}`;
  if (parseInt(min_days) > 0) { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(min_days)); params += `&first_seen_at=lte.${cutoff.toISOString()}`; }
  const vacancies = await sbSelect('career_vacancies', params);
  const targetIds = [...new Set(vacancies.map(v => v.target_id))];
  let targets = [];
  if (targetIds.length) targets = await sbSelect('career_targets', `id=in.(${targetIds.join(',')})`);
  const targetMap = Object.fromEntries(targets.map(t => [t.id, t]));
  let filtered = vacancies.map(v => ({ ...v, career_targets: targetMap[v.target_id] || null }));
  if (req.query.country) filtered = filtered.filter(v => v.career_targets?.country === req.query.country);
  return res.json({ vacancies: filtered, count: filtered.length });
}

async function getTargets(req, res) {
  const { active = 'true', country, priority } = req.query;
  let params = `order=priority.asc,company_name.asc`;
  if (active !== 'all') params += `&active=eq.${active}`;
  if (country) params += `&country=eq.${country}`;
  if (priority) params += `&priority=eq.${priority}`;
  const targets = await sbSelect('career_targets', params);
  return res.json({ targets: targets.map(t => ({ ...t, has_workday: !!detectWorkdayTenant(t.company_name, t.career_url) })), count: targets.length });
}

async function getStats(req, res) {
  const [targets, vacancies] = await Promise.all([sbSelect('career_targets', 'active=eq.true&select=id'), sbSelect('career_vacancies', 'is_active=eq.true&select=id,job_level,first_seen_at,outreach_sent')]);
  const vacs = vacancies || [];
  return res.json({ total_targets: targets.length, total_vacancies: vacs.length, vacancies_30d: vacs.filter(v => daysSince(v.first_seen_at) >= 30).length, vacancies_60d: vacs.filter(v => daysSince(v.first_seen_at) >= 60).length, vacancies_90d: vacs.filter(v => daysSince(v.first_seen_at) >= 90).length, c_level_open: vacs.filter(v => v.job_level === 'C-Level').length, outreach_pending: vacs.filter(v => !v.outreach_sent && daysSince(v.first_seen_at) >= 30).length });
}

async function markOutreach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });
  await sbUpdate('career_vacancies', `id=eq.${vacancy_id}`, { outreach_sent: true, outreach_sent_at: new Date().toISOString() });
  return res.json({ success: true });
}

async function generateOutreachMail(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });
  const rows = await sbSelect('career_vacancies', `id=eq.${vacancy_id}`);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const vac = rows[0];
  const targets = await sbSelect('career_targets', `id=eq.${vac.target_id}`);
  const target = targets[0] || {};
  const prompt = `Du bist Sami Hamid, Managing Partner bei Signium Austria. Schreibe eine professionelle Erstansprache (150-180 Woerter) fuer die Position "${vac.job_title}" bei ${target.company_name || vac.company_name}. Sprache: Deutsch.`;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await response.json();
  return res.json({ mail: data.content?.[0]?.text || '', vacancy: vac });
}

async function updateWorkdayTenant(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { target_id, workday_url } = req.body;
  if (!target_id || !workday_url) return res.status(400).json({ error: 'target_id und workday_url erforderlich' });
  await sbUpdate('career_targets', `id=eq.${target_id}`, { career_url: workday_url });
  return res.json({ success: true, message: 'Workday URL gesetzt' });
}

function daysSince(dateStr) { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function writeLog(entry, startTime) {
  try { await sbInsert('career_scan_log', { ...entry, duration_ms: Date.now() - startTime }); } catch(e) { console.error('Log write failed:', e.message); }
}
