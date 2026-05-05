'use client';
import { useEffect, useMemo, useState } from 'react';
import { buildPrompt } from '../lib/prompt';

/* ─────────────────────────────────────────────
   TYPES & CONSTANTS  (logic — unchanged)
───────────────────────────────────────────── */
type Significance = 'High' | 'Medium' | 'Low';
type Item = {
  title: string; description: string; link: string; pubDate: string; source: string;
  keep?: boolean; stage?: string; disease?: string; target?: string;
  significance?: Significance; summary?: string; relevance_score?: number;
};
const NEWS_API_KEY = 'f2f91a1105854beab0f6f21bf3227353';

type Feed = {
  name:       string;
  color:      string;
  type?:      'rss' | 'newsapi' | 'pubmed-eutils';
  url?:       string;
  keywords?:  string[];
  searchTerm?: string;
};

const RSS_FEEDS: Feed[] = [
  {
    // NewsAPI has browser CORS restrictions — using RSS with keyword pre-filter instead
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
    // Pharmacology & Toxicology subject — most relevant bioRxiv category for drug discovery
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

const STAGES    = ['Target ID', 'Preclinical', 'Clinical', 'Approval', 'Method', 'Industry'];
const CACHE_TTL = 86400000;

const DRUG_DISC_RE = /drug|target|therap|treatment|clinical|trial|biomarker|compound|molecule|inhibitor|antibody|protein|gene|pathway|mechanism|cancer|tumor|neurodegenera|alzheimer|parkinson|oncology|gpcr|kinase|receptor|preclinical|phase [123]|ai agent|large language model|llm|machine learning|deep learning|agentic|foundation model|generative ai|drug design|virtual screening|biomedical ai/i;
const SKIP_RE      = /sponsor|webinar|job listing|opinion|podcast|advertisement|subscribe|press release/i;

/* ─────────────────────────────────────────────
   THEME DEFINITIONS
───────────────────────────────────────────── */
const DARK = {
  pageBg:       '#060d1b',
  headerBg:     'linear-gradient(135deg,#07102a 0%,#120828 50%,#081428 100%)',
  headerBorder: 'rgba(99,102,241,0.25)',
  cardBg:       '#0c1428',
  cardBorder:   '#182044',
  surfaceBg:    '#0f1935',
  surfaceBorder:'#1e3058',
  inputBg:      '#060d1b',
  titleColor:   '#ffffff',
  titleShadow:  '0 0 30px rgba(129,140,248,0.6)',
  subtitle:     '#6b7fa8',
  textPrimary:  '#eef2ff',
  textSecond:   '#7c8db5',
  textMuted:    '#2d3d5a',
  skeletonBg:   '#182044',
  sigHigh:      { color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  sigMed:       { color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  sigLow:       { color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  stageChip:    { bg: '#111d38', color: '#4a5a8a' },
  statBg:       '#0c1428',
  statBorder:   '#182044',
  statMuted:    '#334166',
  pillInactive: { border: '#1e3058', color: '#4a5a8a', bg: 'transparent' },
  refreshBtn:   'linear-gradient(135deg,#6366f1,#8b5cf6)',
  linkColor:    '#38bdf8',
  emptyColor:   '#2d3d5a',
  adminBorder:  '#182044',
};

const LIGHT = {
  pageBg:       '#f4f7ff',
  headerBg:     'linear-gradient(135deg,#ffffff 0%,#eff3ff 60%,#f5f0ff 100%)',
  headerBorder: '#dde4f5',
  cardBg:       '#ffffff',
  cardBorder:   '#e2e8f5',
  surfaceBg:    '#f8faff',
  surfaceBorder:'#dde4f5',
  inputBg:      '#ffffff',
  titleColor:   '#1e3a8a',
  titleShadow:  'none',
  subtitle:     '#64748b',
  textPrimary:  '#0f172a',
  textSecond:   '#475569',
  textMuted:    '#94a3b8',
  skeletonBg:   '#e2e8f5',
  sigHigh:      { color: '#16a34a', bg: 'rgba(22,163,74,0.10)'   },
  sigMed:       { color: '#c2410c', bg: 'rgba(194,65,12,0.10)'   },
  sigLow:       { color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
  stageChip:    { bg: '#f1f5f9', color: '#64748b' },
  statBg:       '#ffffff',
  statBorder:   '#e2e8f5',
  statMuted:    '#94a3b8',
  pillInactive: { border: '#dde4f5', color: '#94a3b8', bg: '#f8faff' },
  refreshBtn:   'linear-gradient(135deg,#4f46e5,#7c3aed)',
  linkColor:    '#2563eb',
  emptyColor:   '#94a3b8',
  adminBorder:  '#e2e8f5',
};

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */
export default function FeedApp({ admin = false }: { admin?: boolean }) {
  /* state — logic unchanged */
  const [items,        setItems]        = useState<Item[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [progress,     setProgress]     = useState('');
  const [stage,        setStage]        = useState('');
  const [disease,      setDisease]      = useState('');
  const [sig,          setSig]          = useState('');
  const [srcFilter,    setSrcFilter]    = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey,       setApiKey]       = useState('');
  const [apiKeySaved,  setApiKeySaved]  = useState(false);
  const [unlocked,     setUnlocked]     = useState(false);
  const [adminPass,    setAdminPass]    = useState('');
  /* theme state */
  const [darkMode,     setDarkMode]     = useState(true);
  const [currentFeed,  setCurrentFeed]  = useState('');
  const [showStages,   setShowStages]   = useState(false);
  const T = darkMode ? DARK : LIGHT;

  useEffect(() => {
    const k = localStorage.getItem('ANTHROPIC_API_KEY') || '';
    setApiKey(k);
    setApiKeySaved(!!k);
    const saved = localStorage.getItem('dd:darkMode');
    if (saved !== null) setDarkMode(saved !== 'false');
    refresh();
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('dd:darkMode', String(next));
  };

  /* memos — logic unchanged */
  const filtered = useMemo(() => {
    const dl = disease.toLowerCase();
    return items.filter(i =>
      (!stage     || i.stage        === stage) &&
      (!sig       || i.significance === sig) &&
      (!srcFilter || i.source       === srcFilter) &&
      (!disease   || [i.disease, i.title, i.description, i.summary]
        .some(s => (s || '').toLowerCase().includes(dl)))
    );
  }, [items, stage, disease, sig, srcFilter]);

  const stats = useMemo(() => ({
    total:  filtered.length,
    high:   filtered.filter(i => i.significance === 'High').length,
    medium: filtered.filter(i => i.significance === 'Medium').length,
    low:    filtered.filter(i => i.significance === 'Low').length,
  }), [filtered]);

  const srcCounts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach(i => { c[i.source] = (c[i.source] || 0) + 1; });
    return c;
  }, [items]);

  const dateRange = useMemo(() => {
    if (!items.length) return null;
    const dates = items.map(i => new Date(i.pubDate)).filter(d => !isNaN(d.getTime()));
    if (!dates.length) return null;
    const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
    const newest = new Date(Math.max(...dates.map(d => d.getTime())));
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { from: fmt(oldest), to: fmt(newest) };
  }, [items]);

  /* ── all logic functions unchanged ── */
  async function refresh() {
    setLoading(true);
    setProgress('Starting…');
    const raw = await fetchAllRss();
    setCurrentFeed('');
    setProgress(`Classifying ${raw.length} items…`);
    const uniq = dedupe(raw);
    const processed = await Promise.all(uniq.map(async (item, i) => {
      if (i % 5 === 0) setProgress(`Classifying ${i + 1} / ${uniq.length}…`);
      return classifyItem(item);
    }));
    setItems(processed.filter(i => i.keep).sort(sorter));
    setLoading(false);
    setProgress('');
  }

  async function fetchPubMedEutils(searchTerm: string, sourceName: string, maxResults = 20): Promise<Item[]> {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=${maxResults}&retmode=json&sort=date`;
    const searchData = await (await fetch(searchUrl, { signal: AbortSignal.timeout(12000) })).json();
    const ids: string[] = searchData.esearchresult?.idlist || [];
    if (!ids.length) return [];
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryData = await (await fetch(summaryUrl, { signal: AbortSignal.timeout(12000) })).json();
    const result = summaryData.result || {};
    return ids.map(id => {
      const doc = result[id];
      if (!doc || doc.error) return null;
      const authors = (doc.authors || []).slice(0, 3).map((a: any) => a.name).join(', ');
      return {
        title:       doc.title || '',
        description: [authors, doc.fulljournalname].filter(Boolean).join(' — '),
        link:        `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        pubDate:     doc.pubdate || '',
        source:      sourceName,
      };
    }).filter(Boolean) as Item[];
  }

  async function fetchAllRss() {
    const all: Item[] = [];
    for (const feed of RSS_FEEDS) {
      setCurrentFeed(feed.name);
      try {
        if (feed.type === 'pubmed-eutils') {
          const rows = await fetchPubMedEutils(feed.searchTerm!, feed.name);
          all.push(...rows);
          continue;
        }

        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url!)}`;
        const res   = await fetch(proxy, { signal: AbortSignal.timeout(12000) });

        if (feed.type === 'newsapi') {
          // ── NewsAPI: JSON response ──
          const data = await res.json();
          if (data.status !== 'ok') continue;
          const rows = (data.articles || [])
            .filter((a: any) => a.title && a.title !== '[Removed]')
            .slice(0, 20)
            .map((a: any) => ({
              title:       (a.title || '').trim(),
              description: ((a.description || a.content || '')).slice(0, 500),
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
          // Keyword pre-filter (only for feeds that define keywords)
          if (feed.keywords?.length) {
            rows = rows.filter(r => {
              const text = `${r.title} ${r.description}`.toLowerCase();
              return feed.keywords!.some(k => text.includes(k));
            });
          }
          all.push(...rows.slice(0, 20));
        }
      } catch {}
    }
    return all;
  }

  function getTextContent(el: Element, sel: string) { return (el.querySelector(sel)?.textContent || '').trim(); }
  function getLink(el: Element) {
    const t = (el.querySelector('link')?.textContent || '').trim();
    if (t) return t;
    return (el.querySelector('guid')?.textContent || '').trim();
  }
  function stripHtml(s: string) { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500); }
  function dedupe(xs: Item[]) {
    const seen = new Set<string>();
    return xs.filter(i => {
      const k = (i.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 10).join(' ');
      if (seen.has(k)) return false; seen.add(k); return true;
    });
  }
  async function classifyItem(item: Item) {
    const key = `dd:${item.link || item.title}:${new Date(item.pubDate).toDateString()}`;
    const cached = cacheLoad(key);
    if (cached) return cached;
    let out: any;
    try {
      const k = localStorage.getItem('ANTHROPIC_API_KEY') || '';
      if (!k) throw new Error('nokey');
      const res  = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: buildPrompt(item) }] }),
      });
      const data = await res.json();
      const text = (data?.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
      out = JSON.parse(text);
    } catch { out = heuristic(item); }
    const merged = { ...item, ...out };
    cacheSave(key, merged);
    return merged;
  }
  function heuristic(item: Item) {
    const t    = `${item.title} ${item.description}`.toLowerCase();
    const keep = DRUG_DISC_RE.test(t) && !SKIP_RE.test(t);
    const stg  = t.includes('phase') ? 'Clinical' : t.includes('fda') ? 'Approval' : t.includes('preclinical') ? 'Preclinical' : t.includes('target') ? 'Target ID' : 'Method';
    const significance = /phase 3|fda approval|breakthrough|approved/.test(t) ? 'High' : /phase 2|phase 1|trial|clinical/.test(t) ? 'Medium' : 'Low';
    const dm = t.match(/alzheimer|parkinson|cancer|tumor|oncolog|neurodegenera|diabetes|autoimmune|inflammation|fibrosis/);
    return { keep, stage: stg, disease: dm ? dm[0].charAt(0).toUpperCase() + dm[0].slice(1) : 'General', target: 'Unknown', significance, summary: item.title, relevance_score: keep ? 5 : 1 };
  }
  function cacheSave(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify({ exp: Date.now() + CACHE_TTL, v })); } catch {} }
  function cacheLoad(k: string) { try { const x = JSON.parse(localStorage.getItem(k) || 'null'); if (!x || x.exp < Date.now()) return null; return x.v; } catch { return null; } }
  function saveApiKey()  { localStorage.setItem('ANTHROPIC_API_KEY', apiKey); setApiKeySaved(!!apiKey); setShowSettings(false); }
  function clearApiKey() { localStorage.removeItem('ANTHROPIC_API_KEY'); setApiKey(''); setApiKeySaved(false); }

  /* ── UI helpers ── */
  const srcColor = (name: string) => RSS_FEEDS.find(f => f.name === name)?.color || '#6b7280';

  const sigStyle = (s?: string) =>
    s === 'High' ? T.sigHigh : s === 'Medium' ? T.sigMed : T.sigLow;

  const pill = (label: string, active: boolean, activeColor: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      cursor: 'pointer', transition: 'all 0.15s',
      border:      `1px solid ${active ? activeColor : T.pillInactive.border}`,
      background:  active ? `${activeColor}20` : T.pillInactive.bg,
      color:       active ? activeColor : T.pillInactive.color,
    }}>{label}</button>
  );

  /* shared input/select style */
  const inputStyle: React.CSSProperties = {
    background: T.inputBg, color: T.textPrimary,
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
    padding: '7px 11px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none',
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: T.pageBg, fontFamily: "'Inter','Segoe UI',Arial,sans-serif", transition: 'background 0.3s' }}>

      {/* ══ CSS keyframes injected once ══ */}
      <style>{`
        @keyframes dd-bar  { 0%{width:5%} 40%{width:60%} 70%{width:80%} 100%{width:95%} }
        @keyframes dd-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes dd-fade { 0%{opacity:0;transform:translateY(-4px)} 100%{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ══ Top loading progress bar ══ */}
      {loading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: darkMode ? '#0c1428' : '#e0e7ff' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#38bdf8)', animation: 'dd-bar 12s ease-out forwards', borderRadius: '0 2px 2px 0' }} />
        </div>
      )}

      {/* ══════════════ HEADER ══════════════ */}
      <header style={{
        background: T.headerBg,
        borderBottom: `1px solid ${T.headerBorder}`,
        padding: '20px 0 18px',
        marginBottom: 32,
        boxShadow: darkMode ? '0 4px 24px rgba(0,0,0,0.4)' : '0 2px 12px rgba(99,102,241,0.06)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>

          {/* Branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Icon mark */}
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, boxShadow: '0 0 20px rgba(99,102,241,0.55)',
              flexShrink: 0,
            }}>🧬</div>
            <div>
              <h1 style={{
                margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.3px',
                color: T.titleColor,
                textShadow: T.titleShadow,
              }}>
                Drug Discovery Feed
              </h1>
              <p style={{ margin: '3px 0 0', color: T.subtitle, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{RSS_FEEDS.length} live sources · AI classification</span>
                {dateRange && (
                  <span style={{ background: darkMode ? 'rgba(99,102,241,0.15)' : '#ede9fe', color: darkMode ? '#a5b4fc' : '#5b21b6', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                    📅 {dateRange.from} – {dateRange.to}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Loading badge + spinner */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'dd-fade 0.3s ease' }}>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(129,140,248,0.25)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'dd-spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#818cf8', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {currentFeed ? `Fetching ${currentFeed}…` : progress}
                </span>
              </div>
            )}

            {/* Dark / Light toggle */}
            <button onClick={toggleDark} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} style={{
              background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${T.surfaceBorder}`,
              borderRadius: 8, padding: '7px 12px',
              color: T.textSecond, cursor: 'pointer', fontSize: 15,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {darkMode ? '☀️' : '🌙'}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{darkMode ? 'Light' : 'Dark'}</span>
            </button>

            {/* API key button */}
            <button onClick={() => setShowSettings(!showSettings)} style={{
              background: showSettings ? (darkMode ? 'rgba(99,102,241,0.15)' : '#ede9fe') : (darkMode ? 'rgba(255,255,255,0.04)' : '#f8faff'),
              border: `1px solid ${apiKeySaved ? '#22c55e55' : T.surfaceBorder}`,
              borderRadius: 8, padding: '7px 13px',
              color: apiKeySaved ? '#22c55e' : T.textSecond,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              {apiKeySaved ? '🔑 Key saved ✓' : '⚙ API Key'}
            </button>

            {/* Refresh */}
            <button onClick={refresh} disabled={loading} style={{
              background: T.refreshBtn,
              border: 'none', borderRadius: 8, padding: '8px 18px',
              color: '#fff', cursor: loading ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.35)',
            }}>
              {loading ? '⟳ Refreshing…' : '↺ Refresh'}
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px 56px' }}>

        {/* ══════════════ API KEY PANEL ══════════════ */}
        {showSettings && (
          <div style={{
            background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`,
            borderRadius: 14, padding: '18px 20px', marginBottom: 24,
            boxShadow: darkMode ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <p style={{ margin: '0 0 12px', color: T.textSecond, fontSize: 13, fontWeight: 600 }}>Anthropic API Key</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-…" style={{ ...inputStyle, width: 300 }} />
              <button onClick={saveApiKey} style={{
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none',
                borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>Save</button>
              <button onClick={clearApiKey} style={{
                background: darkMode ? '#1a2540' : '#f1f5f9', border: 'none',
                borderRadius: 8, padding: '8px 14px', color: T.textSecond, cursor: 'pointer', fontSize: 12,
              }}>Clear</button>
            </div>
            <p style={{ margin: '8px 0 0', color: T.textMuted, fontSize: 11 }}>
              Stored only in your browser. Without it, keyword heuristics are used.
            </p>
          </div>
        )}

        {/* ══════════════ SOURCE CHIPS ══════════════ */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {pill(`All  (${items.length})`, !srcFilter, '#818cf8', () => setSrcFilter(''))}
          {RSS_FEEDS.map(f => pill(
            `${f.name}${srcCounts[f.name] ? `  ${srcCounts[f.name]}` : ''}`,
            srcFilter === f.name, f.color,
            () => setSrcFilter(srcFilter === f.name ? '' : f.name),
          ))}
        </div>

        {/* ══════════════ FILTER ROW ══════════════ */}
        {!admin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
            <select value={stage} onChange={e => setStage(e.target.value)} style={inputStyle}>
              <option value="">All Stages</option>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input value={disease} onChange={e => setDisease(e.target.value)}
              placeholder="🔍  Search disease, keyword…"
              style={{ ...inputStyle, width: 230 }} />
            {/* Significance pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {pill('All', sig === '', '#818cf8', () => setSig(''))}
              {pill('🟢 High',   sig === 'High',   T.sigHigh.color, () => setSig(sig === 'High'   ? '' : 'High'))}
              {pill('🟠 Medium', sig === 'Medium', T.sigMed.color,  () => setSig(sig === 'Medium' ? '' : 'Medium'))}
              {pill('⚪ Low',    sig === 'Low',    T.sigLow.color,  () => setSig(sig === 'Low'    ? '' : 'Low'))}
            </div>
          </div>
        )}

        {/* ══════════════ STAGES INFO ══════════════ */}
        {!admin && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowStages(!showStages)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: T.textMuted, fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ fontSize: 14 }}>{showStages ? '▾' : '▸'}</span>
              What do the stages mean? · Apply to <strong style={{ color: T.textSecond }}>all 6 sources</strong>
            </button>
            {showStages && (
              <div style={{ marginTop: 10, background: T.surfaceBg, border: `1px solid ${T.surfaceBorder}`, borderRadius: 12, padding: '14px 18px', animation: 'dd-fade 0.2s ease' }}>
                <p style={{ margin: '0 0 10px', color: T.textSecond, fontSize: 12, fontWeight: 600 }}>
                  Stages are assigned by AI (or keyword heuristic) to every article from every source — STAT News, BioPharma Dive, Fierce Biotech, bioRxiv, and both PubMed feeds.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
                  {[
                    { stage: 'Target ID',   desc: 'New drug target identified — gene, protein, or pathway', color: '#38bdf8' },
                    { stage: 'Preclinical', desc: 'Lab or animal model studies before human trials',         color: '#a78bfa' },
                    { stage: 'Clinical',    desc: 'Phase 1/2/3 human trials underway or reported',           color: '#fb923c' },
                    { stage: 'Approval',    desc: 'FDA or regulatory decision (approved, rejected, review)', color: '#4ade80' },
                    { stage: 'Method',      desc: 'New assay, AI tool, screening platform, or technique',    color: '#f87171' },
                    { stage: 'Industry',    desc: 'Business news — funding, partnerships, M&A, market',      color: '#a3e635' },
                  ].map(s => (
                    <div key={s.stage} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ background: `${s.color}22`, color: s.color, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', marginTop: 1 }}>{s.stage}</span>
                      <span style={{ fontSize: 12, color: T.textSecond, lineHeight: 1.4 }}>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ STATS BAR ══════════════ */}
        {!loading && items.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Showing',  val: stats.total,  color: '#818cf8' },
              { label: 'High',     val: stats.high,   color: T.sigHigh.color },
              { label: 'Medium',   val: stats.medium, color: T.sigMed.color  },
              { label: 'Low',      val: stats.low,    color: T.sigLow.color  },
            ].map(s => (
              <div key={s.label} style={{
                background: T.statBg, border: `1px solid ${T.statBorder}`,
                borderRadius: 12, padding: '10px 20px', textAlign: 'center',
                boxShadow: darkMode ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: T.statMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════ SKELETONS ══════════════ */}
        {loading && [1, 2, 3, 4].map(n => (
          <div key={n} style={{
            background: T.cardBg, border: `1px solid ${T.cardBorder}`,
            borderRadius: 14, padding: 20, marginBottom: 12,
            opacity: 0.25 + n * 0.15,
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ background: T.skeletonBg, height: 22, width: 64, borderRadius: 999 }} />
              <div style={{ background: T.skeletonBg, height: 22, width: 88, borderRadius: 999 }} />
            </div>
            <div style={{ background: T.skeletonBg, height: 17, width: '62%', borderRadius: 6, marginBottom: 10 }} />
            <div style={{ background: T.skeletonBg, height: 13, width: '87%', borderRadius: 6, marginBottom: 7 }} />
            <div style={{ background: T.skeletonBg, height: 13, width: '71%', borderRadius: 6 }} />
          </div>
        ))}

        {/* ══════════════ ARTICLE CARDS ══════════════ */}
        {!loading && filtered.map((item, idx) => {
          const ss   = sigStyle(item.significance);
          const bc   = srcColor(item.source);
          const date = item.pubDate
            ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
          return (
            <article key={idx} style={{
              background:   T.cardBg,
              border:       `1px solid ${T.cardBorder}`,
              borderLeft:   `4px solid ${ss.color}`,
              borderRadius: 14,
              padding:      '16px 20px',
              marginBottom: 12,
              boxShadow:    darkMode ? 'none' : '0 1px 6px rgba(0,0,0,0.05)',
              transition:   'box-shadow 0.15s',
            }}>

              {/* Badge row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                {/* Significance */}
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: ss.bg, color: ss.color,
                }}>
                  {item.significance === 'High' ? '● ' : item.significance === 'Medium' ? '◐ ' : '○ '}
                  {item.significance || 'Low'}
                </span>
                {/* Stage */}
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                  background: T.stageChip.bg, color: T.stageChip.color,
                }}>
                  {item.stage || 'General'}
                </span>
                {/* Source — pushed right */}
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: `${bc}18`, color: bc,
                  marginLeft: 'auto',
                }}>
                  {item.source}
                </span>
                {date && (
                  <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{date}</span>
                )}
              </div>

              {/* Title */}
              <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: T.textPrimary, lineHeight: 1.45 }}>
                {item.title}
              </h3>

              {/* Summary */}
              <p style={{ margin: '0 0 12px', fontSize: 13, color: T.textSecond, lineHeight: 1.6 }}>
                {item.summary || (item.description || '').slice(0, 280)}
              </p>

              {/* Metadata */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap', alignItems: 'center', color: T.textMuted }}>
                {item.disease && item.disease !== 'General' && (
                  <span>Disease: <strong style={{ color: T.linkColor, fontWeight: 600 }}>{item.disease}</strong></span>
                )}
                {item.target && item.target !== 'Unknown' && item.target !== 'None' && (
                  <span>Target: <strong style={{ color: '#c084fc', fontWeight: 600 }}>{item.target}</strong></span>
                )}
                {item.relevance_score !== undefined && (
                  <span>Score: <strong style={{ color: ss.color, fontWeight: 700 }}>{item.relevance_score}/10</strong></span>
                )}
                {item.link && (
                  <a href={item.link} target="_blank" rel="noreferrer" style={{
                    marginLeft: 'auto', color: T.linkColor, fontSize: 12,
                    fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    Read full article <span style={{ fontSize: 14 }}>↗</span>
                  </a>
                )}
              </div>
            </article>
          );
        })}

        {/* ══════════════ EMPTY STATES ══════════════ */}
        {!loading && filtered.length === 0 && items.length > 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: T.emptyColor }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔬</div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No items match current filters.</p>
            <p style={{ fontSize: 13 }}>Try broadening your search or clearing filters.</p>
          </div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '72px 20px', color: T.emptyColor }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🧪</div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No items loaded yet.</p>
            <p style={{ fontSize: 13 }}>Click <strong style={{ color: '#818cf8' }}>↺ Refresh</strong> to fetch the latest drug discovery intelligence.</p>
          </div>
        )}

        {/* ══════════════ ADMIN ══════════════ */}
        {admin && !unlocked && (
          <div style={{ marginTop: 40, borderTop: `1px solid ${T.adminBorder}`, paddingTop: 28 }}>
            <h2 style={{ color: T.textSecond, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Professor Review</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                placeholder="Admin password" style={inputStyle} />
              <button onClick={() => setUnlocked(adminPass === 'pipelineq-prof')} style={{
                background: T.refreshBtn, border: 'none', borderRadius: 8,
                padding: '8px 18px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}>
                Unlock
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ textAlign: 'center', padding: '28px 20px 36px', fontSize: 12, color: T.textMuted, borderTop: `1px solid ${T.cardBorder}`, marginTop: 40 }}>
        © 2026 All Rights Reserved &nbsp;·&nbsp; Implemented by <strong style={{ color: T.textSecond }}>Nikhil Kurmachalam</strong> &nbsp;·&nbsp; <span style={{ color: T.textSecond }}>SPARC · UAB</span>
      </footer>
    </div>
  );
}

function sorter(a: Item, b: Item) {
  const w: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  return (w[b.significance || 'Low'] - w[a.significance || 'Low']) || (+new Date(b.pubDate) - +new Date(a.pubDate));
}
