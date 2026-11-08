import {firebaseConfig,ADMIN_UID,TG,SHUFFLE} from './config.js';
import {svg,LAWS} from './laws.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signInAnonymously,signOut,sendPasswordResetEmail,updateProfile} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,updateDoc,addDoc,deleteDoc,collection,collectionGroup,getDocs,serverTimestamp,writeBatch,onSnapshot,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';



/* ========= تعريف المسارات والدورات ========= */
const DEFAULT_COURSES={
  computerized:{
    title:'دورة المحوسب - قدرات كمي',
    groups:[
      {t:'الحصة التعريفية',items:[{id:'intro',t:'الحصة التعريفية',d:''}]},
      {t:'بنك أسئلة المحوسب',items:[1,2,3,4,5,6].map(n=>({id:'t'+n,t:'اختبار '+n,d:'',quiz:true}))}
    ]
  },
  foundation:{
    title:'دورة التأسيس - قدرات كمي',
    groups:[
      {t:'مقدمة وتأسيس',items:[{id:'f_intro',t:'حصة التأسيس الأولى',d:''}]},
      {t:'اختبارات التأسيس المتدرجة',items:[1,2,3,4,5].map(n=>({id:'ft'+n,t:'تأسيس '+n,d:'',quiz:true}))}
    ]
  }
};

const mkC=(p,title,en)=>({title,groups:[{t:en?'Introduction':'الحصة التعريفية',items:[{id:p+'_intro',t:en?'Introduction Session':'الحصة التعريفية',d:''}]},{t:en?'Question Bank':'بنك الأسئلة',items:[1,2,3,4,5,6].map(n=>({id:p+'_t'+n,t:(en?'Test ':'اختبار ')+n,d:'',quiz:true}))}]});
DEFAULT_COURSES.gat=mkC('gat','GAT Course',1);
DEFAULT_COURSES.tahsili=mkC('tah','دورة التحصيلي');
DEFAULT_COURSES.american=mkC('am','American Section',1);
const AGR=[3,4,5,6,7,8,9,10,11,12].map(n=>['g'+n,'Grade '+n]);
AGR.forEach(([c,n])=>DEFAULT_COURSES['am_'+c]=mkC('am'+c,'American Section — '+n,1));
const GRADES=[['p3','الصف الثالث الابتدائي'],['p4','الصف الرابع الابتدائي'],['p5','الصف الخامس الابتدائي'],['p6','الصف السادس الابتدائي'],['m1','الصف الأول المتوسط'],['m2','الصف الثاني المتوسط'],['m3','الصف الثالث المتوسط'],['s1','الصف الأول الثانوي'],['s2','الصف الثاني الثانوي'],['s3','الصف الثالث الثانوي']];
GRADES.forEach(([c,n])=>DEFAULT_COURSES['st_'+c]=mkC('st'+c,n));
const TR=[['computerized','📘','دورة المحوسب'],['foundation','📐','دورة التأسيس'],['gat','🎓','GAT'],['tahsili','🧪','التحصيلي'],['stages','🏫','المراحل التعليمية'],['american','🇺🇸','American Section']];
const LS={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let CUR_TRACK=LS.get('cur_track')||'computerized';
let COURSES=JSON.parse(JSON.stringify(DEFAULT_COURSES));
const isEN=()=>CUR_TRACK==='gat'||CUR_TRACK==='american'||CUR_TRACK.startsWith('am_');
const trackOfItem=id=>Object.keys(COURSES).find(k=>COURSES[k].groups.some(g=>g.items.some(x=>x.id===id)))||'';
const qTrack=()=>{const c=COURSES[CUR_TRACK];return(c&&c.groups.some(g=>g.items.some(x=>x.id===Q.it.id)))?CUR_TRACK:trackOfItem(Q.it.id)};
const topOf=t=>t.startsWith('st_')?'stages':t.startsWith('am_')?'american':t;
/* أرقام ورموز لاتينية (يسار←يمين): الإنجليزي + الثانوي فقط. بقية المراحل (ابتدائي/متوسط) عربية بالكامل يمين←يسار */
const latin=()=>isEN()||/^st_s[123]$/.test(CUR_TRACK);
const curTop=()=>CUR_TRACK.startsWith('st_')?'stages':CUR_TRACK.startsWith('am_')?'american':CUR_TRACK;
const allowedT=k=>S.isAdmin||!S.track0||k===S.track0;
const trOptsA=sel=>(S.isAdmin||!S.track0)?trOpts(sel):`<option value="${S.track0}" selected>${esc(trName(S.track0))}</option>`;
const trName=k=>COURSES[k]?COURSES[k].title:'—';
const secOf=t=>{for(const k of Object.keys(COURSES))if(COURSES[k].groups.some(g=>g.items.some(x=>x.id===t)))return COURSES[k].title;return'—'};
const trOpts=(sel)=>TR.filter(x=>x[0]!=='stages'&&x[0]!=='american').map(([k,i,n])=>`<option value="${k}"${k===sel?' selected':''}>${i} ${n}</option>`).join('')+`<optgroup label="المراحل التعليمية">${GRADES.map(([c,n])=>`<option value="st_${c}"${'st_'+c===sel?' selected':''}>${n}</option>`).join('')}</optgroup><optgroup label="American Section">${AGR.map(([c,n])=>`<option value="am_${c}"${'am_'+c===sel?' selected':''}>🇺🇸 ${n}</option>`).join('')}</optgroup>`;

const PASS={exam:70,train:70};
const ACC=['#18a4f2','#f58a22','#8b5cf6','#19cf93','#e84a93','#ffcf33'];

/* ========= الحالة ========= */
let S={sh:{},user:null,name:'',tg:'',accent:ACC[0],done:{},folders:{},res:[],tests:{},media:{},dark:true,isAdmin:false};
try{S.dark=localStorage.getItem('dark')!=='0'}catch(e){}
const $=s=>document.querySelector(s),app=$('#app');

const currentCourse=()=>COURSES[CUR_TRACK]||COURSES.computerized;
const allItems=()=>currentCourse().groups.flatMap(g=>g.items);
const allQuizzes=()=>allItems().filter(x=>x.quiz);
const L_AR=['أ','ب','ج','د'],L_EN=['A','B','C','D'],L=new Proxy([],{get:(t,p)=>(isEN()?L_EN:L_AR)[p]});
const pct=()=>Math.round(allItems().filter(x=>S.done[x.id]).length/Math.max(1,allItems().length)*100);
const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const ARD='٠١٢٣٤٥٦٧٨٩',SUPD={'٠':'⁰','١':'¹','٢':'²','٣':'³','٤':'⁴','٥':'⁵','٦':'⁶','٧':'⁷','٨':'⁸','٩':'⁹','-':'⁻','+':'⁺','n':'ⁿ'};
const toAr=s=>latin()?String(s??'').replace(/[٠-٩]/g,d=>ARD.indexOf(d)).replace(/٫/g,'.').replace(/٪/g,'%'):toAr0(s),toAr0=s=>String(s??'').replace(/(\d)\.(\d)/g,'$1٫$2').replace(/\d/g,d=>ARD[d]).replace(/%/g,'٪');
/* نص رياضي: أرقام عربية + كسور {أ|ب} + جذور √{س} + أسس ^{ن} + أدلة _{ن} */
const MRUN=/[-−+]?(?:[A-Za-z0-9π∞√]|[({\[]+(?=[A-Za-z0-9π∞√\-−+{(\[]))(?:[A-Za-z0-9π∞√²³⁰-⁹ⁿ°′″≤≥≠≈±×÷·∙*\/=+\-−<>%^_{}|()\[\].,:  ]*[A-Za-z0-9π∞²³⁰-⁹ⁿ%°)}\]])?/g;
function mt(s){
  let r=toAr(s);if(latin()&&!isEN())r=r.replace(MRUN,m=>'\uE000'+m+'\uE001');
  let t=esc(r);
  t=t.replace(/\^\{([^{}]+)\}/g,'<sup>$1</sup>').replace(/_\{([^{}]+)\}/g,'<sub>$1</sub>');
  t=t.replace(/~\{([^{}]+)\}/g,'<span class="rp">$1</span>');
  t=t.replace(/\{([^{}|]+)\|([^{}|]+)\}/g,'<span class="fr"><span class="fn" dir="ltr">$1</span><span class="fd" dir="ltr">$2</span></span>');
  t=t.replace(/√\{([^{}]+)\}/g,'<span class="rad">√<span class="rb2">$1</span></span>');
  return t.replace(/\uE000/g,'<span dir="ltr">').replace(/\uE001/g,'</span>');
}
function plain(s){
  return toAr(s).replace(/\^\{([^{}]+)\}/g,(m,x)=>[...x].map(c=>SUPD[c]||c).join('')).replace(/_\{([^{}]+)\}/g,'$1').replace(/~\{([^{}]+)\}/g,'$1')
    .replace(/\{([^{}|]+)\|([^{}|]+)\}/g,'$1/$2').replace(/√\{([^{}]+)\}/g,'√($1)');
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const getQs=t=>(S.tests[t]||[]).map(q=>({...q,tid:t}));
const allQs=()=>Object.keys(S.tests).flatMap(getQs);
const findQ=r=>{const[t,i]=r.split(':');return getQs(t).find(q=>q.id===i)};
const tname=t=>{
  for(const k of Object.keys(COURSES)){
    const it=COURSES[k].groups.flatMap(g=>g.items).find(x=>x.id===t);
    if(it)return it.t;
  }
  return'مجلد';
};

let timer=null,Q=null,cur='intro',filter='',fsel='',fpage=0,fshow=false;
function toast(m){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.append(t)}t.textContent=m;t.className='show';clearTimeout(t._h);t._h=setTimeout(()=>t.className='',2800)}

/* ========= Firebase ========= */
const ready=firebaseConfig.apiKey!=='YOUR_API_KEY';
let auth,db;
if(ready){const a=initializeApp(firebaseConfig);auth=getAuth(a);db=getFirestore(a)}
const saveUser=p=>S.guest?Promise.resolve():updateDoc(doc(db,'users',S.user.uid),p).catch(e=>{console.error(e);toast('تعذر الحفظ — تحقق من الاتصال')});
const notify=p=>addDoc(collection(db,'notifications'),{...p,ts:serverTimestamp(),read:false}).catch(e=>console.warn('notify',e));

async function loadStructure(){
  try{
    const s=await getDoc(doc(db,'meta','structure'));
    if(s.exists()){
      const d=s.data();
      if(d.COURSES)COURSES={...COURSES,...d.COURSES};
    }
  }catch(e){console.warn('استخدام الهيكل الافتراضي للدورات',e)}
}

async function saveStructure(){
  let err;
  for(let i=0;i<3;i++){
    try{await setDoc(doc(db,'meta','structure'),JSON.parse(JSON.stringify({COURSES})),{merge:true});toast('تم حفظ هيكل الاختبارات بنجاح ✓');return true}
    catch(e){err=e;await new Promise(r=>setTimeout(r,900*(i+1)))}
  }
  console.error(err);toast('تعذر حفظ الهيكل ('+(err.code||err.message)+') — الاختبارات محفوظة وستظهر تلقائياً');return false;
}
function discoverTests(ms){
  ms.sort((a,b)=>(a[1].ts||0)-(b[1].ts||0));
  for(const[id,m]of ms){
    const c=COURSES[m.trk];if(!c)continue;
    if(Object.values(COURSES).some(cc=>cc.groups.some(g=>g.items.some(x=>x.id===id))))continue;
    let g=[...c.groups].reverse().find(g=>g.items.some(x=>x.quiz));
    if(!g){g={t:'بنك الأسئلة والاختبارات',items:[]};c.groups.push(g)}
    g.items.push({id,t:m.t||id,d:'',quiz:true});
  }
}

async function loadAll(){
  S.err='';
  try{
    await loadStructure();
    const u=S.user,pr=doc(db,'users',u.uid);S.name=u.displayName||u.email;let s=await getDoc(pr);
    if(!s.exists()){const nm0=S.pending||u.displayName||u.email,tr0=S.pendTrack||'';await setDoc(pr,{name:nm0,done:{},folders:{},track:tr0,approved:S.isAdmin,rejected:false,ts:serverTimestamp()});if(!S.isAdmin)notify({type:'join',uid:u.uid,name:nm0,track:tr0});s=await getDoc(pr)}
    const p=s.data();S.approved=S.isAdmin||p.approved!==false;S.rejected=!!p.rejected;S.track0=p.track||'';if(p.track&&COURSES[p.track]&&LS.get('cu')!==u.uid){CUR_TRACK=p.track;LS.set('cur_track',CUR_TRACK);LS.set('cu',u.uid)}S.done=p.done||{};S.folders=p.folders||{};S.name=p.name||u.email;S.tg=p.tg||'';S.shareTok=p.shareTok||'';S.accent=p.accent||ACC[0];
    if(!S.approved)return;S.tests={};const metas=[];(await getDocs(collection(db,'tests'))).forEach(d=>{const x=d.data();S.tests[d.id]=x.qs||[];S.sh[d.id]=!!x.shared;if(x.meta&&x.meta.trk)metas.push([d.id,x.meta])});discoverTests(metas);
    S.media={};(await getDocs(collection(db,'lessons'))).forEach(d=>S.media[d.id]=d.data());
    S.res=(await getDocs(collection(db,'users',u.uid,'results'))).docs.map(d=>d.data()).sort((a,b)=>(a.ts?.seconds||0)-(b.ts?.seconds||0));
  }catch(e){S.err=e.message;console.error(e)}
}

/* صور الأسئلة */
const IMG={};
async function qimg(id){if(IMG[id]!==undefined)return IMG[id];try{const s=await getDoc(doc(db,'qimg',id));IMG[id]=s.exists()?s.data().d:''}catch(e){IMG[id]=''}return IMG[id]}
const fillImgs=()=>document.querySelectorAll('img[data-q]').forEach(im=>qimg(im.dataset.q).then(d=>{if(d)im.src=d}));
function compress(file,max=900,qual=.72){return new Promise((ok,no)=>{
  const im=new Image(),u=URL.createObjectURL(file);
  im.onload=()=>{const r=Math.min(1,max/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);
    let d=c.toDataURL('image/jpeg',qual);if(d.length>850000)d=c.toDataURL('image/jpeg',.5);ok(d)};
  im.onerror=()=>no(new Error('الملف ليس صورة'));im.src=u})}
const ytId=u=>{const m=String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);return m?m[1]:''};

/* ========= المظهر والألوان ========= */
const theme=()=>{document.documentElement.dataset.theme=S.dark?'dark':'light';$('#th').textContent=S.dark?'☀':'☾'};
function applyAccent(c){
  const st=document.documentElement.style,P=['--ac','--ac2','--glow','--onac'];
  if(!c||c===ACC[0]){P.forEach(p=>st.removeProperty(p));return}
  const n=parseInt(c.slice(1),16),lum=(.299*(n>>16)+.587*((n>>8)&255)+.114*(n&255))/255;
  st.setProperty('--ac',c);st.setProperty('--ac2',`color-mix(in srgb,${c} 78%,#fff)`);st.setProperty('--glow',`color-mix(in srgb,${c} 22%,transparent)`);st.setProperty('--onac',lum>.45?'#141831':'#fff');
}
$('#th').onclick=()=>{S.dark=!S.dark;try{localStorage.setItem('dark',S.dark?'1':'0')}catch(e){}theme()};
$('#out').onclick=()=>signOut(auth);

/* ========= الموجّه ========= */
function route(){
  clearInterval(timer);clearInterval(S.pt);if(!location.hash.startsWith('#/quiz/'))leaveFS();applyLang();
  $('#out').hidden=!S.user||S.guest;$('#nv').hidden=!S.user||S.guest||(!S.approved&&!S.isAdmin);$('#ad').hidden=!S.isAdmin;$('#adr').hidden=!S.isAdmin;$('#bellw').hidden=!S.isAdmin;
  const h0=location.hash;
  if(h0.startsWith('#/r/'))return reportPage(h0.split('/')[2]||'');
  if(h0.startsWith('#/t/'))return sharedRoute();
  if(S.guest){if(h0==='#/result')return result();if(h0.startsWith('#/quiz/'))return quizRoute(h0.replace('#/',''));if(S.gTid){location.hash='#/t/'+S.gTid;return}signOut(auth);return}
  if(!S.user)return login();
  if(!S.approved&&!S.isAdmin)return pending();
  const h=location.hash.replace('#/','')||'';
  if(h.startsWith('course')){
    const parts=h.split('/');
    if(parts[1]==='stages'||parts[1]==='american'){pickTrack(parts[1]);return dash()}
    if(parts[1]&&COURSES[parts[1]]&&!allowedT(parts[1])){location.hash='#/course/'+S.track0;return}
    if(parts[1]&&COURSES[parts[1]]){if(CUR_TRACK!==parts[1]){CUR_TRACK=parts[1];cur=allItems()[0]?.id}LS.set('cur_track',CUR_TRACK);applyLang()}
    return course();
  }
  if(h.startsWith('quiz/'))return quizRoute(h);
  if(h==='result')return result();
  if(h==='folders')return folders();
  if(h==='search')return search();
  if(h==='profile')return profile();
  if(h==='results')return resultsPage();
  if(h.startsWith('rv/'))return reviewPage(h);
  if(h==='admin')return admin();
  dash();
}
addEventListener('hashchange',route);

/* ========= الدخول ========= */
const EMAIL_RE=/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/;
const okEmail=e=>EMAIL_RE.test(e)&&!e.includes('..')&&!/^\.|\.@/.test(e);
const ERR={'auth/invalid-credential':'البريد أو كلمة المرور غير صحيحة','auth/email-already-in-use':'هذا البريد مسجّل مسبقاً','auth/weak-password':'كلمة المرور ضعيفة (6 أحرف على الأقل)','auth/invalid-email':'البريد الإلكتروني غير صالح','auth/too-many-requests':'محاولات كثيرة، حاول لاحقاً','auth/network-request-failed':'تحقق من اتصال الإنترنت'};
function pending(){
  app.innerHTML=`<div class="card login"><span class="lg" role="img" aria-label="شعار"></span><h2>${S.rejected?'تعذّر قبول طلبك':'طلبك قيد المراجعة ⏳'}</h2><p class="mut">${S.rejected?'تم رفض طلب الانضمام. تواصل مع المدرّس.':'تم إنشاء حسابك بنجاح، وبانتظار موافقة المدرّس على دخولك إلى <b>'+esc(trName(S.track0))+'</b>. اضغط «تحديث» بعد الموافقة.'}</p><div class="row" style="justify-content:center;margin-top:14px"><button class="btn" id="rf">🔄 تحديث الحالة</button></div></div>`;
  $('#rf').onclick=async()=>{await loadAll();route()};
  clearInterval(S.pt);S.pt=setInterval(async()=>{await loadAll();if(S.approved){clearInterval(S.pt);route()}},10000);
}
async function pickTrack(k){
  if(!S.isAdmin&&S.track0&&topOf(S.track0)===k)k=S.track0;
  else if(k==='stages'||k==='american'){
    const am=k==='american',list=am?AGR:GRADES,pre=am?'am_':'st_';
    const g=await new Promise(res=>{const d=document.createElement('div');d.className='modal-bg';
      d.innerHTML=`<div class="modal-box"><h3>${am?'Select your grade':'اختر مرحلتك الدراسية'}</h3><div class="gpick">${list.map(([c,n])=>`<button class="tkbig" data-c="${c}"><b>${n}</b></button>`).join('')}</div><button class="btn g" id="gx" style="margin-top:14px">${am?'Cancel':'إلغاء'}</button></div>`;
      document.body.append(d);d.onclick=e=>{const b=e.target.closest('[data-c]');if(b||e.target===d||e.target.id==='gx'){d.remove();res(b?b.dataset.c:null)}}});
    if(!g)return;k=pre+g}
  location.hash='#/course/'+k;
}
function trBar(cur){
  if(!S.isAdmin&&S.track0)return'';
  const top=topOf(cur);
  let h=`<div class="trbar">${TR.map(([k,i,n])=>`<button class="track-pill ${top===k?'active':''}" data-k="${k==='stages'?(top===k?cur:'st_p3'):k==='american'?(top===k?cur:'am_g3'):k}">${i} ${n}</button>`).join('')}</div>`;
  const row=(L,pre)=>`<div class="trbar">${L.map(([c,n])=>`<button class="track-pill ${cur===pre+c?'active':''}" data-k="${pre+c}">${n}</button>`).join('')}</div>`;
  if(top==='stages')h+=row(GRADES,'st_');if(top==='american')h+=row(AGR,'am_');
  return h;
}
function trDrop(cur){
  if(!S.isAdmin&&S.track0)return'';
  const top=topOf(cur),it=(k,t)=>`<button type="button" class="dd-i ${cur===k?'active':''}" data-k="${k}">${t}</button>`;
  const grp=(key,ico,name,L,pre)=>`<div><button type="button" class="dd-i dd-gh ${top===key?'active open':''}" data-g="${key}"><span>${ico} ${name}</span><span class="dd-ar">▾</span></button><div class="dd-sub"${top===key?'':' hidden'}>${L.map(([c,n])=>it(pre+c,n)).join('')}</div></div>`;
  return `<div class="dd"><button type="button" class="inp dd-b"><span>${esc(trName(cur))}</span><span class="dd-ar">▾</span></button><div class="dd-m" hidden>${TR.map(([k,i,n])=>k==='stages'?grp(k,i,n,GRADES,'st_'):k==='american'?grp(k,i,n,AGR,'am_'):it(k,i+' '+n)).join('')}</div></div>`;
}
function bindDrop(el,fn){
  const m=el&&el.querySelector('.dd-m');if(!m)return;
  el.querySelector('.dd-b').onclick=e=>{e.stopPropagation();m.hidden=!m.hidden};
  el.querySelectorAll('[data-g]').forEach(g=>g.onclick=e=>{e.stopPropagation();const sb=g.nextElementSibling;sb.hidden=!sb.hidden;g.classList.toggle('open',!sb.hidden)});
  el.querySelectorAll('[data-k]').forEach(x=>x.onclick=()=>{m.hidden=true;fn(x.dataset.k)});
}
document.addEventListener('click',e=>document.querySelectorAll('.dd-m').forEach(m=>{if(!m.parentNode.contains(e.target))m.hidden=true}));
const bindBar=(el,fn)=>el&&el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>fn(b.dataset.k));
function login(){
  let reg=false;
  app.innerHTML=`<div class="card login"><span class="lg" role="img" aria-label="شعار منصة جوده"></span><h2>أهلاً بك في منصة جوده</h2><p class="mut">سجّل دخولك لمتابعة رحلتك نحو المئوية</p>
  <div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="t1">دخول</button><button class="btn g" id="t2">حساب جديد</button></div>
  <input id="nm" placeholder="الاسم" autocomplete="name" hidden><input id="em" type="email" placeholder="البريد الإلكتروني" dir="ltr" autocomplete="email">
  <input id="pw" type="password" placeholder="كلمة المرور" dir="ltr" autocomplete="current-password"><div id="rg" hidden><label class="mut sm">اختر الدورة التي تريد الدخول إليها</label><input type="hidden" id="rc"><div class="trbar" id="rcb">${TR.map(([k,i,n])=>`<button type="button" class="track-pill" data-v="${k}">${i} ${n}</button>`).join('')}</div><input type="hidden" id="rg2"><div class="trbar" id="rgb" style="display:none"></div></div><p class="er" id="er"></p>
  <button class="btn" id="go" style="width:100%">دخول</button><button class="lnk" id="fg">نسيت كلمة المرور؟</button><p class="ver"><a href="index.html" style="color:var(--ac)">← الصفحة الرئيسية</a> · الإصدار 10</p></div>`;
  const mode=r=>{reg=r;$('#nm').hidden=!r;$('#rg').hidden=!r;$('#t1').className='btn'+(r?' g':'');$('#t2').className='btn'+(r?'':' g');$('#go').textContent=r?'إنشاء الحساب':'دخول';$('#er').textContent=''};
  document.querySelectorAll('#rcb [data-v]').forEach(b=>b.onclick=()=>{const v=b.dataset.v;$('#rc').value=v;$('#rg2').value='';document.querySelectorAll('#rcb .track-pill').forEach(y=>y.classList.toggle('active',y===b));const g=v==='stages'?GRADES:v==='american'?AGR:null,bx=$('#rgb');bx.style.display=g?'flex':'none';bx.innerHTML=g?g.map(([c,n])=>`<button type="button" class="track-pill" data-c="${c}">${n}</button>`).join(''):'';bx.querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>{$('#rg2').value=x.dataset.c;bx.querySelectorAll('.track-pill').forEach(y=>y.classList.toggle('active',y===x))})});$('#t1').onclick=()=>mode(false);$('#t2').onclick=()=>mode(true);
  const go=async()=>{
    const em=$('#em').value.trim(),pw=$('#pw').value,nm=$('#nm').value.trim();
    if(!em||!pw)return $('#er').textContent='أدخل البريد وكلمة المرور';
    if(reg?!okEmail(em):!/^\S+@\S+$/.test(em))return $('#er').textContent='صيغة البريد الإلكتروني غير صحيحة (مثال: name@example.com)';
    if(reg&&!nm)return $('#er').textContent='أدخل الاسم';
    if(reg&&!$('#rc').value)return $('#er').textContent='اختر الدورة التي تريد الدخول إليها';
    if(reg&&['stages','american'].includes($('#rc').value)&&!$('#rg2').value)return $('#er').textContent='اختر الصف الدراسي';
    $('#go').disabled=true;
    try{
      if(reg){S.pending=nm;S.pendTrack=$('#rc').value==='stages'?'st_'+$('#rg2').value:$('#rc').value==='american'?'am_'+$('#rg2').value:$('#rc').value;const c=await createUserWithEmailAndPassword(auth,em,pw);await updateProfile(c.user,{displayName:nm})}
      else await signInWithEmailAndPassword(auth,em,pw);
    }catch(e){S.pending='';$('#er').textContent=ERR[e.code]||e.message;$('#go').disabled=false}
  };
  $('#go').onclick=go;$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  $('#fg').onclick=async()=>{const em=$('#em').value.trim();if(!em)return $('#er').textContent='اكتب بريدك أولاً';
    try{await sendPasswordResetEmail(auth,em);toast('أُرسل رابط استعادة كلمة المرور')}catch(e){$('#er').textContent=ERR[e.code]||e.message}};
}

/* ========= اللوحة ========= */
const statBox=r=>{const a=r.length?Math.round(r.reduce((s,x)=>s+x.p,0)/r.length):0,b=r.length?Math.max(...r.map(x=>x.p)):0;return{a,b}};
const resTable=(r,showName=true)=>`<div style="overflow-x:auto"><table><tr>${showName?'<th>الاختبار</th>':''}<th>النتيجة</th><th>التاريخ</th><th>المدة</th><th>صحيح / خطأ / فارغ / مؤجل</th><th>النوع</th></tr>${r.slice().reverse().slice(0,15).map(x=>{const bl=x.bl||0,wr=x.n-x.c-bl;return`<tr>${showName?`<td>${esc(x.t)}</td>`:''}<td><b style="color:var(--${x.p>=PASS[x.m==='train'?'train':'exam']?'ok':'bad'})">${x.p}%</b></td><td>${esc(x.d)}</td><td>${x.s!=null?fmtDur(x.s):'—'}</td><td><span class="rb ok">${x.c} ✓</span> <span class="rb bad">${wr} ✕</span> <span class="rb">${bl} —</span> <span class="rb gold">${x.fg||0} 🔖</span></td><td>${x.m==='train'?'تدريب':'محاكي'}</td></tr>`}).join('')}</table></div>`;

function dash(){
  const r=S.res,{a,b}=statBox(r);
  const cTitle=currentCourse().title;
  app.innerHTML=`<h2>مرحباً ${esc(S.name)}</h2><p class="mut">تابع من حيث توقفت</p>
  ${S.err?`<p class="er">${/permission/i.test(S.err)?'لم تُنشر قواعد Firestore بعد (أو لم تُضبط على حسابك). انسخ المعرّف أدناه وأرسله للمطوّر.':'تعذر تحميل البيانات: '+esc(S.err)}</p>`:''}
  
  
  <div class="tkgrid">${TR.filter(([k])=>S.isAdmin||!S.track0||(S.track0.startsWith('st_')?k==='stages':S.track0.startsWith('am_')?k==='american':k===S.track0)).map(([k,i,n])=>`<button class="tkbig ${curTop()===k?'active':''}" data-tk="${k}"><span>${i}</span><b>${n}</b>${k==='gat'?'<small>General Ability Test</small>':''}</button>`).join('')}</div>

  <div class="card cc"><div class="th"><span class="lg" style="width:58px;height:58px;border-radius:16px" role="img" aria-label="شعار منصة جوده"></span><span>${esc(cTitle)}</span></div><div><h3>${esc(cTitle)}</h3><p class="mut">تقدمك ${pct()}%</p><div class="bar"><i style="width:${pct()}%"></i></div></div>
  <a class="btn" href="#/course/${CUR_TRACK}">متابعة التعلّم ◀</a></div><br>
  <div class="grid g3"><div class="card stat"><b>${r.length}</b>محاولة</div><div class="card stat"><b>${a}%</b>المتوسط</div><div class="card stat"><b>${b}%</b>الأعلى</div></div><br>
  <div class="card"><div class="qh"><h3>سجل المحاولات</h3><div class="row" style="flex-wrap:wrap"><button class="btn g sm" id="shc">🔗 نسخ رابط النتائج</button><button class="btn wa sm" id="shw">📲 مشاركة عبر واتساب</button></div></div>${r.length?resTable(r):'<p class="mut">لا توجد محاولات بعد. ابدأ أول اختبار!</p>'}</div>
`;
  document.querySelectorAll('[data-tk]').forEach(b=>b.onclick=()=>pickTrack(b.dataset.tk));
  $('#shc').onclick=()=>shareReport('copy');$('#shw').onclick=()=>shareReport('wa');
}

/* ========= الدورة ========= */
function course(){
  const all=allItems();
  const it=all.find(x=>x.id===cur)||all[0]||{id:'intro',t:'الدرس'};
  const m=S.media[it.id]||{},fs=m.files||[],n=it.quiz?getQs(it.id).length:0,rs=S.res.filter(x=>x.tid===it.id),{a,b}=statBox(rs);
  app.innerHTML=`
  <div class="row" style="margin-bottom:16px;gap:12px"><div id="tkbar" style="flex:1;min-width:240px">${trDrop(CUR_TRACK)}</div><button class="track-pill" id="c_feat">⚡ المميزات</button></div>
  <div class="cl"><div>
   <div class="player" id="pl">${m.video?`<iframe src="https://www.youtube-nocookie.com/embed/${esc(m.video.id)}?rel=0" title="${esc(it.t)}" allow="accelerometer;encrypted-media;picture-in-picture;fullscreen" allowfullscreen loading="lazy"></iframe>`:'<div><span class="lg" style="width:78px;height:78px;border-radius:22px;margin:0 auto 12px;box-shadow:0 12px 36px var(--glow)" role="img" aria-label="شعار منصة جوده"></span><p class="mut">لم يُضف فيديو لهذا الدرس بعد</p></div>'}</div>
   <div class="card" style="margin-top:16px"><h3>${esc(it.t)}</h3>
    <div class="acts"><button class="btn ${S.done[it.id]?'g':'ok'}" id="dn">${S.done[it.id]?'إلغاء الإكمال':'تم إكمال الدرس ✓'}</button><span></span></div></div>
   ${it.quiz?`<div class="card" style="margin-top:16px"><div class="qh"><h3>الاختبار${n?` — ${n} سؤال`:''}</h3>${n?'<button class="btn g sm" id="prbtn">🖨 طباعة الاختبار</button>':''}</div>
     ${n?`<div class="grid g2f" style="margin-top:12px">
      <div class="card mode"><h4>⏱ اختبار محاكي</h4><p class="mut">عدد ${n} سؤال</p><div class="row" style="flex-wrap:wrap"><span class="chip2">الحد الأدنى ${PASS.exam}%</span><span class="chip2">دقيقة واحدة لكل سؤال</span></div><a class="btn" href="#/quiz/${it.id}/exam" style="margin-top:12px">ابدأ الآن ▶</a></div>
      <div class="card mode"><h4>📘 التدريب الإلكتروني</h4><p class="mut">عدد ${n} سؤال</p><div class="row" style="flex-wrap:wrap"><span class="chip2">الحد الأدنى ${PASS.train}%</span><span class="chip2">تحقق فوري من الحل</span><span class="chip2">شرح بعد كل سؤال</span></div><a class="btn ok" href="#/quiz/${it.id}/train" style="margin-top:12px">ابدأ الآن ▶</a></div></div>`:'<p class="mut">لم تُضف أسئلة لهذا الاختبار بعد</p>'}
     <div class="grid g4" style="margin-top:14px"><div class="card stat"><b>${rs.length}</b>محاولة</div><div class="card stat"><b>${b}%</b>الأعلى</div><div class="card stat"><b>${a}%</b>المتوسط</div><div class="card stat"><b style="font-size:1rem">${rs.length?esc(rs[rs.length-1].d):'—'}</b>آخر محاولة</div></div>
     ${rs.length?resTable(rs,false):''}</div>`:''}
   ${fs.length?`<div class="card" style="margin-top:16px"><h3>📎 ملفات الدرس</h3>${fs.map(f=>`<a class="fi" href="${esc(f.url)}" target="_blank" rel="noopener"><span>${esc(f.name)}</span><span class="dn">فتح ⬇</span></a>`).join('')}</div>`:''}</div>
   <aside class="card side"><h3>${esc(currentCourse().title)}</h3>
    <p class="mut" style="margin-top:8px">تقدمك ${pct()}%</p><div class="bar"><i style="width:${pct()}%"></i></div>
    <input id="sr" placeholder="ابحث باسماء الدروس" value="${esc(filter)}"><div id="ls"></div></aside></div>`;
  
  bindDrop($('#tkbar'),k=>{location.hash='#/course/'+k});
  $('#c_feat').onclick=showFeatures;
  if($('#prbtn'))$('#prbtn').onclick=()=>printDialog(it);
  
  $('#dn').onclick=()=>{S.done[it.id]=!S.done[it.id];saveUser({['done.'+it.id]:S.done[it.id]});course()};
  const list=()=>{$('#ls').innerHTML=currentCourse().groups.map(g=>{
    const its=g.items.filter(x=>x.t.includes(filter));if(!its.length)return'';
    return`<div class="grp"><h4>${esc(g.t)}<span class="mut">${g.items.filter(x=>S.done[x.id]).length}/${g.items.length}</span></h4>`+
    its.map(x=>`<button class="les ${x.id===it.id?'on':''}" data-id="${x.id}"><span>${esc(x.t)}</span><span>${S.done[x.id]?'<span class="dn">✓</span>':(x.quiz?'<small>'+getQs(x.id).length+' سؤال</small>':'')}</span></button>`).join('')+'</div>'}).join('');
    document.querySelectorAll('.les').forEach(b=>b.onclick=()=>{cur=b.dataset.id;course()})};
  list();$('#sr').oninput=e=>{filter=e.target.value;list()};
}

/* ========= نوافذ منبثقة ========= */
function modal({icon='ℹ️',html='',ok='حسناً',cancel=null,wide=false,onOpen=null,collect=null}){
  return new Promise(res=>{
    const bg=document.createElement('div');bg.className='modal-bg';
    bg.innerHTML=`<div class="modal-box${wide?' wide':''}" role="dialog" aria-modal="true">${icon?`<div class="mi">${icon}</div>`:''}<div class="mb">${html}</div><div class="row mbtn">${cancel?`<button class="btn g" data-r="0">${cancel}</button>`:''}<button class="btn" data-r="1">${ok}</button></div></div>`;
    const done=v=>{bg.remove();res(v)};
    bg.onclick=e=>{if(e.target===bg)done(false)};
    bg.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>done(b.dataset.r==='1'?(collect?collect(bg):true):false));
    bg.querySelectorAll('.mb a').forEach(a=>a.addEventListener('click',()=>done(true)));
    document.body.append(bg);
    if(onOpen)onOpen(bg);
    if(!bg.querySelector('input,textarea,select'))bg.querySelector('[data-r="1"]').focus();
  });
}

/* ========= أدوات مساعدة للبحث والتعديل ========= */
const nz=s=>String(s||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[\u064B-\u0652\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();
async function editQuestion(t,id,after){
  const q=(S.tests[t]||[]).find(x=>x.id===id);if(!q)return;
  const d=await modal({icon:'✎',ok:'حفظ التعديلات',cancel:'إلغاء',
    html:`<h3>تعديل السؤال</h3><div class="fm">
     <label>نص السؤال</label><textarea id="eq" rows="2">${esc(q.q)}</textarea>
     ${q.img?`<img class="qi2" data-q="${q.id}" alt="" style="max-height:170px"><label class="row" style="margin:6px 0"><input type="checkbox" id="ermimg"> إزالة الصورة الحالية</label>`:''}
     <label>${q.img?'استبدال الصورة (اختياري)':'إضافة صورة (اختياري)'}</label><input type="file" id="eimg" accept="image/*">
     ${[0,1,2,3].map(k=>`<label>الخيار ${L[k]}</label><input id="eo${k}" value="${esc(q.o[k]||'')}">`).join('')}
     <label>الإجابة الصحيحة</label><select id="ec">${L.map((l,k)=>`<option value="${k}"${k===q.a?' selected':''}>${l}</option>`).join('')}</select>
     <label>شرح الحل</label><input id="ee" value="${esc(q.e||'')}">
     <label>رابط فيديو الشرح (يوتيوب)</label><input id="ev" dir="ltr" value="${esc(q.v||'')}">
     <label>🏷 كلمات مفتاحية للبحث (افصل بينها بمسافة)</label><input id="ek" value="${esc(q.k||'')}"></div>`,
    onOpen:()=>fillImgs(),
    collect:bg=>{const g=s=>bg.querySelector(s);return{q:g('#eq').value.trim(),o:[0,1,2,3].map(k=>g('#eo'+k).value.trim()),a:+g('#ec').value,e:g('#ee').value.trim(),v:g('#ev').value.trim(),k:g('#ek').value.trim(),file:g('#eimg').files[0]||null,rm:!!(g('#ermimg')&&g('#ermimg').checked)}}});
  if(!d)return;
  if(d.v&&!/^https?:\/\//.test(d.v))return toast('رابط الشرح غير صالح');
  const hasImg=d.file?true:(d.rm?false:!!q.img);
  if(!d.q&&!hasImg)return toast('لا يمكن ترك السؤال بلا نص ولا صورة');
  try{
    if(d.file){await setDoc(doc(db,'qimg',q.id),{d:await compress(d.file)});delete IMG[q.id]}
    else if(d.rm&&q.img){await deleteDoc(doc(db,'qimg',q.id));delete IMG[q.id]}
    const nq={...q,q:d.q,o:d.o,a:d.a,e:d.e,v:d.v,k:d.k,img:hasImg},arr=S.tests[t].map(x=>x.id===q.id?nq:x);
    await setDoc(doc(db,'tests',t),{qs:arr},{merge:true});S.tests[t]=arr;toast('تم حفظ التعديلات ✓');after&&after();
  }catch(e){console.error(e);toast('تعذر حفظ التعديلات')}
}
async function quickKeywords(t,id,after){
  const q=(S.tests[t]||[]).find(x=>x.id===id);if(!q)return;
  const v=prompt('كلمات مفتاحية للبحث (افصل بينها بمسافة):',q.k||'');
  if(v===null)return;
  const arr=S.tests[t].map(x=>x.id===id?{...x,k:v.trim()}:x);
  try{await setDoc(doc(db,'tests',t),{qs:arr},{merge:true});S.tests[t]=arr;toast('تم حفظ الكلمات المفتاحية ✓');after&&after()}catch(e){console.error(e);toast('تعذر الحفظ')}
}

/* ========= القوانين والقواعد ========= */
function showFormulas(){
  const html=`<h3>📐 القوانين والقواعد</h3>
   <input class="inp" id="lsrch" placeholder="ابحث عن قانون… (مثل: مساحة، نسبة، سرعة، أولي)" style="width:100%">
   <div class="lt" id="ltabs"><button class="lt-b on" data-c="">الكل</button>${LAWS.map(c=>`<button class="lt-b" data-c="${c[0]}">${c[1]} ${c[0]}</button>`).join('')}</div>
   <div id="lbody">${LAWS.map(c=>`<section class="lsec" data-c="${c[0]}"><h4>${c[1]} ${c[0]}</h4><div class="lgrid">${c[2].map(it=>`<div class="fcard">${it[2]?`<div class="ffig">${svg(it[2])}</div>`:''}<b>${it[0]}</b><div class="feq">${it[1]}</div></div>`).join('')}</div></section>`).join('')}</div>
   <p class="mut" id="lnone" hidden style="text-align:center">لا توجد نتائج مطابقة</p>`;
  return modal({icon:'',html,ok:'إغلاق',wide:true,onOpen:bg=>{
    const inp=bg.querySelector('#lsrch'),tabs=[...bg.querySelectorAll('.lt-b')],secs=[...bg.querySelectorAll('.lsec')];
    secs.forEach(s=>s.querySelectorAll('.fcard').forEach(c=>c._t=nz(c.textContent)));
    let cat='';
    const run=()=>{
      const w=nz(inp.value).split(/\s+/).filter(Boolean);let any=false;
      secs.forEach(s=>{
        const okCat=!cat||s.dataset.c===cat;let vis=0;
        s.querySelectorAll('.fcard').forEach(c=>{const m=okCat&&w.every(x=>c._t.includes(x));c.hidden=!m;if(m)vis++});
        s.hidden=!vis;if(vis)any=true;
      });
      bg.querySelector('#lnone').hidden=any;
    };
    tabs.forEach(b=>b.onclick=()=>{cat=b.dataset.c;tabs.forEach(x=>x.classList.toggle('on',x===b));run()});
    inp.oninput=run;
  }});
}
const showTestInfo=()=>modal({html:`<h3>تعليمات الاختبار</h3><ul class="il"><li>عدد الأسئلة: <b>${Q.qs.length}</b> سؤالاً${isQuant()?' في قسم واحد (القسم الكمي)':''}.</li>
  ${Q.mode==='exam'?`<li>الوقت <b>دقيقة واحدة لكل سؤال</b>، وينتقل الاختبار تلقائياً إلى السؤال التالي عند انتهائها.</li><li>في الاختبار المحاكي لا يمكن الرجوع إلى سؤال سابق، ولا تظهر الإجابات إلا في النهاية.</li><li>الحد الأدنى للنجاح ${PASS.exam}%.</li>`:`<li>وضع التدريب بلا مؤقّت: تنقّل بحرية بين الأسئلة.</li><li>اضغط «التحقق من الحل» لتعرف الإجابة الصحيحة وتقرأ الشرح.</li><li>الحد الأدنى للنجاح ${PASS.train}%.</li>`}
  <li>استخدم <b>السبورة</b> (✏) للكتابة على السؤال، و<b>العلامة المرجعية</b> لتمييز ما تريد العودة إليه، و«إضافة إلى مجلد» لمراجعته لاحقاً.</li></ul>`});
const showSecInfo=()=>modal({html:`<h3>تعليمات القسم الكمي</h3><p>يقيس هذا القسم قدرتك على الاستدلال الرياضي وحل المسائل الأساسية في:</p><ul class="il"><li>الحساب: النسب والمتوسط والسرعة والكسور والأسس.</li><li>الهندسة: الزوايا والمساحات والمحيطات.</li><li>تحليل البيانات: الجداول والرسوم البيانية.</li><li>الجبر: المعادلات والمتتابعات.</li></ul><p>تجد في زر «القوانين» أهم ما تحتاجه أثناء الحل.</p>`});


const SEC_PER_Q=60;
const isQuant=()=>['computerized','foundation'].includes(qTrack());
const fmtDur=s=>`${Math.floor(s/60)} د ${s%60} ث`;
function quizRoute(h){
  const[,id,mode]=h.split('/');
  let it=allItems().find(x=>x.id===id);
  if(!it){
    for(const k of Object.keys(COURSES)){
      it=COURSES[k].groups.flatMap(g=>g.items).find(x=>x.id===id);
      if(it)break;
    }
  }
  if(!it)return location.hash='#/course';
  const ownT=Object.keys(COURSES).find(k=>COURSES[k].groups.some(g=>g.items.some(x=>x.id===id)));
  if(ownT&&!allowedT(ownT))return location.hash='#/';
  startQuiz(it,getQs(id),mode==='train'?'train':'exam');
}
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const rnd=n=>{try{const u=new Uint32Array(1);crypto.getRandomValues(u);return u[0]%n}catch(e){return Math.floor(Math.random()*n)}};
/* خيارات تعتمد على ترتيبها (جميع ما سبق / أ و ب ...) أو بلا نص (الخيارات داخل الصورة) لا تُخلط */
const POS_OPT=/ما\s*سبق|لا\s*شيء\s*مما|none of the above|all of the above|both\s*[a-d]|^\s*[أابجد]\s*(?:و|,|،)\s*[أابجد]\s*(?:معاً?)?\s*$/i;
function shufOpts(q){
  if(!SHUFFLE.options||!Array.isArray(q.o)||q.o.length<2||typeof q.a!=='number')return q;
  if(q.o.some(x=>!String(x??'').trim()||POS_OPT.test(String(x))))return q;
  const perm=shuf(q.o.map((_,i)=>i));
  return{...q,o:perm.map(i=>q.o[i]),a:perm.indexOf(q.a)};
}
function startQuiz(it,qs,mode){
  if(!qs.length)return toast('لا توجد أسئلة');
  qs=qs.map(shufOpts);if(SHUFFLE.questions)shuf(qs);
  const n=qs.length;
  Q={it,qs,mode,i:0,ans:Array(n).fill(null),flag:Array(n).fill(false),chk:Array(n).fill(false),left:SEC_PER_Q,fs:1,boards:{},fo:false,t0:Date.now()};
  clearInterval(timer);
  if(mode==='exam')timer=setInterval(tick,1000);
  qdraw();
}
function leaveFS(){document.body.classList.remove('fsq','pin');document.querySelectorAll('#qtab').forEach(x=>x.remove());removeEventListener('mousemove',fsMove);if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}
function fsMove(e){const sd=document.querySelector('.qside');if(!sd||document.body.classList.contains('pin'))return;const w=sd.offsetWidth;if(e.clientX>=innerWidth-14)sd.classList.add('show');else if(sd.classList.contains('show')&&e.clientX<innerWidth-w-10)sd.classList.remove('show')}
function toggleFS(){
  if(document.body.classList.contains('fsq'))return leaveFS();
  document.body.classList.add('fsq');
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{})}catch(e){}
  const b=document.createElement('button');b.id='qtab';b.title='تثبيت قائمة الأسئلة / إلغاء التثبيت';b.textContent='📌';
  b.onclick=()=>{Q.pin=!Q.pin;document.body.classList.toggle('pin',!!Q.pin)};
  document.body.append(b);addEventListener('mousemove',fsMove);
}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('fsq'))leaveFS()});
function closeLayers(){document.querySelectorAll('.wb,.modal-bg').forEach(x=>x.remove())}
function tick(){
  Q.left--;
  const t=$('#tmr'),w=$('#wtm'),b=$('#qtbar');
  if(t)t.textContent=fmt(Math.max(0,Q.left));
  if(w)w.textContent=fmt(Math.max(0,Q.left));
  if(b)b.style.width=Math.max(0,Q.left/SEC_PER_Q*100)+'%';
  if(Q.left<=0){closeLayers();if(Q.i<Q.qs.length-1){Q.i++;Q.left=SEC_PER_Q;qdraw()}else finish()}
}
async function goNext(){
  const idx=Q.i;
  if(Q.mode==='exam'&&Q.ans[idx]===null){
    const ok=await modal({icon:'❓',html:'لم تقم بحلّ هذا السؤال، هل تريد المتابعة؟',ok:'تأكيد',cancel:'إلغاء'});
    if(!ok||Q.i!==idx)return;
  }
  if(Q.i>=Q.qs.length-1)return askFinish();
  Q.i++;Q.left=SEC_PER_Q;qdraw();
}
async function askFinish(){
  const un=Q.ans.filter(a=>a===null).length;
  const ok=await modal({icon:'❓',html:un?`لديك <b>${un}</b> سؤال غير محلول. هل تريد إنهاء الاختبار؟`:'هل تريد إنهاء الاختبار وعرض النتيجة؟',ok:'تأكيد',cancel:'إلغاء'});
  if(ok)finish();
}
function qdraw(){
  const q=Q.qs[Q.i],n=Q.qs.length,tr=Q.mode==='train',last=Q.i>=n-1,B=Q.boards[Q.i];
  app.innerHTML=`<div class="qhead"><div class="row"><span class="lg sm" role="img" aria-label="شعار"></span><b>${esc(Q.it.t)}</b><span class="mut sm">${tr?'📘 تدريب إلكتروني':'⏱ اختبار محاكي'}</span></div>
  ${tr?'':`<span class="tm">⏱ <span id="tmr">${fmt(Q.left)}</span></span>`}</div>
  ${tr?'':`<div class="qtb"><i id="qtbar" style="width:${Q.left/SEC_PER_Q*100}%"></i></div>`}
  <div class="qinfo"><span>عدد الأسئلة الكلي <b>${n}</b></span><span>المحلولة <b id="ns">0</b></span><span>غير المحلولة <b id="nu">${n}</b></span></div>
  <div class="qgrid">
   <aside class="card qside"><div class="qu"><span class="lg" role="img" aria-label="شعار"></span><b>${esc(S.name)}</b><span class="mut sm">${esc(Q.it.t)}</span></div>
    <div class="qnum" id="qn"></div>
    <div class="qbtns"><button class="btn g sm" id="bi">تعليمات الاختبار</button>${isQuant()?'<button class="btn g sm" id="bs">تعليمات القسم</button>':''}${isQuant()?'<button class="btn g sm" id="bf">📐 القوانين</button>':''}<button class="btn danger sm" id="be">إنهاء الاختبار</button></div></aside>
   <section class="card qmain">
    <div class="qsec"><span class="chip2">مجموع الأسئلة في الاختبار ${n}</span>${isQuant()?'<span class="chip2">القسم الحالي: الكمي</span>':''}</div>
    <div class="qtl"><b>السؤال رقم ${Q.i+1}</b><div class="row"><button class="ib sm" id="fsb" aria-label="ملء الشاشة" title="ملء الشاشة">⛶</button><button class="ib sm" id="fp1" aria-label="تكبير">A+</button><button class="ib sm" id="fp0" aria-label="الحجم الافتراضي">A</button><button class="ib sm" id="fm1" aria-label="تصغير">A-</button><button class="ib pw${B&&B.objs.length?' has':''}" id="pn" aria-label="السبورة الذكية" title="السبورة الذكية">✏</button></div></div>
    <div class="qcard" id="qc"><div class="qz" style="zoom:${Q.fs}">${q.img?'<img id="qi" alt="صورة السؤال">':''}${q.q?`<p>${mt(q.q)}</p>`:''}</div></div>
    <div class="opts">${q.o.map((o,k)=>`<button class="opt" data-k="${k}"><i>${L[k]}</i><span class="ot">${mt(o)}</span></button>`).join('')}</div>
    ${tr?'<button class="btn ok" id="ck" style="margin-top:14px">التحقق من الحل</button><div class="ex" id="ex" hidden></div>':''}
    <div class="qbar2"><button class="btn g" id="fl"></button><button class="btn g" id="fb">📁 إضافة إلى مجلد</button><button class="ib" id="fa" aria-label="مجلد جديد">+</button><span class="grow"></span>
     ${tr?`<button class="btn g" id="pv" ${Q.i?'':'disabled'}>السؤال السابق</button>`:''}
     <button class="btn ${last?'ok':''}" id="nx">${last?'إنهاء الاختبار':'التالي ◀'}</button></div>
    <div class="fp" id="fp" hidden></div>
   </section></div>`;
  document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{if(tr&&Q.chk[Q.i])return;Q.ans[Q.i]=+b.dataset.k;marks()});
  if(tr){$('#ck').onclick=()=>{Q.chk[Q.i]=true;marks()};$('#pv').onclick=()=>{Q.i--;qdraw()}}
  $('#fl').onclick=()=>{Q.flag[Q.i]=!Q.flag[Q.i];marks()};
  $('#nx').onclick=()=>tr?(last?askFinish():(Q.i++,qdraw())):goNext();
  $('#be').onclick=askFinish;$('#bi').onclick=showTestInfo;if($('#bs'))$('#bs').onclick=showSecInfo;if($('#bf'))$('#bf').onclick=showFormulas;
  const zoom=d=>{Q.fs=d===0?1:Math.max(.7,Math.min(1.8,Q.fs+d));$('.qz').style.zoom=Q.fs};
  $('#fp1').onclick=()=>zoom(.15);$('#fp0').onclick=()=>zoom(0);$('#fm1').onclick=()=>zoom(-.15);
  $('#pn').onclick=openBoard;$('#fsb').onclick=toggleFS;
  $('#fb').onclick=()=>{Q.fo=!Q.fo;fpanel()};
  $('#fa').onclick=()=>{const v=(prompt('اسم المجلد الجديد')||'').trim();if(!v)return;if(S.folders[v])return toast('المجلد موجود');S.folders[v]=[];saveUser({folders:S.folders});Q.fo=true;fpanel()};
  marks();fpanel();
  for(let k=1;k<=3;k++){const x=Q.qs[Q.i+k];if(x&&x.img)qimg(x.id)}
  if(q.img)qimg(q.id).then(d=>{const im=$('#qi');if(im&&Q.qs[Q.i]===q)im.src=d});
}
function marks(){
  const q=Q.qs[Q.i],a=Q.ans[Q.i],tr=Q.mode==='train',ck=tr&&Q.chk[Q.i];
  document.querySelectorAll('.opt').forEach((b,j)=>{b.classList.toggle('sel',j===a&&!ck);b.classList.toggle('right',ck&&j===q.a);b.classList.toggle('wrong',ck&&j===a&&a!==q.a)});
  $('#fl').textContent=Q.flag[Q.i]?'🔖 إلغاء العلامة المرجعية':'🔖 ضع مؤشر كعلامة مرجعية';
  const ex=$('#ex');
  if(ex){ex.hidden=!ck;if(ck){
    const yid=q.v?ytId(q.v):'';
    ex.innerHTML=(a===null?'<b>لم تختر إجابة.</b>':a===q.a?'<b style="color:var(--ok)">إجابة صحيحة ✓</b>':'<b style="color:var(--bad)">إجابة خاطئة</b>')+`<p>الإجابة الصحيحة: ${L[q.a]}${q.o[q.a]?' — '+mt(q.o[q.a]):''}</p>`+(q.e?`<p class="mut">${mt(q.e)}</p>`:'')+
      (yid?`<div class="player" style="margin-top:10px"><iframe src="https://www.youtube-nocookie.com/embed/${yid}?rel=0" title="شرح الحل" allowfullscreen loading="lazy"></iframe></div>`:q.v?`<a class="btn g" href="${esc(q.v)}" target="_blank" rel="noopener">▶ شرح الحل</a>`:'')}}
  const solved=Q.ans.filter(x=>x!==null).length;
  $('#ns').textContent=solved;$('#nu').textContent=Q.qs.length-solved;
  $('#qn').innerHTML=Q.qs.map((_,k)=>`<button class="qnb${k===Q.i?' cur':''}${Q.ans[k]!==null?' done':''}${Q.flag[k]?' flag':''}" data-j="${k}"${tr?'':' tabindex="-1" aria-disabled="true"'}>${(k+1).toLocaleString(latin()?'en-US':'ar-EG')}</button>`).join('');
  if(tr)document.querySelectorAll('.qnb').forEach(b=>b.onclick=()=>{Q.i=+b.dataset.j;qdraw()});
}
function fpanel(){
  const p=$('#fp'),q=Q.qs[Q.i],ref=q.tid+':'+q.id,ks=Object.keys(S.folders);
  p.hidden=!Q.fo;if(!Q.fo)return;
  p.innerHTML=ks.length?ks.map((n,i)=>{const on=S.folders[n].includes(ref);return`<button class="fi ${on?'in':''}" data-f="${i}"><span>📁 ${esc(n)}</span><span>${on?'✓ مضاف':'إضافة'}</span></button>`}).join(''):
   '<div style="text-align:center;padding:14px"><div style="font-size:2rem">🗂️</div><b>لا توجد مجلدات بعد</b><p class="mut">اضغط + لإنشاء مجلد جديد</p></div>';
  p.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{const n=ks[+b.dataset.f],a=S.folders[n],x=a.indexOf(ref);x<0?a.push(ref):a.splice(x,1);saveUser({folders:S.folders});fpanel();toast(x<0?'أُضيف إلى «'+n+'»':'أُزيل من «'+n+'»')});
}

/* ========= السبورة الذكية ========= */
const WB_COL=['#ff8a3d','#e7a21b','#ff7b7b','#e5e7eb','#f472b6','#c084fc','#3b9cff','#22c55e'];
const WB_W={XL:12,L:7,M:4,S:2},WB_S={XL:48,L:34,M:24,S:16};
function textCard(q){
  const c=document.createElement('canvas');c.width=900;let x=c.getContext('2d');
  const F=n=>`700 ${n}px Readex Pro,Tahoma,sans-serif`,lines=[];
  x.font=F(34);
  const wrap=(t,max)=>{const out=[];let cur='';for(const w of t.split(/\s+/)){const nx=cur?cur+' '+w:w;if(x.measureText(nx).width>max&&cur){out.push(cur);cur=w}else cur=nx}if(cur)out.push(cur);return out};
  wrap(plain(q.q||''),820).forEach(l=>lines.push([l,34,'#0b5fa8']));
  q.o.forEach((o,k)=>{if(o)lines.push([L[k]+') '+plain(o),30,'#222'])});
  c.height=Math.max(160,lines.length*50+60);x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.direction='rtl';x.textAlign='right';
  lines.forEach((l,i)=>{x.font=F(l[1]);x.fillStyle=l[2];x.fillText(l[0],c.width-40,60+i*50)});
  return c;
}
function wbBox(o){
  if(o.t==='pen'){const xs=o.p.map(p=>p[0]),ys=o.p.map(p=>p[1]);return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]}
  if(o.t==='txt'){const w=o.txt.length*o.s*.6;return[o.x-w,o.y-o.s,o.x,o.y+4]}
  return[Math.min(o.x1,o.x2),Math.min(o.y1,o.y2),Math.max(o.x1,o.x2),Math.max(o.y1,o.y2)];
}
function wbHit(o,x,y,tol){
  const seg=(x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((x-x1)*dx+(y-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(x-(x1+t*dx),y-(y1+t*dy))};
  if(o.t==='pen'){if(o.p.length===1)return Math.hypot(x-o.p[0][0],y-o.p[0][1])<=tol+o.w;for(let i=1;i<o.p.length;i++)if(seg(o.p[i-1][0],o.p[i-1][1],o.p[i][0],o.p[i][1])<=tol+o.w/2)return true;return false}
  if(o.t==='line'||o.t==='arr')return seg(o.x1,o.y1,o.x2,o.y2)<=tol+o.w/2;
  const b=wbBox(o);return x>=b[0]-tol&&x<=b[2]+tol&&y>=b[1]-tol&&y<=b[3]+tol;
}
function wbMove(o,dx,dy){
  if(o.t==='pen')o.p=o.p.map(p=>[p[0]+dx,p[1]+dy]);
  else if(o.t==='txt'){o.x+=dx;o.y+=dy}
  else{o.x1+=dx;o.x2+=dx;o.y1+=dy;o.y2+=dy}
}
function wbDraw(ctx,o,sel){
  ctx.save();ctx.strokeStyle=o.c;ctx.fillStyle=o.c;ctx.lineWidth=o.w||3;ctx.lineCap='round';ctx.lineJoin='round';
  if(o.t==='pen'){ctx.beginPath();o.p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));if(o.p.length===1)ctx.lineTo(o.p[0][0]+.01,o.p[0][1]);ctx.stroke()}
  else if(o.t==='line'||o.t==='arr'){ctx.beginPath();ctx.moveTo(o.x1,o.y1);ctx.lineTo(o.x2,o.y2);ctx.stroke();
    if(o.t==='arr'){const a=Math.atan2(o.y2-o.y1,o.x2-o.x1),h=10+o.w*2;ctx.beginPath();ctx.moveTo(o.x2,o.y2);ctx.lineTo(o.x2-h*Math.cos(a-.45),o.y2-h*Math.sin(a-.45));ctx.moveTo(o.x2,o.y2);ctx.lineTo(o.x2-h*Math.cos(a+.45),o.y2-h*Math.sin(a+.45));ctx.stroke()}}
  else if(o.t==='rect')ctx.strokeRect(Math.min(o.x1,o.x2),Math.min(o.y1,o.y2),Math.abs(o.x2-o.x1),Math.abs(o.y2-o.y1));
  else if(o.t==='ell'){ctx.beginPath();ctx.ellipse((o.x1+o.x2)/2,(o.y1+o.y2)/2,Math.abs(o.x2-o.x1)/2,Math.abs(o.y2-o.y1)/2,0,0,Math.PI*2);ctx.stroke()}
  else if(o.t==='dia'){const cx=(o.x1+o.x2)/2,cy=(o.y1+o.y2)/2;ctx.beginPath();ctx.moveTo(cx,o.y1);ctx.lineTo(o.x2,cy);ctx.lineTo(cx,o.y2);ctx.lineTo(o.x1,cy);ctx.closePath();ctx.stroke()}
  else if(o.t==='txt'){ctx.font=`700 ${o.s}px Readex Pro,Tahoma,sans-serif`;ctx.textAlign='right';ctx.direction='rtl';ctx.fillText(o.txt,o.x,o.y)}
  if(sel){const b=wbBox(o);ctx.strokeStyle='#18a4f2';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(b[0]-6,b[1]-6,b[2]-b[0]+12,b[3]-b[1]+12)}
  ctx.restore();
}
function openBoard(){
  const q=Q.qs[Q.i],B=Q.boards[Q.i]=Q.boards[Q.i]||{objs:[],undo:[],redo:[],view:{x:0,y:0,z:1},init:false};
  const ov=document.createElement('div');ov.className='wb';
  ov.innerHTML=`<div class="wbh"><div class="row"><button class="ib" id="wx" aria-label="إغلاق">✕</button>${Q.mode==='exam'?`<span class="wbt">⏱ <b id="wtm">${fmt(Math.max(0,Q.left))}</b></span>`:''}<button class="btn g sm" id="wclr">🗑 مسح</button><button class="btn sm" id="wq">🖼 السؤال</button></div><div><b>السبورة</b> <span class="mut sm">ميزة إضافية من المنصة · غير متاحة في الاختبار الفعلي</span></div></div>
  <div class="wbs"><canvas id="wbc"></canvas>
   <div class="wbp"><div class="wbcols">${WB_COL.map(c=>`<button class="wbc" data-c="${c}" style="background:${c}" aria-label="لون"></button>`).join('')}</div><div class="row">${Object.keys(WB_W).map(k=>`<button class="wbz" data-w="${k}">${k}</button>`).join('')}</div></div>
   <div class="wbu"><button class="ib" id="wun" aria-label="تراجع">↶</button><button class="ib" id="wre" aria-label="إعادة">↷</button></div>
   <div class="wbzm"><button class="ib" id="zin" aria-label="تكبير">+</button><b id="zv">100%</b><button class="ib" id="zout" aria-label="تصغير">−</button></div>
   <div class="wbtools">${[['sel','↖','تحديد وتحريك'],['hand','✋','تحريك اللوحة'],['pen','✏','قلم'],['era','⌫','ممحاة'],['arr','➚','سهم'],['line','╱','خط'],['txt','T','نص'],['rect','▭','مستطيل'],['ell','◯','دائرة'],['dia','◇','معين']].map(t=>`<button class="ib wt" data-t="${t[0]}" title="${t[2]}" aria-label="${t[2]}">${t[1]}</button>`).join('')}</div></div>`;
  document.body.append(ov);
  const stage=ov.querySelector('.wbs'),cv=ov.querySelector('#wbc'),ctx=cv.getContext('2d'),v=B.view;
  let tool='pen',col=WB_COL[6],wk='M',showQ=true,bg=null,bw=760,bh=420,sel=-1,tmp=null,drag=null,dpr=1;
  const snap=()=>{B.undo.push(JSON.stringify(B.objs));if(B.undo.length>60)B.undo.shift();B.redo=[]};
  const draw=()=>{
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);
    ctx.setTransform(dpr*v.z,0,0,dpr*v.z,dpr*v.x,dpr*v.y);
    if(showQ&&bg)ctx.drawImage(bg,-bw/2,-bh/2,bw,bh);
    B.objs.forEach((o,i)=>wbDraw(ctx,o,i===sel));
    if(tmp)wbDraw(ctx,tmp,false);
    ov.querySelector('#zv').textContent=Math.round(v.z*100)+'%';
    ov.querySelector('#wun').disabled=!B.undo.length;ov.querySelector('#wre').disabled=!B.redo.length;
  };
  const fit=()=>{const r=stage.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);cv.width=r.width*dpr;cv.height=r.height*dpr;
    if(!B.init){v.x=r.width/2;v.y=r.height/2-30;v.z=Math.min(1,r.width/820);B.init=true}draw()};
  const ui=()=>{
    ov.querySelectorAll('.wt').forEach(b=>b.classList.toggle('on',b.dataset.t===tool));
    ov.querySelectorAll('.wbc').forEach(b=>b.classList.toggle('on',b.dataset.c===col));
    ov.querySelectorAll('.wbz').forEach(b=>b.classList.toggle('on',b.dataset.w===wk));
    cv.style.cursor=tool==='hand'?'grab':tool==='sel'?'default':'crosshair';
  };
  const setBg=()=>{const w=bg.width||bg.naturalWidth,h=bg.height||bg.naturalHeight;bw=760;bh=h*760/w};
  if(q.img){qimg(q.id).then(d=>{if(!d)return;const im=new Image();im.onload=()=>{bg=im;setBg();draw()};im.src=d})}else{bg=textCard(q);setBg()}
  const pos=e=>{const r=cv.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;return{sx,sy,x:(sx-v.x)/v.z,y:(sy-v.y)/v.z}};
  const hitIdx=(x,y)=>{for(let i=B.objs.length-1;i>=0;i--)if(wbHit(B.objs[i],x,y,8/v.z))return i;return -1};
  const zoomAt=(px,py,f)=>{const nz=Math.max(.2,Math.min(5,v.z*f));v.x=px-(px-v.x)*(nz/v.z);v.y=py-(py-v.y)*(nz/v.z);v.z=nz;draw()};
  cv.onpointerdown=e=>{
    cv.setPointerCapture(e.pointerId);const p=pos(e);drag={sx:p.sx,sy:p.sy,x:p.x,y:p.y,vx:v.x,vy:v.y};
    if(tool==='pen')tmp={t:'pen',c:col,w:WB_W[wk],p:[[p.x,p.y]]};
    else if(['line','arr','rect','ell','dia'].includes(tool))tmp={t:tool,c:col,w:WB_W[wk],x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    else if(tool==='txt'){drag=null;const t=prompt('اكتب النص:');if(t&&t.trim()){snap();B.objs.push({t:'txt',c:col,s:WB_S[wk],x:p.x,y:p.y,txt:t.trim()})}draw();return}
    else if(tool==='era'){snap();B.objs=B.objs.filter(o=>!wbHit(o,p.x,p.y,10/v.z))}
    else if(tool==='sel'){sel=hitIdx(p.x,p.y);if(sel>=0)snap()}
    draw();
  };
  cv.onpointermove=e=>{
    if(!drag)return;const p=pos(e);
    if(tool==='hand'){v.x=drag.vx+(p.sx-drag.sx);v.y=drag.vy+(p.sy-drag.sy)}
    else if(tool==='pen'&&tmp)tmp.p.push([p.x,p.y]);
    else if(tmp){tmp.x2=p.x;tmp.y2=p.y}
    else if(tool==='era')B.objs=B.objs.filter(o=>!wbHit(o,p.x,p.y,10/v.z));
    else if(tool==='sel'&&sel>=0){wbMove(B.objs[sel],p.x-drag.x,p.y-drag.y);drag.x=p.x;drag.y=p.y}
    draw();
  };
  cv.onpointerup=cv.onpointercancel=()=>{if(tmp){snap();B.objs.push(tmp);tmp=null}drag=null;draw()};
  cv.onwheel=e=>{e.preventDefault();const p=pos(e);zoomAt(p.sx,p.sy,e.deltaY<0?1.1:1/1.1)};
  ov.querySelectorAll('.wt').forEach(b=>b.onclick=()=>{tool=b.dataset.t;sel=-1;ui();draw()});
  ov.querySelectorAll('.wbc').forEach(b=>b.onclick=()=>{col=b.dataset.c;ui()});
  ov.querySelectorAll('.wbz').forEach(b=>b.onclick=()=>{wk=b.dataset.w;ui()});
  ov.querySelector('#wun').onclick=()=>{if(!B.undo.length)return;B.redo.push(JSON.stringify(B.objs));B.objs=JSON.parse(B.undo.pop());sel=-1;draw()};
  ov.querySelector('#wre').onclick=()=>{if(!B.redo.length)return;B.undo.push(JSON.stringify(B.objs));B.objs=JSON.parse(B.redo.pop());sel=-1;draw()};
  ov.querySelector('#wclr').onclick=()=>{if(B.objs.length&&confirm('مسح كل الكتابة على هذه السبورة؟')){snap();B.objs=[];sel=-1;draw()}};
  ov.querySelector('#wq').onclick=e=>{showQ=!showQ;e.currentTarget.classList.toggle('g',!showQ);draw()};
  ov.querySelector('#zin').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,1.2);
  ov.querySelector('#zout').onclick=()=>zoomAt(cv.clientWidth/2,cv.clientHeight/2,1/1.2);
  const kd=e=>{if(e.key==='Escape')close();else if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();ov.querySelector('#wun').click()}};
  const close=()=>{ov.remove();removeEventListener('keydown',kd);removeEventListener('resize',fit);const pn=$('#pn');if(pn)pn.classList.toggle('has',B.objs.length>0)};
  addEventListener('keydown',kd);addEventListener('resize',fit);
  ov.querySelector('#wx').onclick=close;
  ui();fit();
}


/* ========= طباعة الاختبار كاملاً ========= */
async function printDialog(it){
  if(!getQs(it.id).length)return toast('لا توجد أسئلة لهذا الاختبار');
  const d=await modal({icon:'🖨',ok:'طباعة',cancel:'إلغاء',
    html:`<h3>طباعة «${esc(it.t)}»</h3><div class="fm">
      <label class="row" style="margin:10px 0"><input type="radio" name="pa" value="0" checked> بدون نموذج الإجابة</label>
      <label class="row" style="margin:10px 0"><input type="radio" name="pa" value="1"> مع نموذج الإجابة في نهاية الورقة</label>
      <label class="row" style="margin:10px 0 18px 0;padding-inline-start:26px"><input type="checkbox" id="pe"> إضافة شرح الحلول في نموذج الإجابة</label>
      <label class="row" style="margin:10px 0"><input type="radio" name="pc" value="2" checked> عمودان (توفير للورق)</label>
      <label class="row" style="margin:10px 0"><input type="radio" name="pc" value="1"> عمود واحد (أوضح للرسومات)</label></div>
      <p class="mut sm">ستظهر نافذة الطباعة؛ اختر «حفظ بصيغة PDF» إن أردت ملفاً. يظهر شعار المنصة على كل صفحة.</p>`,
    collect:bg=>({ans:bg.querySelector('[name=pa]:checked').value==='1',exp:bg.querySelector('#pe').checked,cols:+bg.querySelector('[name=pc]:checked').value})});
  if(d)printTest(it,d);
}
async function printTest(it,o){
  const qs=getQs(it.id);toast('جارٍ تجهيز الورقة…');
  const imgs={};await Promise.all(qs.filter(q=>q.img).map(async q=>{imgs[q.id]=await qimg(q.id)}));
  const logo=getComputedStyle(document.documentElement).getPropertyValue('--logo').trim();
  const date=new Date().toLocaleDateString('ar-SA',{dateStyle:'long'}),N=n=>n.toLocaleString('ar-EG');
  const qh=qs.map((q,i)=>`<div class="pq"><div class="pn">${N(i+1)}</div><div class="pb">${q.q?`<p class="qt">${mt(q.q)}</p>`:''}${q.img&&imgs[q.id]?`<img src="${imgs[q.id]}" alt="">`:''}<div class="po">${q.o.map((x,k)=>`<span><b>${L[k]}</b>${x?' '+mt(x):''}</span>`).join('')}</div></div></div>`).join('');
  const key=o.ans?`<div class="pk"><h2>نموذج الإجابة</h2><div class="kg">${qs.map((q,i)=>`<span><b>${N(i+1)}</b> ${L[q.a]}</span>`).join('')}</div>${o.exp?`<div class="ke">${qs.map((q,i)=>q.e?`<p><b>${N(i+1)}.</b> الإجابة ${L[q.a]} — ${mt(q.e)}</p>`:'').join('')}</div>`:''}</div>`:'';
  const css=`@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{margin:0;font-family:'Readex Pro',Tahoma,Arial,sans-serif;direction:rtl;color:#111;font-size:12.5pt;line-height:1.7}
  table.pg{width:100%;border-collapse:collapse}thead{display:table-header-group}tfoot{display:table-footer-group}
  .hd{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:2px solid #0b3a63;padding-bottom:3mm;margin-bottom:4mm;color:#0b3a63;font-weight:700}
  .hd .b{display:flex;align-items:center;gap:10px;font-size:14pt}.lgp{width:12mm;height:12mm;border-radius:3mm;background:${logo} center/cover,#141831;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ft{border-top:1px solid #bbb;margin-top:4mm;padding-top:2mm;font-size:9.5pt;color:#555;display:flex;justify-content:space-between;align-items:center}.ft .lgp{width:6mm;height:6mm;border-radius:1.5mm}
  .wm{position:fixed;inset:0;display:grid;place-items:center;z-index:-1;pointer-events:none}.wm i{width:90mm;height:90mm;border-radius:20mm;background:${logo} center/cover;opacity:.05;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .info{display:flex;gap:8mm;margin-bottom:5mm;font-size:11.5pt}.info span{flex:1;border-bottom:1px dotted #555;padding-bottom:1mm}
  .qs{column-count:${o.cols};column-gap:10mm}.pq{display:flex;gap:3mm;break-inside:avoid;margin-bottom:6mm}.pn{flex:none;width:8mm;height:8mm;border-radius:50%;background:#0b3a63;color:#fff;display:grid;place-items:center;font-weight:700;font-size:10.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pb{flex:1;min-width:0}.qt{margin:0 0 2mm;font-weight:700}.pb img{max-width:100%;display:block;margin:1mm 0 2mm}.po{display:grid;grid-template-columns:1fr 1fr;gap:1mm 4mm}.po b{display:inline-block;min-width:6mm;color:#0b3a63}
  .pk{break-before:page}.pk h2{margin:0 0 4mm;color:#0b3a63}.kg{display:grid;grid-template-columns:repeat(6,1fr);gap:2mm}.kg span{border:1px solid #999;border-radius:2mm;padding:1mm 2mm;text-align:center}.kg b{color:#0b3a63;margin-inline-end:2mm}
  .ke{margin-top:6mm;font-size:11pt}.ke p{margin:0 0 2mm;break-inside:avoid}
  .fr{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 3px;font-size:.9em}.fr .fn{display:block;border-bottom:1px solid currentColor;padding:0 3px}.fr .fd{display:block}
  .rad{display:inline-flex;direction:ltr}.rp{border-top:1.5px solid currentColor}.rb2{border-top:1.5px solid currentColor;padding:0 2px;margin-top:2px}`;
  const header=`<div class="hd"><div class="b"><span class="lgp"></span>منصة جوده</div><div>${esc(it.t)}</div><div style="font-weight:400;font-size:10pt">${date}</div></div>`;
  const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(it.t)} — منصة جوده</title><link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;700&display=swap" rel="stylesheet"><style>${css}</style></head><body>
   <div class="wm"><i></i></div>
   <table class="pg"><thead><tr><td>${header}</td></tr></thead><tbody><tr><td>
    <div class="info"><span>اسم الطالب:</span><span>التاريخ:</span><span>الدرجة:</span></div>
    <div class="qs">${qh}</div>${key}
   </td></tr></tbody><tfoot><tr><td><div class="ft"><span class="lgp"></span><span>منصة جوده — مع أ/ مصطفى جوده</span><span>${esc(it.t)}</span></div></td></tr></tfoot></table></body></html>`;
  const fr=document.createElement('iframe');fr.setAttribute('aria-hidden','true');fr.style.cssText='position:fixed;right:-9999px;top:0;width:210mm;height:297mm;border:0';
  document.body.append(fr);const w=fr.contentWindow,dd=fr.contentDocument;dd.open();dd.write(html);dd.close();
  await Promise.all([...dd.images].map(im=>im.complete?1:new Promise(r=>{im.onload=im.onerror=r})));
  try{await Promise.race([dd.fonts.ready,new Promise(r=>setTimeout(r,1500))])}catch(e){}
  w.focus();w.print();setTimeout(()=>fr.remove(),120000);
}

/* ========= النتيجة ========= */
function finish(){
  clearInterval(timer);closeLayers();
  const n=Q.qs.length,c=Q.ans.filter((a,k)=>a===Q.qs[k].a).length,bl=Q.ans.filter(a=>a===null).length,fg=Q.flag.filter(Boolean).length,s=Math.round((Date.now()-Q.t0)/1000);
  Q.out={c,n,p:Math.round(c/n*100),bl,wr:n-c-bl,fg,s};
  const r={t:Q.it.t,tid:Q.it.id,m:Q.mode,c,n,p:Q.out.p,bl,fg,s,d:new Date().toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'}),uid:S.user.uid,name:S.guest?S.name+' (زائر)':S.name,sec:secOf(Q.it.id)};
  S.res.push(r);
  if(Q.it.id!=='folder'){
    if(Q.out.p>=PASS.train&&!S.done[Q.it.id]){S.done[Q.it.id]=true;saveUser({['done.'+Q.it.id]:true})}
  }
  /* نحفظ نسخة الأسئلة بترتيبها وخياراتها كما ظهرت للطالب + اختياره، ليراجع المدير الحل لاحقاً */
  const det=Q.qs.map((q,k)=>({id:q.id||'',q:q.q||'',o:(q.o||[]).map(String),a:q.a??null,s:Q.ans[k]??null,e:q.e||'',img:!!q.img}));
  const nf=(Q.it.id!=='folder'&&!S.isAdmin)?{type:'exam',uid:S.user.uid,name:S.guest?S.name+' (زائر)':S.name,test:Q.it.t,tid:Q.it.id,p:Q.out.p,m:Q.mode}:null;
  const saveRes=x=>addDoc(collection(db,'users',S.user.uid,'results'),{...x,ts:serverTimestamp()});
  saveRes({...r,det}).catch(e=>{console.warn('det rejected',e);return saveRes(r)})
    .then(ref=>{if(nf)notify({...nf,rid:ref.id})})
    .catch(e=>{console.error(e);toast('تعذر حفظ النتيجة');if(nf)notify(nf)});
  if(S.shareTok)syncReport();
  if(location.hash==='#/result')result();else location.hash='#/result';
}
function result(){
  if(!Q||!Q.out)return location.hash='#/';
  const o=Q.out,ok=o.p>=PASS[Q.mode];
  app.innerHTML=`<div class="card score"><h2>${esc(Q.it.t)}</h2><b>${o.p}%</b><p class="mut">${o.c} صحيحة من ${o.n}</p>
  <p style="color:var(--${ok?'ok':'bad'});font-weight:700">${ok?'✓ حققت الحد الأدنى للنجاح':'لم تصل للحد الأدنى ('+PASS[Q.mode]+'%) — أعد المحاولة'}</p>
  <div class="grid g4" style="margin:14px 0"><div class="card stat"><b style="color:var(--ok)">${o.c}</b>صحيح</div><div class="card stat"><b style="color:var(--bad)">${o.wr}</b>خطأ</div><div class="card stat"><b>${o.bl}</b>فارغ</div><div class="card stat"><b style="font-size:1.2rem">${fmtDur(o.s)}</b>المدة</div></div>
  <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" id="rt">أعد المحاولة</button><button class="btn g" id="rpr">🖨 طباعة النتيجة</button><button class="btn wa" id="rsw">📲 إرسال النتائج لولي الأمر</button>${S.guest?`<a class="btn g" href="#/t/${esc(encodeURIComponent(S.gTid||''))}">العودة</a>`:`<a class="btn g" href="#/course/${CUR_TRACK}">العودة للدورة</a>`}</div></div><br>
  <div class="card"><h3>مراجعة الإجابات</h3>${Q.qs.map((q,k)=>{const a=Q.ans[k],g=a===q.a;return`<div class="rv"><p><b>${k+1}.</b> ${mt(q.q)}</p>${q.img?`<img class="qi2" data-q="${q.id}" alt="">`:''}
   <p style="color:var(--${g?'ok':'bad'})">إجابتك: ${a===null?'لم تجب':L[a]+(q.o[a]?' — '+mt(q.o[a]):'')}</p>${g?'':`<p style="color:var(--ok)">الصحيح: ${L[q.a]}${q.o[q.a]?' — '+mt(q.o[q.a]):''}</p>`}${q.e?`<p class="mut">${mt(q.e)}</p>`:''}</div>`}).join('')}</div>`;
  $('#rt').onclick=()=>startQuiz(Q.it,Q.qs,Q.mode);$('#rpr').onclick=()=>window.print();$('#rsw').onclick=()=>shareReport('wa');fillImgs();
}

const showFeatures=()=>modal({icon:'⚡',html:`<h3>المميزات</h3><div class="fgrid2">
 <a class="feat2" href="#/search"><span>🔍</span><b>البحث عن الأسئلة</b><small>ابحث بالكلمات المفتاحية للوصول لأي سؤال</small></a>
 <a class="feat2" href="#/folders"><span>📁</span><b>مجلداتي</b><small>راجع الأسئلة المحفوظة وابدأ اختباراً منها</small></a>
 <a class="feat2" href="${TG}" target="_blank" rel="noopener"><span>✈</span><b>قناة تيليجرام</b><small>تواصل مع المدرّس والطلاب</small></a>
 <a class="feat2" href="#/profile"><span>🎨</span><b>ألوان المنصة وإعادة التقدم</b><small>خصّص المظهر أو ابدأ الدورة من جديد</small></a>
 <div class="feat2 soon"><span>📈</span><b>اختبار تحديد المستوى</b><small>قريباً</small></div></div>`,ok:'إغلاق'});

/* ========= المجلدات ========= */
function qHtml(q,showAns){
  return`${q.img?`<img class="qi2" data-q="${q.id}" alt="">`:''}${q.q?`<p>${mt(q.q)}</p>`:''}<div class="row" style="flex-wrap:wrap">${q.o.map((o,k)=>`<span class="chip2 ${showAns&&k===q.a?'ok':''}">${L[k]} ${mt(o)}</span>`).join('')}</div>${showAns?`<p class="mut" style="margin-top:6px">الإجابة: ${L[q.a]}${q.e?' — '+mt(q.e):''}</p>`:''}`;
}
function folders(){
  const F=S.folders,ks=Object.keys(F);if(!ks.includes(fsel)){fsel=ks[0]||'';fpage=0}
  const refs=(F[fsel]||[]).map(r=>({r,q:findQ(r)})).filter(x=>x.q),per=10,pages=Math.max(1,Math.ceil(refs.length/per));
  fpage=Math.min(fpage,pages-1);
  const total=ks.reduce((a,k)=>a+F[k].length,0),view=refs.slice(fpage*per,fpage*per+per);
  app.innerHTML=`<h2>📁 إدارة المجلدات</h2><p class="mut">اختر المجلد لعرض الأسئلة المحفوظة، وراجعها أو ابدأ اختباراً منها.</p><br>
  ${ks.length?`<div class="card"><div class="row" style="flex-wrap:wrap"><select class="inp" id="fs">${ks.map(k=>`<option ${k===fsel?'selected':''}>${esc(k)}</option>`).join('')}</select>
   <button class="btn" id="fq" ${refs.length?'':'disabled'}>ابدأ الاختبار ▶</button><button class="btn g" id="fd">حذف المجلد</button></div></div><br>
  <div class="grid g4"><div class="card stat"><b>${total}</b>إجمالي الأسئلة</div><div class="card stat"><b>${ks.length}</b>المجلدات</div><div class="card stat"><b>${fpage+1}</b>الصفحة الحالية</div><div class="card stat"><b>${pages}</b>إجمالي الصفحات</div></div><br>
  <div class="card"><div class="qh"><h3>الأسئلة المعروضة (${refs.length})</h3><label class="row"><input type="checkbox" id="sa" ${fshow?'checked':''}> إظهار الإجابات</label></div>
  ${view.map(x=>`<div class="rv"><div class="qh"><span class="mut">${esc(tname(x.q.tid))}</span><button class="ib" data-rm="${esc(x.r)}" aria-label="إزالة">✕</button></div>${qHtml(x.q,fshow)}</div>`).join('')||'<p class="mut">المجلد فارغ</p>'}
  <div class="row" style="justify-content:center;margin-top:14px"><button class="btn g" id="pp" ${fpage?'':'disabled'}>السابق</button><button class="btn g" id="np" ${fpage<pages-1?'':'disabled'}>التالي</button></div></div>`:
  '<div class="card score"><p class="mut">لا توجد مجلدات بعد. أضف سؤالاً لمجلد أثناء الاختبار.</p></div>'}`;
  if(!ks.length)return;
  $('#fs').onchange=e=>{fsel=e.target.value;fpage=0;folders()};
  $('#sa').onchange=e=>{fshow=e.target.checked;folders()};
  $('#pp').onclick=()=>{fpage--;folders()};$('#np').onclick=()=>{fpage++;folders()};
  $('#fd').onclick=()=>{if(confirm('حذف المجلد؟')){delete S.folders[fsel];saveUser({folders:S.folders});folders()}};
  $('#fq').onclick=()=>startQuiz({id:'folder',t:'مجلد: '+fsel},refs.map(x=>x.q),'train');
  document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{S.folders[fsel]=S.folders[fsel].filter(x=>x!==b.dataset.rm);saveUser({folders:S.folders});folders()});
  fillImgs();
}

/* ========= البحث عن الأسئلة ========= */
function search(){
  app.innerHTML=`<h2>🔍 البحث عن الأسئلة</h2><p class="mut">ابحث بكلمة من نص السؤال أو خياراته أو الكلمات المفتاحية.</p><br>
  <input class="inp" id="sq" placeholder="اكتب كلمة مفتاحية..." style="width:100%"><div id="sres" style="margin-top:16px"></div>`;
  const run=()=>{const t=$('#sq').value.trim();
    if(t.length<2){$('#sres').innerHTML='<p class="mut">اكتب حرفين على الأقل</p>';return}
    const ws=nz(t).split(/\s+/).filter(Boolean),rs=allQs().filter(q=>{const hs=nz([q.q,q.k,q.e,...q.o].join(' '));return ws.every(w=>hs.includes(w))}).slice(0,30);
    $('#sres').innerHTML=rs.length?rs.map(q=>`<div class="card" style="margin-bottom:12px"><span class="mut">${esc(tname(q.tid))}</span>${qHtml(q,false)}<details style="margin-top:8px"><summary>إظهار الإجابة</summary><p><b>${L[q.a]}</b>${q.o[q.a]?' — '+mt(q.o[q.a]):''}</p>${q.e?`<p class="mut">${mt(q.e)}</p>`:''}</details></div>`).join(''):'<p class="mut">لا توجد نتائج</p>';
    fillImgs()};
  $('#sq').oninput=run;run();
}

/* ========= ملفي ========= */
function profile(){
  app.innerHTML=`<h2>👤 ملفي</h2><br><div class="grid g2f"><div class="card fm"><h3>${esc(S.name)}</h3><p class="mut" dir="ltr">${esc(S.user.email)}</p>
   <label>معرّف تيليجرام (Telegram ID)</label><input id="tg" value="${esc(S.tg)}" dir="ltr" inputmode="numeric"><br><br>
   <div class="row"><button class="btn" id="sv">حفظ</button><a class="btn g" href="${TG}" target="_blank" rel="noopener">✈ قناة تيليجرام</a></div></div>
  <div class="card"><h3>ألوان المنصة</h3><div class="row" style="margin:12px 0">${ACC.map(c=>`<button class="sw ${c===S.accent?'on':''}" data-c="${c}" style="background:${c}" aria-label="لون ${c}"></button>`).join('')}</div>
   <h3 style="margin-top:20px">إعادة تعيين التقدم</h3><p class="mut">يمسح علامات إكمال الدروس ويبدأ الدورة من جديد، ولا يؤثر على نتائج اختباراتك.</p><br><button class="btn g" id="rs">إعادة التعيين</button></div></div>`;
  $('#sv').onclick=()=>{S.tg=$('#tg').value.trim();saveUser({tg:S.tg});toast('تم الحفظ ✓')};
  document.querySelectorAll('.sw').forEach(b=>b.onclick=()=>{S.accent=b.dataset.c;applyAccent(S.accent);saveUser({accent:S.accent});profile()});
  $('#rs').onclick=()=>{if(confirm('مسح علامات إكمال كل الدروس؟')){S.done={};saveUser({done:{}});toast('تمت إعادة التعيين')}};
}

/* ========= أدوات إدارة الاختبارات: استيراد دفعي ومسح وحذف ========= */

/* ===== استيراد أسئلة من ملف HTML ===== */
const LETIDX={'أ':0,'ا':0,'إ':0,'آ':0,'ب':1,'ج':2,'د':3,'a':0,'b':1,'c':2,'d':3,'A':0,'B':1,'C':2,'D':3,'1':0,'2':1,'3':2,'4':3,'١':0,'٢':1,'٣':2,'٤':3};
const ANSRE=/(?:الإجابة|الاجابة|الجواب|الحل\s*الصحيح|Correct\s*answer|Answer)[^:：\n]{0,15}[:：\-]?\s*[\(\[]?\s*([أابجدABCDabcd1-4١-٤])(?![\u0621-\u064Aa-zA-Z])/i;
const EXPRE=/^\s*(?:الشرح|التوضيح|التفسير|الحل|Explanation|Solution)\s*[:：\-]?\s*/i;
const stripNum=t=>t.replace(/^\s*(?:سؤال\s*)?[\(\[]?[0-9٠-٩]+[\)\]]?\s*[\.\-:،\)]\s*/,'').trim();
const stripOpt=t=>t.replace(/^\s*(?:[\(\[]?[أابجدهـABCDabcd][\)\]\.\-:]|[\(\[]?[1-4١-٤][\)\]])\s*/,'').trim();
function qText(el){
  const c=el.cloneNode(true);
  c.querySelectorAll('sup').forEach(n=>n.replaceWith('^{'+n.textContent+'}'));
  c.querySelectorAll('sub').forEach(n=>n.replaceWith('_{'+n.textContent+'}'));
  c.querySelectorAll('br').forEach(n=>n.replaceWith(' '));
  return c.textContent.replace(/\s+/g,' ').trim();
}
const clean=v=>{v=String(v??'');return /<[a-z][\s\S]*>/i.test(v)?qText(new DOMParser().parseFromString(v,'text/html').body):v.trim()};
function arraysInScripts(html){
  const out=[],re=/\[\s*\{/g;let m;
  while((m=re.exec(html))){
    let i=m.index,d=0,j=i,q=null;
    for(;j<html.length;j++){const ch=html[j];
      if(q){if(ch==='\\'){j++;continue}if(ch===q)q=null;continue}
      if(ch==='"'||ch==="'"||ch==='`'){q=ch;continue}
      if(ch==='[')d++;else if(ch===']'){d--;if(!d)break}}
    if(d){continue}
    const raw=html.slice(i,j+1);let arr=null;
    try{arr=JSON.parse(raw)}catch(e){try{arr=JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g,'$1"$2":').replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g,(x,y)=>JSON.stringify(y.replace(/\\'/g,"'"))).replace(/`([^`]*)`/g,(x,y)=>JSON.stringify(y)).replace(/,\s*([}\]])/g,'$1'))}catch(e2){}}
    if(Array.isArray(arr)&&arr.length)out.push(arr);
    re.lastIndex=j;
  }
  return out;
}
function normItem(x){
  if(!x||typeof x!=='object')return null;
  const q=x.q??x.question??x.text??x.title??x.prompt;let o=x.o??x.options??x.choices??x.answers??x.opts;
  if(o&&!Array.isArray(o)&&typeof o==='object')o=Object.values(o);
  if(!q||!Array.isArray(o))return null;
  o=o.map(v=>clean(v&&typeof v==='object'?(v.text??v.label??v.value??''):v));
  return{q:clean(q),o,a:x.a??x.answer??x.correct??x.correctAnswer??x.correctIndex??x.right,e:clean(x.e??x.explanation??x.exp??x.solution??'')};
}
const CORRECT=/(^|[\s_-])(correct|right|true|ok|صح|صحيح|صحيحة)([\s_-]|$)/i,WRONG=/incorrect|wrong|false|خطأ/i;
function domQuestions(doc){
  const SEL='li,label,[class*="option" i],[class*="choice" i],[class*="opt" i],[class*="خيار"]';
  let c=[...doc.body.querySelectorAll(SEL)];
  c=c.filter(e=>c.filter(o=>o!==e&&e.contains(o)).length<2);
  c=c.filter(e=>!c.some(o=>o!==e&&o.contains(e)));
  const groups=new Map();c.forEach(e=>{const p=e.parentElement;if(!groups.has(p))groups.set(p,[]);groups.get(p).push(e)});
  const G=[...groups.entries()].filter(([p,a])=>a.length>=2&&a.length<=6),keys=G.map(g=>g[0]),out=[];
  for(const[p,opts]of G){
    let box=p;while(box.parentElement&&box.parentElement!==doc.body&&!keys.some(k=>k!==p&&box.parentElement.contains(k)))box=box.parentElement;
    if(box===p)continue;
    const a0=[...opts].findIndex(el=>{const cl=(el.className||'')+' '+[...el.querySelectorAll('*')].map(n=>n.className||'').join(' ');return(CORRECT.test(el.className||'')&&!WRONG.test(el.className||''))||el.matches('[data-correct="true"],[data-correct="1"],[data-answer="true"]')||!!el.querySelector('input:checked,input[checked],[data-correct="true"]')||(/(^|[\s_-])(correct|right)([\s_-]|$)/i.test(cl)&&!WRONG.test(cl))});
    let a=a0>=0?'أبجد'[a0]:(box.getAttribute('data-answer')??box.getAttribute('data-correct')??box.getAttribute('data-ans'));
    const bt=box.textContent;if((a===null||a===undefined)&&ANSRE.test(bt))a=bt.match(ANSRE)[1];
    opts.forEach(o=>o.setAttribute('data-qo','1'));const cl=box.cloneNode(true);opts.forEach(o=>o.removeAttribute('data-qo'));
    cl.querySelectorAll('[data-qo]').forEach(n=>n.remove());
    let e='';cl.querySelectorAll('[class*="explan" i],[class*="solution" i],[class*="شرح"],[class*="تفسير"]').forEach(n=>{if(!e)e=qText(n).replace(EXPRE,'');n.remove()});
    cl.querySelectorAll('[class*="answer" i],[class*="hint" i],[class*="اجابة"],[class*="إجابة"],script,style').forEach(n=>n.remove());
    [...cl.querySelectorAll('*')].forEach(n=>{if(/^\s*(الإجابة|الاجابة|الجواب|الشرح|التوضيح|Answer|Explanation)/i.test(n.textContent)&&n.parentNode)n.remove()});
    const q=stripNum(qText(cl));
    out.push({q,o:opts.map(el=>{const c=el.cloneNode(true),f=c.firstElementChild;if(f&&/^[\(\[]?[أابجدABCDabcd1-4١-٤][\)\]\.\-:]?$/.test(f.textContent.trim()))f.remove();return stripOpt(qText(c))}),a,e});
  }
  return out;
}
function textQuestions(doc){
  doc.querySelectorAll('script,style').forEach(n=>n.remove());
  doc.querySelectorAll('sup').forEach(n=>n.replaceWith('^{'+n.textContent+'}'));doc.querySelectorAll('sub').forEach(n=>n.replaceWith('_{'+n.textContent+'}'));
  doc.querySelectorAll('br,p,div,li,label,tr,h1,h2,h3,h4,h5,h6,td,th,section,article').forEach(n=>n.insertAdjacentText('beforebegin','\n'));
  const lines=doc.body.textContent.split(/\n+/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];let cur=null;
  for(const l of lines){
    const am=l.match(ANSRE),em=l.match(EXPRE),om=l.match(/^[\(\[]?([أابجدABCDabcd])[\)\]\.\-:]\s*(.+)$/),qm=l.match(/^(?:سؤال\s*)?[\(\[]?[0-9٠-٩]+[\)\]]?\s*[\.\-:،\)]\s*(.+)$/);
    if(am&&cur&&!om){cur.a=am[1];continue}
    if(em&&cur){cur.e=l.replace(EXPRE,'');continue}
    if(om&&cur&&cur.o.length<6&&(LETIDX[om[1]]===cur.o.length||cur.o.length===0)){cur.o.push(om[2]);continue}
    if(qm&&(!cur||cur.o.length>=2)){cur={q:qm[1],o:[],a:null,e:''};out.push(cur);continue}
    if(cur){if(cur.o.length)cur.o[cur.o.length-1]+=' '+l;else cur.q+=' '+l}
  }
  return out;
}
function parseQHtml(html){
  const cands=[];
  arraysInScripts(html).forEach(a=>{const r=a.map(normItem).filter(Boolean);if(r.length)cands.push(r)});
  const doc=new DOMParser().parseFromString(html,'text/html');
  try{cands.push(domQuestions(doc.cloneNode(true)))}catch(e){console.warn(e)}
  try{cands.push(textQuestions(new DOMParser().parseFromString(html,'text/html')))}catch(e){console.warn(e)}
  const good=r=>r.filter(x=>x.q&&x.o.length===4).length;
  cands.sort((a,b)=>good(b)-good(a));
  let r=(cands[0]||[]).filter(x=>x.q&&x.o.length===4);
  if(!r.length)throw new Error('لم أتعرف على الأسئلة في ملف HTML (يلزم لكل سؤال 4 اختيارات). أرسل لي نموذجاً من الملف لأضبط القارئ عليه');
  r=r.map(x=>({...x,q:stripNum(x.q),o:x.o.map(stripOpt)}));
  const nums=r.map(x=>typeof x.a==='number'?x.a:null).filter(v=>v!==null);
  const oneBased=nums.length>0&&!nums.includes(0)&&Math.max(...nums)===4;
  const miss=[];
  r.forEach((x,i)=>{
    let a=x.a;
    if(typeof a==='number')a=oneBased?a-1:a;
    else if(typeof a==='string'&&a.trim()!==''){const t=a.trim();if(t.length<=3&&LETIDX[t[0]]!==undefined&&!/^\d{2,}$/.test(t))a=LETIDX[t[0]];else{const k=x.o.findIndex(o=>o===stripOpt(t)||o===t);a=k>=0?k:null}}
    else a=null;
    if(![0,1,2,3].includes(a)){miss.push(i+1);a=null}
    x.a=a;
  });
  if(miss.length)throw new Error('لم أجد الإجابة الصحيحة في '+miss.length+' سؤالاً (مثل: '+miss.slice(0,6).join('، ')+') — تأكد أن الملف يحدد الإجابة (class=correct أو «الإجابة: ب»)');
  return r;
}
const parseQFile=async f=>{const t=await f.text();return /\.html?$/i.test(f.name)?parseQHtml(t):JSON.parse(t)};
async function importQuestionsBatch(tid,arr,meta){
  const add=[],imgs=[];
  arr.forEach((x,i)=>{
    if(!x||!x.q||!Array.isArray(x.o)||x.o.length!==4||![0,1,2,3].includes(x.a))throw new Error('السؤال '+(i+1)+' غير مكتمل');
    const id='q'+uid()+i;let img=false;
    if(x.fig){
      const sv=String(x.fig);
      if(!/^\s*<svg[\s>]/.test(sv)||/<script|\son\w+\s*=/i.test(sv))throw new Error('الرسم في السؤال '+(i+1)+' غير صالح');
      imgs.push([id,'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(sv)))]);img=true;
    }
    add.push({id,q:String(x.q),o:x.o.map(String),a:x.a,e:String(x.e||''),v:/^https?:\/\//.test(x.v||'')?String(x.v):'',k:String(x.k||''),img});
  });
  const all=[...(S.tests[tid]||[]),...add],b=writeBatch(db);
  imgs.forEach(([id,d])=>b.set(doc(db,'qimg',id),{d}));
  b.set(doc(db,'tests',tid),meta?{qs:all,meta}:{qs:all},{merge:true});
  await b.commit();
  S.tests[tid]=all;
  return add.length;
}
async function deleteTestImages(tid){
  const ids=(S.tests[tid]||[]).filter(q=>q.img).map(q=>q.id);
  for(let i=0;i<ids.length;i+=400){const b=writeBatch(db);ids.slice(i,i+400).forEach(id=>b.delete(doc(db,'qimg',id)));await b.commit()}
  ids.forEach(id=>delete IMG[id]);
}
async function wipeTestQuestions(tid){
  await deleteTestImages(tid);
  await setDoc(doc(db,'tests',tid),{qs:[]},{merge:true});
  S.tests[tid]=[];
}
async function deleteTests(ids){
  for(const tid of ids){await deleteTestImages(tid);await deleteDoc(doc(db,'tests',tid));delete S.tests[tid]}
  Object.keys(COURSES).forEach(k=>COURSES[k].groups.forEach(g=>{g.items=g.items.filter(x=>!ids.includes(x.id))}));
  await saveStructure();
}

/* ========= الإدارة (للمدير فقط) ========= */
function admin(){
  if(!S.isAdmin){app.innerHTML=`<div class="card"><h3>⚙ صفحة الإدارة</h3><p class="mut">هذا الحساب ليس حساب المدير.</p><p dir="ltr" class="mut">UID: ${S.user.uid}</p><p class="mut">ضع هذا المعرّف في <b>ADMIN_UID</b> داخل الملف وفي قواعد Firestore.</p></div>`;return}
  
  let pastedFile=null;
  let adminTrack=COURSES[LS.get('adm_track')]?LS.get('adm_track'):(COURSES[CUR_TRACK]?CUR_TRACK:'computerized');
  const TABS=[['map','🗺','خريطة الدورة'],['tests','🧪','الاختبارات'],['add','➕','إضافة سؤال'],['media','🎥','فيديو وملفات'],['import','📥','استيراد وصور'],['qs','📝','أسئلة الاختبار'],['students','👥','الطلاب'],['results','📊','النتائج']];
  let adminTab=TABS.some(t=>t[0]===LS.get('adm_tab'))?LS.get('adm_tab'):'map',focusId=null;
  const applyTab=()=>{
    document.querySelectorAll('[data-pn]').forEach(p=>p.hidden=p.dataset.pn!==adminTab);
    document.querySelectorAll('#ahtabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===adminTab));
    LS.set('adm_tab',adminTab);
  };
  /* انتقال سريع: افتح تبويباً واختر الاختبار/الدرس فيه مباشرة */
  const go=(tab,id,sels)=>{
    adminTab=tab;applyTab();
    (sels||[]).forEach(q=>{const el=document.querySelector(q);if(el&&[...el.options].some(o=>o.value===id)){el.value=id;el.dispatchEvent(new Event('change'))}});
    const t=document.getElementById('ahtabs');if(t)window.scrollTo({top:t.getBoundingClientRect().top+scrollY-84,behavior:'smooth'});
  };
  
  const getAdminQuizzes=()=>(COURSES[adminTrack]||COURSES.computerized).groups.flatMap(g=>g.items).filter(x=>x.quiz);
  const getAdminLessons=()=>(COURSES[adminTrack]||COURSES.computerized).groups.flatMap(g=>g.items);

  const renderAdminUI=()=>{
    const topt=getAdminQuizzes().map(x=>`<option value="${x.id}">${x.t}</option>`).join('');
    const lopt=getAdminLessons().map(x=>`<option value="${x.id}">${x.t}</option>`).join('');
    const qc=k=>COURSES[k].groups.reduce((a,g)=>a+g.items.filter(x=>x.quiz).length,0);
    const tops=TR.map(([k,i,n])=>`<button type="button" class="track-pill ${topOf(adminTrack)===k?'active':''}" data-top="${k}">${i} ${n}</button>`).join('');
    const subList=topOf(adminTrack)==='stages'?GRADES.map(([c,n])=>['st_'+c,n]):topOf(adminTrack)==='american'?[['american','General'],...AGR.map(([c,n])=>['am_'+c,n])]:null;
    const subs=subList?subList.filter(([k])=>COURSES[k]).map(([k,n])=>`<button type="button" class="track-pill ${k===adminTrack?'active':''}" data-trk="${k}">${esc(n)} <small>${qc(k)}</small></button>`).join(''):'';
    const allIt=getAdminLessons(),nQuiz=allIt.filter(x=>x.quiz).length,nQs=allIt.reduce((a,x)=>a+(S.tests[x.id]||[]).length,0);
    const nVid=allIt.filter(x=>(S.media[x.id]||{}).video).length,nFil=allIt.reduce((a,x)=>a+((S.media[x.id]||{}).files||[]).length,0);

    app.innerHTML=`
    <div class="qh"><div><h2>⚙ إدارة المحتوى</h2><p class="mut">إدارة جميع الدورات (المحوسب، التأسيس، GAT، التحصيلي، المراحل التعليمية، American Section): أضف الاختبارات والأسئلة والملفات، وانسخ روابط الاختبارات من مكان واحد.</p></div></div>
    <div class="card ahub">
      <div class="ahs"><input class="inp" id="ahq" placeholder="🔎 اذهب مباشرة إلى أي مرحلة أو اختبار أو درس… (اكتب جزءاً من الاسم)" autocomplete="off"><div class="ahr" id="ahr" hidden></div></div>
      <div class="ahl">① القسم</div><div class="trbar" id="ah_top">${tops}</div>
      ${subs?`<div class="ahl">② ${topOf(adminTrack)==='stages'?'الصف الدراسي':'الصف / البرنامج'} <small class="mut">(الرقم = عدد الاختبارات)</small></div><div class="trbar" id="ah_sub">${subs}</div>`:''}
      <div class="ahcur">📍 <b>${esc(trName(adminTrack))}</b><span class="rb">${nQuiz} اختبار</span><span class="rb">${nQs} سؤال</span><span class="rb">🎥 ${nVid}</span><span class="rb">📎 ${nFil}</span></div>
    </div>
    <div class="ahtabs" id="ahtabs">${TABS.map(([k,i,n])=>`<button type="button" class="ahtab" data-tab="${k}">${i} ${n}</button>`).join('')}</div>
    <section data-pn="map"><div class="card"><div class="qh"><h3>🗺 خريطة «${esc(trName(adminTrack))}»</h3><span class="mut sm">اضغط أي زر لتنفيذ الإجراء على العنصر مباشرة</span></div><div id="hubmap"></div></div></section>

    <section data-pn="students">
    <div class="card" style="margin-bottom:20px"><h3>🔔 طلبات الانضمام المعلّقة</h3><div id="pl2"><p class="mut">جارٍ التحميل...</p></div></div>
    <div class="card" style="margin-bottom:20px"><div class="qh"><h3>👥 الطلاب</h3><input class="inp" id="stf" placeholder="🔍 ابحث بالاسم…"></div><div id="stl"><p class="mut">جارٍ التحميل...</p></div></div>
    </section><section data-pn="tests">
    <div class="card fm" style="margin-bottom:20px">
      <div class="qh"><h3>📁 إدارة الاختبارات (${esc(trName(adminTrack))})</h3>
        <div class="row" style="flex-wrap:wrap"><button class="btn sm" id="btn_new_t">➕ اختبار جديد</button><button class="btn danger sm" id="btn_bulk_del" disabled>🗑 حذف المحدد</button></div></div>
      <label class="row" style="margin:6px 0"><input type="checkbox" id="tsel_all"> تحديد الكل</label>
      <div id="tlist"></div>
      <p class="mut sm" style="margin-top:8px">✏ إعادة تسمية &nbsp;·&nbsp; 🧹 مسح الأسئلة فقط (يبقى الاختبار فارغاً لإعادة الرفع) &nbsp;·&nbsp; 🗑 حذف نهائي. نتائج الطلاب السابقة تبقى محفوظة.</p>
    </div>

    </section>
    <section data-pn="add">
      <!-- نموذج إضافة سؤال مع الترتيب الجديد -->
      <div class="card fm">
        <h3>➕ إضافة سؤال</h3>
        <label>الاختبار المستهدف</label>
        <select id="at">${topt}</select>

        <label>نص السؤال (أو اضغط داخل المربع والصق الصورة بـ Ctrl+V)</label>
        <textarea id="aq" rows="2" placeholder="اكتب نص السؤال هنا، أو اضغط هنا ثم Ctrl+V للصق صورة من ملف PDF مباشرة"></textarea>
        
        <div id="pv_box" style="display:none;margin-top:10px;position:relative;background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:10px;text-align:center">
          <img id="aq_prev" style="max-height:170px;max-width:100%;border-radius:8px;display:block;margin:auto">
          <button class="btn g" id="rm_prev" type="button" style="margin-top:8px;padding:4px 12px;font-size:0.85rem">🗑 إزالة الصورة الملصقة</button>
        </div>

        <label>أو اختر صورة من جهازك (تُضغط تلقائياً)</label>
        <input type="file" id="ai" accept="image/*">

        <!-- الإجابة الصحيحة وأزرار الحفظ والمعاينة مباشرة أسفل الصورة -->
        <div style="background:var(--bg2);padding:14px;border-radius:16px;border:1px solid var(--line);margin:14px 0">
          <label style="margin-top:0">🎯 الإجابة الصحيحة</label>
          <select id="ac" style="font-weight:700;font-size:1.1rem;margin-bottom:12px">
            ${L.map((l,k)=>`<option value="${k}">${l}</option>`).join('')}
          </select>
          <div class="row" style="gap:10px">
            <button class="btn" id="aadd" style="flex:1;font-size:1.05rem">➕ إضافة السؤال وحفظه</button>
            <button class="btn g" id="aprev" type="button" style="flex:1">👁 معاينة السؤال</button>
          </div>
        </div>

        <!-- الحقول النصية تظل ظاهرة بالكامل كما طلبت -->
        <details open style="margin-top:10px">
          <summary style="font-weight:700;margin-bottom:10px">خيارات السؤال والنصوص التفصيلية (اختياري للأسئلة المصورة)</summary>
          ${[0,1,2,3].map(k=>`<label>الخيار ${L[k]}</label><input id="ao${k}">`).join('')}
          <label>شرح الحل (اختياري)</label><input id="ae">
          <label>رابط فيديو شرح الحل (اختياري)</label><input id="av" dir="ltr" placeholder="https://youtu.be/...">
          <label>كلمات مفتاحية للبحث (اختياري)</label><input id="ak">
        </details>
      </div>

      </section><section data-pn="media">
      <!-- فيديو وملفات الدرس -->
      <div class="card fm">
        <h3>🎥 فيديو وملفات الدرس</h3>
        <label>الدرس</label><select id="ls2">${lopt}</select>
        <label>رابط فيديو يوتيوب</label><input id="yt" dir="ltr" placeholder="https://youtu.be/...">
        <div style="margin:10px 0"><button class="btn" id="ytb">حفظ الفيديو</button></div>
        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
        <label>إضافة ملف (اسم + رابط Google Drive)</label>
        <input id="fn" placeholder="اسم الملف (مثال: مذكرة التأسيس.pdf)">
        <input id="fu" dir="ltr" placeholder="https://drive.google.com/..." style="margin-top:6px">
        <div style="margin-top:10px"><button class="btn g" id="fadd">إضافة الملف</button></div>
        <div id="ml" style="margin-top:16px"></div>
      </div>
    </section>
    <section data-pn="import">
    <!-- رفع جماعي -->
    <div class="card fm">
      <h3>🖼 رفع جماعي لصور الأسئلة</h3>
      <p class="mut">صورة لكل سؤال، تُرتَّب حسب اسم الملف، مع مفتاح الإجابات بالترتيب.</p>
      <label>الاختبار</label><select id="bt">${topt}</select>
      <label>الصور</label><input type="file" id="bi" accept="image/*" multiple>
      <label>مفتاح الإجابات (مثال: أ ب ج د أ ... أو abcd...)</label>
      <textarea id="bk" rows="2" dir="rtl" placeholder="أ ب ج د ..."></textarea><br>
      <button class="btn" id="badd">رفع الأسئلة دفعة واحدة</button>
    </div><br>

    <!-- استيراد دفعة اختبارات -->
    <div class="card fm" style="margin-bottom:20px">
      <h3>📦 استيراد دفعة اختبارات (ملفات متعددة)</h3>
      <p class="mut">اختر عدة ملفات <b>JSON أو HTML</b> دفعة واحدة (ملفات HTML تعمل في الوضع التلقائي)، وتُرتَّب حسب اسم الملف. في الوضع التلقائي يُنشأ لكل ملف اختبار جديد في الدورة المحددة أعلاه بلا حد للعدد، ويُسمّى تلقائياً حسب آخر اختبار موجود. وفي الوضعين الآخرين يحدد كل ملف اختباره بحقل <code>test</code>.</p>
      <label class="row" style="margin:8px 0"><input type="radio" name="bm" value="auto" checked> ➕ إنشاء اختبار جديد لكل ملف وتسميته تلقائياً بالتسلسل (مثل: تأسيس 6، تأسيس 7 …)</label>
      <label class="row" style="margin:8px 0"><input type="radio" name="bm" value="skip"> تخطّي الاختبارات التي فيها أسئلة (الأكثر أماناً)</label>
      <label class="row" style="margin:8px 0"><input type="radio" name="bm" value="replace"> استبدال أسئلة الاختبارات الموجودة بأسئلة الملف</label>
      <input type="file" id="bulkf" accept=".json,.html,.htm,application/json,text/html" multiple><br>
      <button class="btn" id="bulkb">بدء الاستيراد</button>
      <div id="bulklog" class="mut sm" style="margin-top:10px;max-height:260px;overflow:auto"></div>
    </div>

    <!-- استيراد JSON -->
    <div class="card fm">
      <h3>📥 استيراد أسئلة من ملف JSON أو HTML</h3>
      <label>الاختبار</label><select id="jt">${topt}</select>
      <label>الملف</label><input type="file" id="jf" accept=".json,.html,.htm,application/json,text/html"><br>
      <button class="btn" id="jadd">استيراد</button>
    </div><br>

    </section><section data-pn="qs">
    <!-- عرض الأسئلة الحالية للاختبار مع إمكانية الحذف -->
    <div class="card">
      <div class="qh"><h3>أسئلة الاختبار الحالية</h3><select class="inp" id="lt">${topt}</select></div>
      <input class="inp" id="lf" placeholder="🔍 ابحث في أسئلة هذا الاختبار (نص أو كلمة مفتاحية)…" style="width:100%;margin:8px 0">
      <div id="cl"></div>
    </div><br>

    </section><section data-pn="results">
    <!-- سجل نتائج الطلاب -->
    <div class="card">
      <div class="qh"><h3>📊 آخر نتائج الطلاب</h3><a class="btn sm" href="#/results">عرض كل النتائج ◀</a></div>
      <div id="rs"><p class="mut">جارٍ التحميل...</p></div>
    </div>
    </section>
    <div id="preview_modal"></div>
    `;

    // ===== مركز التنقل السريع =====
    const pickTrack=k=>{
      if(!COURSES[k])return;adminTrack=k;LS.set('adm_track',k);
      if(k.startsWith('st_'))LS.set('adm_st',k);if(k==='american'||k.startsWith('am_'))LS.set('adm_am',k);
      renderAdminUI();
    };
    document.querySelectorAll('#ah_top [data-top]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.top,cur=topOf(adminTrack);
      if(k==='stages')pickTrack(cur==='stages'?adminTrack:(COURSES[LS.get('adm_st')]?LS.get('adm_st'):'st_'+GRADES[0][0]));
      else if(k==='american')pickTrack(cur==='american'?adminTrack:(COURSES[LS.get('adm_am')]?LS.get('adm_am'):'am_'+AGR[0][0]));
      else pickTrack(k);
    });
    document.querySelectorAll('#ah_sub [data-trk]').forEach(b=>b.onclick=()=>pickTrack(b.dataset.trk));
    $('#ahtabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;adminTab=b.dataset.tab;applyTab();if(adminTab==='map')mapRender()};
    // بحث شامل في كل المراحل والاختبارات
    const hq=$('#ahq'),hr=$('#ahr');
    const hubFind=v=>{
      const w=nz(v).split(/\s+/).filter(Boolean),out=[];if(!w.length)return out;
      Object.keys(COURSES).forEach(k=>{
        const c=COURSES[k];
        if(w.every(x=>nz(c.title).includes(x)))out.push({k,t:c.title,sub:'فتح المرحلة',ic:'📂'});
        c.groups.forEach(g=>g.items.forEach(it=>{if(w.every(x=>nz(it.t+' '+c.title).includes(x)))out.push({k,id:it.id,t:it.t,sub:c.title,ic:it.quiz?'🧪':'📖'})}));
      });
      return out.slice(0,14);
    };
    const openRes=x=>{if(!x)return;focusId=x.id||null;adminTab='map';pickTrack(x.k)};
    const showRes=()=>{
      const r=hubFind(hq.value);hr._r=r;hr.hidden=!hq.value.trim();
      hr.innerHTML=r.length?r.map((x,i)=>`<button type="button" class="ahri" data-i="${i}"><span>${x.ic} <b>${esc(x.t)}</b></span><small>${esc(x.sub)}</small></button>`).join(''):'<p class="mut sm" style="padding:10px">لا توجد نتائج مطابقة</p>';
      hr.querySelectorAll('.ahri').forEach(b=>b.onmousedown=e=>{e.preventDefault();openRes(hr._r[+b.dataset.i])});
    };
    hq.oninput=showRes;hq.onfocus=()=>{if(hq.value.trim())showRes()};hq.onblur=()=>setTimeout(()=>{hr.hidden=true},180);
    hq.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openRes((hr._r||[])[0])}};
    // خريطة الدورة: المجموعات والعناصر مع أزرار الإجراءات
    const addItem=async(gi,quiz)=>{
      const trk=COURSES[adminTrack];if(!trk)return;
      const nw=await askName('➕',quiz?'اختبار جديد':'درس / حصة جديدة','',quiz?'مثال: اختبار الهندسة والحساب':'مثال: شرح الدرس الأول','إضافة');
      if(!nw)return;
      const id=(quiz?'t_':'l_')+uid();let g=trk.groups[gi];
      if(!g){g={t:'بنك الأسئلة والاختبارات',items:[]};trk.groups.push(g)}
      g.items.push(quiz?{id,t:nw,d:'',quiz:true}:{id,t:nw,d:''});
      if(quiz){try{await setDoc(doc(db,'tests',id),{qs:[],meta:{t:nw,trk:adminTrack,ts:Date.now()}},{merge:true})}catch(e){console.warn(e)}}
      await saveStructure();renderAdminUI();
      go(quiz?'add':'media',id,quiz?['#at','#jt','#bt','#lt']:['#ls2']);
    };
    const addGroup=async()=>{
      const nm=await askName('📂','مجموعة جديدة','','مثال: اختبارات الفصل الثاني','إضافة');if(!nm)return;
      COURSES[adminTrack].groups.push({t:nm,items:[]});await saveStructure();renderAdminUI();
    };
    const renGroup=async gi=>{
      const g=COURSES[adminTrack].groups[gi];if(!g)return;
      const nm=await askName('✏','إعادة تسمية المجموعة',g.t,'','حفظ');if(!nm||nm===g.t)return;
      g.t=nm;await saveStructure();renderAdminUI();
    };
    const delGroup=async gi=>{
      const g=COURSES[adminTrack].groups[gi];if(!g)return;
      if(g.items.length)return toast('احذف عناصر المجموعة أولاً (أو انقلها) ثم احذفها');
      if(!await modal({icon:'🗑',html:`سيُحذف المجموعة الفارغة «<b>${esc(g.t)}</b>». متأكد؟`,ok:'نعم، احذف',cancel:'إلغاء'}))return;
      COURSES[adminTrack].groups.splice(gi,1);await saveStructure();renderAdminUI();
    };
    const delItem=async id=>{
      const it=getAdminLessons().find(x=>x.id===id);if(!it)return;
      if(it.quiz)return delTests([id]);
      if(!await modal({icon:'⚠️',html:`سيُحذف الدرس «<b>${esc(it.t)}</b>» مع فيديوه وملفاته من القائمة. لا يمكن التراجع. متأكد؟`,ok:'نعم، احذف',cancel:'إلغاء'}))return;
      COURSES[adminTrack].groups.forEach(g=>{g.items=g.items.filter(x=>x.id!==id)});
      try{await deleteDoc(doc(db,'lessons',id));delete S.media[id]}catch(e){console.warn(e)}
      await saveStructure();renderAdminUI();
    };
    const mapRow=x=>{
      const m=S.media[x.id]||{},nf=(m.files||[]).length,n=(S.tests[x.id]||[]).length,id=esc(x.id);
      return `<div class="mr" data-id="${id}"><div class="mrt"><b>${esc(x.t)}</b> ${x.quiz?`<small class="rb ${n?'':'bad'}">${n} سؤال</small>`:'<small class="rb">درس</small>'}${m.video?'<small class="rb gold">🎥 فيديو</small>':''}${nf?`<small class="rb">📎 ${nf}</small>`:''}</div>
        <div class="row" style="flex-wrap:wrap">${x.quiz?`<button class="btn sm" data-a="add" data-id="${id}">➕ سؤال</button><button class="btn g sm" data-a="imp" data-id="${id}">📥 استيراد</button><button class="btn g sm" data-a="qs" data-id="${id}">📝 الأسئلة</button><button class="ib sm" data-a="lk" data-id="${id}" title="نسخ رابط الاختبار" aria-label="نسخ رابط الاختبار">🔗</button><button class="ib sm wa" data-a="wa" data-id="${id}" title="مشاركة الرابط عبر واتساب" aria-label="مشاركة الرابط عبر واتساب">📲</button>`:''}<button class="btn g sm" data-a="media" data-id="${id}">🎥 فيديو وملفات</button><button class="ib sm" data-a="rn" data-id="${id}" title="إعادة تسمية" aria-label="إعادة تسمية">✏</button><button class="ib sm" data-a="del" data-id="${id}" title="حذف" aria-label="حذف">🗑</button></div></div>`;
    };
    const mapRender=()=>{
      const el=$('#hubmap'),c=COURSES[adminTrack];if(!el||!c)return;
      el.innerHTML=c.groups.map((g,gi)=>`<div class="mg"><div class="mgh"><b>📂 ${esc(g.t)}</b><span class="row" style="flex-wrap:wrap"><button class="btn sm" data-g="newq" data-gi="${gi}">➕ اختبار جديد</button><button class="btn g sm" data-g="newl" data-gi="${gi}">➕ درس / حصة</button><button class="ib sm" data-g="ren" data-gi="${gi}" title="إعادة تسمية المجموعة" aria-label="إعادة تسمية المجموعة">✏</button><button class="ib sm" data-g="del" data-gi="${gi}" title="حذف المجموعة" aria-label="حذف المجموعة">🗑</button></span></div>${g.items.length?g.items.map(mapRow).join(''):'<p class="mut sm" style="margin:8px 4px">المجموعة فارغة — أضف اختباراً أو درساً.</p>'}</div>`).join('')+'<div style="margin-top:12px"><button class="btn g sm" data-g="newg">➕ مجموعة جديدة</button></div>';
      el.onclick=e=>{
        const a=e.target.closest('[data-a]'),g=e.target.closest('[data-g]');
        if(a){const id=a.dataset.id;({
          add:()=>go('add',id,['#at']),imp:()=>go('import',id,['#bt','#jt']),qs:()=>go('qs',id,['#lt']),
          lk:()=>copyTestLink(id),wa:()=>shareTestWA(id),media:()=>go('media',id,['#ls2']),rn:()=>renameTest(id),del:()=>delItem(id)})[a.dataset.a]();return}
        if(g){const gi=+g.dataset.gi;({newq:()=>addItem(gi,true),newl:()=>addItem(gi,false),ren:()=>renGroup(gi),del:()=>delGroup(gi),newg:addGroup})[g.dataset.g]()}
      };
      if(focusId){const r=el.querySelector('.mr[data-id="'+CSS.escape(focusId)+'"]');if(r){r.classList.add('flash');r.scrollIntoView({block:'center'})}focusId=null}
    };
    applyTab();mapRender();

    // ===== إدارة الاختبارات: قائمة + تحديد متعدد =====
    const askName=(icon,title,val,ph,okTxt)=>modal({icon,ok:okTxt,cancel:'إلغاء',
      html:`<h3>${title}</h3><div class="fm"><input id="nmi" value="${esc(val)}" placeholder="${esc(ph||'')}"></div>`,
      onOpen:bg=>{const i=bg.querySelector('#nmi');i.focus();i.select();i.onkeydown=e=>{if(e.key==='Enter')bg.querySelector('[data-r="1"]').click()}},
      collect:bg=>bg.querySelector('#nmi').value.trim()});
    const selIds=()=>[...document.querySelectorAll('[data-sel]:checked')].map(c=>c.dataset.sel);
    const tlSel=()=>{const n=selIds().length,bt=$('#btn_bulk_del');bt.disabled=!n;bt.textContent='🗑 حذف المحدد'+(n?' ('+n+')':'')};
    const renameTest=async id=>{
      const it=getAdminLessons().find(x=>x.id===id);if(!it)return;
      const nm=await askName('✏','إعادة تسمية الاختبار',it.t,'','حفظ');
      if(!nm||nm===it.t)return;
      it.t=nm;
      try{await setDoc(doc(db,'tests',id),{meta:{t:nm}},{merge:true})}catch(e){console.warn(e)}
      await saveStructure();renderAdminUI();
    };
    const wipeOne=async id=>{
      const it=getAdminLessons().find(x=>x.id===id),cnt=(S.tests[id]||[]).length;
      if(!it)return;if(!cnt)return toast('لا توجد أسئلة في هذا الاختبار');
      const ok=await modal({icon:'🧹',html:`سيُحذف <b>${cnt}</b> سؤالاً من «${esc(it.t)}» مع صورها، ويبقى الاختبار فارغاً لتعيد رفعه. هل أنت متأكد؟`,ok:'نعم، امسح الأسئلة',cancel:'إلغاء'});
      if(!ok)return;
      toast('جارٍ الحذف…');
      try{await wipeTestQuestions(id);toast('تم مسح الأسئلة ✓')}catch(e){console.error(e);toast('تعذر الحذف — راجع الاتصال والقواعد')}
      renderAdminUI();
    };
    const delTests=async ids=>{
      const its=ids.map(id=>getAdminLessons().find(x=>x.id===id)).filter(Boolean);if(!its.length)return;
      const qn=ids.reduce((a,id)=>a+(S.tests[id]||[]).length,0);
      const ok=await modal({icon:'⚠️',html:its.length===1?`سيُحذف الاختبار «<b>${esc(its[0].t)}</b>» بالكامل${qn?` مع <b>${qn}</b> سؤالاً وصورها`:''} ويُزال من قائمة الدورة. لا يمكن التراجع. هل أنت متأكد؟`:`سيُحذف <b>${its.length}</b> اختباراً بالكامل${qn?` مع <b>${qn}</b> سؤالاً وصورها`:''} ويُزالون من قائمة الدورة. لا يمكن التراجع. هل أنت متأكد؟`,ok:'نعم، احذف',cancel:'إلغاء'});
      if(!ok)return;
      toast('جارٍ الحذف…');
      try{await deleteTests(ids);toast('تم الحذف ✓')}catch(e){console.error(e);toast('تعذر الحذف — راجع الاتصال والقواعد')}
      renderAdminUI();
    };
    const tl=()=>{
      const qz=getAdminQuizzes();
      $('#tlist').innerHTML=qz.length?qz.map(x=>`<div class="fi in trow"><label class="row" style="flex:1;min-width:0"><input type="checkbox" data-sel="${esc(x.id)}"><span><b>${esc(x.t)}</b> <small class="rb">${(S.tests[x.id]||[]).length} سؤال</small> ${S.sh[x.id]?'<small class="rb ok">🔗 مشارك</small>':'<small class="rb">🔒 غير مشارك</small>'}</span></label><span class="row"><button class="btn g sm" data-lk="${esc(x.id)}">🔗 نسخ الرابط</button>${S.sh[x.id]?`<button class="btn danger sm" data-us="${esc(x.id)}">⛔ إيقاف المشاركة</button>`:''}<button class="btn wa sm" data-wa="${esc(x.id)}">📲 واتساب</button><button class="ib sm" data-rn="${esc(x.id)}" title="إعادة تسمية" aria-label="إعادة تسمية">✏</button><button class="ib sm" data-wp="${esc(x.id)}" title="مسح الأسئلة" aria-label="مسح الأسئلة">🧹</button><button class="ib sm" data-dl="${esc(x.id)}" title="حذف الاختبار" aria-label="حذف الاختبار">🗑</button></span><input class="inp lkin" readonly value="${esc(tlink(x.id))}" aria-label="رابط الاختبار"></div>`).join(''):'<p class="mut">لا توجد اختبارات في هذه الدورة</p>';
      $('#tlist').querySelectorAll('[data-sel]').forEach(c=>c.onchange=tlSel);
      $('#tlist').querySelectorAll('[data-rn]').forEach(b=>b.onclick=()=>renameTest(b.dataset.rn));
      $('#tlist').querySelectorAll('[data-wp]').forEach(b=>b.onclick=()=>wipeOne(b.dataset.wp));
      $('#tlist').querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>delTests([b.dataset.dl]));
      $('#tlist').querySelectorAll('[data-lk]').forEach(b=>b.onclick=()=>copyTestLink(b.dataset.lk));
      $('#tlist').querySelectorAll('[data-us]').forEach(b=>b.onclick=()=>stopShare(b.dataset.us));
      $('#tlist').querySelectorAll('.lkin').forEach(i=>i.onclick=()=>i.select());
      $('#tlist').querySelectorAll('[data-wa]').forEach(b=>b.onclick=()=>shareTestWA(b.dataset.wa));
      $('#tsel_all').checked=false;tlSel();
    };
    window.__tl=()=>{if($('#tlist'))tl()};
    $('#tsel_all').onchange=e=>{document.querySelectorAll('[data-sel]').forEach(c=>c.checked=e.target.checked);tlSel()};
    $('#btn_bulk_del').onclick=()=>delTests(selIds());
    $('#btn_new_t').onclick=async()=>{
      const nw=await askName('➕','اختبار جديد','','مثال: اختبار الهندسة والحساب','إضافة');
      if(!nw)return;
      const newId='t_'+uid();
      const trk=COURSES[adminTrack]||COURSES.computerized;
      let qGrp=trk.groups.find(g=>g.items.some(x=>x.quiz));
      if(!qGrp){qGrp={t:'بنك الأسئلة والاختبارات',items:[]};trk.groups.push(qGrp)}
      qGrp.items.push({id:newId,t:nw,d:'',quiz:true});
      try{await setDoc(doc(db,'tests',newId),{qs:[],meta:{t:nw,trk:adminTrack,ts:Date.now()}},{merge:true})}catch(e){console.warn(e)}
      await saveStructure();
      renderAdminUI();
      toast('تمت إضافة الاختبار بنجاح ✓');
    };
    tl();

    // استيراد دفعة ملفات
    $('#bulkb').onclick=async()=>{
      const files=[...$('#bulkf').files];if(!files.length)return toast('اختر الملفات أولاً');
      const mode=document.querySelector('[name=bm]:checked').value,log=$('#bulklog');
      const say=t=>{log.insertAdjacentHTML('beforeend',`<div>${esc(t)}</div>`);log.scrollTop=log.scrollHeight};
      files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      $('#bulkb').disabled=true;log.innerHTML='';
      let ok=0,skip=0,bad=0,struct=false;
      for(const f of files){
        try{
          let created=false;const d=await parseQFile(f),arr=Array.isArray(d)?d:d.questions,trk=mode==='auto'?adminTrack:((d&&d.track)||adminTrack);let tid=d&&d.test;
          if(!COURSES[trk])throw new Error('مسار غير معروف: '+trk);
          if(!Array.isArray(arr)||!arr.length)throw new Error('الملف لا يحوي أسئلة');
          if(mode==='auto'){
            const its=COURSES[trk].groups.flatMap(g=>g.items).filter(x=>x.quiz),last=its[its.length-1];
            const ids=new Set(Object.values(COURSES).flatMap(c=>c.groups.flatMap(g=>g.items.map(x=>x.id))));
            let n=Math.max(0,...its.map(x=>{const m=String(x.t).match(/(\d+)\s*$/);return m?+m[1]:0}))+1;
            let base=last?String(last.t).replace(/\d+\s*$/,''):'اختبار ',pre='t';
            if(last){const mi=String(last.id).match(/^(.*?)\d+$/);pre=mi?mi[1]:last.id+'_'}
            if(!base.trim())base='اختبار ';
            while(ids.has(pre+n))n++;
            tid=pre+n;
            let grp=last?COURSES[trk].groups.find(g=>g.items.includes(last)):COURSES[trk].groups[0];
            if(!grp){grp={t:'بنك الأسئلة والاختبارات',items:[]};COURSES[trk].groups.push(grp)}
            grp.items.push({id:tid,t:base+n,d:'',quiz:true});struct=true;created=true;
          }
          if(!tid)throw new Error('الملف لا يحدد اختباراً (حقل test)');
          if(!/^[A-Za-z0-9_]+$/.test(tid))throw new Error('معرّف الاختبار غير صالح');
          let item=COURSES[trk].groups.flatMap(g=>g.items).find(x=>x.id===tid);
          if(!item){
            let grp=COURSES[trk].groups.find(g=>g.items.some(x=>x.quiz));
            if(!grp){grp={t:'بنك الأسئلة والاختبارات',items:[]};COURSES[trk].groups.push(grp)}
            item={id:tid,t:String(d.title||tid),d:'',quiz:true};grp.items.push(item);struct=true;created=true;
          }
          const have=(S.tests[tid]||[]).length;
          if(have&&mode==='skip'){say(`⏭ ${f.name}: «${item.t}» فيه ${have} سؤالاً — تم التخطي`);skip++;continue}
          if(have)await wipeTestQuestions(tid);
          const c=await importQuestionsBatch(tid,arr,created?{t:item.t,trk,ts:Date.now()+ok}:null);
          say(`✓ ${f.name} ← «${item.t}» (${trName(trk)}): ${c} سؤالاً`);ok++;
        }catch(e){bad++;console.error(e);say(`✗ ${f.name}: ${e.message}`)}
      }
      if(struct)await saveStructure();
      say(`— انتهى: نجح ${ok} ، تخطّى ${skip} ، فشل ${bad}`);
      $('#bulkb').disabled=false;toast('انتهى الاستيراد');
      if(struct||ok)setTimeout(renderAdminUI,1500);
    };

    // دعم لصق الصور
    const txtArea=$('#aq'),pvBox=$('#pv_box'),pvImg=$('#aq_prev'),rmBtn=$('#rm_prev'),fileInp=$('#ai');
    txtArea.addEventListener('paste',e=>{
      const items=(e.clipboardData||e.originalEvent.clipboardData).items;
      for(const it of items){
        if(it.type.indexOf('image')!==-1){
          const f=it.getAsFile();
          if(f){
            pastedFile=f;
            pvImg.src=URL.createObjectURL(f);
            pvBox.style.display='block';
            toast('تم لصق الصورة بنجاح ✓');
            break;
          }
        }
      }
    });
    rmBtn.onclick=()=>{pastedFile=null;pvImg.src='';pvBox.style.display='none'};
    fileInp.onchange=()=>{if(fileInp.files[0]){pastedFile=null;pvImg.src='';pvBox.style.display='none'}};

    // زر معاينة السؤال
    $('#aprev').onclick=()=>{
      const q=$('#aq').value.trim();
      const f=pastedFile||$('#ai').files[0];
      const ans=+$('#ac').value;
      const opts=[0,1,2,3].map(k=>$('#ao'+k).value.trim());
      const exp=$('#ae').value.trim();
      if(!q&&!f)return toast('اكتب السؤال أو ارفع صورة للمعاينة');

      let imgSrc=pastedFile?pvImg.src:(fileInp.files[0]?URL.createObjectURL(fileInp.files[0]):'');
      $('#preview_modal').innerHTML=`
      <div class="modal-bg" id="mbg">
        <div class="modal-box">
          <div class="qh"><h3>معاينة السؤال كما سيظهر للطالب</h3><button class="ib" id="cls_prev">✕</button></div>
          <div class="qcard" style="margin-top:14px">
            ${imgSrc?`<img src="${imgSrc}" style="max-width:100%;display:block;margin:auto 0 10px;border-radius:8px">`:''}
            ${q?`<p style="font-weight:700;font-size:1.25rem">${esc(q)}</p>`:''}
          </div>
          <div class="opts">
            ${opts.map((o,k)=>`<div class="opt ${k===ans?'right':''}"><i>${L[k]}</i>${esc(o)||`الخيار ${L[k]}`} ${k===ans?'<span class="dn" style="margin-inline-start:auto">✓ الإجابة الصحيحة</span>':''}</div>`).join('')}
          </div>
          ${exp?`<div class="ex" style="margin-top:14px"><b>شرح الحل:</b> <p class="mut">${esc(exp)}</p></div>`:''}
          <div style="text-align:center;margin-top:18px"><button class="btn" id="cls_prev2">إغلاق المعاينة</button></div>
        </div>
      </div>`;
      $('#cls_prev').onclick=()=>$('#preview_modal').innerHTML='';
      $('#cls_prev2').onclick=()=>$('#preview_modal').innerHTML='';
    };

    // حفظ السؤال
    $('#aadd').onclick=async()=>{
      const q=$('#aq').value.trim(),f=pastedFile||$('#ai').files[0],t=$('#at').value;
      if(!q&&!f)return toast('اكتب السؤال أو ارفع/الصق صورة');
      const v=$('#av').value.trim();if(v&&!/^https?:\/\//.test(v))return toast('رابط الشرح غير صالح');
      try{
        const id='q'+uid(),m={id,q,o:[0,1,2,3].map(k=>$('#ao'+k).value.trim()),a:+$('#ac').value,e:$('#ae').value.trim(),v,k:$('#ak').value.trim(),img:!!f};
        if(f)await setDoc(doc(db,'qimg',id),{d:await compress(f)});
        S.tests[t]=[...(S.tests[t]||[]),m];
        await setDoc(doc(db,'tests',t),{qs:S.tests[t]},{merge:true});
        pastedFile=null;pvImg.src='';pvBox.style.display='none';$('#aq').value='';
        [0,1,2,3].forEach(k=>$('#ao'+k).value='');$('#ae').value='';$('#av').value='';$('#ak').value='';$('#ai').value='';
        toast('أُضيف السؤال بنجاح ✓');
        cl();
      }catch(x){console.error(x);toast('تعذر إضافة السؤال')}
    };

    // إدارة فيديوهات وملفات الدروس
    const lid=()=>$('#ls2').value;
    const saveM=l=>setDoc(doc(db,'lessons',l),S.media[l]||{video:null,files:[]});
    const mm=l=>S.media[l]=S.media[l]||{video:null,files:[]};
    const ml=()=>{
      const m=S.media[lid()]||{},fs=m.files||[];
      $('#ml').innerHTML=(m.video?`<div class="fi in"><span>🎥 youtu.be/${esc(m.video.id)}</span><button class="ib" data-dv="1">✕</button></div>`:'<p class="mut">لا يوجد فيديو</p>')+fs.map((f,i)=>`<div class="fi in"><span>📎 ${esc(f.name)}</span><button class="ib" data-df2="${i}">✕</button></div>`).join('');
      $('#ml').querySelectorAll('[data-dv]').forEach(b=>b.onclick=async()=>{S.media[lid()].video=null;await saveM(lid());ml()});
      $('#ml').querySelectorAll('[data-df2]').forEach(b=>b.onclick=async()=>{S.media[lid()].files.splice(+b.dataset.df2,1);await saveM(lid());ml()});
    };
    $('#ls2').onchange=ml;ml();

    $('#ytb').onclick=async()=>{
      const id=ytId($('#yt').value);if(!id)return toast('رابط يوتيوب غير صالح');
      mm(lid()).video={id,url:$('#yt').value.trim()};await saveM(lid());$('#yt').value='';toast('تم حفظ الفيديو ✓');ml();
    };
    $('#fadd').onclick=async()=>{
      const n=$('#fn').value.trim(),u=$('#fu').value.trim();if(!n||!/^https?:\/\//.test(u))return toast('أدخل اسماً ورابطاً صحيحاً');
      mm(lid()).files.push({name:n,url:u});await saveM(lid());$('#fn').value=$('#fu').value='';toast('أُضيف الملف ✓');ml();
    };

    // قائمة الأسئلة الحالية (مع التعديل والكلمات المفتاحية)
    const cl=()=>{
      const t=$('#lt').value,f=nz($('#lf')?$('#lf').value:'').split(/\s+/).filter(Boolean);
      const rows=getQs(t).map((q,i)=>({q,i})).filter(x=>{const hs=nz([x.q.q,x.q.k,x.q.e,...x.q.o].join(' '));return f.every(w=>hs.includes(w))});
      $('#cl').innerHTML=rows.length?rows.map(({q,i})=>`<div class="fi in"><span>${i+1}. ${esc(plain(q.q))||'🖼 سؤال مصوّر'} — ${L[q.a]}${q.k?` <small class="rb gold">🏷 ${esc(q.k)}</small>`:''}</span><span class="row"><button class="ib sm" data-kq="${q.id}" title="كلمات مفتاحية" aria-label="كلمات مفتاحية">🏷</button><button class="ib sm" data-eq="${q.id}" title="تعديل السؤال" aria-label="تعديل السؤال">✎</button><button class="ib sm" data-dq="${q.id}" title="حذف" aria-label="حذف">✕</button></span></div>`).join(''):'<p class="mut">لا توجد أسئلة مطابقة</p>';
      $('#cl').querySelectorAll('[data-kq]').forEach(b=>b.onclick=()=>quickKeywords(t,b.dataset.kq,cl));
      $('#cl').querySelectorAll('[data-eq]').forEach(b=>b.onclick=()=>editQuestion(t,b.dataset.eq,cl));
      $('#cl').querySelectorAll('[data-dq]').forEach(b=>b.onclick=async()=>{
        if(!confirm('حذف السؤال؟'))return;
        const q=S.tests[t].find(x=>x.id===b.dataset.dq);
        S.tests[t]=S.tests[t].filter(x=>x.id!==q.id);
        try{await setDoc(doc(db,'tests',t),{qs:S.tests[t]},{merge:true});if(q.img)await deleteDoc(doc(db,'qimg',q.id))}catch(e){toast('تعذر الحذف')}
        cl();
      });
    };
    $('#lt').onchange=cl;if($('#lf'))$('#lf').oninput=cl;cl();

    // رفع جماعي
    $('#badd').onclick=async()=>{
      const t=$('#bt').value,fs=[...$('#bi').files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      const MAP={'أ':0,'ا':0,'إ':0,'ب':1,'ج':2,'د':3,a:0,b:1,c:2,d:3},key=[...$('#bk').value.toLowerCase().replace(/[\s,،\-–]/g,'')].map(c=>MAP[c]);
      if(!fs.length)return toast('اختر الصور أولاً');
      if(key.length!==fs.length||key.some(x=>x===undefined))return toast(`عدد الإجابات (${key.length}) لا يطابق عدد الصور (${fs.length}) أو فيها رمز غير مفهوم`);
      try{
        const add=[];
        for(let i=0;i<fs.length;i++){
          toast(`جارٍ الرفع ${i+1}/${fs.length}`);
          const id='q'+uid()+i;
          await setDoc(doc(db,'qimg',id),{d:await compress(fs[i])});
          add.push({id,q:'',o:['','','',''],a:key[i],e:'',v:'',k:'',img:true});
        }
        S.tests[t]=[...(S.tests[t]||[]),...add];
        await setDoc(doc(db,'tests',t),{qs:S.tests[t]},{merge:true});
        toast('تم رفع '+fs.length+' سؤال ✓');
        cl();
      }catch(x){console.error(x);toast('تعذر الرفع')}
    };

    // استيراد JSON
    $('#jadd').onclick=async()=>{
      const f=$('#jf').files[0],t=$('#jt').value;if(!f)return toast('اختر الملف');
      try{
        const dj=await parseQFile(f),arr=Array.isArray(dj)?dj:(dj&&dj.questions);
        if(!Array.isArray(arr)||!arr.length)throw new Error('الملف لا يحوي قائمة أسئلة');
        const add=[];
        for(let i=0;i<arr.length;i++){
          const x=arr[i];
          if(!x.q||!Array.isArray(x.o)||x.o.length!==4||![0,1,2,3].includes(x.a))throw new Error('السؤال '+(i+1)+' غير مكتمل');
          const id='q'+uid()+i;let img=false;
          if(x.fig){
            const sv=String(x.fig);
            if(!/^\s*<svg[\s>]/.test(sv)||/<script|\son\w+\s*=/i.test(sv))throw new Error('الرسم في السؤال '+(i+1)+' غير صالح');
            await setDoc(doc(db,'qimg',id),{d:'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(sv)))});img=true;
            if(i%6===0)toast('جارٍ الاستيراد '+(i+1)+'/'+arr.length);
          }
          add.push({id,q:String(x.q),o:x.o.map(String),a:x.a,e:String(x.e||''),v:/^https?:\/\//.test(x.v||'')?String(x.v):'',k:String(x.k||''),img});
        }
        S.tests[t]=[...(S.tests[t]||[]),...add];
        await setDoc(doc(db,'tests',t),{qs:S.tests[t]},{merge:true});
        toast('تم استيراد '+add.length+' سؤال ✓');cl();
      }catch(x){toast(x instanceof SyntaxError?'ملف JSON غير صالح':x.message)}
    };

    // ===== الطلاب: إيقاف / تفعيل / حذف =====
    let STU=[];
    const delStudent=async id=>{
      const rs=await getDocs(collection(db,'users',id,'results'));
      for(let i=0;i<rs.docs.length;i+=400){const b=writeBatch(db);rs.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit()}
      await deleteDoc(doc(db,'users',id));
    };
    const drawStu=()=>{
      const el=$('#stl');if(!el)return;
      const f=nz($('#stf')?$('#stf').value:'').split(/\s+/).filter(Boolean);
      const rows=STU.filter(u=>f.every(w=>nz(u.name).includes(w))).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));
      el.innerHTML=`<p class="mut sm">عدد الطلاب: ${STU.length}</p>`+(rows.length?`<div style="overflow-x:auto"><table><tr><th>الطالب</th><th>الدورة</th><th>الحالة</th><th>إجراءات</th></tr>${rows.map(u=>{const st=u.rejected?['محظور','bad']:u.approved===false?['بانتظار الموافقة','gold']:['نشط','ok'];return`<tr><td><b>${esc(u.name||'—')}</b></td><td>${esc(trName(u.track))}</td><td><span class="rb ${st[1]}">${st[0]}</span></td><td><span class="row" style="flex-wrap:wrap">${st[1]==='ok'?`<button class="btn g sm" data-sb="${u.id}">إيقاف</button>`:`<button class="btn ok sm" data-sa="${u.id}">تفعيل ✓</button>`}<button class="btn danger sm" data-sd="${u.id}">🗑 حذف</button></span></td></tr>`}).join('')}</table></div>`:'<p class="mut">لا يوجد طلاب</p>');
      el.querySelectorAll('[data-sb]').forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,'users',b.dataset.sb),{approved:false,rejected:true});toast('تم إيقاف الطالب');loadStu();loadPend()}catch(e){toast('تعذر التنفيذ — راجع قواعد Firestore')}});
      el.querySelectorAll('[data-sa]').forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,'users',b.dataset.sa),{approved:true,rejected:false});toast('تم تفعيل الطالب ✓');loadStu();loadPend()}catch(e){toast('تعذر التنفيذ — راجع قواعد Firestore')}});
      el.querySelectorAll('[data-sd]').forEach(b=>b.onclick=async()=>{
        const u=STU.find(x=>x.id===b.dataset.sd);if(!u)return;
        const ok=await modal({icon:'⚠️',html:`سيُحذف الطالب «<b>${esc(u.name||'—')}</b>» مع جميع نتائجه ومجلداته وتقدمه نهائياً. لا يمكن التراجع.<br><span class="mut sm">ملاحظة: حساب الدخول نفسه يبقى في Firebase Authentication؛ إن دخل الطالب مجدداً سيظهر كطلب انضمام جديد. لمنعه نهائياً استخدم «إيقاف» بدل الحذف.</span>`,ok:'نعم، احذف الطالب',cancel:'إلغاء'});
        if(!ok)return;
        toast('جارٍ الحذف…');
        try{await delStudent(u.id);toast('تم حذف الطالب ✓');loadStu();loadPend()}catch(e){console.error(e);toast('تعذر الحذف — راجع قواعد Firestore')}
      });
    };
    const loadStu=async()=>{
      const el=$('#stl');if(!el)return;
      try{const sn=await getDocs(collection(db,'users'));STU=sn.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==S.user.uid);drawStu()}
      catch(e){el.innerHTML='<p class="er">تعذر تحميل الطلاب — راجع قواعد Firestore</p>'}
    };
    const loadPend=async()=>{const el=$('#pl2');if(!el)return;try{
          const sn=await getDocs(collection(db,'users')),rows=sn.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.approved===false&&!u.rejected);
          el.innerHTML=rows.length?rows.map(u=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0"><span><b>${esc(u.name||'—')}</b> <small class="mut">— ${esc(trName(u.track))}</small></span><span class="row"><button class="btn ok sm" data-ap="${u.id}">قبول ✓</button><button class="btn danger sm" data-rj="${u.id}">رفض</button></span></div>`).join(''):'<p class="mut">لا توجد طلبات معلّقة.</p>';
          el.querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,'users',b.dataset.ap),{approved:true});toast('تم قبول الطالب ✓');loadPend();loadStu()}catch(e){toast('تعذر التنفيذ — راجع قواعد Firestore')}});
          el.querySelectorAll('[data-rj]').forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,'users',b.dataset.rj),{rejected:true});toast('تم رفض الطلب');loadPend();loadStu()}catch(e){toast('تعذر التنفيذ — راجع قواعد Firestore')}});
        }catch(e){el.innerHTML='<p class="er">تعذر تحميل الطلبات — راجع قواعد Firestore</p>'}};loadPend();
    loadStu();$('#stf').oninput=drawStu;
    // نتائج الطلاب
    getDocs(collectionGroup(db,'results')).then(s=>{
      const rows=s.docs.map(d=>({...d.data(),_id:d.id,_uid:d.ref.parent.parent.id})).sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0)).slice(0,100);
      $('#rs').innerHTML=rows.length?`<table><tr><th>الطالب</th><th>القسم</th><th>الاختبار</th><th>النوع</th><th>النتيجة</th><th>التاريخ</th><th>الحل</th></tr>${rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.sec||secOf(x.tid))}</td><td>${esc(x.t)}</td><td>${x.m==='train'?'تدريب':'محاكي'}</td><td>${x.p}%</td><td>${esc(x.d)}</td><td><a class="btn sm" href="#/rv/${esc(x.uid||x._uid)}/${esc(x._id)}">🔍 مراجعة</a></td></tr>`).join('')}</table>`:'<p class="mut">لا توجد نتائج بعد</p>';
    }).catch(e=>{$('#rs').innerHTML='<p class="er">تعذر تحميل النتائج — راجع قواعد Firestore</p>'});
  };

  renderAdminUI();
}


/* ========= صفحة نتائج الطلاب (للمدير) ========= */
async function resultsPage(){
  if(!S.isAdmin){location.hash='#/';return}
  app.innerHTML=`<div class="qh"><div><h2>📊 نتائج الطلاب</h2><p class="mut">جميع محاولات الطلاب في الاختبارات.</p></div><div class="row" style="flex-wrap:wrap"><button class="btn g sm" id="rx">⬇ تصدير CSV</button><button class="btn g sm" id="rr">🔄 تحديث</button></div></div>
  <div class="card fm" style="margin:12px 0"><div class="row" style="flex-wrap:wrap"><input class="inp" id="rf1" placeholder="🔍 اسم الطالب…" style="flex:1"><select class="inp" id="rf2"><option value="">كل الاختبارات</option></select><select class="inp" id="rf3"><option value="">كل الأنواع</option><option value="exam">محاكي</option><option value="train">تدريب</option></select></div></div>
  <div class="grid g4" id="rst"></div><br><div class="card"><div id="rtb"><p class="mut">جارٍ التحميل...</p></div></div>`;
  let rows=[],view=[];
  const draw=()=>{
    const w=nz($('#rf1').value).split(/\s+/).filter(Boolean),t=$('#rf2').value,m=$('#rf3').value;
    view=rows.filter(x=>(!t||x.tid===t)&&(!m||x.m===m)&&w.every(k=>nz(x.name).includes(k)));
    const avg=view.length?Math.round(view.reduce((a,x)=>a+x.p,0)/view.length):0,best=view.length?Math.max(...view.map(x=>x.p)):0,stu=new Set(view.map(x=>x.uid||x.name)).size;
    $('#rst').innerHTML=`<div class="card stat"><b>${view.length}</b>محاولة</div><div class="card stat"><b>${stu}</b>طالب</div><div class="card stat"><b>${avg}%</b>المتوسط</div><div class="card stat"><b>${best}%</b>الأعلى</div>`;
    $('#rtb').innerHTML=view.length?`<div style="overflow-x:auto"><table><tr><th>الطالب</th><th>الدورة</th><th>الاختبار</th><th>النوع</th><th>النتيجة</th><th>صحيح / خطأ / فارغ</th><th>المدة</th><th>التاريخ</th><th>الحل</th></tr>${view.slice(0,300).map(x=>{const bl=x.bl||0,wr=x.n-x.c-bl;return`<tr><td>${esc(x.name)}</td><td>${esc(x.sec||secOf(x.tid))}</td><td>${esc(x.t)}</td><td>${x.m==='train'?'تدريب':'محاكي'}</td><td><b style="color:var(--${x.p>=PASS[x.m==='train'?'train':'exam']?'ok':'bad'})">${x.p}%</b></td><td><span class="rb ok">${x.c} ✓</span> <span class="rb bad">${wr} ✕</span> <span class="rb">${bl} —</span></td><td>${x.s!=null?fmtDur(x.s):'—'}</td><td>${esc(x.d)}</td><td><a class="btn sm" href="#/rv/${esc(x.uid||x._uid)}/${esc(x._id)}">🔍 مراجعة</a></td></tr>`}).join('')}</table></div>${view.length>300?'<p class="mut sm">يعرض أحدث 300 محاولة — استخدم الفلاتر أو التصدير لرؤية الباقي.</p>':''}`:'<p class="mut">لا توجد نتائج مطابقة</p>';
  };
  const load=async()=>{
    $('#rtb').innerHTML='<p class="mut">جارٍ التحميل...</p>';
    try{
      const sn=await getDocs(collectionGroup(db,'results'));
      rows=sn.docs.map(d=>({...d.data(),_id:d.id,_uid:d.ref.parent.parent.id})).sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0));
      const seen=new Map();rows.forEach(x=>{if(!seen.has(x.tid))seen.set(x.tid,'('+(x.sec||secOf(x.tid))+') '+x.t)});
      const cur=$('#rf2').value;
      $('#rf2').innerHTML='<option value="">كل الاختبارات</option>'+[...seen].map(([k,v])=>`<option value="${esc(k)}"${k===cur?' selected':''}>${esc(v)}</option>`).join('');
      draw();
    }catch(e){console.error(e);$('#rtb').innerHTML='<p class="er">تعذر تحميل النتائج — راجع قواعد Firestore</p>'}
  };
  $('#rf1').oninput=draw;$('#rf2').onchange=draw;$('#rf3').onchange=draw;$('#rr').onclick=load;
  $('#rx').onclick=()=>{
    if(!view.length)return toast('لا توجد نتائج للتصدير');
    const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const head=['الطالب','الدورة','الاختبار','النوع','النتيجة %','صحيح','عدد الأسئلة','فارغ','المدة (ثانية)','التاريخ'];
    const lines=[head.map(q).join(',')].concat(view.map(x=>[x.name,x.sec||secOf(x.tid),x.t,x.m==='train'?'تدريب':'محاكي',x.p,x.c,x.n,x.bl||0,x.s??'',x.d].map(q).join(',')));
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download='student-results.csv';document.body.append(a);a.click();a.remove();
  };
  load();
}

/* ========= الإنجليزية (GAT / American) ========= */
const EN_D={'منصة جوده':'Goda Platform','📁 مجلداتي':'📁 My Folders','🔍 بحث':'🔍 Search','👤 ملفي':'👤 Profile','⚙ إدارة':'⚙ Admin','خروج':'Sign out','تابع من حيث توقفت':'Pick up where you left off','متابعة التعلّم ◀':'Continue learning ▶','محاولة':'Attempts','المتوسط':'Average','الأعلى':'Best','سجل المحاولات':'Attempt history','🔗 نسخ رابط النتائج':'🔗 Copy results link','📲 مشاركة عبر واتساب':'📲 Share on WhatsApp','📲 إرسال النتائج لولي الأمر':'📲 Send results to parent','📊 النتائج':'📊 Results','لا توجد محاولات بعد. ابدأ أول اختبار!':'No attempts yet. Start your first test!','الاختبار':'Test','النتيجة':'Score','التاريخ':'Date','المدة':'Duration','صحيح / خطأ / فارغ / مؤجل':'Correct / Wrong / Blank / Flagged','النوع':'Type','تدريب':'Practice','محاكي':'Simulated','دورة المحوسب':'Computerized Course','دورة التأسيس':'Foundation Course','التحصيلي':'Tahsili','المراحل التعليمية':'Educational Stages','تم إكمال الدرس ✓':'Mark lesson complete ✓','إلغاء الإكمال':'Undo complete','🖨 طباعة الاختبار':'🖨 Print test','⏱ اختبار محاكي':'⏱ Simulated Exam','📘 التدريب الإلكتروني':'📘 Online Practice','📘 تدريب إلكتروني':'📘 Online Practice','دقيقة واحدة لكل سؤال':'One minute per question','تحقق فوري من الحل':'Instant answer check','شرح بعد كل سؤال':'Explanation after each question','ابدأ الآن ▶':'Start now ▶','آخر محاولة':'Last attempt','⚡ المميزات':'⚡ Features','ابحث باسماء الدروس':'Search lessons','عدد الأسئلة الكلي':'Total questions','المحلولة':'Answered','غير المحلولة':'Unanswered','تعليمات الاختبار':'Exam Instructions','تعليمات القسم':'Section Instructions','📐 القوانين':'📐 Formulas','إنهاء الاختبار':'Finish Exam','القسم الحالي: الكمي':'Current section: Quantitative','التحقق من الحل':'Check Answer','📁 إضافة إلى مجلد':'📁 Add to folder','🔖 ضع مؤشر كعلامة مرجعية':'🔖 Bookmark','🔖 إلغاء العلامة المرجعية':'🔖 Remove bookmark','السؤال السابق':'Previous','التالي ◀':'Next ▶','حسناً':'OK','تأكيد':'Confirm','إلغاء':'Cancel','لم تقم بحلّ هذا السؤال، هل تريد المتابعة؟':'You have not answered this question. Continue?','هل تريد إنهاء الاختبار وعرض النتيجة؟':'Finish the exam and view the result?','لديك':'You have','سؤال غير محلول. هل تريد إنهاء الاختبار؟':'unanswered question(s). Finish the exam?','✓ حققت الحد الأدنى للنجاح':'✓ You reached the passing score','صحيح':'Correct','خطأ':'Wrong','فارغ':'Blank','أعد المحاولة':'Try again','🖨 طباعة النتيجة':'🖨 Print result','العودة للدورة':'Back to course','مراجعة الإجابات':'Review answers','لم تجب':'Not answered','إجابة صحيحة ✓':'Correct answer ✓','إجابة خاطئة':'Wrong answer','لم تختر إجابة.':'No answer selected.','المميزات':'Features','إغلاق':'Close','ملفات الدرس':'Lesson files','📎 ملفات الدرس':'📎 Lesson files','تعذر الحفظ — تحقق من الاتصال':'Could not save — check your connection','لا توجد أسئلة':'No questions','أُضيف إلى «':'Added to «','الصحيح:':'Correct:'};
const EN_R=[[/^تقدمك (\d+)%$/,'Your progress $1%'],[/^مرحباً (.+)$/,'Welcome $1'],[/^(\d+) سؤال$/,'$1 questions'],[/^عدد (\d+) سؤال$/,'$1 questions'],[/^الاختبار — (\d+) سؤال$/,'Test — $1 questions'],[/^الحد الأدنى (\d+)%$/,'Minimum $1%'],[/^السؤال رقم (\d+)$/,'Question $1'],[/^مجموع الأسئلة في الاختبار (\d+)$/,'Total questions in the test: $1'],[/^(\d+) صحيحة من (\d+)$/,'$1 correct out of $2'],[/^لم تصل للحد الأدنى \((\d+)%\) — أعد المحاولة$/,'Below the passing score ($1%) — try again'],[/^إجابتك: لم تجب$/,'Your answer: not answered'],[/^إجابتك: /,'Your answer: '],[/^الصحيح: /,'Correct: '],[/^الإجابة الصحيحة: /,'Correct answer: '],[/^📘 تدريب إلكتروني$/,'📘 Online Practice']];
function tx(k){if(EN_D[k])return EN_D[k];for(const[r,v]of EN_R)if(r.test(k))return k.replace(r,v);return null}
function trNode(n){
  if(n.nodeType===3){const o=n.nodeValue,k=o.trim();if(!k)return;const v=tx(k);if(v){if(n._o===undefined)n._o=o;n.nodeValue=o.replace(k,()=>v)}}
  else if(n.nodeType===1){['placeholder','title','aria-label'].forEach(a=>{const v=n.getAttribute(a),t=v&&tx(v);if(t)n.setAttribute(a,t)});n.childNodes.forEach(trNode)}
}

/* ========= العلم الأمريكي المرفرف ========= */
let usRAF=0,usCv=null;
function usFlagOn(){
  if(usCv)return;
  const cv=document.createElement('canvas');cv.id='usflag';document.body.prepend(cv);usCv=cv;
  const tex=document.createElement('canvas');tex.width=760;tex.height=400;const t=tex.getContext('2d');
  for(let i=0;i<13;i++){t.fillStyle=i%2?'#ffffff':'#b22234';t.fillRect(0,i*400/13,760,400/13+1)}
  t.fillStyle='#3c3b6e';t.fillRect(0,0,304,400*7/13);t.fillStyle='#fff';
  const star=(x,y,R)=>{t.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,r=k%2?R*.4:R;t.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}t.closePath();t.fill()};
  for(let r=0;r<9;r++){const six=r%2===0,n=six?6:5;for(let c=0;c<n;c++)star((six?c+.5:c+1)*304/6,(r+.6)*(400*7/13)/9.2,7)}
  const ctx=cv.getContext('2d'),SW=3;
  const size=()=>{cv.width=Math.ceil(innerWidth/2);cv.height=Math.ceil(innerHeight/2)};size();addEventListener('resize',size);
  const draw=ts=>{
    const W=cv.width,H=cv.height,amp=H*.04,k=2*Math.PI/(W*.7),m=amp*2;
    ctx.clearRect(0,0,W,H);
    for(let x=0;x<W;x+=SW){
      const ph=x*k-ts*.0022,dy=Math.sin(ph)*amp*(.25+.75*x/W),sh=Math.cos(ph);
      ctx.drawImage(tex,x/W*760,0,SW/W*760,400,x,-m+dy,SW,H+2*m);
      ctx.fillStyle=sh>0?`rgba(255,255,255,${sh*.16})`:`rgba(0,0,0,${-sh*.32})`;ctx.fillRect(x,0,SW,H);
    }
  };
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last=0;const loop=ts=>{usRAF=requestAnimationFrame(loop);if(document.hidden||ts-last<33)return;last=ts;draw(ts)};
  if(still)draw(1500);else usRAF=requestAnimationFrame(loop);
}
function usFlagOff(){cancelAnimationFrame(usRAF);if(usCv){usCv.remove();usCv=null}}

function applyLang(){
  const en=isEN(),h=document.documentElement;h.lang=en?'en':'ar';h.dir=en?'ltr':'rtl';h.classList.toggle('us',en);en?usFlagOn():usFlagOff();
  const w=document.createTreeWalker(document.body,4);let n;
  while(n=w.nextNode()){if(en)trNode(n);else if(n._o!==undefined){n.nodeValue=n._o;n._o=undefined}}
  if(en)trNode(document.body);
}
new MutationObserver(ms=>{if(isEN())ms.forEach(m=>m.addedNodes.forEach(trNode))}).observe(document.body,{childList:true,subtree:true});


/* ========= مراجعة حل طالب (للمدير) ========= */
let RV_HINT=null;
async function reviewPage(h){
  if(!S.isAdmin){location.hash='#/';return}
  const [,uid,rid]=h.split('/'),back='<a class="btn sm" href="#/results">◀ نتائج الطلاب</a>';
  app.innerHTML='<div class="card"><p class="mut">جارٍ تحميل محاولة الطالب...</p></div>';
  let all;
  try{
    const sn=await getDocs(collection(db,'users',uid,'results'));
    all=sn.docs.map(d=>({...d.data(),_id:d.id})).sort((a,b)=>(b.ts?.seconds||0)-(a.ts?.seconds||0));
  }catch(e){console.error(e);app.innerHTML='<div class="card"><p class="er">تعذر تحميل المحاولة — راجع قواعد Firestore</p>'+back+'</div>';return}
  if(!all.length){app.innerHTML='<div class="card"><p class="mut">لا توجد محاولات لهذا الطالب.</p>'+back+'</div>';return}
  let r=all.find(x=>x._id===rid);
  if(!r&&RV_HINT)r=all.find(x=>x.tid===RV_HINT.tid&&x.p===RV_HINT.p)||all.find(x=>x.tid===RV_HINT.tid);
  r=r||all[0];RV_HINT=null;
  const det=Array.isArray(r.det)?r.det:null;
  const st=q=>q.s==null?'bl':q.s===q.a?'ok':'no';
  const cnt={ok:0,no:0,bl:0};(det||[]).forEach(q=>cnt[st(q)]++);
  let flt='all';
  const draw=()=>{
    const pass=r.p>=PASS[r.m==='train'?'train':'exam'];
    app.innerHTML=`<div class="qh"><div><h2>🔍 مراجعة حل الطالب</h2><p class="mut">${esc(r.name||'—')} — ${esc(r.t)}</p></div><div class="row" style="flex-wrap:wrap">${back}<button class="btn ok sm" id="rvp">🖨 طباعة</button></div></div>
    <div class="card" style="margin:12px 0"><div class="grid g4"><div class="card stat"><b style="color:var(--${pass?'ok':'bad'})">${r.p}%</b>النتيجة</div><div class="card stat"><b style="color:var(--ok)">${det?cnt.ok:r.c}</b>صحيح</div><div class="card stat"><b style="color:var(--bad)">${det?cnt.no:(r.n-r.c-(r.bl||0))}</b>خطأ</div><div class="card stat"><b>${det?cnt.bl:(r.bl||0)}</b>فارغ</div></div>
    <p class="mut sm" style="margin-top:10px">${esc(r.sec||secOf(r.tid))} • ${r.m==='train'?'تدريب':'محاكي'} • ${r.s!=null?'المدة '+fmtDur(r.s)+' • ':''}${esc(r.d||'')}</p>
    ${all.length>1?`<select class="inp" id="rvs" style="width:100%;margin-top:6px">${all.map(x=>`<option value="${esc(x._id)}" ${x._id===r._id?'selected':''}>${esc(x.t)} — ${x.p}% — ${esc(x.d||'')}</option>`).join('')}</select>`:''}</div>
    ${det?`<div class="card" style="margin-bottom:12px"><div class="row" style="flex-wrap:wrap;gap:6px">${det.map((q,k)=>`<button class="rvj ${st(q)}" data-j="${k}" title="سؤال ${k+1}">${k+1}</button>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap;margin-top:10px"><button class="btn sm fbt all ${flt==='all'?'on':''}" data-f="all">الكل (${det.length})</button><button class="btn sm fbt no ${flt==='no'?'on':''}" data-f="no">الأخطاء فقط (${cnt.no})</button><button class="btn sm fbt bl ${flt==='bl'?'on':''}" data-f="bl">لم يُجب (${cnt.bl})</button></div></div>
    ${det.map((q,k)=>({q,k})).filter(x=>flt==='all'||st(x.q)===flt).map(({q,k})=>`<div class="card rvq ${st(q)}" id="rvq${k}"><div class="qh"><b>السؤال ${k+1}</b><span class="rb ${st(q)==='ok'?'ok':st(q)==='no'?'bad':''}">${st(q)==='ok'?'✓ صحيح':st(q)==='no'?'✕ خطأ':'— لم يُجب'}</span></div>
      ${q.img?`<img class="qi2" data-q="${esc(q.id)}" alt="">`:''}${q.q?`<p>${mt(q.q)}</p>`:''}
      ${q.o.map((o,j)=>`<div class="rvo ${j===q.a?'ok':''} ${j===q.s&&j!==q.a?'no':''}"><b>${L[j]}</b><span>${o?mt(o):''}</span><small>${j===q.a?'✓ الإجابة الصحيحة':''}${j===q.s?(j===q.a?' • اختيار الطالب':'✕ اختيار الطالب'):''}</small></div>`).join('')}
      ${q.s==null?'<p class="mut sm" style="margin-top:8px">لم يجب الطالب عن هذا السؤال.</p>':''}${q.e?`<p class="mut" style="margin-top:8px">💡 ${mt(q.e)}</p>`:''}</div>`).join('')||'<div class="card"><p class="mut">لا توجد أسئلة في هذا الفلتر.</p></div>'}`
    :'<div class="card"><p class="mut">لا تتوفر تفاصيل الإجابات لهذه المحاولة (محاولة قديمة حُفظت قبل تفعيل ميزة المراجعة). المحاولات الجديدة ستظهر هنا بالتفصيل.</p></div>'}`;
    $('#rvp').onclick=()=>window.print();
    const sl=$('#rvs');if(sl)sl.onchange=()=>{location.hash='#/rv/'+uid+'/'+sl.value};
    document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{flt=b.dataset.f;draw()});
    document.querySelectorAll('[data-j]').forEach(b=>b.onclick=()=>{if(flt!=='all'&&st(det[+b.dataset.j])!==flt){flt='all';draw()}const el=$('#rvq'+b.dataset.j);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),2000)}});
    fillImgs();
  };
  draw();
}

/* ========= جرس التنبيهات (للمدير) ========= */
let bellUnsub=null,bellFirst=true,NOTIFS=[];
const nWhen=n=>n.ts&&n.ts.toDate?n.ts.toDate().toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'}):'';
const nText=n=>n.type==='join'?`<b>${esc(n.name||'—')}</b> يطلب الانضمام إلى ${esc(trName(n.track))}`:`<b>${esc(n.name||'—')}</b> أنهى «${esc(n.test||'')}» — ${esc(n.p)}% (${n.m==='train'?'تدريب':'محاكي'})`;
function drawBell(){
  const un=NOTIFS.filter(n=>!n.read).length,b=$('#bdg'),m=$('#bellm');if(!b||!m)return;
  b.hidden=!un;b.textContent=un>99?'99+':un;
  m.innerHTML=`<div class="qh" style="margin:4px 8px 8px"><b>🔔 التنبيهات</b><span class="row"><button class="btn g sm" id="bra" ${un?'':'disabled'}>تعليم الكل كمقروء</button><button class="btn g sm" id="bcl" ${NOTIFS.length?'':'disabled'}>مسح الكل</button></span></div>`+
   (NOTIFS.length?NOTIFS.map(n=>`<button class="bn ${n.read?'':'new'}" data-n="${n.id}"><span style="font-size:1.3rem">${n.type==='join'?'👤':'📝'}</span><span><span>${nText(n)}</span><small>${esc(nWhen(n))} — ${n.type==='join'?'اضغط لفتح طلبات الانضمام':'اضغط لمراجعة حل الطالب ◀'}</small></span></button>`).join(''):'<p class="mut" style="text-align:center;padding:16px">لا توجد تنبيهات</p>');
  m.querySelector('#bra').onclick=async()=>{try{const bt=writeBatch(db);NOTIFS.filter(n=>!n.read).forEach(n=>bt.update(doc(db,'notifications',n.id),{read:true}));await bt.commit()}catch(e){toast('تعذر التنفيذ')}};
  m.querySelector('#bcl').onclick=async()=>{try{const bt=writeBatch(db);NOTIFS.forEach(n=>bt.delete(doc(db,'notifications',n.id)));await bt.commit()}catch(e){toast('تعذر التنفيذ')}};
  m.querySelectorAll('[data-n]').forEach(x=>x.onclick=async()=>{
    const n=NOTIFS.find(y=>y.id===x.dataset.n);if(!n)return;
    m.hidden=true;
    if(!n.read)updateDoc(doc(db,'notifications',n.id),{read:true}).catch(()=>{});
    let to='#/results';
    if(n.type==='join'){LS.set('adm_tab','students');to='#/admin'}
    else if(n.uid){RV_HINT={tid:n.tid,p:n.p};to='#/rv/'+n.uid+'/'+(n.rid||'-')}
    if(location.hash===to)route();else location.hash=to;
  });
}
function startBell(){
  stopBell();bellFirst=true;
  bellUnsub=onSnapshot(query(collection(db,'notifications'),orderBy('ts','desc'),limit(50)),sn=>{
    NOTIFS=sn.docs.map(d=>({id:d.id,...d.data()}));
    if(!bellFirst){
      let any=false;
      sn.docChanges().forEach(c=>{if(c.type==='added'&&!c.doc.metadata.hasPendingWrites){any=true;const d=c.doc.data();toast(d.type==='join'?'🔔 طلب انضمام جديد من '+(d.name||''):'📝 '+(d.name||'')+' أنهى «'+(d.test||'')+'» — '+d.p+'%')}});
      const bl=$('#bell');if(any&&bl){bl.classList.remove('bring');void bl.offsetWidth;bl.classList.add('bring')}
    }
    bellFirst=false;drawBell();
  },e=>console.warn('bell',e));
}
function stopBell(){if(bellUnsub){bellUnsub();bellUnsub=null}NOTIFS=[];const m=$('#bellm');if(m){m.hidden=true;m.innerHTML=''}const b=$('#bdg');if(b)b.hidden=true}
$('#bell').onclick=e=>{e.stopPropagation();const m=$('#bellm');m.hidden=!m.hidden};
document.addEventListener('click',e=>{const m=$('#bellm');if(m&&!m.hidden&&!e.composedPath().includes(m)&&!e.target.closest('#bell'))m.hidden=true});

/* ========= روابط الاختبارات للزوّار + تقرير ولي الأمر ========= */
const base=()=>location.href.split('#')[0];
const tlink=id=>base()+'#/t/'+encodeURIComponent(id);
const hashTid=()=>{const p=location.hash.split('/');return p[1]==='t'?decodeURIComponent(p[2]||''):''};
const itemById=id=>{for(const k of Object.keys(COURSES)){const x=COURSES[k].groups.flatMap(g=>g.items).find(i=>i.id===id);if(x)return x}return null};
async function copyText(t){
  try{await navigator.clipboard.writeText(t)}
  catch(e){const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.append(a);a.select();try{document.execCommand('copy')}catch(x){}a.remove()}
  toast('تم نسخ الرابط ✓');
}
const waUrl=t=>'https://wa.me/?text='+encodeURIComponent(t);
const openWA=t=>window.open(waUrl(t),'_blank','noopener');
/* الاختبار لا يُفتح للزوّار إلا إذا فعّلت مشاركته (حقل shared في وثيقة الاختبار) */
async function setShared(id,on){
  try{await setDoc(doc(db,'tests',id),{shared:!!on},{merge:true});S.sh[id]=!!on;if(typeof window.__tl==='function')window.__tl();return true}
  catch(e){console.error(e);toast('تعذّر تغيير حالة المشاركة — تحقق من قواعد Firestore');return false}
}
async function copyTestLink(id){if(await setShared(id,true))copyText(tlink(id))}
async function shareTestWA(id){
  const w=window.open('','_blank'); /* نفتح النافذة فوراً حتى لا يحجبها المتصفح */
  if(!await setShared(id,true)){if(w)w.close();return}
  const it=itemById(id),msg=`📝 ${it?it.t:'اختبار'}\nاختبر نفسك على منصة جوده (بدون الحاجة لتسجيل دخول):\n${tlink(id)}`;
  if(w){w.opener=null;w.location.href=waUrl(msg)}else openWA(msg);
}
async function stopShare(id){if(await setShared(id,false))toast('أُوقفت مشاركة الاختبار ✓')}

/* زائر: يدخل برابط الاختبار ويكتب اسمه فقط (تسجيل مجهول Anonymous في Firebase) */
async function loadGuest(){
  S.err='';S.tests={};S.media={};S.res=[];S.done={};S.folders={};
  try{
    await loadStructure();
    if(S.gTid){
      const s=await getDoc(doc(db,'tests',S.gTid));
      if(s.exists()){const x=s.data();S.tests[S.gTid]=x.qs||[];S.gMeta=x.meta||null;if(x.meta&&x.meta.trk)discoverTests([[S.gTid,x.meta]])}
    }
  }catch(e){S.err=e.code==='permission-denied'?'هذا الاختبار غير متاح عبر الرابط (لم تُفعَّل مشاركته أو أُوقفت). تواصل مع المعلّم.':e.message;console.error(e)}
  /* نستعيد محاولات الزائر السابقة ورمز تقريره، حتى لا يستبدل تقرير ولي الأمر بنتائج هذه الجلسة فقط */
  S.shareTok=LS.get('rtok')||'';
  try{if(S.user)S.res=(await getDocs(collection(db,'users',S.user.uid,'results'))).docs.map(d=>d.data()).sort((a,b)=>(a.ts?.seconds||0)-(b.ts?.seconds||0))}catch(e){console.warn('guest results',e)}
}
const guestErr=e=>({
  'auth/operation-not-allowed':'فعّل تسجيل الدخول المجهول (Anonymous) من لوحة Firebase ← Authentication ← Sign-in method.',
  'auth/admin-restricted-operation':'تسجيل الدخول المجهول (Anonymous) غير مفعّل. فعّله من Firebase ← Authentication ← Sign-in method ← Anonymous ثم Save.',
  'auth/unauthorized-domain':'نطاق الموقع غير مسموح. أضِفه في Firebase ← Authentication ← Settings ← Authorized domains.',
  'auth/network-request-failed':'تحقق من اتصال الإنترنت ثم أعد فتح الرابط.'
}[e&&e.code]||(/referer|api.?key/i.test((e&&(e.code+' '+e.message))||'')?'مفتاح Firebase API مقيَّد. أضِف نطاق الموقع في Google Cloud ← APIs & Services ← Credentials ← قيود HTTP referrer.':'تعذّر فتح الاختبار. راجع الرمز أدناه وأرسله للمطوّر.'));
async function sharedRoute(){
  const p=location.hash.split('/'),tid=decodeURIComponent(p[2]||''),md=p[3]==='train'?'train':p[3]==='exam'?'exam':'';
  if(!tid){location.hash='#/';return}
  S.gTid=tid;
  if(!S.user){
    app.innerHTML='<p class="mut" style="text-align:center;margin-top:80px">جارٍ فتح الاختبار...</p>';
    try{await signInAnonymously(auth)}
    catch(e){console.error(e);app.innerHTML='<div class="card login"><span class="lg" role="img" aria-label="شعار منصة جوده"></span><h2>تعذّر فتح الاختبار</h2><p class="er">'+guestErr(e)+'</p><p class="mut sm" dir="ltr" style="margin-top:8px">'+esc(e.code||e.message||'')+'</p></div>'}
    return;
  }
  if(!S.guest&&!S.tests[tid]){
    try{const s=await getDoc(doc(db,'tests',tid));if(s.exists()){const x=s.data();S.tests[tid]=x.qs||[];S.gMeta=x.meta||null;if(x.meta&&x.meta.trk)discoverTests([[tid,x.meta]])}}catch(e){console.warn(e)}
  }
  sharedLanding(tid,md);
}
function sharedLanding(tid,md){
  const tk=trackOfItem(tid);if(tk)CUR_TRACK=tk;
  applyLang();
  const it=itemById(tid)||{id:tid,t:(S.gMeta&&S.gMeta.t)||'اختبار'},qs=getQs(tid),n=qs.length;
  app.innerHTML=`<div class="card login"><span class="lg" role="img" aria-label="شعار منصة جوده"></span><h2>${esc(it.t)}</h2>
  ${S.err&&!n?'':`<p class="mut">${n?n+' سؤال':'لا توجد أسئلة في هذا الاختبار بعد'}</p>`}
  ${S.guest?`<input id="gnm" placeholder="اكتب اسمك ليظهر في الاختبار" autocomplete="name" maxlength="40" value="${esc(S.name||LS.get('gname')||'')}">`:`<p class="mut">مرحباً ${esc(S.name)}</p>`}
  <p class="er" id="er">${S.err?esc(S.err):''}</p>
  ${n?`<div class="row" style="justify-content:center;flex-wrap:wrap;margin-top:6px">${md!=='train'?'<button class="btn" id="g1">⏱ ابدأ الاختبار</button>':''}${md!=='exam'?'<button class="btn ok" id="g2">📘 ابدأ التدريب</button>':''}</div>`:''}</div>`;
  const go=m=>{
    if(S.guest){const nm=$('#gnm').value.trim();if(nm.length<2)return $('#er').textContent='اكتب اسمك (حرفان على الأقل)';S.name=nm;LS.set('gname',nm)}
    startQuiz(it,qs,m);
  };
  if($('#g1'))$('#g1').onclick=()=>go('exam');
  if($('#g2'))$('#g2').onclick=()=>go('train');
}

/* تقرير ولي الأمر: رابط عام يعرض نتائج الطالب فقط (بدون تسجيل دخول) */
const newTok=()=>{try{const a=new Uint8Array(22);crypto.getRandomValues(a);return[...a].map(x=>(x%36).toString(36)).join('')}catch(e){return uid()+uid()+uid()}};
async function syncReport(){
  if(!S.shareTok||!S.user)return false;
  const items=S.res.slice(-200).map(x=>({t:x.t||'',tid:x.tid||'',sec:x.sec||'',m:x.m||'',p:+x.p||0,c:+x.c||0,n:+x.n||0,bl:+x.bl||0,fg:+x.fg||0,s:x.s==null?0:+x.s,d:x.d||''}));
  try{await setDoc(doc(db,'reports',S.shareTok),{uid:S.user.uid,name:S.name||'',items,ts:serverTimestamp()});return true}
  catch(e){console.warn('report',e);return false}
}
async function shareReport(how){
  if(!S.res.length)return toast('لا توجد نتائج لمشاركتها بعد');
  const w=how==='wa'?window.open('','_blank'):null; /* نفتح النافذة فوراً حتى لا يحجبها المتصفح */
  if(!S.shareTok){
    S.shareTok=(S.guest&&LS.get('rtok'))||newTok();
    if(S.guest)LS.set('rtok',S.shareTok);else await saveUser({shareTok:S.shareTok});
  }
  if(!await syncReport()){if(w)w.close();return toast('تعذّر إنشاء رابط النتائج — انشر قواعد Firestore الخاصة بمجموعة reports')}
  const link=base()+'#/r/'+S.shareTok,msg=`📊 نتائج ${S.name} في منصة جوده:\n${link}`;
  if(how!=='wa')return copyText(link);
  if(w){w.opener=null;w.location.href=waUrl(msg)}else openWA(msg);
}
async function reportPage(tok){
  CUR_TRACK='computerized';applyLang();
  app.innerHTML='<div class="card"><p class="mut">جارٍ تحميل النتائج...</p></div>';
  let d=null;
  try{if(tok){const s=await getDoc(doc(db,'reports',tok));d=s.exists()?s.data():null}}
  catch(e){console.error(e);app.innerHTML='<div class="card"><p class="er">تعذّر تحميل النتائج. تحقق من الاتصال ثم أعد المحاولة.</p></div>';return}
  if(!d){app.innerHTML='<div class="card login"><span class="lg" role="img" aria-label="شعار منصة جوده"></span><h2>الرابط غير صالح</h2><p class="mut">لم نجد نتائج لهذا الرابط.</p></div>';return}
  const r=Array.isArray(d.items)?d.items:[],{a,b}=statBox(r),g=new Map();
  r.forEach(x=>{const k=x.tid||x.t,o=g.get(k)||{t:x.t,sec:x.sec,n:0,best:0,last:x};o.n++;o.best=Math.max(o.best,x.p);o.last=x;g.set(k,o)});
  const when=d.ts&&d.ts.toDate?d.ts.toDate().toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'}):'';
  const col=p=>`var(--${p>=PASS.exam?'ok':'bad'})`;
  app.innerHTML=`<div class="card score"><span class="lg" style="margin:0 auto 10px" role="img" aria-label="شعار منصة جوده"></span><h2>نتائج الطالب: ${esc(d.name||'—')}</h2><p class="mut">منصة جوده${when?' — آخر تحديث: '+esc(when):''}</p></div><br>
  <div class="grid g3"><div class="card stat"><b>${r.length}</b>محاولة</div><div class="card stat"><b>${a}%</b>المتوسط</div><div class="card stat"><b>${b}%</b>الأعلى</div></div><br>
  <div class="card"><h3>النتائج حسب الاختبار</h3>${g.size?`<div style="overflow-x:auto"><table><tr><th>الاختبار</th><th>القسم</th><th>المحاولات</th><th>الأعلى</th><th>آخر نتيجة</th><th>التاريخ</th></tr>${[...g.values()].map(o=>`<tr><td>${esc(o.t)}</td><td>${esc(o.sec||'')}</td><td>${o.n}</td><td><b style="color:${col(o.best)}">${o.best}%</b></td><td><b style="color:${col(o.last.p)}">${o.last.p}%</b></td><td>${esc(o.last.d||'')}</td></tr>`).join('')}</table></div>`:'<p class="mut">لا توجد محاولات بعد.</p>'}</div><br>
  <div class="card"><h3>آخر المحاولات</h3>${r.length?resTable(r):'<p class="mut">لا توجد محاولات بعد.</p>'}</div>`;
}

/* ========= البدء ========= */
{const d=document.createElement('div');d.id='bgd';const g='٠٢٣٤٥٦٧٨٩±√π%';
 for(let i=0;i<14;i++){const s=document.createElement('span');s.textContent=g[Math.floor(Math.random()*g.length)];
  s.style.cssText=`left:${Math.random()*96}%;top:${Math.random()*92}%;font-size:${28+Math.random()*56}px;--t:${10+Math.random()*10}s;--d:${-Math.random()*10}s`;d.append(s)}
 document.body.prepend(d)}
theme();
if(!ready){
  app.innerHTML=`<div class="card"><h2>🔧 الإعداد مطلوب</h2><p class="mut">افتح الملف وضع إعدادات مشروعك في <b>firebaseConfig</b> أعلى السكربت، ثم أعد التحميل.</p></div>`;
}else{
  app.innerHTML='<p class="mut" style="text-align:center;margin-top:80px">جارٍ التحميل...</p>';
  onAuthStateChanged(auth,async u=>{
    S.user=u;S.isAdmin=!!u&&u.uid===ADMIN_UID;S.guest=!!u&&u.isAnonymous;stopBell();
    document.body.classList.toggle('guest',S.guest);
    if(S.guest){S.approved=true;S.gTid=S.gTid||hashTid();S.name=LS.get('gname')||'';await loadGuest()}
    else if(u){await loadAll();applyAccent(S.accent);if(S.isAdmin)startBell()}
    S.pending='';route();
  });
}
