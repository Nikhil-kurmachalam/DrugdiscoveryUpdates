import { buildPrompt } from './prompt.js';

const NEWS_API_KEY = 'f2f91a1105854beab0f6f21bf3227353';

const RSS_FEEDS = [
  {
    name:     'STAT News',
    type:     'rss',
    url:      'https://www.statnews.com/feed/',
    color:    '#38bdf8',
    keywords: ['drug discovery', 'target discovery', 'drug development', 'clinical trial', 'fda', 'biomarker', 'therapeutics', 'oncology', 'phase 1', 'phase 2', 'phase 3'],
  },
  {
    name:     'BioPharma Dive',
    type:     'rss',
    url:      'https://www.biopharmadive.com/feeds/news/',
    color:    '#fb923c',
    keywords: ['drug discovery', 'target discovery', 'drug development', 'clinical trial', 'biomarker', 'therapeutics'],
  },
  {
    name:     'Fierce Biotech',
    type:     'rss',
    url:      'https://www.fiercebiotech.com/rss/xml',
    color:    '#c084fc',
    keywords: ['drug discovery', 'target discovery', 'target validation', 'biomarker', 'preclinical', 'screening', 'r&d', 'drug development'],
  },
  {
    name:     'bioRxiv',
    type:     'rss',
    url:      'https://www.biorxiv.org/rss/subject/pharmacology-and-toxicology.xml',
    color:    '#f87171',
    keywords: ['drug discovery', 'target discovery', 'target identification', 'target validation', 'lead optimization', 'screening', 'small molecule', 'biologic', 'drug target', 'inhibitor'],
  },
  {
    name:  'PubMed · Drug Disc.',
    type:  'rss',
    url:   'https://pubmed.ncbi.nlm.nih.gov/rss/search/1vCeRl5tNk836xFPh1aGA__GMugekbZQkTrq0LO2sGWLkeDg7l/?limit=15&utm_campaign=pubmed-2&fc=20260505005014',
    color: '#34d399',
  },
  {
    name:  'PubMed · Target Disc.',
    type:  'rss',
    url:   'https://pubmed.ncbi.nlm.nih.gov/rss/search/1VE-4vX3y68Ug0Ja3gZRk6WP2tgOmc0lwWOHuKxULplttU49R4/?limit=15&utm_campaign=pubmed-2&fc=20260505004341',
    color: '#a3e635',
  },
];

const STAGES     = ['Target ID', 'Preclinical', 'Clinical', 'Approval', 'Method', 'Industry'];
const CACHE_TTL  = 24 * 60 * 60 * 1000;
const ADMIN_PASS = 'pipelineq-prof';
const SIG_COLOR  = { High: '#4ade80', Medium: '#fb923c', Low: '#64748b' };
const SIG_BG     = { High: 'rgba(74,222,128,0.12)', Medium: 'rgba(251,146,60,0.12)', Low: 'rgba(100,116,139,0.10)' };
const SIG_ICON   = { High: '● ', Medium: '◐ ', Low: '○ ' };

const DRUG_DISC_RE = /drug|target|therap|treatment|clinical|trial|biomarker|compound|molecule|inhibitor|antibody|protein|gene|pathway|mechanism|cancer|tumor|neurodegenera|alzheimer|parkinson|oncology|gpcr|kinase|receptor|preclinical|phase [123]/i;
const SKIP_RE      = /sponsor|webinar|job listing|opinion|podcast|advertisement|subscribe|press release/i;

const state = { items: [], srcFilter: '', approved: loadApproved() };
window._sigFilter = '';

const feedEl       = document.getElementById('feed');
const stageFilter  = document.getElementById('stageFilter');
const diseaseFilter= document.getElementById('diseaseFilter');
const statusBar    = document.getElementById('status-bar');
const srcBar       = document.getElementById('source-bar');

for (const s of STAGES) stageFilter.innerHTML += `<option>${s}</option>`;

initApiKeyUI();

// Source filter bar
function buildSourceBar() {
  const counts = {};
  state.items.forEach(i => { counts[i.source] = (counts[i.source] || 0) + 1; });
  const all  = `<button class="src-btn ${!state.srcFilter ? 'active' : ''}" data-src="" style="--src-color:#6366f1">All Sources (${state.items.length})</button>`;
  const btns = RSS_FEEDS.map(f =>
    `<button class="src-btn ${state.srcFilter === f.name ? 'active' : ''}" data-src="${f.name}" style="--src-color:${f.color}">${f.name}${counts[f.name] ? ` · ${counts[f.name]}` : ''}</button>`
  ).join('');
  srcBar.innerHTML = all + btns;
  srcBar.querySelectorAll('.src-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.srcFilter = btn.dataset.src; buildSourceBar(); render(); });
  });
}

// Significance filter — driven by window._sigFilter set in index.html
// expose render so the HTML inline script can call it
window._renderFeed = render;

document.getElementById('refreshBtn').addEventListener('click', refresh);
stageFilter.addEventListener('change', render);
diseaseFilter.addEventListener('input', render);
document.getElementById('unlockAdmin').addEventListener('click', unlockAdmin);
if (location.hash === '#admin') document.getElementById('admin').classList.remove('hidden');

refresh();

async function refresh() {
  setStatus('⟳ Fetching feeds…', true);
  const raw = await fetchAllRss();
  setStatus(`⟳ Classifying ${raw.length} items…`, true);
  const uniq = dedupe(raw);
  const processed = [];
  let i = 0;
  for (const item of uniq) {
    if (i++ % 5 === 0) setStatus(`⟳ Classifying ${i} / ${uniq.length}…`, true);
    processed.push(await classifyItem(item));
  }
  state.items = processed.filter(i => i.keep).sort(sortBySignificanceThenDate);
  setStatus('', false);
  buildSourceBar();
  updateDateRange();
  render();
}

async function fetchPubMedEutils(searchTerm, sourceName, maxResults = 20) {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=${maxResults}&retmode=json&sort=date`;
  const searchData = await (await fetch(searchUrl, { signal: AbortSignal.timeout(12000) })).json();
  const ids = searchData.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
  const summaryData = await (await fetch(summaryUrl, { signal: AbortSignal.timeout(12000) })).json();
  const result = summaryData.result || {};
  return ids.map(id => {
    const doc = result[id];
    if (!doc || doc.error) return null;
    const authors = (doc.authors || []).slice(0, 3).map(a => a.name).join(', ');
    return {
      title:       doc.title || '',
      description: [authors, doc.fulljournalname].filter(Boolean).join(' — '),
      link:        `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      pubDate:     doc.pubdate || '',
      source:      sourceName,
    };
  }).filter(Boolean);
}

async function fetchAllRss() {
  const all = [];
  for (const feed of RSS_FEEDS) {
    try {
      if (feed.type === 'pubmed-eutils') {
        const rows = await fetchPubMedEutils(feed.searchTerm, feed.name);
        all.push(...rows);
        continue;
      }

      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`;
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res   = await fetch(proxy, { signal: ctrl.signal });
      clearTimeout(timer);

      if (feed.type === 'newsapi') {
        // ── NewsAPI: JSON response ──
        const data = await res.json();
        if (data.status !== 'ok') continue;
        const rows = (data.articles || [])
          .filter(a => a.title && a.title !== '[Removed]')
          .slice(0, 20)
          .map(a => ({
            title:       (a.title || '').trim(),
            description: (a.description || a.content || '').slice(0, 500),
            link:        a.url || '',
            pubDate:     a.publishedAt || '',
            source:      feed.name,
          }));
        all.push(...rows);
      } else {
        // ── RSS: XML response ──
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) continue;
        let rows = [...doc.querySelectorAll('item')].slice(0, 30).map(el => ({
          title:       getTextContent(el, 'title'),
          description: stripHtml(getTextContent(el, 'description')),
          link:        getLink(el),
          pubDate:     getTextContent(el, 'pubDate') || getTextContent(el, 'dc\\:date') || getTextContent(el, 'date'),
          source:      feed.name,
        })).filter(r => r.title || r.link);
        // Keyword pre-filter for feeds that define keywords
        if (feed.keywords && feed.keywords.length) {
          rows = rows.filter(r => {
            const text = `${r.title} ${r.description}`.toLowerCase();
            return feed.keywords.some(k => text.includes(k));
          });
        }
        all.push(...rows.slice(0, 20));
      }
    } catch { /* skip failed feed */ }
  }
  return all;
}

function getTextContent(el, sel) {
  return (el.querySelector(sel)?.textContent || '').trim();
}

function getLink(el) {
  const linkEl   = el.querySelector('link');
  const linkText = (linkEl?.textContent || '').trim();
  if (linkText) return linkText;
  const guid = el.querySelector('guid');
  return (guid?.textContent || '').trim();
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = (i.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 10).join(' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function classifyItem(item) {
  const key    = `dd:${item.link || item.title}:${new Date(item.pubDate).toDateString()}`;
  const cached = loadWithTTL(key);
  if (cached) return cached;
  const apiKey = localStorage.getItem('ANTHROPIC_API_KEY') || '';
  let out;
  try {
    if (!apiKey) throw new Error('No key');
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body:    JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: buildPrompt(item) }] }),
    });
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    out = JSON.parse(text);
  } catch { out = heuristic(item); }
  const merged = { ...item, ...out };
  saveWithTTL(key, merged);
  return merged;
}

function heuristic(item) {
  const t    = `${item.title} ${item.description}`.toLowerCase();
  const keep = DRUG_DISC_RE.test(t) && !SKIP_RE.test(t);
  const stg  = t.includes('phase') ? 'Clinical' : t.includes('fda') ? 'Approval' : t.includes('preclinical') ? 'Preclinical' : t.includes('target') ? 'Target ID' : 'Method';
  const sig  = /phase 3|fda approval|breakthrough|approved/.test(t) ? 'High'
             : /phase 2|phase 1|trial|clinical/.test(t) ? 'Medium' : 'Low';
  const dm   = t.match(/alzheimer|parkinson|cancer|tumor|oncolog|neurodegenera|diabetes|autoimmune|inflammation|fibrosis/);
  return { keep, stage: stg, disease: dm ? dm[0].charAt(0).toUpperCase() + dm[0].slice(1) : 'General', target: 'Unknown', significance: sig, summary: item.title, relevance_score: keep ? 5 : 1 };
}

function sortBySignificanceThenDate(a, b) {
  const w = { High: 3, Medium: 2, Low: 1 };
  return (w[b.significance] - w[a.significance]) || (new Date(b.pubDate) - new Date(a.pubDate));
}

function render() {
  const stg = stageFilter.value;
  const dl  = diseaseFilter.value.toLowerCase();
  const sig = window._sigFilter || '';
  const src = state.srcFilter;
  const list = state.items.filter(i =>
    (!stg || i.stage === stg) &&
    (!sig || i.significance === sig) &&
    (!src || i.source === src) &&
    // disease searches disease field + title + description + summary
    (!dl || [i.disease, i.title, i.description, i.summary].some(s => (s || '').toLowerCase().includes(dl)))
  );
  renderStats(list);
  if (!list.length) {
    feedEl.innerHTML = '<p style="color:var(--empty);text-align:center;padding:40px">No items match current filters.</p>';
    return;
  }
  feedEl.innerHTML = list.map(item => {
    const sc   = SIG_COLOR[item.significance] || '#64748b';
    const sbg  = SIG_BG[item.significance]    || 'rgba(100,116,139,0.10)';
    const icon = SIG_ICON[item.significance]  || '○ ';
    const bc   = RSS_FEEDS.find(f => f.name === item.source)?.color || '#6b7280';
    const date = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return `
    <article style="background:var(--card-bg);border:1px solid var(--card-border);border-left:4px solid ${sc};border-radius:14px;padding:16px 20px;margin-bottom:12px;box-shadow:var(--card-shadow)">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${sbg};color:${sc}">${icon}${item.significance || 'Low'}</span>
        <span style="padding:3px 10px;border-radius:999px;font-size:11px;background:var(--stage-bg);color:var(--stage-text);font-weight:500">${item.stage || 'General'}</span>
        <span style="padding:3px 10px;border-radius:999px;font-size:11px;background:${bc}18;color:${bc};margin-left:auto;font-weight:700">${item.source}</span>
        ${date ? `<span style="font-size:11px;color:var(--text-muted);white-space:nowrap">${date}</span>` : ''}
      </div>
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:var(--text-1);line-height:1.45">${item.title}</h3>
      <p style="margin:0 0 12px;font-size:13px;color:var(--text-2);line-height:1.6">${item.summary || (item.description || '').slice(0, 280)}</p>
      <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;align-items:center">
        ${item.disease && item.disease !== 'General' ? `<span>Disease: <strong style="color:var(--link);font-weight:600">${item.disease}</strong></span>` : ''}
        ${item.target && item.target !== 'Unknown' && item.target !== 'None' ? `<span>Target: <strong style="color:#c084fc;font-weight:600">${item.target}</strong></span>` : ''}
        ${item.relevance_score != null ? `<span>Score: <strong style="color:${sc};font-weight:700">${item.relevance_score}/10</strong></span>` : ''}
        ${item.link ? `<a href="${item.link}" target="_blank" style="margin-left:auto;color:var(--link);font-size:12px;text-decoration:none;font-weight:700">Read full article ↗</a>` : ''}
      </div>
    </article>`;
  }).join('');
}

function renderStats(list) {
  const high   = list.filter(i => i.significance === 'High').length;
  const medium = list.filter(i => i.significance === 'Medium').length;
  const low    = list.filter(i => i.significance === 'Low').length;
  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-box" style="color:#60a5fa"><span class="stat-num">${list.length}</span><span class="stat-label">Showing</span></div>
    <div class="stat-box" style="color:${SIG_COLOR.High}"><span class="stat-num">${high}</span><span class="stat-label">High</span></div>
    <div class="stat-box" style="color:${SIG_COLOR.Medium}"><span class="stat-num">${medium}</span><span class="stat-label">Medium</span></div>
    <div class="stat-box" style="color:${SIG_COLOR.Low}"><span class="stat-num">${low}</span><span class="stat-label">Low</span></div>
  `;
}

function unlockAdmin() {
  if (document.getElementById('adminPassword').value !== ADMIN_PASS) return alert('Invalid password');
  const panel = document.getElementById('adminPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = state.items.map((item, idx) =>
    `<div class="card"><strong>${item.title}</strong><br>
     <button data-a="${idx}">Approve</button> <button data-d="${idx}">Dismiss</button></div>`
  ).join('');
  panel.onclick = e => {
    const a = e.target.dataset.a, d = e.target.dataset.d;
    if (a) { state.approved[iKey(state.items[a])] = state.items[a]; saveApproved(state.approved); }
    if (d) { delete state.approved[iKey(state.items[d])]; saveApproved(state.approved); }
  };
}

function initApiKeyUI() {
  const stored = localStorage.getItem('ANTHROPIC_API_KEY') || '';
  const status = document.getElementById('key-status');
  if (status) { status.textContent = stored ? '● set' : '● not set'; status.className = stored ? 'set' : 'unset'; }
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    document.getElementById('settings-panel').classList.toggle('hidden');
  });
  document.getElementById('saveKey')?.addEventListener('click', () => {
    const val = document.getElementById('apiKeyInput').value.trim();
    if (val) localStorage.setItem('ANTHROPIC_API_KEY', val);
    else localStorage.removeItem('ANTHROPIC_API_KEY');
    if (status) { status.textContent = val ? '● set' : '● not set'; status.className = val ? 'set' : 'unset'; }
    document.getElementById('settings-panel').classList.add('hidden');
  });
  document.getElementById('clearKey')?.addEventListener('click', () => {
    localStorage.removeItem('ANTHROPIC_API_KEY');
    document.getElementById('apiKeyInput').value = '';
    if (status) { status.textContent = '● not set'; status.className = 'unset'; }
  });
  if (stored && document.getElementById('apiKeyInput')) document.getElementById('apiKeyInput').value = stored;
}

function setStatus(msg, isLoading) {
  if (statusBar) { statusBar.textContent = msg; statusBar.style.display = msg ? 'inline-block' : 'none'; }
  const btn      = document.getElementById('refreshBtn');
  const bar      = document.getElementById('loading-bar');
  const fill     = document.getElementById('loading-bar-fill');
  const spinner  = document.getElementById('loading-spinner');
  if (btn)     { btn.disabled = isLoading; btn.textContent = isLoading ? '⟳ Refreshing…' : '↺ Refresh'; }
  if (bar)     { bar.style.display = isLoading ? 'block' : 'none'; }
  if (fill && isLoading) { fill.style.animation = 'none'; void fill.offsetWidth; fill.style.animation = 'dd-bar 12s ease-out forwards'; }
  if (spinner) { spinner.style.display = isLoading ? 'block' : 'none'; }
}

function updateDateRange() {
  const badge = document.getElementById('date-range-badge');
  if (!badge) return;
  const dates = state.items.map(i => i.pubDate ? new Date(i.pubDate) : null).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) { badge.textContent = ''; return; }
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const oldest = fmt(dates[0]);
  const newest = fmt(dates[dates.length - 1]);
  badge.textContent = oldest === newest ? ` · ${oldest}` : ` · ${oldest} – ${newest}`;
}

function iKey(i)           { return i.link || i.title; }
function saveWithTTL(k, v) { try { localStorage.setItem(k, JSON.stringify({ exp: Date.now() + CACHE_TTL, v })); } catch {} }
function loadWithTTL(k)    { try { const x = JSON.parse(localStorage.getItem(k) || 'null'); if (!x || x.exp < Date.now()) return null; return x.v; } catch { return null; } }
function saveApproved(a)   { localStorage.setItem('piq:approved', JSON.stringify(a)); }
function loadApproved()    { try { return JSON.parse(localStorage.getItem('piq:approved') || '{}'); } catch { return {}; } }
