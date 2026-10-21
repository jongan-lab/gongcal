/* 두 레이아웃(A·B)이 함께 쓰는 데이터·필터·상세 시트 로직. 화면 배치는 각 index.html이 맡는다. */
(function(){
"use strict";
var GC=window.GC={};
var DATA_URL=new URL("data.json",document.currentScript.src).href;
var PREF_KEY="gongcal-pub:prefs:v1", SEEN_KEY="gongcal-pub:seen:v1";
var REFRESH_MS=15*60*1000;

var STAGES=GC.STAGES=[
  {k:"docStart",label:"접수 시작",short:"접수",color:"--s-doc",on:false},
  {k:"docEnd",label:"서류 마감",short:"마감",color:"--s-docEnd",on:true},
  {k:"guide",label:"자소서 가이드 제공",short:"가이드",color:"--s-guide",on:false},
  {k:"exam",label:"필기 시험",short:"필기",color:"--s-exam",on:true},
  {k:"examRes",label:"필기 합격 발표",short:"필기발표",color:"--s-examRes",on:true},
  {k:"int1",label:"1차 면접",short:"1차면접",color:"--s-int1",on:true},
  {k:"int1Res",label:"1차 합격 발표",short:"1차발표",color:"--s-int1Res",on:true},
  {k:"int2",label:"2차 면접",short:"2차면접",color:"--s-int2",on:true},
  {k:"final",label:"최종 발표",short:"최종",color:"--s-final",on:true}
];
var SMAP=GC.SMAP={}; STAGES.forEach(function(s){SMAP[s.k]=s;});
var ORDER=["docStart","docEnd","guide","exam","examRes","int1","int1Res","int2","final"];
GC.GROUPS=[
  {label:"서류",keys:["docStart","docEnd"]},
  {label:"필기",keys:["exam"]},
  {label:"면접",keys:["int1","int2"]},
  {label:"발표",keys:["examRes","int1Res","final"]}
];

/* ---------- storage (per-viewer conveniences only) ---------- */
function load(key,def){try{var v=localStorage.getItem(key);return v?JSON.parse(v):def;}catch(e){return def;}}
function save(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}}
var prefs=GC.prefs=load(PREF_KEY,null)||{};
prefs.stars=prefs.stars||[];
prefs.stages=prefs.stages||STAGES.filter(function(s){return s.on;}).map(function(s){return s.k;});
prefs.types=prefs.types||[];
GC.savePrefs=function(){save(PREF_KEY,prefs);};
GC.state={q:"",starOnly:!!prefs.starOnly,group:null};

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id);}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function pad(n){return (n<10?"0":"")+n;}
function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function parseYmd(s){var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
function todayStr(){return ymd(new Date());}
function addDays(s,n){var d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d);}
function diffDays(a,b){return Math.round((parseYmd(b)-parseYmd(a))/86400000);}
var DOW=["일","월","화","수","목","금","토"];
function fmtMD(s){var d=parseYmd(s);return (d.getMonth()+1)+"/"+d.getDate()+"("+DOW[d.getDay()]+")";}
function fmtLong(s){var d=parseYmd(s);return (d.getMonth()+1)+"월 "+d.getDate()+"일 ("+DOW[d.getDay()]+")";}
function fmtFull(s){var d=parseYmd(s);return d.getFullYear()+". "+(d.getMonth()+1)+". "+d.getDate()+". ("+DOW[d.getDay()]+")";}
function dlabel(n){return n===0?"D-DAY":(n>0?"D-"+n:"D+"+(-n));}
function relText(n){return n===0?"오늘":(n>0?n+"일 남음":(-n)+"일 지남");}
function cssVar(n){return "var("+n+")";}
function safeUrl(u){return typeof u==="string"&&/^https?:\/\//i.test(u)?u:null;}
GC.$=$;GC.el=el;GC.pad=pad;GC.ymd=ymd;GC.parseYmd=parseYmd;GC.todayStr=todayStr;GC.addDays=addDays;GC.diffDays=diffDays;
GC.DOW=DOW;GC.fmtMD=fmtMD;GC.fmtLong=fmtLong;GC.dlabel=dlabel;GC.cssVar=cssVar;

/* ---------- model ---------- */
GC.data=null;
function coOf(row){return (GC.data&&row.co&&GC.data.companies[row.co])||null;}
function nameOf(row){var c=coOf(row);if(c&&c.name)return c.name;return row.title||"이름 없는 공고";}
function suffixOf(row){return (row.title||"").replace(/^\s*\d{4}년?\s*/,"").trim();}
function eventsOf(row){
  var ev=[],d=row.d;
  ORDER.forEach(function(k){
    if(!d[k])return;
    if(k==="docStart"&&d.docStart===d.docEnd)return;
    var end=k==="exam"?d.examEnd:k==="int1"?d.int1End:k==="int2"?d.int2End:null;
    ev.push({k:k,date:d[k],end:end&&end!==d[k]?end:null,row:row});
  });
  return ev;
}
function rowVisible(row){
  var st=GC.state;
  if(st.starOnly&&prefs.stars.indexOf(row.co||row.id)<0)return false;
  if(prefs.types.length){var c=coOf(row);if(!c||prefs.types.indexOf(c.kind)<0)return false;}
  if(st.q){var q=st.q.toLowerCase().replace(/\s+/g,"");
    var hay=(nameOf(row)+row.title).toLowerCase().replace(/\s+/g,"");if(hay.indexOf(q)<0)return false;}
  return true;
}
function activeKeys(){
  var g=GC.state.group;
  return g==null?prefs.stages:GC.GROUPS[g].keys;
}
function visibleEvents(){
  var out=[],keys=activeKeys();if(!GC.data)return out;
  GC.data.rows.forEach(function(r){if(!rowVisible(r))return;
    eventsOf(r).forEach(function(e){if(keys.indexOf(e.k)>=0)out.push(e);});});
  out.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:ORDER.indexOf(a.k)-ORDER.indexOf(b.k);});
  return out;
}
function eventsByDay(){var m={};visibleEvents().forEach(function(e){(m[e.date]=m[e.date]||[]).push(e);});return m;}
function nextEvent(row,t){var evs=eventsOf(row).filter(function(e){return e.date>=t&&e.k!=="guide";});return evs[0]||null;}
var seen=load(SEEN_KEY,null);
function isNew(row){return !!(seen&&seen.newIds&&seen.newIds[row.id]);}
function isStar(row){return prefs.stars.indexOf(row.co||row.id)>=0;}
function toggleStar(row){var key=row.co||row.id,i=prefs.stars.indexOf(key);if(i>=0)prefs.stars.splice(i,1);else prefs.stars.push(key);GC.savePrefs();GC.render();}
GC.coOf=coOf;GC.nameOf=nameOf;GC.suffixOf=suffixOf;GC.eventsOf=eventsOf;GC.rowVisible=rowVisible;GC.visibleEvents=visibleEvents;
GC.eventsByDay=eventsByDay;GC.nextEvent=nextEvent;GC.isNew=isNew;GC.isStar=isStar;GC.toggleStar=toggleStar;
GC.render=function(){}; // 각 레이아웃이 덮어쓴다

/* ---------- shared widgets ---------- */
// 일정 하나를 카드로: 색 막대 · 단계 · 기업명 · 부가정보 · D-day
GC.evCard=function(e,opts){
  opts=opts||{};
  var s=SMAP[e.k],t=todayStr(),b=el("button","evcard");
  var bar=el("span","bar");bar.style.background=cssVar(s.color);b.appendChild(bar);
  var main=el("span","main"),nm=el("span","nm");
  nm.appendChild(el("span","",GC.nameOf(e.row)));if(isNew(e.row))nm.appendChild(el("span","new","NEW"));
  main.appendChild(nm);
  var sub=[s.label],sx=suffixOf(e.row);if(sx)sub.push(sx);if(e.end)sub.push("~"+fmtMD(e.end));
  if(e.k==="exam"&&e.row.type)sub.push(e.row.type);
  if(opts.withDate)sub.unshift(fmtMD(e.date));
  var se=el("span","sub",sub.join(" · "));se.style.setProperty("--c",cssVar(s.color));main.appendChild(se);
  b.appendChild(main);
  var n=diffDays(t,e.date);
  if(opts.dday!==false)b.appendChild(el("span","dd"+(n>=0&&n<=3?" hot":""),dlabel(n)));
  b.addEventListener("click",function(){GC.openRow(e.row);});
  return b;
};
GC.coCard=function(r){
  var c=coOf(r),t=todayStr(),card=el("div","cocard");
  var row1=el("div","row1");
  var st=el("button","star",isStar(r)?"★":"☆");st.setAttribute("aria-pressed",isStar(r)?"true":"false");st.setAttribute("aria-label","관심 기업");
  st.onclick=function(){toggleStar(r);};
  var nb=el("button","nmb",nameOf(r));if(isNew(r)){var nw=el("span","new","NEW");nw.style.marginLeft="6px";nb.appendChild(nw);}
  var sx=suffixOf(r);if(sx)nb.appendChild(el("small","",sx));
  nb.onclick=function(){GC.openRow(r);};
  row1.appendChild(nb);if(c&&c.kind)row1.appendChild(el("span","typechip",c.kind));row1.appendChild(st);
  card.appendChild(row1);
  var dots=el("div","dots");
  ["docEnd","exam","examRes","int1","int1Res","int2","final"].forEach(function(k){
    if(!r.d[k])return;var dt=el("span","dot"+(r.d[k]<t?" done":""));dt.style.color=cssVar(SMAP[k].color);
    dt.title=SMAP[k].label+" "+fmtMD(r.d[k]);dots.appendChild(dt);});
  card.appendChild(dots);
  var ne=nextEvent(r,t),nx=el("div","next");
  if(ne){var lab=el("b","",SMAP[ne.k].label+" ");lab.style.color=cssVar(SMAP[ne.k].color);
    nx.appendChild(lab);nx.appendChild(document.createTextNode(fmtMD(ne.date)+" · "+dlabel(diffDays(t,ne.date))));}
  else{nx.textContent="전형 종료";nx.className="next muted";}
  card.appendChild(nx);
  return card;
};
// 진행 중(또는 2주 안에 끝난) 공고를 다음 일정 가까운 순으로
GC.activeRows=function(){
  if(!GC.data)return [];
  var t=todayStr();
  var rows=GC.data.rows.filter(rowVisible).filter(function(r){var e=eventsOf(r);return e.length&&e[e.length-1].date>=addDays(t,-14);});
  rows.sort(function(a,b){var x=nextEvent(a,t),y=nextEvent(b,t);
    if(x&&y)return x.date<y.date?-1:x.date>y.date?1:0;if(x)return -1;if(y)return 1;return nameOf(a)<nameOf(b)?-1:1;});
  return rows;
};
GC.upcomingExams=function(days){
  if(!GC.data)return [];var t=todayStr();
  return GC.data.rows.filter(rowVisible).filter(function(r){return r.d.exam&&r.d.exam>=t&&diffDays(t,r.d.exam)<=days;})
    .sort(function(a,b){return a.d.exam<b.d.exam?-1:1;});
};
GC.deadlines=function(days){
  if(!GC.data)return [];var t=todayStr();
  return GC.data.rows.filter(rowVisible).filter(function(r){return r.d.docEnd&&r.d.docEnd>=t&&diffDays(t,r.d.docEnd)<=days;})
    .sort(function(a,b){return a.d.docEnd<b.d.docEnd?-1:1;});
};
GC.emptyBox=function(title,sub){var em=el("div","empty");em.appendChild(el("b","",title));if(sub)em.appendChild(document.createTextNode(sub));return em;};

// 필터 패널: 관심 기업 · 전형 단계 · 기업 유형
GC.buildFilters=function(box){
  box.textContent="";
  var g0=el("div","fgroup"),tl=el("label","toggle"),cb=el("input");cb.type="checkbox";cb.checked=GC.state.starOnly;
  cb.onchange=function(){GC.state.starOnly=cb.checked;prefs.starOnly=cb.checked;GC.savePrefs();GC.render();};
  tl.appendChild(cb);tl.appendChild(document.createTextNode("관심 기업만 보기"));g0.appendChild(tl);box.appendChild(g0);

  var g1=el("div","fgroup"),h1=el("h3","","전형 단계"),all=el("button","","전체 켜기");
  all.onclick=function(){prefs.stages=STAGES.map(function(s){return s.k;});GC.state.group=null;GC.savePrefs();GC.buildFilters(box);GC.render();};
  h1.appendChild(all);g1.appendChild(h1);var sg=el("div","stages");
  STAGES.forEach(function(s){
    var lab=el("label"),c=el("input");c.type="checkbox";c.checked=prefs.stages.indexOf(s.k)>=0;
    c.onchange=function(){
      if(c.checked){if(prefs.stages.indexOf(s.k)<0)prefs.stages.push(s.k);}else prefs.stages=prefs.stages.filter(function(x){return x!==s.k;});
      GC.state.group=null;GC.savePrefs();GC.render();};
    var sw=el("span","sw");sw.style.background=cssVar(s.color);
    lab.appendChild(c);lab.appendChild(sw);lab.appendChild(document.createTextNode(s.label));sg.appendChild(lab);
  });
  g1.appendChild(sg);box.appendChild(g1);

  var g2=el("div","fgroup"),h2=el("h3","","기업 유형"),clr=el("button","","해제");
  clr.onclick=function(){prefs.types=[];GC.savePrefs();GC.buildFilters(box);GC.render();};
  h2.appendChild(clr);g2.appendChild(h2);var chips=el("div","chips");
  var kinds={};if(GC.data)Object.keys(GC.data.companies).forEach(function(k){var t=GC.data.companies[k].kind;if(t)kinds[t]=(kinds[t]||0)+1;});
  Object.keys(kinds).sort(function(a,b){return kinds[b]-kinds[a];}).forEach(function(t){
    var b=el("button","chip",t);b.setAttribute("aria-pressed",prefs.types.indexOf(t)>=0?"true":"false");
    b.onclick=function(){
      if(prefs.types.indexOf(t)>=0)prefs.types=prefs.types.filter(function(x){return x!==t;});else prefs.types.push(t);
      GC.savePrefs();b.setAttribute("aria-pressed",prefs.types.indexOf(t)>=0?"true":"false");GC.render();};
    chips.appendChild(b);
  });
  if(!chips.childNodes.length)chips.appendChild(el("span","fcount","불러오는 중…"));
  g2.appendChild(chips);box.appendChild(g2);
  box.appendChild(el("div","fcount fcount-n"));GC.renderCount();
};
GC.renderCount=function(){
  if(!GC.data)return;
  var txt="공고 "+GC.data.rows.length+"건 중 "+GC.data.rows.filter(rowVisible).length+"건 표시";
  document.querySelectorAll(".fcount-n").forEach(function(c){c.textContent=txt;});
};
GC.filtersActive=function(){
  var def=STAGES.filter(function(s){return s.on;}).map(function(s){return s.k;});
  var stagesChanged=prefs.stages.length!==def.length||def.some(function(k){return prefs.stages.indexOf(k)<0;});
  return (GC.state.starOnly?1:0)+(prefs.types.length?1:0)+(stagesChanged?1:0);
};

/* ---------- sheet (detail / filters) ---------- */
var lastFocus=null;
function openSheet(title,meta,fill){
  $("sTitle").textContent=title;$("sMeta").textContent=meta||"";
  var b=$("sBody");b.textContent="";b.scrollTop=0;fill(b);
  if(!$("sheet").classList.contains("show"))lastFocus=document.activeElement;
  $("sheet").classList.add("show");$("scrim").classList.add("show");$("sheet").setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";$("sClose").focus({preventScroll:true});
}
function closeSheet(){
  $("sheet").classList.remove("show");$("scrim").classList.remove("show");$("sheet").setAttribute("aria-hidden","true");
  document.body.style.overflow="";if(lastFocus&&lastFocus.focus)lastFocus.focus({preventScroll:true});
}
GC.openSheet=openSheet;GC.closeSheet=closeSheet;
function kvRow(dl,k,v){if(!v)return;dl.appendChild(el("dt","",k));var dd=el("dd");if(typeof v==="string")dd.textContent=v;else dd.appendChild(v);dl.appendChild(dd);}
function tags(list){if(!list||!list.length)return null;var w=el("div","tagrow");list.forEach(function(x){w.appendChild(el("span","tag",x));});return w;}
GC.openRow=function(r){
  var c=coOf(r),t=todayStr();
  openSheet(nameOf(r),[r.title,r.season?r.season+" 채용":"",c&&c.kind].filter(Boolean).join(" · "),function(b){
    var acts=el("div","dsec"),links=el("div","dlinks");
    var lk=r.links.concat(c?c.links:[]).map(safeUrl).filter(Boolean);
    lk=lk.filter(function(u,i){return lk.indexOf(u)===i;});
    lk.slice(0,2).forEach(function(u,i){var x=el("a",i?"sec":"",i===0?"채용 공고 보기 ↗":"채용 홈페이지 ↗");x.href=u;x.target="_blank";x.rel="noopener noreferrer";links.appendChild(x);});
    var sb=el("button","btn",isStar(r)?"★ 관심 해제":"☆ 관심 기업");
    sb.onclick=function(){toggleStar(r);GC.openRow(r);};links.appendChild(sb);
    acts.appendChild(links);b.appendChild(acts);

    var sec=el("div","dsec");sec.appendChild(el("h3","","전형 일정"));
    var tl=el("ol","tl"),evs=eventsOf(r);
    if(!evs.length)sec.appendChild(el("div","empty-mini","아직 발표된 일정이 없어요."));
    evs.forEach(function(e){var s=SMAP[e.k],li=el("li",e.date<t?"past":"");li.style.setProperty("--c",cssVar(s.color));
      li.appendChild(el("div","lab",s.label));var dl=el("div","");dl.appendChild(el("span","dt",fmtFull(e.date)+(e.end?" ~ "+fmtMD(e.end):"")));
      dl.appendChild(el("span","rel",relText(diffDays(t,e.date))));li.appendChild(dl);tl.appendChild(li);});
    if(evs.length)sec.appendChild(tl);b.appendChild(sec);

    var s2=el("div","dsec");s2.appendChild(el("h3","","필기"));var kv=el("dl","kv");
    kvRow(kv,"필기 유형",r.type);kvRow(kv,"NCS 과목",tags(r.ncs));kvRow(kv,"NCS 문항",r.ncsQ&&r.ncsQ!=="-"?r.ncsQ:"");
    kvRow(kv,"전공 문항",r.majorQ&&r.majorQ!=="-"?r.majorQ:"");
    kvRow(kv,"전기 과목",tags(r.elec));kvRow(kv,"기계 과목",tags(r.mech));
    kvRow(kv,"기타 과목",tags(r.etc));kvRow(kv,"필기 배수",r.ratio);kvRow(kv,"필기 특이사항",r.examNote);
    if(kv.childNodes.length){s2.appendChild(kv);b.appendChild(s2);}

    var s3=el("div","dsec");s3.appendChild(el("h3","","채용 정보"));var kv2=el("dl","kv");
    kvRow(kv2,"채용 인원",r.hire);kvRow(kv2,"채용 정리",r.brief);kvRow(kv2,"특이사항",r.note);
    if(kv2.childNodes.length){s3.appendChild(kv2);b.appendChild(s3);}
  });
};
GC.openDay=function(ds,list){
  openSheet(fmtLong(ds),"일정 "+list.length+"건",function(b){
    var w=el("div","daylist");list.forEach(function(e){w.appendChild(GC.evCard(e,{dday:false}));});b.appendChild(w);
  });
};
GC.openFilters=function(){
  openSheet("필터","",function(b){GC.buildFilters(b);
    var done=el("button","btn","적용하고 닫기");done.style.width="100%";done.style.marginTop="8px";done.onclick=closeSheet;b.appendChild(done);});
};

/* ---------- notices ---------- */
var toastT=null;
GC.toast=function(msg){var t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove("show");},4200);};
function notice(msg){var n=$("notice");if(!n)return;n.className="notice"+(msg?" show":"");n.textContent=msg||"";}
GC.stampText=function(){
  if(!GC.data||!GC.data.updatedAt)return "";
  var d=new Date(GC.data.updatedAt);
  return "업데이트 "+(d.getMonth()+1)+"/"+d.getDate()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
};

/* ---------- load ---------- */
function markNew(rows){
  var now=Date.now(),ids=rows.map(function(r){return r.id;}),added=0;
  if(!seen){seen={ids:ids,newIds:{}};save(SEEN_KEY,seen);return 0;}
  var set={};seen.ids.forEach(function(i){set[i]=1;});
  Object.keys(seen.newIds).forEach(function(k){if(now-seen.newIds[k]>3*86400000)delete seen.newIds[k];});
  ids.forEach(function(i){if(!set[i]){seen.newIds[i]=now;added++;}});
  seen.ids=ids;save(SEEN_KEY,seen);return added;
}
var lastFetch=0;
function fetchData(){
  lastFetch=Date.now();
  return fetch(DATA_URL+"?t="+Date.now(),{cache:"no-store"}).then(function(res){
    if(!res.ok)throw new Error(res.status);return res.json();
  }).then(function(j){
    if(!j||!Array.isArray(j.rows))throw new Error("format");
    j.companies=j.companies||{};
    var first=!GC.data,changed=first||GC.data.updatedAt!==j.updatedAt;
    GC.data=j;notice("");
    if(!changed)return;
    var added=markNew(j.rows);
    if(GC.onData)GC.onData();GC.render();
    if(added)GC.toast("새 공고 "+added+"건이 올라왔어요. NEW 표시로 확인하세요.");
    else if(!first)GC.toast("일정이 업데이트됐어요.");
  }).catch(function(){
    if(!GC.data)notice("일정을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.");
  });
}
GC.start=function(){
  $("sClose").onclick=closeSheet;$("scrim").onclick=closeSheet;
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&$("sheet").classList.contains("show"))closeSheet();});
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible"&&Date.now()-lastFetch>REFRESH_MS)fetchData();});
  setInterval(function(){if(document.visibilityState==="visible"&&Date.now()-lastFetch>REFRESH_MS)fetchData();},60000);
  GC.render();fetchData();
};
})();
