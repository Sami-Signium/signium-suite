// api/scan-careers.js
// PAUL Career Scanner — ohne @supabase/supabase-js Paket
// Verwendet native fetch direkt gegen Supabase REST API

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL        = 'claude-haiku-4-5-20251001';

// ── Supabase REST Helpers ─────────────────────────────────────────────────────
async function sbSelect(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!r.ok) throw new Error(`Supabase SELECT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase INSERT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbUpsert(table, body, onConflict) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase UPSERT ${table}: ${await r.text()}`);
  return r.json();
}

async function sbUpdate(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase UPDATE ${table}: ${await r.text()}`);
  return r.json();
}

// ── Positionsfilter ───────────────────────────────────────────────────────────
const LEADERSHIP_PROMPT = `Du bist ein Executive Search Spezialist. Analysiere den folgenden Text einer Karriereseite und extrahiere NUR Leitungspositionen mit einem geschätzten Jahresgehalt über €125.000.

EINSCHLIESSEN:
- C-Level: CEO, CFO, COO, CTO, CHRO, CMO, CDO, CRO, CPO, CIO, CSO
- Geschäftsführer/in, Managing Director, Generaldirektor, Vorstand
- Bereichsleiter/in, Division Head, Head of [Bereich]
- Abteilungsleiter/in (nur bei großen Unternehmen / strategischen Abteilungen)
- Country Manager, Regional Director, Market Lead
- Vice President, Senior Vice President
- General Counsel, Head of Strategy, Head of M&A

AUSSCHLIESSEN:
- Team Lead / Gruppenleiter (operative Ebene)
- Sachbearbeiter, Specialist, Analyst, Coordinator
- Junior, Trainee, Werkstudent, Praktikant

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format:
[{"title":"Positionstitel","department":"Bereich oder null","level":"C-Level|Geschäftsführung|Bereichsleitung|Abteilungsleitung|Sonstige Leitungsfunktion","job_url":"URL oder null"}]

Wenn keine passenden Positionen: antworte mit []`;

// ── Main Handler ──────────────────────────────────────────────────────────────
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
    return res.status(400).json({ error: 'Unbekannte action' });
  } catch (err) {
    console.error('[scan-careers]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── 1. Upload Targets ─────────────────────────────────────────────────────────
async function uploadTargets(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { companies } = req.body;
  if (!Array.isArray(companies) || !companies.length)
    return res.status(400).json({ error: 'companies[] fehlt' });

  const rows = companies.map((c, i) => ({
    company_name: String(c.company_name || '').trim(),
    career_url:   String(c.career_url   || '').trim(),
    country:      String(c.country      || 'AT').trim(),
    industry:     c.industry  || null,
    revenue_mio:  c.revenue_mio ? parseFloat(c.revenue_mio) : null,
    employees:    c.employees   ? parseInt(c.employees)     : null,
    priority:     c.priority    ? parseInt(c.priority)      : 2,
    source:       c.source  || null,
    notes:        c.notes   || null,
    internal_id:  c.internal_id || `IMPORT-${Date.now()}-${i}`,
    active:       c.active !== 'N' && c.active !== false,
    updated_at:   new Date().toISOString()
  })).filter(r => r.company_name && r.career_url);

  await sbUpsert('career_targets', rows, 'internal_id');
  return res.json({ success: true, uploaded: rows.length, message: `${rows.length} Unternehmen importiert/aktualisiert` });
}

// ── 2. Scan one ───────────────────────────────────────────────────────────────
async function scanOneCompany(req, res) {
  const { target_id } = req.method === 'POST' ? req.body : req.query;
  if (!target_id) return res.status(400).json({ error: 'target_id fehlt' });

  const rows = await sbSelect('career_targets', `id=eq.${target_id}`);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });

  const result = await scanTarget(rows[0]);
  return res.json(result);
}

// ── 3. Scan all ───────────────────────────────────────────────────────────────
async function scanAllCompanies(req, res) {
  const limit    = parseInt(req.query.limit || '10');
  const priority = req.query.priority;

  let params = `active=eq.true&order=priority.asc,last_scanned_at.asc.nullsfirst&limit=${limit}`;
  if (priority) params += `&priority=eq.${priority}`;

  const targets = await sbSelect('career_targets', params);
  const results = [];

  for (const target of targets) {
    const result = await scanTarget(target);
    results.push(result);
    await sleep(1500);
  }

  return res.json({
    total_scanned:        results.length,
    total_new_vacancies:  results.reduce((s, r) => s + (r.new_vacancies  || 0), 0),
    total_filled:         results.reduce((s, r) => s + (r.filled_vacancies || 0), 0),
    errors:               results.filter(r => r.status === 'error').length,
    results
  });
}

// ── Core scan ─────────────────────────────────────────────────────────────────
async function scanTarget(target) {
  const startTime = Date.now();
  const log = {
    target_id:        target.id,
    company_name:     target.company_name,
    status:           'error',
    vacancies_found:  0,
    new_vacancies:    0,
    filled_vacancies: 0
  };

  try {
    const pageText = await fetchCareerPage(target.career_url);

    if (!pageText || pageText.length < 100) {
      log.status = 'skipped';
      log.error_message = 'Seite leer oder nicht erreichbar';
      await writeLog(log, startTime);
      return { ...log };
    }

    const jobs = await analyzeWithClaude(pageText, target.company_name, target.career_url);
    log.vacancies_found = jobs.length;

    if (!jobs.length) {
      log.status = 'no_jobs';
      await sbUpdate('career_targets', `id=eq.${target.id}`, { last_scanned_at: new Date().toISOString() });
      await writeLog(log, startTime);
      return { ...log, jobs: [] };
    }

    // Bestehende aktive Vakanzen laden
    const existing = await sbSelect('career_vacancies', `target_id=eq.${target.id}&is_active=eq.true`);
    const existingTitles = new Set(existing.map(e => e.job_title.toLowerCase().trim()));
    const foundTitles    = new Set(jobs.map(j => j.title.toLowerCase().trim()));

    // Neue einfügen
    let newCount = 0;
    for (const job of jobs) {
      if (!existingTitles.has(job.title.toLowerCase().trim())) {
        try {
          await sbInsert('career_vacancies', {
            target_id:     target.id,
            company_name:  target.company_name,
            job_title:     job.title,
            department:    job.department || null,
            job_level:     job.level      || null,
            job_url:       job.job_url    || target.career_url,
            is_active:     true,
            first_seen_at: new Date().toISOString(),
            last_seen_at:  new Date().toISOString()
          });
          newCount++;
        } catch(e) {
          // Duplikat — ignorieren
        }
      } else {
        // last_seen aktualisieren
        await sbUpdate('career_vacancies',
          `target_id=eq.${target.id}&job_title=eq.${encodeURIComponent(job.title)}`,
          { last_seen_at: new Date().toISOString() }
        );
      }
    }

    // Verschwundene als besetzt markieren
    let filledCount = 0;
    for (const ex of existing) {
      if (!foundTitles.has(ex.job_title.toLowerCase().trim())) {
        await sbUpdate('career_vacancies', `id=eq.${ex.id}`, {
          is_active: false,
          filled_at: new Date().toISOString()
        });
        filledCount++;
      }
    }

    await sbUpdate('career_targets', `id=eq.${target.id}`, { last_scanned_at: new Date().toISOString() });

    log.status           = 'success';
    log.new_vacancies    = newCount;
    log.filled_vacancies = filledCount;
    await writeLog(log, startTime);
    return { ...log, jobs };

  } catch (err) {
    log.error_message = err.message;
    await writeLog(log, startTime);
    return { ...log, error: err.message };
  }
}

// ── Karriereseite abrufen ─────────────────────────────────────────────────────
async function fetchCareerPage(url) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; CareerScanner/1.0)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8'
      }
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
      .substring(0, 8000);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Seite nicht erreichbar: ${err.message}`);
  }
}

// ── KI-Analyse ────────────────────────────────────────────────────────────────
async function analyzeWithClaude(pageText, companyName, baseUrl) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{
        role:    'user',
        content: `${LEADERSHIP_PROMPT}\n\nUnternehmen: ${companyName}\nBasis-URL: ${baseUrl}\n\nKarriereseiteninhalt:\n${pageText}`
      }]
    })
  });
  if (!response.ok) throw new Error(`Claude API: ${response.status}`);
  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return [];
  }
}

// ── 4. Get Vacancies ──────────────────────────────────────────────────────────
async function getVacancies(req, res) {
  const { min_days = 0, level, limit = 200 } = req.query;

  let params = `is_active=eq.true&order=first_seen_at.asc&limit=${limit}`;
  if (level) params += `&job_level=eq.${encodeURIComponent(level)}`;

  if (parseInt(min_days) > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(min_days));
    params += `&first_seen_at=lte.${cutoff.toISOString()}`;
  }

  const vacancies = await sbSelect('career_vacancies', params);

  // Target-Daten dazu laden
  const targetIds = [...new Set(vacancies.map(v => v.target_id))];
  let targets = [];
  if (targetIds.length) {
    targets = await sbSelect('career_targets', `id=in.(${targetIds.join(',')})`);
  }
  const targetMap = Object.fromEntries(targets.map(t => [t.id, t]));

  const enriched = vacancies.map(v => ({
    ...v,
    career_targets: targetMap[v.target_id] || null
  }));

  // Nachfilter country
  let filtered = enriched;
  if (req.query.country) filtered = filtered.filter(v => v.career_targets?.country === req.query.country);

  return res.json({ vacancies: filtered, count: filtered.length });
}

// ── 5. Get Targets ────────────────────────────────────────────────────────────
async function getTargets(req, res) {
  const { active = 'true', country, priority } = req.query;
  let params = `order=priority.asc,company_name.asc`;
  if (active !== 'all') params += `&active=eq.${active}`;
  if (country)  params += `&country=eq.${country}`;
  if (priority) params += `&priority=eq.${priority}`;

  const targets = await sbSelect('career_targets', params);
  return res.json({ targets, count: targets.length });
}

// ── 6. Stats ──────────────────────────────────────────────────────────────────
async function getStats(req, res) {
  const [targets, vacancies] = await Promise.all([
    sbSelect('career_targets',  'active=eq.true&select=id'),
    sbSelect('career_vacancies','is_active=eq.true&select=id,job_level,first_seen_at,outreach_sent')
  ]);

  const vacs = vacancies || [];
  const stats = {
    total_targets:    targets.length,
    total_vacancies:  vacs.length,
    vacancies_30d:    vacs.filter(v => daysSince(v.first_seen_at) >= 30).length,
    vacancies_60d:    vacs.filter(v => daysSince(v.first_seen_at) >= 60).length,
    vacancies_90d:    vacs.filter(v => daysSince(v.first_seen_at) >= 90).length,
    c_level_open:     vacs.filter(v => v.job_level === 'C-Level').length,
    outreach_pending: vacs.filter(v => !v.outreach_sent && daysSince(v.first_seen_at) >= 30).length
  };
  return res.json(stats);
}

// ── 7. Mark Outreach ──────────────────────────────────────────────────────────
async function markOutreach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });
  await sbUpdate('career_vacancies', `id=eq.${vacancy_id}`, {
    outreach_sent: true, outreach_sent_at: new Date().toISOString()
  });
  return res.json({ success: true });
}

// ── 8. Generate Mail ──────────────────────────────────────────────────────────
async function generateOutreachMail(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });

  const rows = await sbSelect('career_vacancies', `id=eq.${vacancy_id}`);
  if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
  const vac = rows[0];

  const targets = await sbSelect('career_targets', `id=eq.${vac.target_id}`);
  const target  = targets[0] || {};
  const days    = daysSince(vac.first_seen_at);

  const prompt = `Du bist Sami Hamid, Managing Partner bei Signium Austria (Stein & Partner GmbH, Wien). 30+ Jahre Erfahrung im Executive Search, DACH & CEE.

Schreibe eine professionelle Erstansprache (max. 120 Wörter) an den Entscheidungsträger bei ${target.company_name || vac.company_name} bezüglich der seit ${days} Tagen offenen Position "${vac.job_title}" (${vac.job_level}).

Regeln: Keine Floskeln. Direkt ansprechen dass die Stelle lange offen ist. Signium positionieren: DACH/CEE Spezialist, eigene Büros, 1000+ Mandate, 30 Jahre. Auf Augenhöhe. Sprache: Deutsch. Kein Betreff.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  const mail = data.content?.[0]?.text || '';
  return res.json({ mail, vacancy: vac });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function writeLog(entry, startTime) {
  try {
    await sbInsert('career_scan_log', { ...entry, duration_ms: Date.now() - startTime });
  } catch(e) {
    console.error('Log write failed:', e.message);
  }
}
