
// src/App.js
import React, { useEffect, useRef, useState } from "react";

/*
  Playbox Timer - single-file React app
  Features: multi-user, admin, timers, loud alarm at 10min & time up, bookkeeping logs, export CSV, dark/light, audio feedback.
*/

const LS_UNITS = "hp_v5_units";
const LS_LOGS = "hp_v5_logs";
const LS_USERS = "hp_v5_users";
const LS_SESSION = "hp_v5_session";
const LS_THEME = "hp_v5_theme";
const DEFAULT_PRICE = 30000;
const ALARM_BEFORE_SECONDS = 10 * 60;
const UNDO_DELETE_MS = 5000;

function uid(prefix = "id") { return prefix + Math.random().toString(36).slice(2,9); }
function formatHMS(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "00:00:00";
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  if (hh > 0) return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function lerp(a,b,t){return a+(b-a)*t;}
function lerpColor(a,b,t){return [Math.round(lerp(a[0],b[0],t)),Math.round(lerp(a[1],b[1],t)),Math.round(lerp(a[2],b[2],t))];}
function rgbToHex(rgb){return "#"+rgb.map(v=>{const s=v.toString(16);return s.length===1?"0"+s:s}).join("")}
function progressToColor(progress){
  const blue=[6,94,168], purple=[124,58,237], red=[239,68,68];
  const t = Math.max(0, Math.min(1, progress));
  if(t>0.5){ const local=(t-0.5)/0.5; return rgbToHex(lerpColor(purple, blue, local)); }
  const local = t/0.5; return rgbToHex(lerpColor(red, purple, local));
}
function encodePwd(username,password){ try { return btoa(`${username}:${password}`); } catch(e){ return `${username}:${password}`; } }
function nowISO(){ return new Date().toISOString(); }

/* Audio */
function playClick(audioRef) {
  try {
    const ctx = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
    audioRef.current = ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime+0.005);
    o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.08); o.stop(ctx.currentTime+0.1);
  } catch(e){}
}
function playSoft(audioRef, freq=520, dur=220, vol=0.08) {
  try {
    const ctx = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
    audioRef.current = ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type="sine"; o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime+0.02);
    o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur/1000); o.stop(ctx.currentTime+dur/1000+0.02);
  } catch(e) {}
}
function playLongBeep(audioRef, volume=1){
  try{
    const ctx = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
    audioRef.current = ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type="sine"; o.frequency.setValueAtTime(660, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2 * Math.max(0, volume), ctx.currentTime + 0.02);
    o.connect(g); g.connect(ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.95); o.stop(ctx.currentTime+1.0);
  } catch(e){}
}
async function playBeepSequence(audioRef, n=3, volume=1) {
  for(let i=0;i<n;i++){ playLongBeep(audioRef, volume); await new Promise(r=>setTimeout(r,1100)); }
}

/* Unit creator */
function createUnit(id,name){
  return { id, name: name||`PlayBox ${id}`, pricePerHour: DEFAULT_PRICE, notes: "", active:false, remainingSec:0, initialSec:0, warned:false, finished:false, color:"#065ea8", volume:1, muted:false, pendingDelete:null, inputs:{hours:0, mins:0} };
}

/* App */
export default function App(){
  const [theme,setTheme] = useState(()=> { try{ const t=localStorage.getItem(LS_THEME); return t||"dark"; }catch(e){return "dark"} });
  useEffect(()=> localStorage.setItem(LS_THEME, theme), [theme]);

  const [route,setRoute] = useState(window.location.hash.slice(1) || "/login");
  useEffect(()=>{ const onHash = ()=> setRoute(window.location.hash.slice(1) || "/login"); window.addEventListener("hashchange", onHash); return ()=> window.removeEventListener("hashchange", onHash); },[]);

  const audioRef = useRef(null);
  const tickRef = useRef(null);

  const [users,setUsers] = useState(()=> { try{ const raw=localStorage.getItem(LS_USERS); if(raw) return JSON.parse(raw);}catch{}; return [{id:1, username:"admin", passwordEncoded: encodePwd("admin","1234"), role:"admin"}]; });
  const [session,setSession] = useState(()=> { try{ const raw=localStorage.getItem(LS_SESSION); return raw?JSON.parse(raw):null;}catch{return null;} });

  const [units,setUnits] = useState(()=> { try{ const raw=localStorage.getItem(LS_UNITS); if(raw) return JSON.parse(raw);}catch{}; return [createUnit(1), createUnit(2), createUnit(3)]; });
  const [logs,setLogs] = useState(()=> { try{ const raw=localStorage.getItem(LS_LOGS); return raw?JSON.parse(raw):[];}catch{return [];} });

  const [toasts,setToasts] = useState([]);
  const [exportFrom,setExportFrom] = useState("");
  const [exportTo,setExportTo] = useState("");

  useEffect(()=> localStorage.setItem(LS_USERS, JSON.stringify(users)), [users]);
  useEffect(()=> localStorage.setItem(LS_UNITS, JSON.stringify(units)), [units]);
  useEffect(()=> localStorage.setItem(LS_LOGS, JSON.stringify(logs)), [logs]);
  useEffect(()=> localStorage.setItem(LS_SESSION, JSON.stringify(session)), [session]);

  useEffect(()=>{ tickRef.current = setInterval(()=>{ setUnits(prev=> prev.map(u=> { if(!u.active || u.remainingSec<=0) return u; return {...u, remainingSec: Math.max(0, u.remainingSec-1)}; })); },1000); return ()=> clearInterval(tickRef.current); },[]);

  useEffect(()=>{
    let changed=false; const newUnits=units.map(u=>({...u})); const newLogs=[];
    for(const u of units){
      if(u.active && !u.warned && u.initialSec > ALARM_BEFORE_SECONDS && u.remainingSec <= ALARM_BEFORE_SECONDS && u.remainingSec > 0){
        const idx = newUnits.findIndex(x=>x.id===u.id);
        newUnits[idx].warned = true;
        enqueueToast(`${u.name} — 10 min remaining`, "#f59e0b", 8000);
        // loud alarm for 10 min (10 beeps)
        if(audioRef.current) playBeepSequence(audioRef, 10, u.muted ? 0 : 1);
        changed = true;
      }
      if(u.active && !u.finished && u.remainingSec === 0 && u.initialSec > 0){
        const idx = newUnits.findIndex(x=>x.id===u.id);
        newLogs.push({ unit: u.name, durationMinutes: Math.max(0, Math.round(u.initialSec/60)), cost: Math.ceil((u.initialSec/3600)*u.pricePerHour), notes: u.notes||"", operator: session?.username||"unknown", timestamp: nowISO() });
        newUnits[idx] = {...newUnits[idx], active:false, finished:true, warned:false, color:"#ef4444", remainingSec:0, initialSec:0 };
        enqueueToast(`${u.name} — Time's up!`, "#ef4444", 10000);
        // loud alarm for time up (10 beeps)
        if(audioRef.current) playBeepSequence(audioRef, 10, u.muted ? 0 : 1);
        changed = true;
      }
    }
    if(newLogs.length) setLogs(old=> [...newLogs.reverse(), ...old]);
    if(changed) setUnits(newUnits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  /* Toasts */
  function enqueueToast(text, color="#0b5ea8", life=4000, actionLabel, action){
    const id = uid("t");
    const t = { id, text, color, actionLabel, action };
    setToasts(old=>{ const next = [...old, t]; if(next.length>6) next.shift(); return next; });
    if(life && life>0) setTimeout(()=> dismissToast(id), life);
    return id;
  }
  function dismissToast(id){ setToasts(old=> old.filter(t=> t.id!==id)); }

  /* Users */
  function createUser(username,password,role="operator"){
    if(!username||!password){ enqueueToast("Username & password required","#ef4444"); return null; }
    if(users.find(u=>u.username===username)){ enqueueToast("Username exists","#ef4444"); return null; }
    const u = { id: Math.max(0,...users.map(x=>x.id))+1, username, passwordEncoded: encodePwd(username,password), role };
    setUsers(old=> [...old, u]); enqueueToast(`User ${username} created`, "#0b5ea8"); return u;
  }
  function editUser(id,data){ setUsers(prev=> prev.map(u=> u.id===id? {...u,...data}:u)); enqueueToast("User updated","#0b5ea8"); }
  function deleteUser(id){ if(!confirm("Delete this user?")) return; setUsers(prev=> prev.filter(u=> u.id!==id)); enqueueToast("User deleted","#ef4444"); }

  function login(username,password){
    const found = users.find(u=>u.username===username);
    if(!found){ enqueueToast("Invalid credentials","#ef4444"); return false; }
    if(found.passwordEncoded !== encodePwd(username,password)){ enqueueToast("Invalid credentials","#ef4444"); return false; }
    const s = { username: found.username, role: found.role, loggedAt: nowISO() };
    setSession(s); enqueueToast("Logged in","#0b5ea8",1600); window.location.hash="/app"; return true;
  }
  function logout(){ setSession(null); window.location.hash="/login"; }

  /* Units */
  function addUnit(name,price){ const id = units.length? Math.max(...units.map(u=>u.id))+1:1; const nu = createUnit(id,name||`PlayBox ${id}`); if(price) nu.pricePerHour = price; setUnits(old=> [...old, nu]); enqueueToast(`${nu.name} added","#0b5ea8`); playSoft(audioRef,600,180,0.06); }
  function editUnitPrice(id,price){ setUnits(prev=> prev.map(u=> u.id===id? {...u, pricePerHour: price}:u)); enqueueToast("Price updated","#0b5ea8"); }
  function editUnitNotes(id,notes){ setUnits(prev=> prev.map(u=> u.id===id? {...u, notes}:u)); enqueueToast("Notes saved","#0b5ea8"); }

  function startTimer(id){
    if(!audioRef.current){ try{ audioRef.current = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} }
    setUnits(prev=> prev.map(u=> { if(u.id!==id) return u; const total = Math.max(0, Math.round((u.inputs.hours||0)*3600 + (u.inputs.mins||0)*60)); if(u.active){ if(!confirm(`${u.name} is running. Restart with new duration?`)) return u; } playSoft(audioRef,760,220,u.muted?0:u.volume*0.08); return {...u, active:true, remainingSec: total, initialSec: total, warned:false, finished:false, color:"#065ea8"} } ));
  }
  function stopTimer(id){
    setUnits(prev=> prev.map(u=> { if(u.id!==id) return u; const usedSec = u.initialSec? Math.max(0, u.initialSec - u.remainingSec):0; const minutesUsed = Math.max(0, Math.round(usedSec/60)); const cost = Math.ceil((usedSec/3600)*u.pricePerHour); if(usedSec>0) setLogs(old=> [{ unit: u.name, durationMinutes: minutesUsed, cost, notes: u.notes||"", operator: session?.username||"unknown", timestamp: nowISO()}, ...old]); playSoft(audioRef,420,200, u.muted?0:u.volume*0.06); enqueueToast(`${u.name} stopped — ${minutesUsed} min`, "#0b5ea8"); return {...u, active:false, remainingSec:0, initialSec:0, warned:false, finished:false, color:"#222"} }));
  }

  function setUnitInput(id,hours,mins){ setUnits(prev=> prev.map(u=> u.id===id? {...u, inputs:{hours, mins}}: u)); }
  function setUnitVolume(id,val){ setUnits(prev=> prev.map(u=> u.id===id? {...u, volume: Math.max(0, Math.min(1,val)), muted: val===0? true: u.muted}:u)); }
  function toggleMute(id){ setUnits(prev=> prev.map(u=> u.id===id? {...u, muted: !u.muted}:u)); }

  function requestDeleteUnit(id){ setUnits(prev=> prev.map(u=> u.id===id? {...u, pendingDelete: Date.now()+UNDO_DELETE_MS}:u)); const toastId = enqueueToast("Unit will be deleted","#ef4444", UNDO_DELETE_MS+200, "Undo", ()=> undoDeleteUnit(id)); setTimeout(()=>{ setUnits(prev=> { const u = prev.find(x=> x.id===id); if(!u) return prev; if(u.pendingDelete && u.pendingDelete <= Date.now()){ enqueueToast(`${u.name} deleted`,"#ef4444"); return prev.filter(x=> x.id!==id); } return prev; }); dismissToast(toastId); }, UNDO_DELETE_MS+120); }
  function undoDeleteUnit(id){ setUnits(prev=> prev.map(u=> u.id===id? {...u, pendingDelete: null}:u)); enqueueToast("Delete undone","#0b5ea8"); }

  function exportLogsCSV(){
    const from = exportFrom? new Date(exportFrom): null; const to = exportTo? new Date(exportTo): null;
    const filtered = logs.filter(r=>{ if(!from && !to) return true; const t = new Date(r.timestamp); if(from && t < from) return false; if(to && t > to) return false; return true; });
    if(!filtered.length) return enqueueToast("No logs in range","#ef4444");
    const header = ["Timestamp","Unit","Minutes","CostRp","Notes","Operator"];
    const rows = filtered.map(r=> [r.timestamp, r.unit, r.durationMinutes, r.cost, r.notes||"", r.operator||""]);
    const csv = [header, ...rows].map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv],{ type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `playbox_logs_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); enqueueToast("CSV exported","#0b5ea8");
  }

  function customerViewUrl(unitId){ const base = window.location.href.split("#")[0]; return `${base}#/view?unit=${unitId}`; }

  /* Routes */
  if(route.startsWith("/view")){
    const parts = window.location.hash.split("?"); const params = new URLSearchParams(parts[1]); const id = Number(params.get("unit")); const u = units.find(x=> x.id === id);
    return (<div style={theme==="dark"? styles.app: styles.appLight}><style>{globalCSS(theme)}</style><div style={styles.centerCard}>{ u? (<div style={{textAlign:"center", color: theme==="dark"?"#e6eefc":"#061226"}}><div style={{fontSize:20,fontWeight:800,color:u.color}}>{u.name}</div><div style={{marginTop:10,fontSize:36,fontWeight:900}}>{formatHMS(u.remainingSec)}</div><div style={{color: theme==="dark"?"#94a3b8":"#475569", marginTop:8}}>{u.active? "Running": u.finished? "Finished": "Idle"}</div><div style={{marginTop:14,width:260, marginLeft:"auto", marginRight:"auto"}}>{ u.active && (<div style={{height:8, background: theme==="dark"? "#0b1220":"#f1f5f9", borderRadius:8, overflow:"hidden"}}><div style={{ width: `${u.initialSec? ((u.initialSec - u.remainingSec)/u.initialSec)*100:0}%`, height:"100%", background: `linear-gradient(90deg, #00a3ff, #7c3aed, #ef4444)`, transition: "width .8s linear" }} /></div>) }</div><div style={{marginTop:18}}><a href="#/app" onClick={(e)=>{ e.preventDefault(); window.location.hash="/app"; }} style={{color:"#9bd1ff"}}>Back to operator</a></div></div>) : (<div style={{color: theme==="dark"?"#efefef":"#061226"}}>Unit not found</div>) }</div></div>);
  }

  if(!session && route !== "/login"){ window.location.hash="/login"; return null; }
  if(route === "/login") return <LoginScreen onLogin={login} theme={theme} setTheme={setTheme} playClick={() => playClick(audioRef)} />;

  return (<div style={theme==="dark"? styles.app: styles.appLight}><style>{globalCSS(theme)}</style><header style={styles.header}><div style={styles.brand}><div style={styles.logo}>🎮</div><div><div style={styles.title}>Playbox Timer</div><div style={styles.subtitle}>PS5-style billing • operator</div></div></div><div style={{display:"flex", gap:10, alignItems:"center"}}><div style={{color: theme==="dark"? "#9bd1ff": "#0b5ea8", fontSize:13}}>{session?.username} ({session?.role})</div><button title="Toggle theme" style={styles.iconBtn} onClick={()=>{ setTheme(s=> s==="dark"?"light":"dark"); playClick(audioRef); }}>{theme==="dark"?"☀️":"🌙"}</button><button style={styles.btnOutline} onClick={()=>{ exportLogsCSV(); }}>Export CSV</button><div style={{display:"flex", gap:6}}><button style={styles.btnPrimary} onClick={()=>{ addUnit(); }}>+ Add Unit</button><button style={styles.iconBtn} onClick={()=>{ logout(); }}>Logout</button></div></div></header><main style={styles.main}><section style={styles.grid}>{ units.map(u=>{ const progress = u.initialSec>0? u.remainingSec / u.initialSec:1; const color = progressToColor(progress); const isWarn = u.active && u.initialSec > ALARM_BEFORE_SECONDS && u.remainingSec > 0 && u.remainingSec <= ALARM_BEFORE_SECONDS; const isEnded = u.finished; const tileBg = u.active? (theme==="dark"? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))":"#fff") : (theme==="dark"? "linear-gradient(180deg,#02040a,#07101a, transparent)":"#fff"); return (<div key={u.id} style={{ ...styles.card, background: tileBg, borderColor: u.pendingDelete? "#5b2121": isWarn? "#f59e0b":"rgba(255,255,255,0.03)", boxShadow: `0 8px 28px rgba(0,0,0,0.45), 0 0 18px ${color}33`, transform: u.pendingDelete? "scale(.99)": undefined }} onMouseEnter={e=>{ e.currentTarget.style.transform="scale(1.02)"; e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.6), 0 0 30px ${color}66`; }} onMouseLeave={e=>{ e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.45), 0 0 18px ${color}33`; }}><div style={styles.cardHead}><div><div style={{fontSize:16, fontWeight:800, color}}>{u.name}</div><div style={{color: theme==="dark"? "#94a3b8":"#64748b", fontSize:13}}>Rp{u.pricePerHour.toLocaleString()} / hr</div></div><div style={{display:"flex", gap:6}}><button title="Edit name" style={styles.iconBtn} onClick={()=>{ const newName = prompt("Edit unit name:", u.name); if(newName && newName.trim()){ setUnits(prev=> prev.map(x=> x.id===u.id? {...x, name: newName.trim()}:x)); enqueueToast("Name updated","#0b5ea8"); playSoft(audioRef,780,160,0.05); } }}>✎</button><button title="Delete" style={styles.iconBtnDanger} onClick={()=> requestDeleteUnit(u.id)}>🗑</button></div></div><div style={{textAlign:"center", marginTop:12}}><div style={{fontSize:34, fontWeight:900, color: isWarn? "#f59e0b": isEnded? "#ef4444": color}}>{formatHMS(u.remainingSec)}</div><div style={{color: theme==="dark"? "#94a3b8":"#64748b", marginTop:6}}>{u.active? "Running": isEnded? "Finished": "Idle"}</div></div><div style={{marginTop:12, display:"flex", gap:8, alignItems:"center"}}><div style={{display:"flex", gap:6}}><input style={styles.inputTiny} type="number" min={0} value={u.inputs.hours} onChange={(e)=> setUnitInput(u.id, Number(e.target.value||0), u.inputs.mins)} placeholder="h"/><input style={styles.inputTiny} type="number" min={0} value={u.inputs.mins} onChange={(e)=> setUnitInput(u.id, u.inputs.hours, Number(e.target.value||0))} placeholder="m"/></div><button style={{...styles.btnPrimary, flex:1}} onClick={()=> startTimer(u.id)}>{u.active? "Restart":"Start"}</button><button style={styles.btnGhost} onClick={()=> stopTimer(u.id)}>Stop</button></div><div style={{marginTop:12, display:"flex", justifyContent:"space-between", color: theme==="dark"? "#94a3b8":"#64748b", alignItems:"center"}}><div style={{width:"60%"}}><div style={{fontSize:12}}>Notes</div><input style={{...styles.input, marginTop:6}} value={u.notes||""} placeholder="Add note (controller, customer, etc.)" onChange={(e)=> setUnits(prev=> prev.map(x=> x.id===u.id? {...x, notes: e.target.value}:x))} onBlur={()=> enqueueToast("Notes saved","#0b5ea8",900)} /></div><div style={{display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end", width:"40%"}}><div style={{display:"flex", gap:8, alignItems:"center"}}><div style={{fontSize:12}}>Vol</div><input type="range" min={0} max={1} step={0.01} value={u.volume} onChange={(e)=> setUnitVolume(u.id, Number(e.target.value))}/><button style={styles.iconBtn} onClick={()=> toggleMute(u.id)}>{u.muted? "🔈":"🔇"}</button></div><div style={{fontSize:12, display:"flex", gap:6}}><a href={customerViewUrl(u.id)} target="_blank" rel="noreferrer" style={styles.linkBtn}>Open view</a><button style={styles.iconBtn} onClick={()=>{ const p = prompt("Price per hour (Rp):", String(u.pricePerHour)); if(p!==null){ const v = Number(p); if(!isNaN(v) && v>0) editUnitPrice(u.id, v); } }}>Rp</button></div></div></div></div>) }) }</section><aside style={styles.side}><div style={styles.panel}><div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><div><div style={{fontSize:14, fontWeight:800, color:"#9bd1ff"}}>Recent Sessions</div><div style={{fontSize:12, color:"#94a3b8"}}>Latest activity</div></div><div style={{fontSize:13, color:"#9bd1ff"}}>Total: Rp{logs.reduce((s,l)=> s + (l.cost||0),0).toLocaleString()}</div></div><div style={{marginTop:12, maxHeight:260, overflow:"auto"}}>{ logs.length===0 ? (<div style={{color:"#6b7280"}}>No sessions yet.</div>) : ( logs.map((r,i)=>( <div key={i} style={{display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.03)"}}><div><div style={{fontWeight:700, color:"#e6eefc"}}>{r.unit}</div><div style={{color:"#94a3b8", fontSize:12}}>{new Date(r.timestamp).toLocaleString()}</div>{r.notes? <div style={{color:"#94a3b8", fontSize:12}}>Note: {r.notes}</div>: null}<div style={{color:"#94a3b8", fontSize:12}}>Operator: {r.operator||""}</div></div><div style={{textAlign:"right"}}><div style={{fontWeight:700, color:"#9bd1ff"}}>Rp{(r.cost||0).toLocaleString()}</div><div style={{color:"#94a3b8", fontSize:12}}>{r.durationMinutes} min</div></div></div>)) ) }</div><div style={{marginTop:12, display:"flex", gap:8, alignItems:"center"}}><input type="date" value={exportFrom} onChange={(e)=> setExportFrom(e.target.value)} style={styles.input} /><input type="date" value={exportTo} onChange={(e)=> setExportTo(e.target.value)} style={styles.input} /><button style={styles.btnPrimary} onClick={()=> exportLogsCSV()}>Export</button><button style={styles.btnOutline} onClick={()=> { if(confirm("Clear logs?")) setLogs([]); }}>Clear</button></div>{ session?.role === "admin" && (<div style={{marginTop:12}}><div style={{fontWeight:800, marginBottom:8}}>User management</div><UserManager users={users} onCreate={createUser} onEdit={editUser} onDelete={deleteUser} /></div>) }</div></aside></main><div style={styles.toastWrap}>{ toasts.map(t=> (<div key={t.id} style={{...styles.toast, borderLeft:`6px solid ${t.color||"#0b5ea8"}`}}><div style={{fontWeight:800}}>{t.text}</div><div style={{marginTop:8, display:"flex", gap:8}}>{ t.actionLabel && (<button style={styles.btnOutline} onClick={()=>{ try{ t.action && t.action(); }catch(e){} dismissToast(t.id); }}>{t.actionLabel}</button>) }<button style={styles.iconBtn} onClick={()=> dismissToast(t.id)}>Close</button></div></div>)) }</div><footer style={styles.footer}>© {new Date().getFullYear()} Playbox Samarinda</footer></div>);
}

/* Login Screen */
function LoginScreen({ onLogin, theme, setTheme, playClick }){
  const [user, setUser] = useState("admin"); const [pwd, setPwd] = useState("1234");
  return (<div style={ theme==="dark"? styles.app: styles.appLight }><style>{globalCSS(theme)}</style><div style={styles.centerCard}><div style={{fontSize:22,fontWeight:900,color:"#9bd1ff"}}>Operator Login</div><div style={{marginTop:12, width:340}}><input style={styles.input} value={user} onChange={(e)=> setUser(e.target.value)} placeholder="username" /><input style={{...styles.input, marginTop:8}} type="password" value={pwd} onChange={(e)=> setPwd(e.target.value)} placeholder="password" /><div style={{display:"flex", gap:8, marginTop:12}}><button style={styles.btnPrimary} onClick={()=>{ onLogin(user,pwd); playClick && playClick(); }}>Login</button><button style={styles.btnOutline} onClick={()=>{ setUser("admin"); setPwd("1234"); }}>Fill demo</button><div style={{marginLeft:"auto", display:"flex", gap:6}}><button style={styles.iconBtn} onClick={()=>{ setTheme(s=> s==="dark"?"light":"dark"); playClick && playClick(); }}>{theme==="dark"? "☀️":"🌙"}</button><a href="#/view?unit=1" onClick={(e)=>{ e.preventDefault(); window.location.hash="/view?unit=1"; }} style={{color:"#9bd1ff", alignSelf:"center"}}>Preview view</a></div></div></div></div></div>);
}

/* User Manager */
function UserManager({ users, onCreate, onEdit, onDelete }) {
  const [uName,setUName] = useState(""); const [uPwd, setUPwd] = useState(""); const [role,setRole] = useState("operator");
  return (<div><div style={{display:"flex", gap:6}}><input placeholder="username" value={uName} onChange={(e)=> setUName(e.target.value)} style={styles.input} /><input placeholder="password" value={uPwd} onChange={(e)=> setUPwd(e.target.value)} style={styles.input} /><select value={role} onChange={(e)=> setRole(e.target.value)} style={styles.input}><option value="operator">operator</option><option value="admin">admin</option></select><button style={styles.btnPrimary} onClick={()=>{ if(!uName || !uPwd) return alert("Enter username/password"); onCreate(uName,uPwd,role); setUName(""); setUPwd(""); }}>Create</button></div><div style={{marginTop:8}}>{ users.map(usr=> (<div key={usr.id} style={{display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.02)"}}><div><div style={{fontWeight:800}}>{usr.username} <span style={{fontWeight:600,color:"#94a3b8", fontSize:12}}>({usr.role})</span></div></div><div style={{display:"flex", gap:6}}><button style={styles.iconBtn} onClick={()=>{ const newPassword = prompt("New password (leave blank to keep):"); const newRole = prompt("Role (admin/operator):", usr.role) || usr.role; if(newPassword !== null){ const payload = {}; if(newPassword.length) payload.passwordEncoded = encodePwd(usr.username, newPassword); if(newRole) payload.role = newRole; onEdit(usr.id, payload); } }}>Edit</button><button style={styles.iconBtnDanger} onClick={()=>{ if(confirm("Delete user?")) onDelete(usr.id); }}>Del</button></div></div>)) }</div></div>);
}

/* Styles */
const globalCSS = (theme="dark")=> `*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial;background:${theme==="dark"? "#05060a":"#f8fbff"};color:${theme==="dark"? "#e6eefc":"#061226"}}`;

const styles = {
  app: { minHeight:"100vh", background:"linear-gradient(180deg,#02040a,#07101a)", color:"#e6eefc" },
  appLight: { minHeight:"100vh", background:"linear-gradient(180deg,#ffffff,#f1f9ff)", color:"#061226" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderBottom:"1px solid rgba(255,255,255,0.03)" },
  brand: { display:"flex", gap:12, alignItems:"center" },
  logo: { width:44, height:44, borderRadius:10, background:"linear-gradient(180deg,#001428,#071a2a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 },
  title: { fontSize:16, fontWeight:800, color:"#9bd1ff" },
  subtitle: { fontSize:12, color:"#94a3b8" },
  btnPrimary: { background:"linear-gradient(180deg,#00a3ff,#005cff)", color:"#fff", border:"none", padding:"8px 12px", borderRadius:10, cursor:"pointer" },
  btnOutline: { background:"transparent", border:"1px solid rgba(255,255,255,0.06)", padding:"8px 10px", borderRadius:10, cursor:"pointer", color:"#9bd1ff" },
  iconBtn: { background:"transparent", border:"1px solid rgba(255,255,255,0.04)", padding:6, borderRadius:8, cursor:"pointer", color:"#e6eefc" },
  iconBtnDanger: { background:"transparent", border:"1px solid rgba(255,80,80,0.08)", padding:6, borderRadius:8, cursor:"pointer", color:"#ff9b9b" },
  btnGhost: { background:"transparent", border:"none", padding:"8px 12px", borderRadius:8, cursor:"pointer", color:"#9bd1ff" },
  main: { display:"grid", gridTemplateColumns:"1fr 360px", gap:18, padding:18 },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:12 },
  card: { borderRadius:12, padding:14, background:"linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border:"1px solid rgba(255,255,255,0.03)", boxShadow:"0 8px 28px rgba(0,0,0,0.45)", transition:"transform .18s ease, box-shadow .18s ease" },
  cardHead: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  inputTiny: { padding:8, borderRadius:8, border:"1px solid rgba(255,255,255,0.04)", width:72, background:"transparent", color:"#e6eefc" },
  input: { padding:10, borderRadius:10, border:"1px solid rgba(255,255,255,0.04)", width:"100%", background:"transparent", color:"#e6eefc" },
  side: {},
  panel: { padding:12, background:"linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", borderRadius:12, boxShadow:"0 6px 18px rgba(0,0,0,0.45)" },
  toastWrap: { position:"fixed", right:20, top:20, display:"flex", flexDirection:"column", gap:12, zIndex:2000 },
  toast: { width:360, background:"linear-gradient(180deg,#021024,#04122a)", padding:12, borderRadius:10, boxShadow:"0 12px 36px rgba(0,0,0,0.6)", color:"#e6eefc" },
  centerCard: { minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" },
  linkBtn: { padding:"6px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.04)", textDecoration:"none", color:"#9bd1ff" },
  footer: { textAlign:"center", padding:12, color:"#6b7280" },
};
