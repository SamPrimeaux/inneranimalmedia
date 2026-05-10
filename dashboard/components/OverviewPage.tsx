/**
 * OverviewPage.tsx — remaster v2
 * Inner Animal Media · Agent Sam Observability
 * No emojis · Dense charts · CMS theme-compatible via var(--theme-*)
 */

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, ScatterChart, Scatter,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from "recharts";

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:      "var(--theme-bg,       #081520)",
  surface: "var(--theme-surface,  #0d1e2c)",
  surf2:   "var(--theme-surface2, #112333)",
  border:  "var(--theme-border,   rgba(255,255,255,0.07))",
  text:    "var(--theme-text,     #ddeaf5)",
  muted:   "var(--theme-muted,    #6b8fa8)",
  accent:  "var(--theme-accent,   #2dd4bf)",
  accent2: "var(--theme-accent2,  #7c3aed)",
  font:    "var(--theme-font,     'DM Mono','JetBrains Mono',monospace)",
  green:   "#22c55e",
  red:     "#ef4444",
  amber:   "#f59e0b",
  blue:    "#3b82f6",
  violet:  "#8b5cf6",
};

const PC: Record<string, string> = {
  openai: "#10a37f", anthropic: "#d97706", google: "#4285f4",
  meta: "#1877f2", mistral: "#ff6b35", other: "#6b7280",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiStripData  { api_calls:number; tokens_used:number; cost_usd:number; tool_calls:number; mcp_calls:number; deployments:number; }
interface ActivityData  { weekly_activity:{deploys:number;tasks_completed:number;agent_calls:number}; worked_this_week:{hours_this_week:number;hours_today:number}; projects:{active:number;top:any[]}; }
interface AgentActivity { sessions:number; llm_calls:number; top_model:string|null; total_cost_usd:number; events:Array<{type:string;count:number;cost:number}>; }
interface WorkflowData  { total:number; by_intent:Array<{intent:string;count:number;success_rate:number}>; recent:any[]; }
interface DeployData    { deployments:any[]; cicd_runs:any[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = {
  usd: (n:number) => n>=1000?`$${(n/1000).toFixed(1)}K`:`$${n.toFixed(2)}`,
  num: (n:number) => n>=1_000_000?`${(n/1_000_000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(1)}K`:String(Math.round(n)),
  tok: (n:number) => n>=1_000_000?`${(n/1_000_000).toFixed(2)}M`:`${(n/1000).toFixed(0)}K`,
  pct: (n:number) => `${n>=0?"+":""}${n.toFixed(1)}%`,
  hrs: (n:number) => `${n.toFixed(1)}h`,
};

const rand = (base:number, variance=0.35) => base*(1-variance/2+(Math.random()-0.5)*variance);
const seedArr = (base:number, len=9) => Array.from({length:len},(_,i)=>Math.max(0, base*(0.7+Math.sin(i*1.4)*0.2+Math.random()*0.3)));
const DAYS = ["May 8","May 9","May 10","May 11","May 12","May 13","May 14"];

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const Ico = {
  flame:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2c0 6-6 6-6 12a6 6 0 0012 0c0-6-6-6-6-12z"/></svg>,
  cpu:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M20 9h3M1 15h3M20 15h3"/></svg>,
  cloud:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10a6 6 0 00-12 0 4 4 0 000 8h12a4 4 0 000-8z"/></svg>,
  zap:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  clock:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  tool:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  list:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  pulse:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  refresh: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  db:      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  route:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M5 9v4a7 7 0 007 7M19 9v4a7 7 0 01-7 7"/></svg>,
  deploy:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>,
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, style={} }:{ children:React.ReactNode; style?:React.CSSProperties }) {
  return <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:16, ...style }}>{children}</div>;
}

function CardHeader({ icon, title, action }:{ icon?:React.ReactNode; title:string; action?:React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
        {icon && <span style={{ color:T.muted, display:"flex", alignItems:"center" }}>{icon}</span>}
        <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

function Pill({ label }:{ label:string }) {
  return <span style={{ fontSize:10, color:T.muted, background:T.surf2, padding:"3px 10px", borderRadius:20, cursor:"pointer" }}>{label} ▾</span>;
}

function Skel({ w="100%", h=16, r=4 }:{ w?:string|number; h?:number; r?:number }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:"rgba(255,255,255,0.05)", animation:"ovpulse 1.6s ease-in-out infinite" }} />;
}

function Dot({ c }:{ c:string }) {
  return <div style={{ width:7, height:7, borderRadius:"50%", background:c, flexShrink:0 }} />;
}

function Trend({ val }:{ val:number }) {
  return <span style={{ fontSize:10, fontWeight:700, color:val>=0?T.green:T.red }}>{val>=0?"▲":"▼"} {Math.abs(val).toFixed(1)}%</span>;
}

function Sparkline({ data, color=T.accent, h=36, w=110 }:{ data:number[]; color?:string; h?:number; w?:number }) {
  if (!data||data.length<2) return <div style={{ height:h }} />;
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
  const pts = data.map((v,i)=>[(i/(data.length-1))*w, h-((v-min)/range)*(h-6)-3]);
  const line = pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = color.replace(/[^a-z0-9]/gi,"x");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#sp${id})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

const Tip = ({ active, payload, label, fmt: fmtFn }:any) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#0a1825", border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", fontSize:11, fontFamily:T.font }}>
      {label && <div style={{ color:T.muted, marginBottom:4 }}>{label}</div>}
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{ color:p.color||T.text, display:"flex", gap:8 }}>
          <span style={{ color:T.muted }}>{p.name}:</span>
          <span style={{ fontWeight:600 }}>{fmtFn?fmtFn(p.value,p.name):p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Cards ────────────────────────────────────────────────────────────────

interface KpiDef { icon:React.ReactNode; label:string; value:string; trend:number; compare:string; spark:number[]; color:string; }

function KpiCard({ icon, label, value, trend, compare, spark, color, loading }:KpiDef&{loading:boolean}) {
  return (
    <Card style={{ flex:"1 1 152px", minWidth:0, padding:"13px 14px", display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ display:"flex", alignItems:"center", gap:5, color:color, fontSize:10, fontWeight:600, letterSpacing:"0.07em", textTransform:"uppercase" }}>
        <span style={{ display:"flex" }}>{icon}</span>
        <span style={{ color:T.muted }}>{label}</span>
      </div>
      {loading ? (<><Skel h={24} w="55%"/><Skel h={36}/><Skel h={10} w="60%"/></>) : (
        <>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
            <span style={{ fontSize:20, fontWeight:700, letterSpacing:"-0.02em" }}>{value}</span>
            <Trend val={trend}/>
          </div>
          <Sparkline data={spark} color={color} h={36} w={130}/>
          <div style={{ fontSize:9, color:T.muted }}>{compare}</div>
        </>
      )}
    </Card>
  );
}

// ─── Spend Over Time ─────────────────────────────────────────────────────────

function SpendChart() {
  const data = DAYS.map((date,i)=>({
    date, openai:800+i*90+rand(200), anthropic:400+i*60+rand(150),
    google:250+i*30+rand(100), meta:120+rand(80), other:60+rand(40),
  }));
  return (
    <Card style={{ gridColumn:"span 3" }}>
      <CardHeader icon={Ico.flame} title="AI Spend Over Time" action={<Pill label="Last 7 Days"/>}/>
      <ResponsiveContainer width="100%" height={168}>
        <AreaChart data={data} margin={{top:4,right:4,left:-18,bottom:0}}>
          <defs>
            {Object.entries(PC).map(([k,c])=>(
              <linearGradient key={k} id={`ag${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c} stopOpacity=".5"/>
                <stop offset="95%" stopColor={c} stopOpacity="0"/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
          <XAxis dataKey="date" tick={{fontSize:10,fill:T.muted}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:T.muted}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v.toFixed(0)}`}/>
          <Tooltip content={<Tip fmt={(v:number)=>`$${v.toFixed(2)}`}/>}/>
          {["openai","anthropic","google","meta","other"].map(k=>(
            <Area key={k} type="monotone" dataKey={k} stackId="1" name={k.charAt(0).toUpperCase()+k.slice(1)}
              stroke={PC[k]} fill={`url(#ag${k})`} strokeWidth={1.5}/>
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
        {Object.entries({OpenAI:"openai",Anthropic:"anthropic",Google:"google",Meta:"meta",Other:"other"}).map(([l,k])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:T.muted }}>
            <div style={{ width:8, height:8, borderRadius:2, background:PC[k] }}/>{l}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Workflow Panel ───────────────────────────────────────────────────────────

function WorkflowPanel({ data }:{ data:WorkflowData|null }) {
  const total = data?.total||1248;
  const pie = [
    {name:"Completed",value:74,color:T.accent},{name:"Succeeded",value:16,color:T.green},
    {name:"Failed",value:7,color:T.red},{name:"Running",value:3,color:T.amber},
  ];
  const intents = data?.by_intent?.slice(0,5)||[
    {intent:"code_gen",count:341},{intent:"file_ops",count:279},
    {intent:"search",count:214},{intent:"deploy",count:187},{intent:"mcp_tool",count:156},
  ];
  const maxI = Math.max(...intents.map(i=>i.count),1);
  return (
    <Card>
      <CardHeader icon={Ico.cpu} title="Batch / Workflow"/>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <div style={{ position:"relative", width:88, height:88, flexShrink:0 }}>
          <ResponsiveContainer width={88} height={88}>
            <PieChart>
              <Pie data={pie} cx="50%" cy="50%" innerRadius={26} outerRadius={42} dataKey="value" strokeWidth={0}>
                {pie.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <span style={{ fontSize:13, fontWeight:700 }}>{(total/1000).toFixed(1)}K</span>
            <span style={{ fontSize:8, color:T.muted }}>runs</span>
          </div>
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
          {pie.map(e=>(
            <div key={e.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}><Dot c={e.color}/><span style={{ fontSize:10, color:T.muted }}>{e.name}</span></div>
              <span style={{ fontSize:10, fontWeight:600 }}>{e.value}%</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
        <div style={{ fontSize:9, color:T.muted, fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:7 }}>By Intent</div>
        {intents.map(it=>(
          <div key={it.intent} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
            <div style={{ fontSize:9, color:T.muted, width:60, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.intent}</div>
            <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(it.count/maxI)*100}%`, background:T.accent, borderRadius:2 }}/>
            </div>
            <div style={{ fontSize:9, color:T.muted, width:26, textAlign:"right" }}>{it.count}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Top Services ─────────────────────────────────────────────────────────────

function TopServices({ events }:{ events:Array<{type:string;count:number}> }) {
  const svcs = events.length>0 ? events.slice(0,7) : [
    {type:"Web Search",count:18700},{type:"Code Interpreter",count:14200},{type:"Vector Store",count:11900},
    {type:"Browser Auto",count:9800},{type:"File Reader",count:7300},{type:"DB Query",count:5100},{type:"R2 Write",count:3400},
  ];
  const chartData = svcs.map(s=>({ name:s.type.split(" ")[0], value:s.count }));
  return (
    <Card>
      <CardHeader icon={Ico.tool} title="Top Services (MCP)"/>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={chartData} layout="vertical" margin={{top:0,right:28,left:0,bottom:0}}>
          <XAxis type="number" hide/>
          <YAxis type="category" dataKey="name" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false} width={54}/>
          <Tooltip content={<Tip fmt={(v:number)=>fmt.num(v)}/>}/>
          <Bar dataKey="value" name="Calls" radius={[0,3,3,0]}>
            {chartData.map((_,i)=><Cell key={i} fill={`rgba(45,212,191,${1-i*0.11})`}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:6 }}>
        {svcs.slice(0,4).map((s,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:7, fontSize:9, color:T.muted }}>
            <span style={{ width:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.type}</span>
            <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.04)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(s.count/18700)*100}%`, background:`rgba(45,212,191,${0.9-i*0.18})`, borderRadius:2 }}/>
            </div>
            <span style={{ width:32, textAlign:"right" }}>{fmt.num(s.count)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Budget Card ──────────────────────────────────────────────────────────────

function BudgetCard({ cost }:{ cost:number }) {
  const budget=60000, pct=Math.min((cost/budget)*100,100);
  const daily = DAYS.map((date,i)=>({ date, spend:(cost/7||5000)*(0.8+i*0.04+Math.random()*0.3) }));
  return (
    <Card>
      <CardHeader icon={Ico.cloud} title="Budget vs Spend" action={<Pill label="Last 7 Days"/>}/>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <div><div style={{ fontSize:18, fontWeight:700 }}>{fmt.usd(cost||37245)}</div><div style={{ fontSize:9, color:T.muted }}>Spent</div></div>
        <div style={{ textAlign:"right" }}><div style={{ fontSize:18, fontWeight:700 }}>{fmt.usd(budget)}</div><div style={{ fontSize:9, color:T.muted }}>Budget</div></div>
      </div>
      <div style={{ height:7, background:"rgba(255,255,255,0.05)", borderRadius:4, marginBottom:5, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${T.accent},${T.violet})`, borderRadius:4 }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:T.muted, marginBottom:12 }}>
        <span>{pct.toFixed(0)}% used</span><span>17 days left</span>
      </div>
      <ResponsiveContainer width="100%" height={52}>
        <BarChart data={daily} margin={{top:0,right:0,left:0,bottom:0}} barSize={8}>
          <Bar dataKey="spend" fill={T.accent} fillOpacity={0.5} radius={[2,2,0,0]} name="Daily"/>
          <Tooltip content={<Tip fmt={(v:number)=>fmt.usd(v)}/>}/>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${T.border}`, paddingTop:10, marginTop:4 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700 }}>{fmt.usd((cost||37245)*1.53)}</div>
          <div style={{ fontSize:9, color:T.muted }}>Projected</div>
          <div style={{ fontSize:9, color:T.green, marginTop:2 }}>▼ 5.2% vs last mo</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:20, fontWeight:700 }}>17</div>
          <div style={{ fontSize:9, color:T.muted }}>Days Left</div>
        </div>
      </div>
    </Card>
  );
}

// ─── Workflow Runs Over Time ──────────────────────────────────────────────────

function WorkflowRunsChart() {
  const data = DAYS.map(date=>({ date, succeeded:Math.round(1400+Math.random()*1200), failed:Math.round(100+Math.random()*280), running:Math.round(50+Math.random()*180) }));
  return (
    <Card>
      <CardHeader icon={Ico.cpu} title="Workflow Runs Over Time" action={<Pill label="Last 7 Days"/>}/>
      <div style={{ display:"flex", gap:14, marginBottom:8 }}>
        {[["Succeeded",T.accent],["Failed",T.red],["Running",T.amber]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.muted }}><Dot c={c}/>{l}</div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{top:0,right:0,left:-22,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
          <XAxis dataKey="date" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="succeeded" stackId="a" fill={T.accent} name="Succeeded"/>
          <Bar dataKey="failed"    stackId="a" fill={T.red}    name="Failed"/>
          <Bar dataKey="running"   stackId="a" fill={T.amber}  name="Running" radius={[2,2,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ─── Tool Call Waterfall ──────────────────────────────────────────────────────

function ToolWaterfall() {
  const steps = [
    {n:1,tool:"read_file",        dur:"1.21s",bar:0, len:10,c:T.accent},
    {n:2,tool:"search_docs",      dur:"2.18s",bar:10,len:18,c:T.blue  },
    {n:3,tool:"code_interpreter", dur:"3.02s",bar:28,len:25,c:T.violet},
    {n:4,tool:"vector_search",    dur:"1.65s",bar:53,len:14,c:T.amber },
    {n:5,tool:"write_file",       dur:"0.87s",bar:67,len: 7,c:T.green },
    {n:6,tool:"deploy_preview",   dur:"1.32s",bar:74,len:11,c:T.accent},
    {n:7,tool:"smoke_test",       dur:"0.94s",bar:85,len: 8,c:T.blue  },
  ];
  return (
    <Card>
      <CardHeader icon={Ico.zap} title="Tool Call Waterfall" action={
        <span style={{ fontSize:10, color:T.green, background:"rgba(34,197,94,0.1)", padding:"2px 8px", borderRadius:20 }}>Success</span>
      }/>
      <div style={{ fontSize:9, display:"grid", gridTemplateColumns:"14px 88px 36px 1fr", gap:"0 8px", color:T.muted, paddingBottom:6, borderBottom:`1px solid ${T.border}`, marginBottom:8 }}>
        <span>#</span><span>Tool</span><span>Dur</span><span>0s — 12s</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {steps.map(s=>(
          <div key={s.n} style={{ display:"grid", gridTemplateColumns:"14px 88px 36px 1fr", gap:"0 8px", alignItems:"center" }}>
            <span style={{ fontSize:9, color:T.muted }}>{s.n}</span>
            <span style={{ fontSize:9, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.tool}</span>
            <span style={{ fontSize:9, color:T.muted }}>{s.dur}</span>
            <div style={{ height:12, background:"rgba(255,255,255,0.04)", borderRadius:3, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, bottom:0, left:`${s.bar}%`, width:`${s.len}%`, background:s.c, borderRadius:3, opacity:0.85 }}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:9, color:T.muted }}>
        <span>Total: 11.19s</span><span>7 tools</span><span>0 errors</span>
      </div>
    </Card>
  );
}

// ─── Error Inbox ──────────────────────────────────────────────────────────────

function ErrorInbox() {
  const rows = [
    {time:"2m",  tag:"Tool",    msg:"Failed to connect to MCP server",  sev:"high",   c:T.red  },
    {time:"15m", tag:"Routing", msg:"No available model for task type", sev:"high",   c:T.red  },
    {time:"1h",  tag:"DB",      msg:"Supabase query timeout 30s",       sev:"medium", c:T.amber},
    {time:"2h",  tag:"Deploy",  msg:"Build failed: TypeScript errors",  sev:"medium", c:T.amber},
    {time:"3h",  tag:"Auth",    msg:"Invalid API key for provider",     sev:"low",    c:T.accent},
    {time:"4h",  tag:"R2",      msg:"Object write exceeded size limit", sev:"low",    c:T.accent},
    {time:"6h",  tag:"Worker",  msg:"CPU time limit approached",        sev:"low",    c:T.accent},
  ];
  const counts = [{l:"High",n:2,c:T.red},{l:"Medium",n:2,c:T.amber},{l:"Low",n:3,c:T.muted}];
  return (
    <Card>
      <CardHeader icon={Ico.pulse} title="Error Inbox" action={<span style={{ fontSize:10, color:T.accent, cursor:"pointer" }}>View All →</span>}/>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {counts.map(s=>(
          <div key={s.l} style={{ flex:1, background:T.surf2, borderRadius:7, padding:"6px 10px", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:s.c }}>{s.n}</div>
            <div style={{ fontSize:9, color:T.muted }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
        {rows.map((e,i)=>(
          <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", padding:"7px 0", borderBottom:i<rows.length-1?`1px solid ${T.border}`:"none" }}>
            <span style={{ fontSize:9, color:T.muted, width:26, flexShrink:0, marginTop:2 }}>{e.time}a</span>
            <span style={{ fontSize:9, fontWeight:700, color:e.c, background:`${e.c}18`, padding:"1px 6px", borderRadius:3, flexShrink:0 }}>{e.tag}</span>
            <span style={{ fontSize:9, color:T.muted, lineHeight:1.5, flex:1 }}>{e.msg}</span>
            <Dot c={e.c}/>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Tokens Over Time ─────────────────────────────────────────────────────────

function TokensChart() {
  const data = DAYS.map(date=>({ date, input:Math.round(180000+Math.random()*300000), output:Math.round(80000+Math.random()*180000), cached:Math.round(40000+Math.random()*90000) }));
  return (
    <Card>
      <CardHeader icon={Ico.zap} title="Tokens Over Time" action={<Pill label="Last 7 Days"/>}/>
      <div style={{ display:"flex", gap:12, marginBottom:8 }}>
        {[["Input",T.accent],["Output",T.violet],["Cached",T.blue]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.muted }}><Dot c={c}/>{l}</div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={148}>
        <AreaChart data={data} margin={{top:0,right:0,left:-22,bottom:0}}>
          <defs>
            {[["ti",T.accent],["to",T.violet],["tc",T.blue]].map(([id,c])=>(
              <linearGradient key={id} id={`tg${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c} stopOpacity=".4"/><stop offset="95%" stopColor={c} stopOpacity="0"/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
          <XAxis dataKey="date" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false} tickFormatter={v=>fmt.tok(v)}/>
          <Tooltip content={<Tip fmt={(v:number)=>fmt.tok(v)}/>}/>
          <Area type="monotone" dataKey="input"  name="Input"  stroke={T.accent} fill="url(#tgti)" strokeWidth={1.5}/>
          <Area type="monotone" dataKey="output" name="Output" stroke={T.violet} fill="url(#tgto)" strokeWidth={1.5}/>
          <Area type="monotone" dataKey="cached" name="Cached" stroke={T.blue}   fill="url(#tgtc)" strokeWidth={1.5}/>
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ─── Model Leaderboard ────────────────────────────────────────────────────────

function ModelLeaderboard() {
  const rows = [
    {rank:1,model:"gpt-4o",           prov:"OpenAI",    pk:"openai",    runs:28400,success:98.5,lat:2.3,cost:0.021},
    {rank:2,model:"claude-3-5-sonnet",prov:"Anthropic", pk:"anthropic", runs:19700,success:97.1,lat:3.1,cost:0.018},
    {rank:3,model:"gemini-1.5-pro",   prov:"Google",    pk:"google",    runs:12600,success:95.3,lat:3.9,cost:0.012},
    {rank:4,model:"llama-3.1-70b",    prov:"Meta",      pk:"meta",      runs:8900, success:92.0,lat:5.7,cost:0.009},
    {rank:5,model:"mistral-large-2",  prov:"Mistral",   pk:"mistral",   runs:6200, success:91.2,lat:4.6,cost:0.011},
  ];
  const maxR = Math.max(...rows.map(r=>r.runs));
  return (
    <Card>
      <CardHeader icon={Ico.list} title="Model Leaderboard" action={<Pill label="All Task Types"/>}/>
      <div style={{ fontSize:9, display:"grid", gridTemplateColumns:"16px minmax(0,1fr) 58px 40px 46px 38px 50px", gap:"0 8px", color:T.muted, paddingBottom:7, borderBottom:`1px solid ${T.border}`, marginBottom:6 }}>
        <span>#</span><span>Model</span><span>Provider</span><span>Runs</span><span>Success</span><span>P95</span><span>$/1K</span>
      </div>
      {rows.map(r=>(
        <div key={r.rank} style={{ marginBottom:8 }}>
          <div style={{ fontSize:10, display:"grid", gridTemplateColumns:"16px minmax(0,1fr) 58px 40px 46px 38px 50px", gap:"0 8px", alignItems:"center", marginBottom:3 }}>
            <span style={{ color:T.muted }}>{r.rank}</span>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.model}</span>
            <span style={{ color:PC[r.pk]||T.muted, fontSize:9 }}>{r.prov}</span>
            <span style={{ color:T.muted }}>{fmt.num(r.runs)}</span>
            <span style={{ color:r.success>95?T.green:T.amber }}>{r.success}%</span>
            <span style={{ color:T.muted }}>{r.lat}s</span>
            <span style={{ color:T.muted }}>${r.cost.toFixed(3)}</span>
          </div>
          <div style={{ height:3, background:"rgba(255,255,255,0.04)", borderRadius:2, marginLeft:24, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(r.runs/maxR)*100}%`, background:PC[r.pk]||T.accent, borderRadius:2, opacity:.7 }}/>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ─── Cost vs Latency Scatter ──────────────────────────────────────────────────

function CostLatency() {
  const sets = [
    {name:"OpenAI",    color:PC.openai,    data:[{x:2.3,y:0.021},{x:1.8,y:0.028},{x:3.2,y:0.015}]},
    {name:"Anthropic", color:PC.anthropic, data:[{x:3.1,y:0.018},{x:4.2,y:0.012}]},
    {name:"Google",    color:PC.google,    data:[{x:3.9,y:0.012},{x:5.1,y:0.009},{x:2.8,y:0.016}]},
    {name:"Meta",      color:PC.meta,      data:[{x:5.7,y:0.009},{x:6.2,y:0.007}]},
    {name:"Mistral",   color:PC.mistral,   data:[{x:4.6,y:0.011}]},
  ];
  return (
    <Card>
      <CardHeader icon={Ico.route} title="Cost vs Latency"/>
      <div style={{ display:"flex", gap:10, marginBottom:6, flexWrap:"wrap" }}>
        {sets.map(s=>(
          <div key={s.name} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:T.muted }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:s.color }}/>{s.name}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={178}>
        <ScatterChart margin={{top:4,right:8,left:-16,bottom:12}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
          <XAxis type="number" dataKey="x" name="P95 Latency" unit="s" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false} domain={[0,8]} label={{value:"P95 Latency (s)",position:"insideBottom",offset:-6,fontSize:9,fill:T.muted}}/>
          <YAxis type="number" dataKey="y" name="Cost" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v.toFixed(3)}`}/>
          <Tooltip content={<Tip fmt={(v:number,n:string)=>n==="P95 Latency"?`${v}s`:`$${v.toFixed(3)}`}/>}/>
          {sets.map(s=><Scatter key={s.name} name={s.name} data={s.data} fill={s.color} fillOpacity={0.85} r={5}/>)}
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ─── Routing Decisions ────────────────────────────────────────────────────────

function RoutingDecisions() {
  const data = DAYS.map(date=>({ date, primary:Math.round(800+Math.random()*600), fallback:Math.round(80+Math.random()*120), override:Math.round(20+Math.random()*60) }));
  const share = [{name:"OpenAI",v:38,c:PC.openai},{name:"Anthropic",v:29,c:PC.anthropic},{name:"Google",v:18,c:PC.google},{name:"Meta",v:10,c:PC.meta},{name:"Other",v:5,c:PC.other}];
  return (
    <Card>
      <CardHeader icon={Ico.route} title="Routing Decisions" action={<Pill label="Last 7 Days"/>}/>
      <div style={{ display:"flex", gap:12, marginBottom:8 }}>
        {[["Primary",T.accent],["Fallback",T.amber],["Override",T.violet]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.muted }}><Dot c={c}/>{l}</div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={108}>
        <AreaChart data={data} margin={{top:0,right:0,left:-28,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
          <XAxis dataKey="date" tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:9,fill:T.muted}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Area type="monotone" dataKey="primary"  name="Primary"  stroke={T.accent} fill={T.accent}  fillOpacity={.12} strokeWidth={1.5}/>
          <Area type="monotone" dataKey="fallback" name="Fallback" stroke={T.amber}  fill={T.amber}   fillOpacity={.12} strokeWidth={1.5}/>
          <Area type="monotone" dataKey="override" name="Override" stroke={T.violet} fill={T.violet}  fillOpacity={.12} strokeWidth={1.5}/>
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ marginTop:10, borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
        <div style={{ fontSize:9, color:T.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Provider Share</div>
        <div style={{ display:"flex", height:7, borderRadius:4, overflow:"hidden", gap:1 }}>
          {share.map(p=><div key={p.name} title={`${p.name}: ${p.v}%`} style={{ width:`${p.v}%`, background:p.c }}/>)}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 12px", marginTop:7 }}>
          {share.map(p=><div key={p.name} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:T.muted }}><Dot c={p.c}/>{p.name} {p.v}%</div>)}
        </div>
      </div>
    </Card>
  );
}

// ─── RAG Health ───────────────────────────────────────────────────────────────

function RagHealth() {
  const pie = [{name:"Healthy",value:82,c:T.green},{name:"Warning",value:11,c:T.amber},{name:"Stale",value:5,c:T.muted},{name:"Critical",value:2,c:T.red}];
  const cov  = DAYS.map(date=>({ date, pct:92+Math.random()*6 }));
  return (
    <Card style={{ flex:"2 1 380px" }}>
      <CardHeader icon={Ico.db} title="RAG / Document Health" action={<span style={{ fontSize:10, color:T.accent, cursor:"pointer" }}>View All →</span>}/>
      <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:14, alignItems:"center" }}>
          <div style={{ position:"relative", width:90, height:90, flexShrink:0 }}>
            <ResponsiveContainer width={90} height={90}>
              <PieChart>
                <Pie data={pie} cx="50%" cy="50%" innerRadius={26} outerRadius={43} dataKey="value" strokeWidth={0}>
                  {pie.map((e,i)=><Cell key={i} fill={e.c}/>)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
              <span style={{ fontSize:13, fontWeight:700 }}>10.5K</span>
              <span style={{ fontSize:8, color:T.muted }}>docs</span>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {pie.map(e=>(
              <div key={e.name} style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"space-between", minWidth:110 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}><Dot c={e.c}/><span style={{ fontSize:10, color:T.muted }}>{e.name}</span></div>
                <span style={{ fontSize:10, fontWeight:600 }}>{e.value}%</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex:"1 1 180px" }}>
          <div style={{ fontSize:9, color:T.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Embedding Coverage (7d)</div>
          <ResponsiveContainer width="100%" height={72}>
            <LineChart data={cov} margin={{top:2,right:4,left:-28,bottom:0}}>
              <XAxis dataKey="date" tick={{fontSize:8,fill:T.muted}} axisLine={false} tickLine={false}/>
              <YAxis domain={[85,100]} tick={{fontSize:8,fill:T.muted}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
              <Tooltip content={<Tip fmt={(v:number)=>`${v.toFixed(1)}%`}/>}/>
              <ReferenceLine y={90} stroke={T.amber} strokeDasharray="3 3"/>
              <Line type="monotone" dataKey="pct" name="Coverage" stroke={T.accent} strokeWidth={1.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
            {[["Chunks","2.1M"],["Embeddings","1.8M"],["Avg Latency","241ms"],["Updated","2m ago"]].map(([l,v])=>(
              <div key={l} style={{ background:T.surf2, borderRadius:6, padding:"7px 10px" }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{v}</div>
                <div style={{ fontSize:9, color:T.muted, marginTop:1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Deployments Timeline ─────────────────────────────────────────────────────

function DeploymentsTimeline({ data }:{ data:DeployData|null }) {
  const deploys = data?.deployments?.slice(0,6)||[];
  const hist = DAYS.map(date=>({ date, prod:Math.floor(3+Math.random()*4), staging:Math.floor(1+Math.random()*3) }));
  const fallback = [
    {worker_name:"agent-sam-worker", environment:"prod",    status:"success", deployed_at:"2h ago"},
    {worker_name:"iam-api-gateway",  environment:"prod",    status:"success", deployed_at:"5h ago"},
    {worker_name:"mcp-server",       environment:"staging", status:"success", deployed_at:"1d ago"},
    {worker_name:"iam-pty",          environment:"prod",    status:"rollback", deployed_at:"2d ago"},
  ];
  const rows = deploys.length>0 ? deploys : fallback;
  return (
    <Card style={{ flex:"2 1 340px" }}>
      <CardHeader icon={Ico.deploy} title="Deployments Timeline"/>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {[["42","Total",T.text],["97.6%","Success",T.green],["1","Failed",T.red],["1","Rollback",T.amber]].map(([v,l,c])=>(
          <div key={l} style={{ flex:1, background:T.surf2, borderRadius:7, padding:"7px 10px", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:17, fontWeight:700, color:c }}>{v}</div>
            <div style={{ fontSize:9, color:T.muted }}>{l}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={68}>
        <BarChart data={hist} margin={{top:0,right:0,left:-28,bottom:0}} barSize={6} barGap={2}>
          <XAxis dataKey="date" tick={{fontSize:8,fill:T.muted}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:8,fill:T.muted}} axisLine={false} tickLine={false}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="prod"    name="Prod"    fill={T.accent} radius={[2,2,0,0]}/>
          <Bar dataKey="staging" name="Staging" fill={T.violet} radius={[2,2,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display:"flex", gap:12, marginTop:4, marginBottom:8 }}>
        {[["Prod",T.accent],["Staging",T.violet]].map(([l,c])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:T.muted }}><Dot c={c}/>{l}</div>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
        {rows.map((d:any,i:number)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:i<rows.length-1?`1px solid ${T.border}`:"none", fontSize:10 }}>
            <Dot c={d.status==="success"?T.green:d.status==="rollback"?T.amber:T.red}/>
            <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.worker_name}</span>
            <span style={{ color:T.muted, fontSize:9 }}>{d.environment}</span>
            <span style={{ color:T.muted, fontSize:9 }}>{d.deployed_at||new Date(d.timestamp||0).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── System Health ────────────────────────────────────────────────────────────

function SystemHealth() {
  const svcs = [
    {name:"CF Workers",  status:"healthy", lat:"12ms",  up:"99.98%"},
    {name:"Supabase DB", status:"healthy", lat:"24ms",  up:"99.95%"},
    {name:"MCP Server",  status:"healthy", lat:"8ms",   up:"99.99%"},
    {name:"D1 Database", status:"healthy", lat:"3ms",   up:"100%"  },
    {name:"R2 Storage",  status:"healthy", lat:"18ms",  up:"99.97%"},
    {name:"PTY",         status:"healthy", lat:"6ms",   up:"99.90%"},
    {name:"Ollama",      status:"warning", lat:"142ms", up:"98.2%" },
  ];
  const sc: Record<string,string> = {healthy:T.green,warning:T.amber,down:T.red};
  const uptime = DAYS.map(date=>({ date, pct:99.5+Math.random()*0.5 }));
  return (
    <Card style={{ flex:"1 1 240px" }}>
      <CardHeader icon={Ico.pulse} title="System Health"/>
      <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:14 }}>
        {svcs.map(s=>(
          <div key={s.name} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <Dot c={sc[s.status]||T.muted}/>
            <span style={{ fontSize:10, flex:1 }}>{s.name}</span>
            <span style={{ fontSize:9, color:T.muted }}>{s.lat}</span>
            <span style={{ fontSize:9, fontWeight:600, color:sc[s.status] }}>{s.up}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
        <div style={{ fontSize:9, color:T.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Uptime (7d)</div>
        <ResponsiveContainer width="100%" height={52}>
          <AreaChart data={uptime} margin={{top:2,right:0,left:-28,bottom:0}}>
            <XAxis hide/><YAxis domain={[99,100.1]} hide/>
            <Tooltip content={<Tip fmt={(v:number)=>`${v.toFixed(3)}%`}/>}/>
            <Area type="monotone" dataKey="pct" name="Uptime" stroke={T.green} fill={T.green} fillOpacity={.15} strokeWidth={1.5}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Active Projects ──────────────────────────────────────────────────────────

function ActiveProjects({ projects }:{ projects:any[] }) {
  const defs = [
    {name:"Swamp Blood Gator Guides — CF-Native Rebuild",status:"development",agent:"Swamp_Bot",  progress:82,deploys:14,hrs:38.4,c:T.accent},
    {name:"IAM TOOLS agent workspace",                   status:"development",agent:"Tools_Agent",progress:68,deploys:9, hrs:26.1,c:T.blue  },
    {name:"Companions of CPAS — Rescue Mgmt Platform",  status:"development",agent:"CPAS_Rescue",progress:74,deploys:11,hrs:31.7,c:T.green },
    {name:"Agent Sam Dashboard",                         status:"discovery",  agent:"Dashboard",  progress:35,deploys:3, hrs:12.9,c:T.violet},
  ];
  const rows = defs.map((d,i)=>projects[i]?{...d,name:projects[i].name,status:projects[i].status}:d);
  const sc: Record<string,string> = {development:T.accent,discovery:T.violet,maintenance:T.amber,production:T.green};

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:T.muted }}>Active Projects</span>
          <span style={{ fontSize:10, color:T.muted, background:T.surface, border:`1px solid ${T.border}`, padding:"0 7px", borderRadius:20 }}>{rows.length}</span>
        </div>
        <a href="/dashboard/projects" style={{ fontSize:10, color:T.accent, textDecoration:"none" }}>View All →</a>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:10 }}>
        {rows.map((p,i)=>(
          <Card key={i} style={{ padding:14, borderLeft:`3px solid ${p.c}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:7 }}>
              <span style={{ fontSize:12, fontWeight:600, lineHeight:1.35, flex:1 }}>{p.name}</span>
              <span style={{ fontSize:9, fontWeight:700, color:sc[p.status]||T.muted, background:`${sc[p.status]||"#6b7280"}18`, padding:"2px 7px", borderRadius:3, flexShrink:0 }}>{p.status}</span>
            </div>
            <div style={{ fontSize:9, color:T.muted, marginBottom:10 }}>Agent Sam: {p.agent} · Last deploy: 2h ago</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.05)", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${p.progress}%`, background:`linear-gradient(90deg,${p.c},${T.violet})`, borderRadius:3 }}/>
              </div>
              <span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>{p.progress}%</span>
            </div>
            <div style={{ display:"flex", gap:16, alignItems:"flex-end" }}>
              {[["Deploys",String(p.deploys)],["Hours",`${p.hrs}h`]].map(([l,v])=>(
                <div key={l}><div style={{ fontSize:13, fontWeight:700 }}>{v}</div><div style={{ fontSize:9, color:T.muted }}>{l}</div></div>
              ))}
              <div style={{ flex:1 }}>
                <Sparkline data={seedArr(p.progress,10)} color={p.c} h={28} w={80}/>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}


// ─── Quick Nav ────────────────────────────────────────────────────────────────

function QuickNav() {
  const links = [
    { label: "Projects",  href: "/dashboard/projects" },
    { label: "Tasks",     href: "/dashboard/tasks"    },
    { label: "Library",   href: "/dashboard/library"  },
    { label: "Docs",      href: "/dashboard/docs"     },
    { label: "Finance",   href: "/dashboard/finance"  },
  ];
  return (
    <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
      {links.map(l => (
        
          key={l.label}
          href={l.href}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: T.muted,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 7,
            padding: "6px 16px",
            textDecoration: "none",
            letterSpacing: "0.04em",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = T.accent;
            (e.currentTarget as HTMLElement).style.color = T.accent;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
            (e.currentTarget as HTMLElement).style.color = T.muted;
          }}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [kpi,      setKpi]      = useState<KpiStripData  |null>(null);
  const [activity, setActivity] = useState<ActivityData  |null>(null);
  const [agent,    setAgent]    = useState<AgentActivity |null>(null);
  const [wf,       setWf]       = useState<WorkflowData  |null>(null);
  const [dep,      setDep]      = useState<DeployData    |null>(null);
  const [loading,  setLoading]  = useState(true);
  const [ts,       setTs]       = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k,a,ag,w,d] = await Promise.allSettled([
        fetch("/api/overview/kpi-strip").then(r=>r.json()),
        fetch("/api/overview/activity-strip").then(r=>r.json()),
        fetch("/api/overview/agent-activity").then(r=>r.json()),
        fetch("/api/overview/commands-workflows").then(r=>r.json()),
        fetch("/api/overview/deployments").then(r=>r.json()),
      ]);
      if (k.status==="fulfilled")  setKpi(k.value);
      if (a.status==="fulfilled")  setActivity(a.value);
      if (ag.status==="fulfilled") setAgent(ag.value);
      if (w.status==="fulfilled")  setWf(w.value);
      if (d.status==="fulfilled")  setDep(d.value);
    } finally { setLoading(false); setTs(new Date()); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const cost  = kpi?.cost_usd??0;
  const calls = activity?.weekly_activity?.agent_calls??kpi?.api_calls??0;
  const hrs   = activity?.worked_this_week?.hours_this_week??0;
  const mcp   = kpi?.mcp_calls??0;
  const top   = activity?.projects?.top??[];

  const kpis: KpiDef[] = [
    {icon:Ico.flame, label:"Monthly Burn",    value:fmt.usd(cost||37245),          trend: 12.4, compare:`vs last 7d ${fmt.usd((cost||37245)*0.88)}`,    spark:seedArr(cost||37245,9),       color:T.amber },
    {icon:Ico.cpu,   label:"AI Tooling",      value:fmt.usd((cost||37245)*0.34),   trend:  8.7, compare:"subscriptions + API",                           spark:seedArr(12680,9),             color:T.accent},
    {icon:Ico.cloud, label:"Infra / Bills",   value:fmt.usd((cost||37245)*0.22),   trend:  6.3, compare:"CF services and bills",                         spark:seedArr(8142,9),              color:T.violet},
    {icon:Ico.zap,   label:"Agent Calls",     value:fmt.num(calls||128900),         trend: 18.6, compare:`vs last 7d ${fmt.num((calls||128900)*0.84)}`,  spark:seedArr(calls||128900,9),     color:T.accent},
    {icon:Ico.clock, label:"Hours This Week", value:fmt.hrs(hrs||24.6),             trend: 14.2, compare:`vs last week ${fmt.hrs((hrs||24.6)*0.88)}`,    spark:seedArr(hrs||24.6,9),         color:T.green },
    {icon:Ico.tool,  label:"MCP Calls Today", value:fmt.num(mcp||5842),             trend: 23.1, compare:`vs yesterday ${fmt.num((mcp||5842)*0.81)}`,   spark:seedArr(mcp||5842,9),         color:T.accent},
    {icon:Ico.list,  label:"Open Tasks",      value:"247",                          trend:  9.8, compare:"vs yesterday 225",                             spark:seedArr(247,9,0.2),           color:T.amber },
    {icon:Ico.pulse, label:"Worker Health",   value:"95%",                          trend: -4.2, compare:"vs last 7d 91%",                               spark:seedArr(95,9),                color:T.green },
  ];

  const timeStr = ts.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

  return (
    <>
      <style>{`
        @keyframes ovpulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .ov-wrap *{box-sizing:border-box;}
        .ov-wrap a{color:${T.accent};}
      `}</style>
      <div className="ov-wrap" style={{ fontFamily:T.font, background:T.bg, color:T.text, minHeight:"100vh", padding:"22px 26px", overflowX:"hidden" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:T.muted, marginBottom:4 }}>OPS OVERVIEW</div>
            <h1 style={{ margin:0, fontSize:24, fontWeight:700, letterSpacing:"-0.02em" }}>Overview</h1>
            <p style={{ margin:"3px 0 0", fontSize:11, color:T.muted }}>Live cost, health, and execution telemetry</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:T.muted }}>Last refreshed: {timeStr}</span>
            <a href="/dashboard/analytics" style={{ fontSize:10, textDecoration:"none" }}>Health dashboard →</a>
            <button onClick={load} style={{ fontSize:11, color:T.accent, background:`${T.accent}12`, border:`1px solid ${T.accent}30`, borderRadius:7, padding:"6px 14px", cursor:"pointer", fontFamily:T.font, display:"flex", alignItems:"center", gap:6 }}>
              {Ico.refresh} Refresh
            </button>
          </div>
        </div>

        {/* Quick Nav */}
        <QuickNav />

        {/* KPI Strip */}
        <div style={{ display:"flex", gap:8, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
          {kpis.map(k=><KpiCard key={k.label} {...k} loading={loading}/>)}
        </div>

        {/* Row 2 */}
        <div style={{ display:"grid", gridTemplateColumns:"3fr 1.1fr 1.1fr 1.1fr", gap:10, marginBottom:10 }}>
          <SpendChart/>
          <WorkflowPanel data={wf}/>
          <TopServices events={agent?.events??[]}/>
          <BudgetCard cost={cost}/>
        </div>

        {/* System Pulse divider */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 0 12px", borderTop:`1px solid ${T.border}` }}>
          <span style={{ color:T.muted, display:"flex" }}>{Ico.pulse}</span>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:T.muted }}>System Pulse / Execution Analytics</span>
        </div>

        {/* Row 3 */}
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1.2fr 1.5fr 1.1fr", gap:10, marginBottom:10 }}>
          <WorkflowRunsChart/>
          <ToolWaterfall/>
          <ErrorInbox/>
          <TokensChart/>
        </div>

        {/* Row 4 */}
        <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr", gap:10, marginBottom:10 }}>
          <ModelLeaderboard/>
          <CostLatency/>
          <RoutingDecisions/>
        </div>

        {/* Row 5 */}
        <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          <RagHealth/>
          <DeploymentsTimeline data={dep}/>
          <SystemHealth/>
        </div>

        {/* Active Projects */}
        <ActiveProjects projects={top}/>

      </div>
    </>
  );
}
