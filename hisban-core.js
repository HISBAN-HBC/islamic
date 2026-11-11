/* HISBAN Core 1.0.0 — FROZEN. Shared by «ساعة حُسبان» (HISBAN Clock 1.0) and «ملاحة حُسبان» (HISBAN Navigation).
   Pure solar/geodesy math, formatting, storage and the compass sensor. No page layout here.
   Rule: do not change the names or behaviour below without publishing a new core version. */
const HISBAN_CORE_VERSION="1.0.0";

/* ---------- constants & storage ---------- */
const rad=Math.PI/180,deg=180/Math.PI;
const M_PER_DEG=111320;            // 40,075 km / 360°
const EARTH_R=6371008.8;           // mean radius (m)
const KAABA=[21.4225,39.8262];
const devTz=-new Date().getTimezoneOffset()/60;
const $=id=>document.getElementById(id);
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const BASE_CITIES=[
 ["الجزائر العاصمة",36.7538,3.0588,1],["وهران",35.6971,-0.6308,1],["قسنطينة",36.365,6.6147,1],["عنابة",36.9,7.7667,1],
 ["سطيف",36.19,5.41,1],["تبسة",35.4042,8.1242,1],["بسكرة",34.85,5.73,1],["غرداية",32.49,3.67,1],["ورقلة",31.9493,5.325,1],
 ["بشار",31.6238,-2.2162,1],["تندوف",27.6711,-8.1474,1],["تمنراست",22.785,5.5228,1],["مكة المكرمة",21.4225,39.8262,3]];

/* ---------- position fix (each app passes its own storage key) ----------
   fix = {lat,lon,acc,t,src:"gps"|"manual", dx,dy (m east/north since fix), dist, steps, unk, veh} */
function loadFix(key){const f=store.get(key||"hisban-fix");return f&&isFinite(f.lat)&&isFinite(f.lon)?f:null}
function fixPos(f){if(!f)return null;return[f.lat+(f.dy||0)/M_PER_DEG,f.lon+(f.dx||0)/(M_PER_DEG*Math.cos(f.lat*rad))]}
const freshFix=(lat,lon,acc,src)=>({lat,lon,acc,t:Date.now(),src,dx:0,dy:0,dist:0,steps:0,unk:0,veh:0});

/* ---------- solar engine (analytic, offline) ---------- */
function localNow(tz){const d=new Date(Date.now()+tz*3600e3);return{d,h:d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600}}
function sun(d,lat,lon,tz){
  const day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),12-tz);
  const n=day/864e5+2440587.5-2451545;
  const L=(280.46+.9856474*n)%360,g=(357.528+.9856003*n)*rad;
  const lam=(L+1.915*Math.sin(g)+.02*Math.sin(2*g))*rad,eps=(23.439-4e-7*n)*rad;
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam))*deg;
  let e=L-((ra+360)%360);e=((e+540)%360)-180; // equation of time (deg), wrapped
  const noon=12-lon/15-e*4/60+tz;
  const ha=h=>{const c=(Math.sin(h*rad)-Math.sin(lat*rad)*Math.sin(dec))/(Math.cos(lat*rad)*Math.cos(dec));return Math.acos(Math.max(-1,Math.min(1,c)))*deg/15};
  return{dec,noon,rise:noon-ha(-.833),set:noon+ha(-.833)};
}
function altAz(h,S,lat){
  const H=(h-S.noon)*15*rad,la=lat*rad;
  const alt=Math.asin(Math.sin(la)*Math.sin(S.dec)+Math.cos(la)*Math.cos(S.dec)*Math.cos(H))*deg;
  const az=(Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(la)-Math.tan(S.dec)*Math.cos(la))*deg+180)%360;
  return{alt,az};
}
function sunAt(lat,lon,tz){const {d,h}=localNow(tz);return altAz(h,sun(d,lat,lon,tz),lat)}
function riseAz(dec,lat){const h0=-.833*rad,c=(Math.sin(dec)-Math.sin(lat*rad)*Math.sin(h0))/(Math.cos(lat*rad)*Math.cos(h0));return Math.abs(c)>1?null:Math.acos(c)*deg}
const husban=(t,rise)=>((t-rise)*15%360+360)%360;               // 15° per hour from sunrise
function dialA(t,S){const dl=S.set-S.rise;const x=((t-S.rise)%24+24)%24;return x<dl?180*x/dl:180+180*(x-dl)/(24-dl)} // top=sunrise, right=midday, bottom=sunset, left=midnight
const moonIllum=()=>{const ph=((Date.now()-Date.UTC(2000,0,6,18,14))/864e5/29.530588%1+1)%1;return(1-Math.cos(2*Math.PI*ph))/2};

/* ---------- geodesy ---------- */
function bearing(la1,lo1,la2,lo2){const p1=la1*rad,p2=la2*rad,dl=(lo2-lo1)*rad;
  return(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*deg+360)%360}
function distM(la1,lo1,la2,lo2){const p1=la1*rad,p2=la2*rad,dp=p2-p1,dl=(lo2-lo1)*rad;
  const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*EARTH_R*Math.asin(Math.min(1,Math.sqrt(a)))}
const DIRS=["شمال","شمال شرق","شرق","جنوب شرق","جنوب","جنوب غرب","غرب","شمال غرب"];
const dirName=a=>DIRS[Math.round(((a%360)+360)%360/45)%8];

/* ---------- formatting ---------- */
const pad2=n=>String(n).padStart(2,"0");
const fmt=h=>{h=((h%24)+24)%24;let m=Math.round(h*60)%1440;return pad2(Math.floor(m/60))+":"+pad2(m%60)};
const fmtS=h=>{h=((h%24)+24)%24;const s=h*3600,hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),ss=s%60;return pad2(hh)+":"+pad2(mm)+":"+ss.toFixed(4).padStart(7,"0")};
const fmtDist=m=>m<1000?Math.round(m)+" م":(m/1000).toFixed(m<10000?2:1)+" كم";
function fmtAge(ms){const s=ms/1000;if(s<60)return"الآن";if(s<3600)return Math.floor(s/60)+" د";if(s<86400)return Math.floor(s/3600)+" س "+Math.floor(s%3600/60)+" د";return Math.floor(s/86400)+" يوم"}
const median=a=>{const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
function parseCoords(v){const m=String(v).match(/@?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)||String(v).match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);return m?[m[1],m[2]]:null}

/* ---------- compass sensor & true-north correction ---------- */
let heading=null,headingAbs=false,compassOffset=+store.get("hisban-compass")||0;
const ORI_EVT=("ondeviceorientationabsolute" in window)?"deviceorientationabsolute":"deviceorientation";
const oriUsers=new Set();
async function sensorPermission(motion){
  try{
    if(motion&&typeof DeviceMotionEvent!=="undefined"&&typeof DeviceMotionEvent.requestPermission==="function"){if(await DeviceMotionEvent.requestPermission()!=="granted")return false}
    if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){if(await DeviceOrientationEvent.requestPermission()!=="granted")return false}
    return true;
  }catch(e){return false}
}
function onOri(e){
  let h=null;
  if(typeof e.webkitCompassHeading==="number"){h=e.webkitCompassHeading;headingAbs=true}
  else if(e.alpha!=null){h=(360-e.alpha)%360;headingAbs=!!e.absolute||e.type==="deviceorientationabsolute"}
  if(h!=null){const so=(screen.orientation&&screen.orientation.angle)||0;heading=((h+so+compassOffset)%360+360)%360}
}
function oriStart(user){if(!oriUsers.size)addEventListener(ORI_EVT,onOri);oriUsers.add(user)}
function oriStop(user){oriUsers.delete(user);if(!oriUsers.size){removeEventListener(ORI_EVT,onOri);heading=null}}
// Solar constraint: with the top of the phone pointed at the sun, the computed solar azimuth corrects the compass
function calibrateWithSun(s,out){
  if(heading==null){out("لم تصل قراءة البوصلة بعد. حرّك الهاتف قليلًا ثم أعد المحاولة.");return false}
  if(s.alt<2){out("الشمس تحت الأفق أو قريبة منه. المعايرة تحتاج شمسًا ظاهرة.");return false}
  const raw=((heading-compassOffset)%360+360)%360;
  compassOffset=((s.az-raw+540)%360)-180;store.set("hisban-compass",compassOffset);
  out("صُحّحت البوصلة بالشمس: "+(compassOffset>0?"+":"")+compassOffset.toFixed(1)+"°. صارت تشير إلى الشمال الحقيقي.");return true;
}
function checkWithSun(s,out){
  if(heading==null){out("لم تصل قراءة البوصلة بعد.");return null}
  if(s.alt<2){out("الشمس تحت الأفق أو قريبة منه. الفحص يحتاج شمسًا ظاهرة.");return null}
  const dA=((heading-s.az+540)%360)-180,a=Math.abs(dA);
  const v=a<3?"البوصلة سليمة":a<10?"احتمال تشويش مغناطيسي: ابتعد عن السيارة والمعادن وأعد الفحص":"معايرة مطلوبة: اضغط «معايرة بالشمس» والهاتف موجّه نحو الشمس";
  out("الفرق بين البوصلة واتجاه الشمس المحسوب "+(dA>0?"+":"")+dA.toFixed(1)+"°: "+v+". (وجّه أعلى الهاتف نحو الشمس عند الضغط)");
  return dA;
}
