'use client';
import { useEffect, useMemo, useState } from 'react';
import { buildPrompt } from '../lib/prompt';

type Item = { title: string; description: string; link: string; pubDate: string; source: string; keep?: boolean; stage?: string; disease?: string; target?: string; significance?: 'High'|'Medium'|'Low'; summary?: string; relevance_score?: number };
const RSS_FEEDS = [
  { name: 'STAT News', url: 'https://www.statnews.com/feed/' },
  { name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/' },
  { name: 'Fierce Biotech', url: 'https://www.fiercebiotech.com/rss/xml' },
  { name: 'bioRxiv', url: 'https://www.biorxiv.org/rss/subject/drug-discovery.xml' }
];
const STAGES = ['Target ID', 'Preclinical', 'Clinical', 'Approval', 'Method', 'Industry'];
const CACHE_TTL = 86400000;

export default function FeedApp({ admin = false }: { admin?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [stage, setStage] = useState(''); const [disease, setDisease] = useState(''); const [sig, setSig] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { refresh(); }, []);
  const filtered = useMemo(() => items.filter(i => (!stage || i.stage===stage) && (!sig || i.significance===sig) && (!disease || (i.disease||'').toLowerCase().includes(disease.toLowerCase()))), [items, stage, disease, sig]);

  async function refresh() { const raw = await fetchAllRss(); const processed = await Promise.all(dedupe(raw).map(classifyItem)); setItems(processed.filter(i => i.keep).sort(sorter)); }
  async function fetchAllRss(){ const all:Item[]=[]; for(const feed of RSS_FEEDS){ try{ const u=`https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`; const xml=await (await fetch(u)).text(); const doc=new DOMParser().parseFromString(xml,'text/xml'); const rows=[...doc.querySelectorAll('item')].slice(0,20).map(i=>({title:text(i,'title'),description:text(i,'description'),link:text(i,'link'),pubDate:text(i,'pubDate'),source:feed.name})); all.push(...rows);}catch{}} return all; }
  function text(n:Element,s:string){return (n.querySelector(s)?.textContent||'').trim();}
  function dedupe(xs:Item[]){ const seen=new Set<string>(); return xs.filter(i=>{const k=(i.title||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').slice(0,10).join(' '); if(seen.has(k)) return false; seen.add(k); return true;});}
  async function classifyItem(item:Item){ const key=`piq:${item.link}:${new Date(item.pubDate).toDateString()}`; const c=load(key); if(c) return c; let out:any; try{ const apiKey=localStorage.getItem('ANTHROPIC_API_KEY')||''; if(!apiKey) throw new Error('nokey'); const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:250,messages:[{role:'user',content:buildPrompt(item)}]})}); const data=await res.json(); out=JSON.parse(data?.content?.[0]?.text||'{}'); }catch{ out=heuristic(item);} const merged={...item,...out}; save(key,merged); return merged; }
  function heuristic(item:Item){ const t=`${item.title} ${item.description}`.toLowerCase(); const stage=t.includes('phase')?'Clinical':t.includes('fda')?'Approval':t.includes('preclinical')?'Preclinical':'Industry'; const significance=/phase 3|fda approval|breakthrough/.test(t)?'High':/phase 2|trial/.test(t)?'Medium':'Low'; return {keep:!/sponsor|webinar|job|opinion/.test(t),stage,disease:'General',target:'None',significance,summary:item.title,relevance_score:5}; }
  function save(k:string,v:any){localStorage.setItem(k,JSON.stringify({exp:Date.now()+CACHE_TTL,v}));}
  function load(k:string){try{const x=JSON.parse(localStorage.getItem(k)||'null'); if(!x||x.exp<Date.now()) return null; return x.v;}catch{return null;}}

  return <div>
    <h1>PipelineIQ — Drug Discovery RSS Hub</h1>
    <p>Frontend-only curated feed using RSS + AI classification.</p>
    {!admin && <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <select value={stage} onChange={e=>setStage(e.target.value)}><option value=''>All Stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}</select>
      <input value={disease} onChange={e=>setDisease(e.target.value)} placeholder='Disease filter' />
      <select value={sig} onChange={e=>setSig(e.target.value)}><option value=''>All Significance</option><option>High</option><option>Medium</option><option>Low</option></select>
      <button onClick={refresh}>Refresh RSS + AI</button>
    </div>}
    {admin && !unlocked && <div><input id='adminPass' type='password' placeholder='Admin password'/><button onClick={()=>setUnlocked((document.getElementById('adminPass') as HTMLInputElement)?.value==='pipelineq-prof')}>Unlock</button></div>}
    {filtered.map((item,idx)=><article key={idx} style={{background:'#111937',border:'1px solid #273163',borderRadius:10,padding:12,margin:'10px 0'}}><div>{item.stage} · {item.significance} · {item.source}</div><h3>{item.title}</h3><p>{item.summary||item.description}</p><small>Disease: {item.disease||'General'} · Target: {item.target||'None'} · Relevance: {item.relevance_score??0}/10</small></article>)}
  </div>;
}
function sorter(a:Item,b:Item){const w:any={High:3,Medium:2,Low:1}; return (w[b.significance||'Low']-w[a.significance||'Low']) || (+new Date(b.pubDate)- +new Date(a.pubDate));}
