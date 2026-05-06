// api/scan-careers.js
// PAUL Career Scanner — Serverless Function
// Vercel Hobby Plan: zählt als 1 von max. 12 Funktionen
// Supabase Projekt: ftdxhswcnghlmcagrsox (PAUL/Henry)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// Positionsfilter — Leitungsfunktionen >125k
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
- Junior-Positionen, Trainees, Werkstudenten, Praktikanten
- Positionen ohne klare Leitungsverantwortung

Antworte NUR mit einem JSON-Array. Kein Text davor oder danach.
Format:
[
  {
    "title": "Exakter Positionstitel wie auf der Seite",
    "department": "Bereich/Abteilung oder null",
    "level": "C-Level|Geschäftsführung|Bereichsleitung|Abteilungsleitung|Sonstige Leitungsfunktion",
    "job_url": "URL zur Stelle wenn erkennbar, sonst null"
  }
]

Wenn keine passenden Positionen gefunden: antworte mit []`;

// Hauptfunktion
export default async function handler(req, res) {
  // CORS
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

    return res.status(400).json({ error: 'Unbekannte action. Gültig: upload-targets, scan-one, scan-all, get-vacancies, get-targets, get-stats, mark-outreach, generate-mail' });
  } catch (err) {
    console.error('[scan-careers] Unhandled error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── 1. Excel-Upload: Unternehmen in Supabase speichern ───────────────────────
async function uploadTargets(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { companies } = req.body; // Array aus dem Frontend (nach Excel-Parse)
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: 'companies[] fehlt oder leer' });
  }

  const rows = companies.map(c => ({
    company_name: c.company_name?.trim(),
    career_url:   c.career_url?.trim(),
    country:      c.country?.trim() || 'AT',
    industry:     c.industry || null,
    revenue_mio:  c.revenue_mio ? parseFloat(c.revenue_mio) : null,
    employees:    c.employees ? parseInt(c.employees) : null,
    priority:     c.priority ? parseInt(c.priority) : 2,
    source:       c.source || null,
    notes:        c.notes || null,
    internal_id:  c.internal_id || null,
    active:       c.active !== 'N' && c.active !== false,
    updated_at:   new Date().toISOString()
  })).filter(r => r.company_name && r.career_url);

  // Upsert: bestehende Einträge aktualisieren, neue hinzufügen
  const { data, error } = await supabase
    .from('career_targets')
    .upsert(rows, { onConflict: 'internal_id', ignoreDuplicates: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ success: true, uploaded: rows.length, message: `${rows.length} Unternehmen importiert/aktualisiert` });
}

// ── 2. Eine Firma scannen ────────────────────────────────────────────────────
async function scanOneCompany(req, res) {
  const { target_id } = req.method === 'POST' ? req.body : req.query;
  if (!target_id) return res.status(400).json({ error: 'target_id fehlt' });

  const { data: target, error: tErr } = await supabase
    .from('career_targets')
    .select('*')
    .eq('id', target_id)
    .single();

  if (tErr || !target) return res.status(404).json({ error: 'Unternehmen nicht gefunden' });

  const result = await scanTarget(target);
  return res.json(result);
}

// ── 3. Alle aktiven Firmen scannen (mit Limit pro Request) ───────────────────
async function scanAllCompanies(req, res) {
  const { limit = 10, priority } = req.query;

  let query = supabase
    .from('career_targets')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('last_scanned_at', { ascending: true, nullsFirst: true })
    .limit(parseInt(limit));

  if (priority) query = query.eq('priority', parseInt(priority));

  const { data: targets, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const results = [];
  for (const target of targets) {
    const result = await scanTarget(target);
    results.push(result);
    // Kurze Pause zwischen Requests (Rate limiting)
    await sleep(1500);
  }

  const summary = {
    total_scanned: results.length,
    total_new_vacancies: results.reduce((s, r) => s + (r.new_vacancies || 0), 0),
    total_filled: results.reduce((s, r) => s + (r.filled_vacancies || 0), 0),
    errors: results.filter(r => r.status === 'error').length,
    results
  };

  return res.json(summary);
}

// ── Core: Eine Karriereseite scrapen + KI-Analyse ────────────────────────────
async function scanTarget(target) {
  const startTime = Date.now();
  const logEntry = {
    target_id: target.id,
    company_name: target.company_name,
    status: 'error',
    vacancies_found: 0,
    new_vacancies: 0,
    filled_vacancies: 0
  };

  try {
    // Schritt 1: Karriereseite abrufen
    const pageText = await fetchCareerPage(target.career_url);

    if (!pageText || pageText.length < 100) {
      logEntry.status = 'skipped';
      logEntry.error_message = 'Seite leer oder nicht erreichbar';
      await writeLog(logEntry, startTime);
      return { ...logEntry, company: target.company_name };
    }

    // Schritt 2: KI-Analyse
    const jobs = await analyzeWithClaude(pageText, target.company_name, target.career_url);

    if (!jobs || jobs.length === 0) {
      logEntry.status = 'no_jobs';
      await supabase.from('career_targets').update({ last_scanned_at: new Date().toISOString() }).eq('id', target.id);
      await writeLog(logEntry, startTime);
      return { ...logEntry, company: target.company_name, jobs: [] };
    }

    logEntry.vacancies_found = jobs.length;

    // Schritt 3: Bestehende Vakanzen laden
    const { data: existing } = await supabase
      .from('career_vacancies')
      .select('id, job_title, is_active')
      .eq('target_id', target.id);

    const existingTitles = new Set((existing || []).filter(e => e.is_active).map(e => e.job_title.toLowerCase().trim()));
    const foundTitles = new Set(jobs.map(j => j.title.toLowerCase().trim()));

    // Schritt 4: Neue Vakanzen einfügen
    let newCount = 0;
    for (const job of jobs) {
      const titleKey = job.title.toLowerCase().trim();
      if (!existingTitles.has(titleKey)) {
        const { error } = await supabase.from('career_vacancies').insert({
          target_id:    target.id,
          company_name: target.company_name,
          job_title:    job.title,
          department:   job.department || null,
          job_level:    job.level || null,
          job_url:      job.job_url || target.career_url,
          is_active:    true,
          first_seen_at: new Date().toISOString(),
          last_seen_at:  new Date().toISOString()
        });
        if (!error) newCount++;
      } else {
        // Vorhandene: last_seen aktualisieren
        await supabase.from('career_vacancies')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('target_id', target.id)
          .ilike('job_title', job.title);
      }
    }

    // Schritt 5: Verschwundene Stellen als "besetzt" markieren
    let filledCount = 0;
    for (const ex of (existing || []).filter(e => e.is_active)) {
      if (!foundTitles.has(ex.job_title.toLowerCase().trim())) {
        await supabase.from('career_vacancies')
          .update({ is_active: false, filled_at: new Date().toISOString() })
          .eq('id', ex.id);
        filledCount++;
      }
    }

    // Schritt 6: last_scanned_at updaten
    await supabase.from('career_targets')
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('id', target.id);

    logEntry.status = 'success';
    logEntry.new_vacancies = newCount;
    logEntry.filled_vacancies = filledCount;

    await writeLog(logEntry, startTime);
    return { ...logEntry, company: target.company_name, jobs };

  } catch (err) {
    logEntry.error_message = err.message;
    await writeLog(logEntry, startTime);
    return { ...logEntry, company: target.company_name, error: err.message };
  }
}

// ── Karriereseite abrufen (fetch mit Timeout) ────────────────────────────────
async function fetchCareerPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CareerScanner/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    // HTML-Tags entfernen, Text bereinigen
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Max 8000 Zeichen für Claude
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Seite nicht erreichbar: ${err.message}`);
  }
}

// ── KI-Analyse mit Claude Haiku ──────────────────────────────────────────────
async function analyzeWithClaude(pageText, companyName, baseUrl) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `${LEADERSHIP_PROMPT}\n\nUnternehmen: ${companyName}\nBasis-URL: ${baseUrl}\n\nKarriereseiteninhalt:\n${pageText}`
      }]
    })
  });

  if (!response.ok) throw new Error(`Claude API Fehler: ${response.status}`);

  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// ── 4. Vakanzen abrufen ──────────────────────────────────────────────────────
async function getVacancies(req, res) {
  const { min_days = 0, level, country, priority, limit = 200 } = req.query;

  let query = supabase
    .from('career_vacancies')
    .select(`
      *,
      career_targets (company_name, career_url, country, industry, priority)
    `)
    .eq('is_active', true)
    .order('first_seen_at', { ascending: true })
    .limit(parseInt(limit));

  if (parseInt(min_days) > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(min_days));
    query = query.lte('first_seen_at', cutoff.toISOString());
  }

  if (level) query = query.eq('job_level', level);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Nachfilter nach country/priority (über join)
  let filtered = data || [];
  if (country) filtered = filtered.filter(v => v.career_targets?.country === country);
  if (priority) filtered = filtered.filter(v => v.career_targets?.priority === parseInt(priority));

  return res.json({ vacancies: filtered, count: filtered.length });
}

// ── 5. Targets abrufen ───────────────────────────────────────────────────────
async function getTargets(req, res) {
  const { active = 'true', country, priority } = req.query;

  let query = supabase.from('career_targets').select('*').order('priority').order('company_name');
  if (active !== 'all') query = query.eq('active', active === 'true');
  if (country) query = query.eq('country', country);
  if (priority) query = query.eq('priority', parseInt(priority));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ targets: data || [], count: (data || []).length });
}

// ── 6. Statistiken ───────────────────────────────────────────────────────────
async function getStats(req, res) {
  const [targets, vacancies, recentScans] = await Promise.all([
    supabase.from('career_targets').select('id, active, priority, last_scanned_at').eq('active', true),
    supabase.from('career_vacancies').select('id, job_level, first_seen_at, outreach_sent, days_open').eq('is_active', true),
    supabase.from('career_scan_log').select('*').order('scanned_at', { ascending: false }).limit(20)
  ]);

  const vacs = vacancies.data || [];
  const now = new Date();

  const stats = {
    total_targets:       (targets.data || []).length,
    total_vacancies:     vacs.length,
    vacancies_30d:       vacs.filter(v => daysSince(v.first_seen_at) >= 30).length,
    vacancies_60d:       vacs.filter(v => daysSince(v.first_seen_at) >= 60).length,
    vacancies_90d:       vacs.filter(v => daysSince(v.first_seen_at) >= 90).length,
    c_level_open:        vacs.filter(v => v.job_level === 'C-Level').length,
    outreach_pending:    vacs.filter(v => !v.outreach_sent && daysSince(v.first_seen_at) >= 30).length,
    last_scans:          recentScans.data || []
  };

  return res.json(stats);
}

// ── 7. Outreach markieren ────────────────────────────────────────────────────
async function markOutreach(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });

  const { error } = await supabase.from('career_vacancies')
    .update({ outreach_sent: true, outreach_sent_at: new Date().toISOString() })
    .eq('id', vacancy_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
}

// ── 8. Outreach-Mail generieren (Sonnet für Qualität) ────────────────────────
async function generateOutreachMail(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { vacancy_id } = req.body;
  if (!vacancy_id) return res.status(400).json({ error: 'vacancy_id fehlt' });

  const { data: vac, error } = await supabase
    .from('career_vacancies')
    .select('*, career_targets(*)')
    .eq('id', vacancy_id)
    .single();

  if (error || !vac) return res.status(404).json({ error: 'Vakanz nicht gefunden' });

  const days = daysSince(vac.first_seen_at);
  const company = vac.career_targets?.company_name || vac.company_name;
  const country = vac.career_targets?.country || 'AT';

  const prompt = `Du bist Sami Hamid, Managing Partner bei Signium Austria (Stein & Partner GmbH, Wien). 
30+ Jahre Erfahrung im Executive Search, DACH & CEE.

Schreibe eine professionelle Erstansprache (max. 120 Wörter) an den Entscheidungsträger bei ${company} (${country}) bezüglich der seit ${days} Tagen offenen Position "${vac.job_title}" (${vac.job_level}).

Regeln:
- Keine generischen Floskeln
- Direkt ansprechen DASS die Stelle lange offen ist — als Signal, nicht als Kritik
- Signium positionieren: DACH/CEE Spezialist, eigene Büros, 1000+ Mandate, 30 Jahre
- Auf Augenhöhe, substanziell
- Sprache: Deutsch
- Kein Betreff, nur Fließtext`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  const mail = data.content?.[0]?.text || '';
  return res.json({ mail, vacancy: vac });
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function writeLog(entry, startTime) {
  await supabase.from('career_scan_log').insert({
    ...entry,
    duration_ms: Date.now() - startTime
  });
}
