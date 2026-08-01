export const ABSENCE_CATALOG = Object.freeze({
  F: {label:'Ferie', category:'ABS', ccnlRef:'Art. 30', annualLimit:'vacationAnnualHours'},
  FS: {label:'Festività soppresse', category:'ABS', ccnlRef:'Art. 30 c.4', annualLimit:'suppressedHolidayAnnualHours'},
  PR36: {label:'Permesso personale recuperabile', category:'ABS', ccnlRef:'Art. 33', annualLimit:'personalPermitAnnualHours', hourlyOnly:true, requiresRecovery:true, autoRecoveryMonths:2},
  PERM: {label:'Permesso generico (storico)', category:'ABS', ccnlRef:'Art. 34'},
  VIS: {label:'Visita / terapia / esame diagnostico', category:'ABS', ccnlRef:'Art. 34 c.4', requiresRecovery:true},
  STUDIO: {label:'Diritto allo studio', category:'ABS', ccnlRef:'Art. 31'},
  ESAME: {label:'Permesso per esame', category:'ABS', ccnlRef:'Art. 31 / Art. 34'},
  LUTTO: {label:'Lutto', category:'ABS', ccnlRef:'Art. 34', eventRequired:true, maxDays:3, eventWindowDays:7},
  MATR: {label:'Matrimonio', category:'ABS', ccnlRef:'Art. 34', eventRequired:true, maxDays:15},
  GRAVI: {label:'Gravi ragioni documentate', category:'ABS', ccnlRef:'Art. 34', maxDaysAnnual:5},
  PCIV: {label:'Protezione civile', category:'ABS', ccnlRef:'Art. 34'},
  SIND: {label:'Permesso sindacale', category:'ABS', ccnlRef:'Artt. 10-11'},
  RIPALL: {label:'Riposo per allattamento', category:'ABS', ccnlRef:'Art. 78'},
  MALFIG: {label:'Malattia del figlio', category:'ABS', ccnlRef:'Art. 78'},
  'L104/92': {label:'Permesso Legge 104', category:'ABS', ccnlRef:'Art. 34'},
  AVIS: {label:'Permesso AVIS / donazione', category:'ABS', ccnlRef:'Art. 34'},
  CONG: {label:'Congedo parentale', category:'ABS', ccnlRef:'Art. 78'},
  MAL: {label:'Malattia', category:'ABS', ccnlRef:'Art. 43'},
  INF: {label:'Infortunio', category:'ABS', ccnlRef:'Art. 43'},
  A: {label:'Assenza per festività', category:'RC', ccnlRef:'Art. 29'},
  RC: {label:'Riposo compensativo generico', category:'RC', ccnlRef:'Artt. 27-29'},
  RFS: {label:'Recupero festività spettante', category:'RC', ccnlRef:'Art. 29', referenceRequired:true},
  RCF: {label:'Recupero festività lavorata (sigla storica)', category:'RC', ccnlRef:'Art. 29', referenceRequired:true},
  RCD: {label:'Recupero deroga al riposo', category:'RC', ccnlRef:'Art. 27', referenceRequired:true},
  RCB: {label:'Recupero banca ore', category:'RC', ccnlRef:'Art. 56', minHours:4},
  RCP: {label:'Recupero permesso', category:'RC', ccnlRef:'Art. 33', referenceRequired:true}
});

export const ART27_REASONS = Object.freeze([
  {code:'A', label:'Servizio di emergenza-urgenza protratto oltre il turno'},
  {code:'B', label:'Mancata o tardiva presenza del lavoratore montante'},
  {code:'C', label:'Cambio squadra o turno senza riposo completo'},
  {code:'D', label:'Chiamata durante reperibilità'},
  {code:'E', label:'Trasferimento a lunga percorrenza oltre 12 ore'},
  {code:'F', label:'Maxi-emergenza nazionale o internazionale'},
  {code:'G', label:'Grande evento non programmabile in tempi congrui'},
  {code:'H', label:'Attività umanitaria straordinaria'}
]);

export const validDerogationCode = code => ART27_REASONS.some(item => item.code === String(code || '').toUpperCase());
export const absenceMeta = code => ABSENCE_CATALOG[String(code || '').toUpperCase()] || {label:String(code || ''), category:'ABS', ccnlRef:''};
export const absenceLabel = code => absenceMeta(code).label;

export function addDaysKey(day, amount){
  const [y,m,d]=String(day).slice(0,10).split('-').map(Number);
  const date=new Date(y,m-1,d);
  date.setDate(date.getDate()+Number(amount||0));
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function addMonthsKey(day, amount){
  const [y,m,d]=String(day).slice(0,10).split('-').map(Number);
  const date=new Date(y,m-1,d);
  const originalDay=date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth()+Number(amount||0));
  const last=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  date.setDate(Math.min(originalDay,last));
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function easterMondayKey(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  const easter=new Date(year,month-1,day); easter.setDate(easter.getDate()+1);
  return `${year}-${String(easter.getMonth()+1).padStart(2,'0')}-${String(easter.getDate()).padStart(2,'0')}`;
}

export function holidayKeysForYear(year, patronDay=''){
  const fixed=['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'];
  const set=new Set(fixed.map(mmdd=>`${year}-${mmdd}`));
  set.add(easterMondayKey(year));
  if(/^\d{2}-\d{2}$/.test(String(patronDay||'')))set.add(`${year}-${patronDay}`);
  return set;
}

export function dateInRange(day, from='', until=''){
  const key=String(day||'').slice(0,10);
  if(from && key<from)return false;
  if(until && key>until)return false;
  return true;
}

export function daysBetween(a,b){
  const parse=k=>{const [y,m,d]=String(k).slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
  return Math.round((parse(b)-parse(a))/86400000);
}

export function absenceOptionsHtml(selected=''){
  return Object.entries(ABSENCE_CATALOG).map(([code,meta])=>
    `<option value="${code}"${code===selected?' selected':''}>${code} · ${meta.label}</option>`
  ).join('');
}
