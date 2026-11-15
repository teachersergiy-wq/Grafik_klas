const CFG={owner:"teachersergiy-wq",repo:"Grafik_klas",file:"data.json",defaultPasswords:{teacher:"teacher",starosta:"starosta"}};
const DRAFT_KEY="gk_draft_v1";
let data={students:[],days:{},passwords:null};
let token=localStorage.getItem("gk_write_token")||"";
let userLogin=localStorage.getItem("gk_login")||"";
let role=localStorage.getItem("gk_role")||"viewer";
let editDate=todayStr();
let dataSha=null;
let loginOpen=false;
let editingId=null;
let weekOffset=0;
let highlightToday=false;
let theme=localStorage.getItem("gk_theme")||"light";
const THEMES=["light","dark","color","neon"];
const THEME_ICONS={light:"☀️",dark:"🌙",color:"🎨",neon:"🌈"};
function applyTheme(){document.documentElement.setAttribute("data-theme",theme);const btn=document.getElementById("btnTheme");if(btn){btn.textContent=THEME_ICONS[theme]||"🎨";btn.title="Тема: "+({light:"світла",dark:"темна",color:"рожева",neon:"бірюзова"}[theme]||theme);}}
function cycleTheme(){const i=THEMES.indexOf(theme);theme=THEMES[(i+1)%THEMES.length];localStorage.setItem("gk_theme",theme);applyTheme();}
function todayStr(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Kyiv"});}
function kyivNow(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Europe/Kyiv"}));}
function isWeekdayKyiv(){const d=kyivNow().getDay();return d>=1&&d<=5;}
function isHeadTimeWindow(){if(!isWeekdayKyiv())return false;const n=kyivNow();const mins=n.getHours()*60+n.getMinutes();return mins>=8*60&&mins<10*60+40;}
function apiUrl(path){return "https://api.github.com/repos/"+CFG.owner+"/"+CFG.repo+"/contents/"+path;}
function getPasswords(){const p=data.passwords||{};return{teacher:p.teacher||CFG.defaultPasswords.teacher,starosta:p.starosta||CFG.defaultPasswords.starosta};}
async function loadData(){try{const headers=token?{Authorization:"Bearer "+token}:{};const r=await fetch(apiUrl(CFG.file)+"?ref=main",{headers:headers});if(!r.ok)throw new Error("load fail");const j=await r.json();dataSha=j.sha;const text=decodeURIComponent(escape(atob(j.content.replace(/\n/g,""))));data=JSON.parse(text);if(!data.students)data.students=[];if(!data.days)data.days={};}catch(e){try{const r2=await fetch("https://raw.githubusercontent.com/"+CFG.owner+"/"+CFG.repo+"/main/"+CFG.file+"?t="+Date.now());data=await r2.json();dataSha=null;if(!data.students)data.students=[];if(!data.days)data.days={};}catch(e2){data={students:[],days:{}};}}migrateStudentStats();renderAll();trySendDraft();}
async function saveData(msg){if(!token)throw new Error("Немає токена збереження. Вставте його у блок «Токен для збереження» вище.");const content=btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2))));const body={message:msg||"Оновлення графіка чергування",content:content,branch:"main"};if(dataSha)body.sha=dataSha;const r=await fetch(apiUrl(CFG.file),{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/vnd.github+json"},body:JSON.stringify(body)});if(!r.ok){const err=await r.json().catch(function(){return{};});throw new Error(err.message||"Помилка збереження");}const j=await r.json();dataSha=j.content.sha;}
function studentById(id){return data.students.find(function(s){return s.id===id;});}
function scheduleStats(studentId){let b=0,ch=0;const days=data.days||{};Object.keys(days).forEach(function(date){const rec=days[date];if(!rec)return;const abs=rec.absent||[];if(abs.indexOf(studentId)<0)b+=1;if(rec.duty===studentId&&dutyCountsInCh(rec))ch+=1;});return{b:b,ch:ch};}
function pastB(s){if(s.b0!=null&&s.b0!==undefined)return Number(s.b0)||0;return Number(s.b)||0;}
function pastCh(s){if(s.ch0!=null&&s.ch0!==undefined)return Number(s.ch0)||0;return Number(s.ch)||0;}
function totalB(s){return pastB(s)+scheduleStats(s.id).b;}
function totalCh(s){return pastCh(s)+scheduleStats(s.id).ch;}
function calcPct(s){const b=totalB(s);const ch=totalCh(s);if(!b||b<=0)return ch>0?1:0;return ch/b;}
function migrateStudentStats(){if(!data.students)return;data.students.forEach(function(s){if(s.b0!=null&&s.ch0!=null)return;const sch=scheduleStats(s.id);const tb=Number(s.b)||0;const tc=Number(s.ch)||0;s.b0=Math.max(0,tb-sch.b);s.ch0=Math.max(0,tc-sch.ch);});}
function pickDuty(absentIds){const present=data.students.filter(function(s){return absentIds.indexOf(s.id)<0;});if(!present.length)return null;present.sort(function(a,b){const pa=calcPct(a),pb=calcPct(b);if(Math.abs(pa-pb)>1e-9)return pa-pb;const ca=totalCh(a),cb=totalCh(b);if(ca!==cb)return ca-cb;return a.name.localeCompare(b.name,"uk");});return present[0].id;}
function dayRecord(date){return data.days[date]||null;}
function canEditDayNote(date){if(role==="teacher")return true;if(role!=="head")return false;if(date!==todayStr())return false;if(!isWeekdayKyiv())return false;const n=kyivNow();const mins=n.getHours()*60+n.getMinutes();return mins>=8*60&&mins<16*60;}
function renderAll(){applyTheme();if(typeof renderDuty==="function")renderDuty();if(typeof renderMatrix==="function")renderMatrix();if(typeof renderMonthFair==="function")renderMonthFair();if(typeof renderLateBanner==="function")renderLateBanner();if(typeof renderAuth==="function")renderAuth();if((role==="teacher"||role==="head")&&typeof renderEditor==="function")renderEditor();}
function migrateStudentStats(){}
async function trySendDraft(){}
function applyDay(){}
function reverseDay(){}
console.error("Core incomplete - full restore needed");
loadData();
