import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

function fmt(n) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(n||0); }
function relDate(d) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff/86400000);
  if (days===0) return "Today"; if (days===1) return "Yesterday";
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}
const CAT_COLORS = { income:"#4ade80",client_revenue:"#34d399",tech:"#60a5fa",food:"#fbbf24",subscriptions:"#f97316",other:"#94a3b8",transfer:"#a78bfa" };
const CAT_LABELS = { income:"Income",client_revenue:"Client Revenue",tech:"Tech",food:"Food",subscriptions:"Subscriptions",other:"Other",transfer:"Transfer" };

function Tip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return <div style={{background:"rgba(10,20,42,0.97)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px",fontSize:12}}>
    <div style={{color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:600}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: <strong>{fmt(p.value)}</strong></div>)}
  </div>;
}

function DropZone({onFile}){
  const [drag,setDrag]=useState(false);
  const ref=useRef();
  return <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
    onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f?.name.endsWith(".csv"))onFile(f);}}
    onClick={()=>ref.current.click()}
    style={{border:`2px dashed ${drag?"#4ade80":"rgba(255,255,255,0.15)"}`,borderRadius:12,padding:"28px",textAlign:"center",cursor:"pointer",background:drag?"rgba(74,222,128,0.05)":"rgba(255,255,255,0.02)",transition:"all 0.2s"}}>
    <div style={{fontSize:13,color:drag?"#4ade80":"rgba(255,255,255,0.4)",fontWeight:600}}>{drag?"Drop CSV to import":"Drag and drop CSV or click to browse"}</div>
    <div style={{fontSize:11,color:"rgba(255,255,255,0.25)",marginTop:4}}>Capital One, Chase, and generic bank exports supported</div>
    <input ref={ref} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{if(e.target.files[0])onFile(e.target.files[0]);}} />
  </div>;
}

const S={
  root:{minHeight:"100vh",background:"transparent",fontFamily:"'DM Sans',system-ui,sans-serif",padding:"24px 32px 48px"},
  card:{background:"rgba(10,20,42,0.95)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"20px 22px",isolation:"isolate"},
  lbl:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8},
  val:{fontSize:26,fontWeight:800,lineHeight:1.1,fontFamily:"'DM Mono',monospace"},
  pill:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,textTransform:"uppercase",letterSpacing:"0.07em"},
  inp:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"9px 12px",color:"#ffffff",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"},
  btn:{background:"rgba(74,222,128,0.15)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:8,color:"#4ade80",fontWeight:700,fontSize:13,padding:"9px 18px",cursor:"pointer",whiteSpace:"nowrap"},
};

export default function Finance(){
  const[tab,setTab]=useState("overview");
  const[data,setData]=useState(null);
  const[txns,setTxns]=useState([]);
  const[filter,setFilter]=useState({type:"all",source:"all",from:"",to:""});
  const[showAdd,setShowAdd]=useState(false);
  const[importing,setImporting]=useState(false);
  const[importMsg,setImportMsg]=useState(null);
  const[newTxn,setNewTxn]=useState({date:new Date().toISOString().split("T")[0],description:"",category:"other",amount:"",account_id:"5"});

  const load=useCallback(()=>{
    fetch("/api/finance/summary",{credentials:"include"}).then(r=>r.json()).then(setData).catch(()=>{});
    fetch("/api/finance/transactions?limit=200",{credentials:"include"}).then(r=>r.json()).then(d=>{if(d.transactions)setTxns(d.transactions);}).catch(()=>{});
  },[]);

  useEffect(()=>{load();},[load]);

  async function handleCSV(file){
    setImporting(true);setImportMsg(null);
    const text=await file.text();
    const res=await fetch("/api/finance/import-csv",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({csv:text,filename:file.name})}).then(r=>r.json()).catch(()=>({error:"Upload failed"}));
    setImporting(false);
    setImportMsg(res.error?`Error: ${res.error}`:`Imported ${res.imported} transactions`);
    if(!res.error)load();
  }

  async function saveTxn(){
    if(!newTxn.description||!newTxn.amount)return;
    await fetch("/api/finance/transactions",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newTxn,amount:parseFloat(newTxn.amount)})});
    setShowAdd(false);setNewTxn({date:new Date().toISOString().split("T")[0],description:"",category:"other",amount:"",account_id:"5"});load();
  }

  const monthly=data?.monthly||[];
  const byCat=data?.by_category||[];
  const sum=data?.summary||{};
  const accounts=data?.accounts||[];
  const filtered=txns.filter(t=>{
    if(filter.type==="income"&&t.amount<=0)return false;
    if(filter.type==="expense"&&t.amount>=0)return false;
    if(filter.source!=="all"&&String(t.account_id)!==filter.source)return false;
    if(filter.from&&t.transaction_date<filter.from)return false;
    if(filter.to&&t.transaction_date>filter.to)return false;
    return true;
  });

  return(
    <div style={S.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;700&display=swap');
      @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      *{box-sizing:border-box;}input:focus,select:focus{border-color:rgba(74,222,128,0.5)!important;outline:none;}
      ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}`}</style>

      {/* Tab bar + actions */}
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:24,borderBottom:"1px solid rgba(0,0,0,0.08)",paddingBottom:0}}>
        {["overview","transactions","import"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 18px",fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:"transparent",borderBottom:"2px solid",borderBottomColor:tab===t?"#3b82f6":"transparent",color:tab===t?"#1e293b":"rgba(0,0,0,0.4)",marginBottom:-1}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>setShowAdd(p=>!p)} style={{...S.btn,marginBottom:8}}>+ Add Transaction</button>
        <button onClick={()=>setTab("import")} style={{...S.btn,marginBottom:8,marginLeft:8,background:"rgba(96,165,250,0.15)",color:"#60a5fa",borderColor:"rgba(96,165,250,0.3)"}}>Import CSV</button>
      </div>

      {showAdd&&(
        <div style={{...S.card,marginBottom:20,animation:"fadeIn 0.2s ease"}}>
          <div style={{...S.lbl,marginBottom:12}}>New Transaction</div>
          <div style={{display:"grid",gridTemplateColumns:"140px 1fr 160px 110px 160px auto",gap:10,alignItems:"end"}}>
            <input type="date" value={newTxn.date} onChange={e=>setNewTxn(p=>({...p,date:e.target.value}))} style={S.inp}/>
            <input placeholder="Description" value={newTxn.description} onChange={e=>setNewTxn(p=>({...p,description:e.target.value}))} style={S.inp}/>
            <select value={newTxn.category} onChange={e=>setNewTxn(p=>({...p,category:e.target.value}))} style={{...S.inp,color:"#fff"}}>
              {Object.entries(CAT_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
            <input type="number" placeholder="Amount (-=expense)" value={newTxn.amount} onChange={e=>setNewTxn(p=>({...p,amount:e.target.value}))} style={S.inp} step="0.01"/>
            <select value={newTxn.account_id} onChange={e=>setNewTxn(p=>({...p,account_id:e.target.value}))} style={{...S.inp,color:"#fff"}}>
              {accounts.length?accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>):<option value="5">IAM Business</option>}
            </select>
            <button onClick={saveTxn} style={S.btn}>Save</button>
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:6}}>Negative amounts are expenses, positive are income/revenue</div>
        </div>
      )}

      {tab==="overview"&&(
        <div style={{animation:"fadeIn 0.25s ease"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>
            {[{label:"Total In (Month)",value:sum.month_in,accent:"#4ade80"},{label:"Total Out (Month)",value:sum.month_out,accent:"#ef4444"},{label:"Net (Month)",value:sum.month_net,accent:(sum.month_net||0)>=0?"#4ade80":"#ef4444"},{label:"AI / Tech Spend",value:sum.tech_spend,accent:"#60a5fa"}].map(c=>(
              <div key={c.label} style={S.card}>
                <div style={S.lbl}>{c.label}</div>
                <div style={{...S.val,color:c.accent}}>{fmt(c.value)}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 290px",gap:16,marginBottom:16}}>
            <div style={S.card}>
              <div style={{...S.lbl,marginBottom:14}}>Income vs Expenses — Last 6 Months</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient>
                    <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{fill:"rgba(255,255,255,0.3)",fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>`$${v}`} tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} axisLine={false} tickLine={false} width={50}/>
                  <Tooltip content={<Tip/>}/>
                  <Area type="monotone" dataKey="income" name="Income" stroke="#4ade80" strokeWidth={2} fill="url(#gI)"/>
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gE)"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={S.card}>
              <div style={{...S.lbl,marginBottom:12}}>Spend by Category</div>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart><Pie data={byCat} dataKey="amount" cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={2}>
                  {byCat.map((e,i)=><Cell key={i} fill={CAT_COLORS[e.category]||"#475569"}/>)}
                </Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:6}}>
                {byCat.slice(0,5).map(c=>(
                  <div key={c.category} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:8,height:8,borderRadius:2,background:CAT_COLORS[c.category]||"#475569"}}/>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{CAT_LABELS[c.category]||c.category}</span>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:"#fff",fontFamily:"'DM Mono',monospace"}}>{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S.card}>
            <div style={{...S.lbl,marginBottom:14}}>Monthly Net Cash Flow</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={monthly} barSize={26}>
                <XAxis dataKey="month" tick={{fill:"rgba(255,255,255,0.3)",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>`$${v}`} tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} axisLine={false} tickLine={false} width={50}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="net" name="Net" radius={[4,4,0,0]}>{monthly.map((m,i)=><Cell key={i} fill={(m.net||0)>=0?"#4ade80":"#ef4444"}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab==="transactions"&&(
        <div style={{animation:"fadeIn 0.25s ease"}}>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            {[["all","All"],["income","Income"],["expense","Expenses"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(p=>({...p,type:v}))} style={{padding:"5px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",border:"1px solid",borderColor:filter.type===v?"rgba(59,130,246,0.4)":"rgba(0,0,0,0.12)",background:filter.type===v?"rgba(59,130,246,0.08)":"transparent",color:filter.type===v?"#3b82f6":"rgba(0,0,0,0.45)"}}>
                {l}
              </button>
            ))}
            <select value={filter.source} onChange={e=>setFilter(p=>({...p,source:e.target.value}))} style={{padding:"5px 12px",borderRadius:6,fontSize:12,border:"1px solid rgba(0,0,0,0.12)",background:"white",color:"rgba(0,0,0,0.6)",cursor:"pointer"}}>
              <option value="all">All Sources</option>
              {accounts.map(a=><option key={a.id} value={String(a.id)}>{a.account_name}</option>)}
            </select>
            <input type="date" value={filter.from} onChange={e=>setFilter(p=>({...p,from:e.target.value}))} style={{padding:"5px 10px",borderRadius:6,fontSize:12,border:"1px solid rgba(0,0,0,0.12)",background:"white",color:"rgba(0,0,0,0.6)"}}/>
            <span style={{fontSize:12,color:"rgba(0,0,0,0.35)"}}>to</span>
            <input type="date" value={filter.to} onChange={e=>setFilter(p=>({...p,to:e.target.value}))} style={{padding:"5px 10px",borderRadius:6,fontSize:12,border:"1px solid rgba(0,0,0,0.12)",background:"white",color:"rgba(0,0,0,0.6)"}}/>
            <span style={{fontSize:12,color:"rgba(0,0,0,0.35)",marginLeft:4}}>{filtered.length} transactions</span>
          </div>
          <div style={S.card}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                {["Date","Description","Category","Amount"].map(h=>(
                  <th key={h} style={{textAlign:h==="Amount"?"right":"left",fontSize:9,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.09em",paddingBottom:10,fontWeight:700}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.slice(0,100).map((t,i)=>(
                  <tr key={t.id||i} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                    <td style={{padding:"10px 0",fontSize:12,color:"rgba(255,255,255,0.4)",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{relDate(t.transaction_date)}</td>
                    <td style={{padding:"10px 12px",fontSize:13,color:"rgba(255,255,255,0.85)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                    <td style={{padding:"10px 0"}}>
                      <span style={{...S.pill,background:`${CAT_COLORS[t.category]||"#475569"}22`,color:CAT_COLORS[t.category]||"#94a3b8",border:`1px solid ${CAT_COLORS[t.category]||"#475569"}40`}}>{CAT_LABELS[t.category]||t.category||"—"}</span>
                    </td>
                    <td style={{padding:"10px 0",fontSize:13,fontWeight:700,textAlign:"right",fontFamily:"'DM Mono',monospace",color:(t.amount||0)>=0?"#4ade80":"#ef4444"}}>{t.amount>=0?"+":""}{fmt(t.amount)}</td>
                  </tr>
                ))}
                {filtered.length===0&&<tr><td colSpan={4} style={{padding:"32px 0",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:13}}>No transactions match filters</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="import"&&(
        <div style={{maxWidth:580,animation:"fadeIn 0.25s ease"}}>
          <div style={S.card}>
            <div style={{...S.lbl,marginBottom:16}}>Import CSV Transactions</div>
            <DropZone onFile={handleCSV}/>
            {importing&&<div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:12,textAlign:"center"}}>Importing...</div>}
            {importMsg&&<div style={{fontSize:13,color:importMsg.startsWith("Error")?"#ef4444":"#4ade80",marginTop:12,textAlign:"center",fontWeight:600}}>{importMsg}</div>}
            <div style={{marginTop:20}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Expected Format</div>
              <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px 16px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(255,255,255,0.5)"}}>
                Transaction Date, Transaction Amount, Transaction Description<br/>
                2026-02-11, -5.45, Claude Pro subscription<br/>
                2026-02-11, 328.35, Pelican Peptides Final Payment
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
