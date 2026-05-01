import { buildPrompt } from './prompt.js';

const RSS_FEEDS = [
  { name: 'STAT News', url: 'https://www.statnews.com/feed/' },
  { name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/' },
  { name: 'Fierce Biotech', url: 'https://www.fiercebiotech.com/rss/xml' },
  { name: 'bioRxiv', url: 'https://www.biorxiv.org/rss/subject/drug-discovery.xml' }
];

const STAGES = ['Target ID', 'Preclinical', 'Clinical', 'Approval', 'Method', 'Industry'];
const CACHE_TTL = 24 * 60 * 60 * 1000;
const ADMIN_PASSWORD = 'pipelineq-prof';

const state = { items: [], approved: loadApproved() };
const feedEl = document.getElementById('feed');
const stageFilter = document.getElementById('stageFilter');
const diseaseFilter = document.getElementById('diseaseFilter');
const sigFilter = document.getElementById('sigFilter');

for (const s of STAGES) stageFilter.innerHTML += `<option>${s}</option>`;

document.getElementById('refreshBtn').addEventListener('click', refresh);
stageFilter.addEventListener('change', render);
diseaseFilter.addEventListener('input', render);
sigFilter.addEventListener('change', render);
document.getElementById('unlockAdmin').addEventListener('click', unlockAdmin);
if (location.hash === '#admin') document.getElementById('admin').classList.remove('hidden');

refresh();

async function refresh() {
  const raw = await fetchAllRss();
  const deduped = dedupe(raw);
  const processed = [];
  for (const item of deduped) processed.push(await classifyItem(item));
  state.items = processed.filter(i => i.keep).sort(sortBySignificanceThenDate);
  saveCache(state.items);
  render();
}

async function fetchAllRss() {
  const all = [];
  for (const feed of RSS_FEEDS) {
    const via = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`;
    try {
      const xml = await (await fetch(via)).text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const items = [...doc.querySelectorAll('item')].slice(0, 20).map(i => ({
        title: text(i, 'title'), description: text(i, 'description'),
        link: text(i, 'link'), pubDate: text(i, 'pubDate'), source: feed.name
      }));
      all.push(...items);
    } catch {}
  }
  return all;
}

function text(node, sel) { return (node.querySelector(sel)?.textContent || '').trim(); }
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(); }
function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = norm(i.title).split(' ').slice(0, 10).join(' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function classifyItem(item) {
  const key = `piq:${item.link}:${new Date(item.pubDate).toDateString()}`;
  const cached = loadWithTTL(key);
  if (cached) return cached;

  const prompt = buildPrompt(item);
  const apiKey = localStorage.getItem('ANTHROPIC_API_KEY') || '';
  let out;
  try {
    if (!apiKey) throw new Error('No key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 250, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    out = JSON.parse(data?.content?.[0]?.text || '{}');
  } catch {
    out = heuristic(item);
  }

  const merged = { ...item, ...out };
  saveWithTTL(key, merged);
  return merged;
}

function heuristic(item) {
  const t = `${item.title} ${item.description}`.toLowerCase();
  const stage = t.includes('phase') ? 'Clinical' : t.includes('fda') ? 'Approval' : t.includes('preclinical') ? 'Preclinical' : 'Industry';
  const significance = /phase 3|fda approval|breakthrough/.test(t) ? 'High' : /phase 2|trial/.test(t) ? 'Medium' : 'Low';
  return { keep: !/sponsor|webinar|job|opinion/.test(t), stage, disease: 'General', target: 'None', significance, summary: item.title, relevance_score: 5 };
}

function sortBySignificanceThenDate(a,b){const w={High:3,Medium:2,Low:1};return (w[b.significance]-w[a.significance])||((new Date(b.pubDate))-(new Date(a.pubDate)));}

function render() {
  const stage = stageFilter.value;
  const disease = diseaseFilter.value.toLowerCase();
  const sig = sigFilter.value;
  const filtered = state.items.filter(i => (!stage || i.stage===stage) && (!sig || i.significance===sig) && (!disease || (i.disease||'').toLowerCase().includes(disease)));
  feedEl.innerHTML = filtered.map(item => `
    <article class="card">
      <div><span class="pill">${item.stage}</span><span class="pill">${item.significance}</span><span class="pill">${item.source}</span></div>
      <h3>${item.title}</h3>
      <p>${item.summary || item.description}</p>
      <small>Disease: ${item.disease || 'General'} · Target: ${item.target || 'None'} · Relevance: ${item.relevance_score ?? 0}/10</small><br>
      <a href="${item.link}" target="_blank">Open article</a>
    </article>
  `).join('') || '<p>No matching items.</p>';
}

function unlockAdmin(){
  if(document.getElementById('adminPassword').value!==ADMIN_PASSWORD) return alert('Invalid password');
  const panel=document.getElementById('adminPanel');panel.classList.remove('hidden');
  panel.innerHTML=state.items.map((i,idx)=>`<div class='card'><strong>${i.title}</strong><br><button data-a='${idx}'>Approve</button> <button data-d='${idx}'>Dismiss</button></div>`).join('');
  panel.onclick=(e)=>{const a=e.target.dataset.a,d=e.target.dataset.d;if(a){state.approved[iKey(state.items[a])]=state.items[a];saveApproved(state.approved);}if(d){delete state.approved[iKey(state.items[d])];saveApproved(state.approved);}};
}
function iKey(i){return i.link||i.title;}
function saveWithTTL(k,v){localStorage.setItem(k,JSON.stringify({exp:Date.now()+CACHE_TTL,v}));}
function loadWithTTL(k){try{const x=JSON.parse(localStorage.getItem(k)||'null');if(!x||x.exp<Date.now())return null;return x.v;}catch{return null;}}
function saveCache(items){saveWithTTL('piq:last_feed',items)}
function saveApproved(a){localStorage.setItem('piq:approved',JSON.stringify(a));}
function loadApproved(){try{return JSON.parse(localStorage.getItem('piq:approved')||'{}')}catch{return {};}}
