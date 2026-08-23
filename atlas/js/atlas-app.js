import {
  APP_VERSION, COMPATIBLE_STORAGE_VERSIONS, CREW_SLOTS,
  ATLAS_SERVER_URL, DEFAULT_SETTINGS, DOW, FALLBACK_EMPLOYEES,
  MONTHS, ORDINARY_CREW_SLOTS, OPERATIONAL_SHIFT_CATALOG,
  crewSlotsForDayShift, operationalShiftMeta
} from './config.js';
import { state } from './state.js';
import {
  loadApplicationSnapshot, readProtectedRecords,
  saveApplicationSnapshot, writeProtectedRecords
} from './persistence.js';
import {
  bootAuthentication, getServerAuthContext, rememberServerUrl,
  setBootLoadingStep, finishBootLoading
} from './auth-protected.js?v=1.0.0-RESET-CANCEL-2322';
import { initSidebarLayout } from './layout.js';
import {
  applyAccessProfile,
  initVolunteerCoverage,
  refreshWorkspace
} from './volunteer-coverage.js?v=1.0.0-BUCHI-UX-1005';
import {
  isValidAppsScriptUrl, loadProtectedSheets,
  saveCalendarPlanToSheet, saveEmployeesToSheet,
  loadSharedSettings, saveSharedSettings,
  approveVolunteerProposalWithPlan
} from './google-sheet-service.js?v=1.0.0-HOTFIX-0012';
import { ABSENCE_CATALOG, ART27_REASONS, absenceMeta, absenceLabel, addDaysKey, addMonthsKey, holidayKeysForYear, dateInRange, daysBetween, validDerogationCode } from './ccnl-rules.js';

(() => {
  'use strict';

  let replacementContext = null;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid = () => (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') ? globalThis.crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const fmt = n => Number(n || 0).toLocaleString('it-IT',{minimumFractionDigits:Number(n)%1?1:0,maximumFractionDigits:2});
  const round2 = n => Math.round(Number(n||0)*100)/100;
  function slug(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  const yes = v => ['SI','SÌ','YES','TRUE','1','X'].includes(String(v??'').trim().toUpperCase());
  function normalizeSesso(v){const s=String(v||'').trim().toUpperCase();if(['M','MASCHIO','UOMO','MALE'].includes(s))return'M';if(['F','FEMMINA','DONNA','FEMALE'].includes(s))return'F';return'';}
  function normalizeEmployee(e){
    const weekly=Number(e.oreSettimanali)||null;
    const rawEndDate=String(e.employmentEndDate||'').slice(0,10);
    const rawEndType=String(e.employmentEndType||'').toUpperCase();
    const employmentEndType=rawEndType==='DATE'||(!rawEndType&&rawEndDate)
      ?'DATE'
      :'INDEFINITE';

    return{
      ...e,
      id:String(e.id||slug(`${e.cognome}-${e.nome}`)),
      turno:normalizeTurno(e.turno),
      sesso:normalizeSesso(e.sesso),
      autista:!!e.autista,
      capo:!!e.capo,
      soccorritore:!!e.soccorritore,
      l104:!!e.l104,
      avis:!!e.avis,
      congedo:!!e.congedo,
      attivo:e.attivo!==false,
      employmentEndType,
      employmentEndDate:employmentEndType==='DATE'?rawEndDate:'',
      oreSettimanali:weekly,
      oreMensili:Number(e.oreMensili)||null,
      vacationAnnualHours:Number(e.vacationAnnualHours)||null,
      suppressedHolidayAnnualHours:Number(e.suppressedHolidayAnnualHours)||null,
      nightRestriction:['NO_NIGHT','ON_REQUEST'].includes(String(e.nightRestriction||'').toUpperCase())?String(e.nightRestriction).toUpperCase():'NONE',
      nightRestrictionFrom:String(e.nightRestrictionFrom||'').slice(0,10),
      nightRestrictionUntil:String(e.nightRestrictionUntil||'').slice(0,10),
      nightRestrictionNote:String(e.nightRestrictionNote||''),
      onCallNightRestricted:!!e.onCallNightRestricted,
      partTime:e.partTime===true||(weekly>0&&weekly<37.5),
      supplementaryConsent:!!e.supplementaryConsent,
      elasticClause:!!e.elasticClause,
      partTimeDays:String(e.partTimeDays||''),
      partTimeShifts:String(e.partTimeShifts||'')
    };
  }
  const isMale = e => normalizeSesso(e?.sesso)==='M';
  const isFemale = e => normalizeSesso(e?.sesso)==='F';
  const employeeName = e => e ? `${e.cognome} ${e.nome}` : 'Dipendente non trovato';
  const assignmentKey = (employeeId,day) => `${employeeId}|${day}`;
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDateKey = k => { const [y,m,d]=String(k).slice(0,10).split('-').map(Number); return new Date(y,m-1,d); };
  const isWeekend = d => d.getDay()===0 || d.getDay()===6;
  const isSunday = d => d.getDay()===0;

  function employeeActiveOn(employee,day){
    if(!employee||employee.attivo===false)return false;
    if(
      employee.employmentEndType==='DATE'&&
      employee.employmentEndDate
    ){
      return String(day||'').slice(0,10)<=employee.employmentEndDate;
    }
    return true;
  }
  function employeeActiveInMonth(employee,month=state.month){
    const first=`${month}-01`;
    return employeeActiveOn(employee,first);
  }
  function employeeVisibleInMonth(employee,month=state.month){
    if(!employee||employee.attivo===false)return false;
    if(
      employee.employmentEndType==='DATE'&&
      employee.employmentEndDate
    ){
      return employee.employmentEndDate>=`${month}-01`;
    }
    return true;
  }
  function activeWorkdaysForEmployee(employee,month=state.month){
    return workdays(month).filter(day=>
      employeeActiveOn(employee,dateKey(day))
    );
  }
  function employeeEmploymentLabel(employee,referenceDay=dateKey(new Date())){
    if(employee?.attivo===false){
      return{
        label:'Anagrafica non attiva',
        className:'ended',
        ended:true
      };
    }
    if(
      employee?.employmentEndType==='DATE'&&
      employee?.employmentEndDate
    ){
      const ended=employee.employmentEndDate<referenceDay;
      return{
        label:`${ended?'Terminato':'Termina'} ${formatDateIt(employee.employmentEndDate)}`,
        className:ended?'ended':'dated',
        ended
      };
    }
    return{
      label:'Fine indeterminata',
      className:'',
      ended:false
    };
  }

  function monthDates(month=state.month){ const [y,m]=month.split('-').map(Number); return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>new Date(y,m-1,i+1)); }
  function monthLabel(month=state.month){ const [y,m]=month.split('-').map(Number); return `${MONTHS[m-1][0].toUpperCase()}${MONTHS[m-1].slice(1)} ${y}`; }
  function workdays(month=state.month){ return monthDates(month).filter(d=>d.getDay()>=1&&d.getDay()<=5); }
  function isoWeek(date){ const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())); const day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d-yearStart)/86400000)+1)/7); }
  function preferredGroup(date,shift){ if(!state.settings.useABRotation || !['M','P'].includes(shift)) return null; const even=isoWeek(date)%2===0; const morning=even?'A':'B'; if(shift==='M') return morning; return morning==='A'?'B':'A'; }

  function normalizeTurno(v){ const s=String(v||'').trim().toLowerCase(); if(['vol','libero','libera'].includes(s)) return 'Libera'; if(['amm','amministrazione'].includes(s)) return 'Amministrazione'; if(s==='rs') return 'RS'; if(s==='ro') return 'RO'; return String(v||'').trim().toUpperCase(); }
  function normalizeHeader(v){ return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_\s]+/g,' '); }
  function parseCsv(text){
    const delimiter = detectDelimiter(text); const rows=[]; let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){ const c=text[i],n=text[i+1]; if(c==='"'){ if(quoted&&n==='"'){cell+='"';i++;} else quoted=!quoted; }
      else if(c===delimiter&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    row.push(cell); if(row.some(x=>String(x).trim()!==''))rows.push(row); return rows;
  }
  function detectDelimiter(text){ const first=String(text).split(/\r?\n/,1)[0]||''; const commas=(first.match(/,/g)||[]).length, semis=(first.match(/;/g)||[]).length, tabs=(first.match(/\t/g)||[]).length; return tabs>commas&&tabs>semis?'\t':semis>commas?';':','; }
  function csvObjects(text){ const rows=parseCsv(text); if(!rows.length)return[]; const headers=rows.shift().map(normalizeHeader); return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()]))); }
  function getField(obj,...names){ for(const n of names){ const k=normalizeHeader(n); if(obj[k]!==undefined && obj[k]!=='') return obj[k]; } return ''; }

  function parseFlexibleDate(value){
    const s=String(value||'').trim(); if(!s)return null;
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    const d=new Date(s); return Number.isNaN(d.getTime())?null:dateKey(d);
  }
  function parseTimeFromDate(value){ const s=String(value||'').trim(); if(!s)return ''; const m=s.match(/(?:T|\s)(\d{1,2}):(\d{2})/); return m?`${String(m[1]).padStart(2,'0')}:${m[2]}`:''; }
  function numeric(v, fallback=0){ const n=Number(String(v??'').replace(',','.')); return Number.isFinite(n)?n:fallback; }
  const SHARED_SETTING_KEYS=[
    'targetHours',
    'minRest',
    'seMin',
    'seMax',
    'seTarget',
    'sePreferredEmployeeId',
    'sePreferredMinDays',
    'sePreferredMaxDays',
    'respMin',
    'respGoal',
    'autoAdmin',
    'autoResponsabili',
    'autoSecondari',
    'useABRotation',
    'allowRoAuto',
    'weeklyStandardHours',
    'weeklyMinHours',
    'weeklyMaxHours',
    'weeklyAverageMax',
    'weeklyRestHours',
    'weeklyRestOccurrences14',
    'annualOvertimeLimit',
    'annualOvertimeExtended',
    'vacationAnnualHours',
    'suppressedHolidayAnnualHours',
    'personalPermitAnnualHours',
    'personalPermitRecoveryMonths',
    'holidayRecoveryDays',
    'bankHoursMinBlock',
    'patronHoliday',
    'enforceNoSplitDay',
    'autoCompensatoryRestDefault'
  ];

  function sharedSettingsPayload(
    source=state.settings
  ){
    const output={};

    SHARED_SETTING_KEYS.forEach(key=>{
      if(
        Object.prototype.hasOwnProperty.call(
          source||{},
          key
        )
      ){
        output[key]=source[key];
      }
    });

    return output;
  }

  function applySharedSettings(
    shared,
    {
      persist=true,
      render=true
    }={}
  ){
    if(
      !shared||
      shared.configured!==true||
      !shared.settings||
      typeof shared.settings!=='object'
    ){
      return false;
    }

    state.settings={
      ...DEFAULT_SETTINGS,
      ...state.settings,
      ...shared.settings,
      matrixCsvUrl:'',
      databaseCsvUrl:'',
      appsScriptUrl:ATLAS_SERVER_URL,
      holidayRecoveryDays:
        Number(
          shared.settings.holidayRecoveryDays
        )||30,
      // Regola strutturale ATLAS: MGSE ordinario sempre 2/2.
      // Un vecchio valore condiviso non deve riattivare il precedente minimo 1.
      seMin:2,
      seMax:2,
      seTarget:2
    };

    state.sharedSettingsUpdatedAt=
      String(shared.updatedAt||'');

    state.sharedSettingsUpdatedBy=
      String(shared.updatedBy||'');

    if(persist){
      saveState();
    }

    if(render){
      renderAll();
    }

    return true;
  }

  let sharedSettingsRefreshBusy=false;
  let lastSharedSettingsCheck=0;

  async function refreshSharedSettings({
    force=false,
    silent=true
  }={}){
    if(sharedSettingsRefreshBusy){
      return false;
    }

    const now=Date.now();

    if(
      !force&&
      now-lastSharedSettingsCheck<30000
    ){
      return false;
    }

    const auth=getServerAuthContext();

    if(
      !auth.token||
      !auth.serverUrl
    ){
      return false;
    }

    sharedSettingsRefreshBusy=true;
    lastSharedSettingsCheck=now;

    try{
      const data=
        await loadSharedSettings({
          url:auth.serverUrl,
          token:auth.token
        });

      const shared=
        data.sharedSettings||null;

      if(
        shared?.configured&&
        String(shared.updatedAt||'')!==
          String(
            state.sharedSettingsUpdatedAt||''
          )
      ){
        applySharedSettings(
          shared,
          {
            persist:true,
            render:true
          }
        );

        if(!silent){
          toast(
            'Impostazioni aggiornate',
            `Regole condivise aggiornate${
              shared.updatedBy
                ?` da ${shared.updatedBy}`
                :''
            }.`,
            'success'
          );
        }

        return true;
      }

      return false;
    }catch(error){
      console.warn(
        'Aggiornamento impostazioni condivise non riuscito:',
        error
      );

      return false;
    }finally{
      sharedSettingsRefreshBusy=false;
    }
  }

  function shiftWindow(type,day,customStart,customEnd){
    const d=parseDateKey(day),dow=d.getDay(); let start='',end='',nextDay=false,hours=0;
    const operational=operationalShiftMeta(type);
    if(customStart&&customEnd){
      start=customStart;end=customEnd;
      const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
      let mins=eh*60+em-(sh*60+sm);
      if(mins<0){mins+=1440;nextDay=true;}
      hours=mins/60;
    }
    else if(operational){
      start=operational.start;
      end=operational.end;
      nextDay=!!operational.nextDay;
      hours=Number(operational.hours||0);
    }
    else if(type==='M'){ if(dow===0){start='08:00';end='14:00';hours=6;} else {start='06:00';end='13:30';hours=7.5;} }
    else if(type==='P'){ if(dow===0){start='14:00';end='20:00';hours=6;} else if(dow===6){start='13:00';end='20:00';hours=7;} else {start='13:00';end='20:30';hours=7.5;} }
    else if(type==='N'){ if(dow===6){start='20:00';end='08:00';hours=12;} else if(dow===0){start='20:00';end='06:00';hours=10;} else {start='20:30';end='06:00';hours=9.5;} nextDay=true; }
    else if(type==='PN'){ if(dow===6){start='13:00';end='08:00';hours=19;} else if(dow===0){start='14:00';end='06:00';hours=16;} else {start='13:00';end='06:00';hours=17;} nextDay=true; }
    else if(type==='MGSE'){start='06:00';end='13:30';hours=7.5;}
    else if(['GRA','GRM','GRS','GRO','RO'].includes(type)){start='08:00';end='17:00';hours=7.5;}
    else if(type==='AM7'){start='08:00';end='15:00';hours=7;}
    else if(type==='AM8,5'){start='08:00';end='17:00';hours=8.5;}
    else if(type==='AM4'){start='08:00';end='12:00';hours=4;}
    return {start,end,nextDay,hours};
  }
  function getDateTime(day,time,nextDay=false){ const d=parseDateKey(day),[h,m]=String(time||'00:00').split(':').map(Number); d.setHours(h||0,m||0,0,0); if(nextDay)d.setDate(d.getDate()+1); return d; }
  function assignmentTimes(a,day){
    if(a.allDay && !a.start && !a.end) return {start:null,end:null,hours:Number(a.hours||0),startText:'giornata',endText:'',timed:false};
    const w=shiftWindow(a.shift||a.type||a.code,day,a.start,a.end); const st=a.start||w.start, en=a.end||w.end;
    if(!st||!en)return {start:null,end:null,hours:Number(a.hours??w.hours??0),startText:'',endText:'',timed:false};
    const next=a.nextDay??w.nextDay; return {start:getDateTime(day,st,false),end:getDateTime(day,en,next),hours:Number(a.hours??w.hours),startText:st,endText:en,timed:true};
  }
  function siteFromCode(code){const rest=String(code||'').toUpperCase().replace(/^(PN|M|P|N)/,'');if(rest.startsWith('SU'))return'SU';if(rest.startsWith('G'))return'G';if(rest.startsWith('S'))return'S';return'';}
  function roleFromCode(code,site){const s=String(code||'').toUpperCase();if(site==='SU')return s.match(/SU([ACS])3?$/)?.[1]||'';return s.match(/([ACS])$/)?.[1]||'';}
  function isOperationalShift(a){return a?.category==='OP'&&!!operationalShiftMeta(a.code||a.type);}
  function operationalCode(a){return String(a?.code||a?.type||'').toUpperCase();}
  function normalizeCode(a){ if(a.category==='118'){const base=a.shift==='PN'?'PN':a.shift;if(a.site==='G')return`${base}G${a.machine}${a.role}`;if(a.site==='SU')return`${base}SU${a.role}`;return`${base}S${a.role}`;} if(isOperationalShift(a))return operationalCode(a); return a.code||a.type||''; }
  function tagClass(a){ if(a.category==='118')return a.shift==='M'?'tag-m':a.shift==='P'?'tag-p':a.shift==='PN'?'tag-pn':'tag-n'; if(isOperationalShift(a)){const tag=operationalShiftMeta(operationalCode(a))?.tag;return tag==='M'?'tag-m':tag==='P'?'tag-p':tag==='N'?'tag-n':'tag-op-g';} if(a.category==='SE')return'tag-se'; if(a.category==='RESP')return'tag-resp'; if(a.category==='AM')return'tag-am'; if(a.category==='FORM')return'tag-form'; if(['RC','REST'].includes(a.category))return'tag-rc'; return'tag-absence'; }
  function sourceLabel(a){ const o=String(a.origin||'MANUALE').toUpperCase(); return o.startsWith('AUTO')?'AUTO':o.startsWith('DATA')||o==='IMPORTATA'?'DB':'MAN'; }

  function getAssignments(employeeId,day){ return state.assignments[assignmentKey(employeeId,day)]||[]; }
  function setAssignments(employeeId,day,items,{dirty=true,render=true}={}){ const k=assignmentKey(employeeId,day); if(items.length)state.assignments[k]=items; else delete state.assignments[k]; if(dirty)state.localDirty=true; saveState(); if(render)renderAll(); }
  function appendTo(employeeId,day,item,{dirty=true,render=false}={}){ const arr=[...getAssignments(employeeId,day),item]; setAssignments(employeeId,day,arr,{dirty,render}); }
  function currentEmployee(){ return state.employees.find(e=>e.id===state.activeCell?.employeeId); }

  function adjacentDayKey(day,offset){
    const d=parseDateKey(day); d.setDate(d.getDate()+offset); return dateKey(d);
  }
  function isNight118(a){ return (a?.category==='118' && ['N','PN'].includes(a.shift)) || (isOperationalShift(a) && !!operationalShiftMeta(operationalCode(a))?.night); }
  function isWorkingAssignment(a){
    const code=String(a?.code||a?.type||'').toUpperCase();
    if(code==='REP')return false;
    return ['118','OP','SE','RESP','AM','FORM','CUSTOM'].includes(a?.category);
  }
  function isLegacyPostNightMarker(item){
    const code=String(
      item?.code||
      item?.type||
      ''
    ).toUpperCase();

    return !!(
      item&&
      code==='SM'&&
      (
        item.postNight===true||
        item.linkedNightId||
        String(item.origin||'')
          .toUpperCase()
          .startsWith('AUTO')
      )
    );
  }
  function purgeLegacyPostNightMarkers(){
    let removed=0;

    const purgeStore=store=>{
      Object.keys(store||{}).forEach(key=>{
        const before=store[key]||[];
        const after=before.filter(
          item=>!isLegacyPostNightMarker(item)
        );

        removed+=before.length-after.length;

        if(after.length){
          store[key]=after;
        }else{
          delete store[key];
        }
      });
    };

    purgeStore(state.assignments);

    Object.values(state.monthPlans||{})
      .forEach(plan=>
        purgeStore(plan?.assignments)
      );

    state.dbRecords=(state.dbRecords||[])
      .filter(record=>{
        const remove=
          !record.requirement&&
          isLegacyPostNightMarker(
            record.item
          );

        if(remove)removed++;
        return !remove;
      });

    return removed;
  }
  function ensurePostNightRest(
    employeeId,
    day,
    nightItem,
    {dirty=false}={}
  ){
    // Dalla Release 1.4.3 non viene creato alcun riposo
    // a giornata intera. Il controllo è esclusivamente
    // temporale: minimo 11 ore tra fine e inizio.
    return false;
  }
  function removeLinkedPostNightRest(
    employeeId,
    nightDay,
    nightItem
  ){
    const next=adjacentDayKey(
      nightDay,
      1
    );
    const key=assignmentKey(
      employeeId,
      next
    );
    const items=getAssignments(
      employeeId,
      next
    );
    const keep=items.filter(
      item=>!isLegacyPostNightMarker(item)
    );

    if(keep.length){
      state.assignments[key]=keep;
    }else{
      delete state.assignments[key];
    }
  }
  function ensureAllPostNightRests(){
    // Nome mantenuto per compatibilità con le chiamate esistenti.
    // Ora elimina gli SM automatici delle versioni precedenti.
    return purgeLegacyPostNightMarkers();
  }

  function initRequirements(){ monthDates().forEach(d=>{const day=dateKey(d); ['M','P','N'].forEach(shift=>{const k=`${day}|${shift}`; if(state.requirements[k]==null){ if(d.getDay()>=1&&d.getDay()<=5&&['M','P'].includes(shift))state.requirements[k]='required'; else if(d.getDay()===6&&['M','P'].includes(shift))state.requirements[k]='required'; else state.requirements[k]='conditional'; }});}); }
  function recalcDefaultTarget(){ state.settings.targetHours=round2(workdays().length*7.6); }

  function isProtectedCalendarRecord(a){
    return !!a && (a.category==='ABS' || a.category==='RC');
  }
  function syncProtectedRecordsForCurrentMonth(){
    const store=readProtectedRecords();
    Object.keys(store).forEach(key=>{const day=key.slice(key.lastIndexOf('|')+1);if(day.startsWith(state.month))delete store[key];});
    Object.entries(state.assignments).forEach(([key,items])=>{
      const day=key.slice(key.lastIndexOf('|')+1);if(!day.startsWith(state.month))return;
      const protectedItems=(items||[]).filter(isProtectedCalendarRecord);
      if(protectedItems.length)store[key]=protectedItems;
    });
    writeProtectedRecords(store);
  }
  function restoreProtectedRecordsForCurrentMonth(){
    const store=readProtectedRecords();
    Object.entries(store).forEach(([key,items])=>{
      const day=key.slice(key.lastIndexOf('|')+1);if(!day.startsWith(state.month))return;
      const current=[...(state.assignments[key]||[])],ids=new Set(current.map(a=>a.id));
      (items||[]).forEach(a=>{if(!ids.has(a.id)){current.push(a);ids.add(a.id);}});
      if(current.length)state.assignments[key]=current;
    });
  }
  function protectedRecordCount(){
    return Object.values(state.assignments).reduce((sum,items)=>sum+(items||[]).filter(isProtectedCalendarRecord).length,0);
  }

  function normalizeAssignmentItem(a){
    if(!a)return a;
    const item={...a};
    if(item.postNight || (item.category==='RC'&&item.code==='RC'&&item.linkedNightId)){
      item.category='REST';item.type='SM';item.code='SM';item.postNight=true;item.hours=0;item.allDay=true;
    }
    if(item.category==='OP'){
      const meta=operationalShiftMeta(item.code||item.type);
      if(meta){
        item.type=operationalCode(item);
        item.code=operationalCode(item);
        item.site=item.site??meta.site;
        item.role=item.role??meta.role??'';
        item.shift=item.shift??meta.shift;
        item.start=item.start||meta.start;
        item.end=item.end||meta.end;
        item.nextDay=item.nextDay??!!meta.nextDay;
        item.hours=Number(item.hours??meta.hours);
      }
    }
    item.workRegime=String(item.workRegime||'ORDINARY').toUpperCase();
    item.recoveredHours=Number(item.recoveredHours||0);
    return item;
  }
  function migrateAssignmentStore(){
    Object.keys(state.assignments).forEach(
      key=>{
        state.assignments[key]=(
          state.assignments[key]||[]
        ).map(normalizeAssignmentItem);
      }
    );

    purgeLegacyPostNightMarkers();
  }
  function isNightItem(a,day){
    if(a?.category==='118'&&['N','PN'].includes(a.shift))return true;
    const t=assignmentTimes(a,day);if(!t.timed)return false;
    const startM=t.start.getHours()*60+t.start.getMinutes(),endM=t.end.getHours()*60+t.end.getMinutes();
    return startM>=22*60||startM<6*60||t.end.getDate()!==t.start.getDate()||endM<=6*60;
  }
  function nightRestrictionActive(e,day){return e?.nightRestriction!=='NONE'&&dateInRange(day,e?.nightRestrictionFrom,e?.nightRestrictionUntil);}
  function weekdayIso(day){const d=parseDateKey(day).getDay();return d===0?7:d;}
  function partTimeDayAllowed(e,day,item){
    if(!e?.partTime)return true;
    const days=String(e.partTimeDays||'').split(',').map(x=>Number(x.trim())).filter(Boolean);
    if(days.length&&!days.includes(weekdayIso(day)))return false;
    const shifts=String(e.partTimeShifts||'').toUpperCase().split(',').map(x=>x.trim()).filter(Boolean);
    const code=String(item.shift||item.type||item.code||'').toUpperCase();
    if(shifts.length&&!shifts.some(s=>code.startsWith(s)||item.category===s))return false;
    return true;
  }
  function mondayStart(date){const d=new Date(date);d.setHours(0,0,0,0);const dow=d.getDay()||7;d.setDate(d.getDate()-(dow-1));return d;}
  function weekKeyFromDate(date){const m=mondayStart(date);return dateKey(m);}
  function historicalRowsForEmployee(employeeId){
    if(state._historyRowsCache?.has(employeeId))return state._historyRowsCache.get(employeeId);
    const current=rowsForEmployee(employeeId);
    const currentIds=new Set(current.map(r=>r.a.id));
    const employee=state.employees.find(e=>e.id===employeeId);
    const older=(state.dbRecords||[])
      .filter(r=>
        !r.requirement&&
        r.employeeId===employeeId&&
        !String(r.day||'').startsWith(state.month)&&
        !currentIds.has(r.item?.id)
      )
      .map(r=>{
        const item=normalizeAssignmentItem(r.item);
        return {employeeId,employee,day:r.day,a:item,...assignmentTimes(item,r.day)};
      });
    const result=[...older,...current].sort((a,b)=>(a.start?.getTime()||0)-(b.start?.getTime()||0));
    state._historyRowsCache?.set(employeeId,result);
    return result;
  }
  function workRowsForEmployee(employeeId){return historicalRowsForEmployee(employeeId).filter(r=>isWorkingAssignment(r.a)&&r.timed);}
  function weeklyOverlapHours(row,start,end){
    if(!row?.timed||!row.start||!row.end)return 0;
    const overlapStart=Math.max(row.start.getTime(),start.getTime());
    const overlapEnd=Math.min(row.end.getTime(),end.getTime());
    if(overlapEnd<=overlapStart)return 0;

    const elapsed=(row.end-row.start)/36e5;
    const recognized=Number(row.hours||0);
    const overlap=(overlapEnd-overlapStart)/36e5;
    if(elapsed<=0)return 0;

    return recognized*(overlap/elapsed);
  }
  function weekHours(employeeId,date,extra=null){
    const start=mondayStart(date),end=new Date(start);
    end.setDate(end.getDate()+7);

    let total=workRowsForEmployee(employeeId)
      .filter(row=>row.start<end&&row.end>start)
      .reduce(
        (sum,row)=>sum+weeklyOverlapHours(row,start,end),
        0
      );

    if(extra){
      const timed=assignmentTimes(extra.a,extra.day);
      if(timed.timed&&timed.start<end&&timed.end>start){
        total+=weeklyOverlapHours(timed,start,end);
      }
    }

    return round2(total);
  }
  function annualRows(employeeId,year){return historicalRowsForEmployee(employeeId).filter(r=>String(r.day).startsWith(String(year)));}
  function annualCodeHours(employeeId,year,code){return annualRows(employeeId,year).filter(r=>(r.a.code||r.a.type)===code).reduce((s,r)=>s+Number(r.hours||0),0);}
  function annualCodeDays(employeeId,year,code){return new Set(annualRows(employeeId,year).filter(r=>(r.a.code||r.a.type)===code).map(r=>r.day)).size;}
  const RFS_CODES=new Set(['RFS','RCF']);
  function isRfsRecord(a){return RFS_CODES.has(String(a?.code||a?.type||'').toUpperCase());}
  function nextMonthValue(month){
    const [year,value]=String(month).split('-').map(Number);
    const date=new Date(year,value,1);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  }
  function endOfMonthKey(month){
    return monthDateKeysFor(month).at(-1);
  }
  function rfsRecoveryWindow(sourceDay){
    const due=addDaysKey(sourceDay,30);
    return{
      start:addDaysKey(sourceDay,1),
      end:due,
      nextMonth:String(due).slice(0,7)
    };
  }
  function rfsEligibleForMonth(entitlement,month){
    const first=`${month}-01`;
    const last=endOfMonthKey(month);
    return entitlement.due>=first&&entitlement.sourceDay<last;
  }
  function monthDateKeysFor(month){
    const [year,value]=String(month).split('-').map(Number);
    const last=new Date(year,value,0).getDate();
    return Array.from({length:last},(_,index)=>`${year}-${String(value).padStart(2,'0')}-${String(index+1).padStart(2,'0')}`);
  }
  function ledgerRowsForEmployee(employeeId){
    const employee=state.employees.find(e=>e.id===employeeId);
    const map=new Map();
    let sequence=0;
    const add=(day,item)=>{
      if(!day||!item)return;
      const normalized=normalizeAssignmentItem(item);
      const identity=normalized.id||`${employeeId}|${day}|${normalized.code||normalized.type||''}|${sequence++}`;
      map.set(identity,{employeeId,employee,day,a:normalized});
    };

    (state.dbRecords||[]).forEach(record=>{
      if(!record.requirement&&record.employeeId===employeeId)add(record.day,record.item);
    });

    Object.values(state.monthPlans||{}).forEach(plan=>{
      Object.entries(plan?.assignments||{}).forEach(([key,items])=>{
        const split=key.lastIndexOf('|');
        const id=key.slice(0,split);
        const day=key.slice(split+1);
        if(id!==employeeId)return;
        (items||[]).forEach(item=>add(day,item));
      });
    });

    Object.entries(state.assignments||{}).forEach(([key,items])=>{
      const split=key.lastIndexOf('|');
      const id=key.slice(0,split);
      const day=key.slice(split+1);
      if(id!==employeeId)return;
      (items||[]).forEach(item=>add(day,item));
    });

    return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day));
  }
  function rfsEntitlementLedger(employeeId,year){
    const employee=state.employees.find(e=>e.id===employeeId);
    const rows=ledgerRowsForEmployee(employeeId);
    const holidays=holidayKeysForYear(year,state.settings.patronHoliday);
    const workedByDay=new Map();

    rows.forEach(row=>{
      if(
        String(row.day).startsWith(String(year))&&
        holidays.has(row.day)&&
        isWorkingAssignment(row.a)&&
        !workedByDay.has(row.day)
      ){
        workedByDay.set(row.day,row);
      }
    });

    const recoveries=rows
      .filter(row=>isRfsRecord(row.a))
      .sort((a,b)=>a.day.localeCompare(b.day));

    const usedRecoveryIds=new Set();
    return [...workedByDay.entries()]
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([sourceDay,sourceRow])=>{
        let recovery=recoveries.find(row=>{
          const identity=row.a.id||`${row.day}|${row.a.code}`;
          return !usedRecoveryIds.has(identity)&&row.a.linkedEventDay===sourceDay;
        });

        const window=rfsRecoveryWindow(sourceDay);

        if(
          recovery&&
          (
            recovery.day<window.start||
            recovery.day>window.end
          )
        ){
          recovery=null;
        }

        if(!recovery){
          recovery=recoveries.find(row=>{
            const identity=row.a.id||`${row.day}|${row.a.code}`;
            return (
              !usedRecoveryIds.has(identity)&&
              !row.a.linkedEventDay&&
              row.day>=window.start&&
              row.day<=window.end
            );
          });
        }

        if(recovery){
          usedRecoveryIds.add(
            recovery.a.id||`${recovery.day}|${recovery.a.code}`
          );
        }

        return{
          employeeId,
          employee,
          sourceDay,
          sourceRecordId:sourceRow.a.id||'',
          due:window.end,
          recoveryWindowStart:window.start,
          recoveryWindowEnd:window.end,
          recovery,
          used:!!recovery
        };
      });
  }
  function rfsCounter(employeeId,year){
    const ledger=rfsEntitlementLedger(employeeId,year);
    const monthStart=`${state.month}-01`;
    const earned=ledger.length;
    const used=ledger.filter(item=>item.used).length;
    const available=ledger.filter(
      item=>!item.used&&item.due>=monthStart
    ).length;
    const expired=ledger.filter(
      item=>!item.used&&item.due<monthStart
    ).length;

    return{
      earned,
      used,
      remaining:available,
      available,
      expired,
      ledger
    };
  }
  function pendingRfsEntitlements(){
    const year=Number(state.month.slice(0,4));
    const monthStart=`${state.month}-01`;
    const monthEnd=endOfMonthKey(state.month);
    const years=state.month.endsWith('-01')
      ?[year-1,year]
      :[year];
    const list=[];

    state.employees
      .filter(employee=>employee.attivo!==false)
      .forEach(employee=>{
        years.forEach(value=>{
          rfsEntitlementLedger(employee.id,value)
            .filter(item=>
              !item.used&&
              item.sourceDay<=monthEnd&&
              item.due>=monthStart
            )
            .forEach(item=>list.push(item));
        });
      });

    const unique=new Map();
    list.forEach(item=>
      unique.set(
        `${item.employeeId}|${item.sourceDay}`,
        item
      )
    );

    return [...unique.values()].sort((a,b)=>
      employeeName(a.employee).localeCompare(
        employeeName(b.employee)
      )||
      a.sourceDay.localeCompare(b.sourceDay)
    );
  }
  function dailyContractHours(e){return round2((Number(e.oreSettimanali)||state.settings.weeklyStandardHours||38)/5);}
  function automaticRecoveryDue(day,meta){
    if(!day||!meta?.requiresRecovery)return'';
    if(Number(meta.recoveryDeadlineDays)>0){
      return addDaysKey(day,Number(meta.recoveryDeadlineDays));
    }
    if(Number(meta.autoRecoveryMonths)>0){
      return addMonthsKey(day,Number(meta.autoRecoveryMonths));
    }
    return'';
  }
  function resolvedRecoveryDue(day,meta,requested=''){
    const automatic=automaticRecoveryDue(day,meta);
    if(!automatic)return requested||'';
    if(!requested)return automatic;
    return requested>automatic?automatic:requested;
  }
  function recoveryDueIsMandatory(meta){
    return !!(meta?.requiresRecovery&&(meta.recoveryDueRequired||meta.recoveryDeadlineDays||meta.autoRecoveryMonths));
  }
  function validDerogation(a){return validDerogationCode(a?.derogationCode)&&String(a?.derogationAuthorizedBy||'').trim().length>0;}
  function recoverySatisfied(employeeId,item){
    if(!item?.recoveryRequired)return true;
    const recovered=Number(item.recoveredHours||0);
    if(recovered>=Number(item.hours||0))return true;
    return historicalRowsForEmployee(employeeId).some(r=>r.a.category==='RC'&&['RCD','RCP'].includes(r.a.code||r.a.type)&&(r.a.linkedRecordId===item.id||r.a.linkedEventDay===item.referenceDate));
  }
  function workRegimeHours(employeeId,year){return annualRows(employeeId,year).filter(r=>['SUPPLEMENTARY','OVERTIME','BANKED'].includes(String(r.a.workRegime||'').toUpperCase())).reduce((s,r)=>s+Number(r.hours||0),0);}
  function mergeIntervals(rows){
    const list=rows.filter(r=>r.start&&r.end).map(r=>({start:new Date(r.start),end:new Date(r.end)})).sort((a,b)=>a.start-b.start),out=[];
    list.forEach(x=>{const last=out[out.length-1];if(last&&x.start<=last.end){if(x.end>last.end)last.end=x.end;}else out.push(x);});return out;
  }
  function restUnitsInWindow(rows,start,end,minHours){
    const extendedStart=new Date(start);extendedStart.setDate(extendedStart.getDate()-3);const extendedEnd=new Date(end);extendedEnd.setDate(extendedEnd.getDate()+3);
    const merged=mergeIntervals(rows.filter(r=>r.end>extendedStart&&r.start<extendedEnd));
    const boundaries=[{end:extendedStart},...merged,{start:extendedEnd}];let units=0;
    for(let i=0;i<boundaries.length-1;i++){const gapStart=boundaries[i].end||extendedStart,gapEnd=boundaries[i+1].start||extendedEnd;if(gapEnd<=start||gapStart>=end)continue;const hours=(gapEnd-gapStart)/36e5;if(hours>=minHours)units+=Math.max(1,Math.floor(hours/minHours));}
    return units;
  }
  function absenceRowsForMonth(){
    const rows=[];Object.entries(state.assignments).forEach(([key,items])=>{const split=key.lastIndexOf('|'),employeeId=key.slice(0,split),day=key.slice(split+1);if(!day.startsWith(state.month))return;const employee=state.employees.find(e=>e.id===employeeId);(items||[]).filter(isProtectedCalendarRecord).forEach(item=>rows.push({employeeId,employee,day,item}));});
    return rows.sort((a,b)=>a.day.localeCompare(b.day)||employeeName(a.employee).localeCompare(employeeName(b.employee)));
  }

  function clonePlan(value){
    return value==null?value:structuredClone(value);
  }
  function cacheCurrentMonthPlan(){
    state.monthPlans=state.monthPlans||{};
    state.monthPlans[state.month]={
      assignments:clonePlan(state.assignments||{}),
      requirements:clonePlan(state.requirements||{}),
      localDirty:!!state.localDirty,
      lastAutoSummary:clonePlan(state.lastAutoSummary)
    };
  }
  function restoreCachedMonthPlan(month){
    const plan=state.monthPlans?.[month];
    if(!plan)return false;
    state.assignments=clonePlan(plan.assignments||{});
    state.requirements=clonePlan(plan.requirements||{});
    state.localDirty=!!plan.localDirty;
    state.lastAutoSummary=clonePlan(plan.lastAutoSummary||null);
    migrateAssignmentStore();
    restoreProtectedRecordsForCurrentMonth();
    ensureAllPostNightRests();
    return true;
  }
  function updateMonthControls(){
    const input=$('#monthPicker');
    if(input)input.value=state.month;
  }
  function saveState(){
    try{
      syncProtectedRecordsForCurrentMonth();
      cacheCurrentMonthPlan();
      saveApplicationSnapshot({
        version:APP_VERSION,
        month:state.month,
        employees:state.employees,
        assignments:state.assignments,
        requirements:state.requirements,
        monthPlans:state.monthPlans,
        settings:state.settings,
        localDirty:state.localDirty,
        lastAutoSummary:state.lastAutoSummary
      });
      updateSyncStatus(state.localDirty?'Modifiche locali non sincronizzate':'Salvato nel browser',state.localDirty?'sync':'local');
    }
    catch(e){console.warn(e);updateSyncStatus('Sessione temporanea','sync');}
  }
  function loadState(){
    try{
      const data=loadApplicationSnapshot();
      if(!data)return false;
      if(!COMPATIBLE_STORAGE_VERSIONS.has(Number(data.version)))return false;
      state.month=data.month||state.month;
      state.employees=(data.employees?.length?data.employees:structuredClone(FALLBACK_EMPLOYEES)).map(normalizeEmployee);
      state.monthPlans=data.monthPlans||{};
      const cached=state.monthPlans[state.month];
      state.assignments=clonePlan(cached?.assignments||data.assignments||{});
      state.requirements=clonePlan(cached?.requirements||data.requirements||{});
      migrateAssignmentStore();
      state.settings={...DEFAULT_SETTINGS,...(data.settings||{}),holidayRecoveryDays:30};
      state.localDirty=cached?!!cached.localDirty:!!data.localDirty;
      state.lastAutoSummary=clonePlan(cached?.lastAutoSummary||data.lastAutoSummary||null);
      restoreProtectedRecordsForCurrentMonth();
      cacheCurrentMonthPlan();
      return true;
    }catch(e){console.error(e);return false;}
  }
  function openMonth(month){
    const target=String(month||'').trim();
    if(!/^\d{4}-\d{2}$/.test(target))return;
    if(target===state.month){
      updateMonthControls();
      return;
    }
    syncProtectedRecordsForCurrentMonth();
    cacheCurrentMonthPlan();
    state.month=target;
    if(!restoreCachedMonthPlan(target)){
      state.assignments={};
      state.requirements={};
      state.lastAutoSummary=null;
      if(state.dbRecords.length)applyDbRecordsToMonth({replace:true});
      else{
        initRequirements();
        restoreProtectedRecordsForCurrentMonth();
      }
      state.localDirty=false;
    }
    recalcDefaultTarget();
    updateMonthControls();
    saveState();
    renderAll();
    toast('Mese aperto',monthLabel(target),state.localDirty?'info':'success');
  }
  function stepMonth(offset){
    const [year,month]=state.month.split('-').map(Number);
    const date=new Date(year,month-1+Number(offset||0),1);
    openMonth(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`);
  }
  function openCurrentMonth(){
    const now=new Date();
    openMonth(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  }
  function updateSyncStatus(text,mode='local'){ const el=$('#syncText'); if(el)el.textContent=text; const pill=$('#syncPill'); if(pill)pill.style.borderColor=mode==='error'?'rgba(251,113,133,.35)':mode==='sync'?'rgba(56,189,248,.35)':'rgba(52,211,153,.25)'; }
  function toast(title,text='',type='success'){ const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`<strong>${esc(title)}</strong>${text?`<span class="muted">${esc(text)}</span>`:''}`;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),4200); }
  const UI_FONT_SIZE_KEY='atlas-118-ui-font-size';

  function applyUiFontSize(size){
    const allowed=new Set([
      'standard',
      'large',
      'xlarge'
    ]);

    const resolved=
      allowed.has(size)
        ?size
        :'large';

    document.body.dataset.fontSize=
      resolved;

    try{
      localStorage.setItem(
        UI_FONT_SIZE_KEY,
        resolved
      );
    }catch{}

    $$('.ui-font-choice')
      .forEach(button=>
        button.classList.toggle(
          'active',
          button.dataset.fontSize===resolved
        )
      );
  }

  function initUiFontControl(){
    let current='large';

    try{
      current=
        localStorage.getItem(
          UI_FONT_SIZE_KEY
        )||'large';
    }catch{}

    applyUiFontSize(current);

    if($('#uiFontControl')){
      return;
    }

    const control=document.createElement('div');
    control.id='uiFontControl';
    control.className='ui-font-control';
    control.setAttribute(
      'aria-label',
      'Dimensione caratteri'
    );

    control.innerHTML=`
      <span class="ui-font-label">Testo</span>
      <button type="button"
              class="ui-font-choice"
              data-font-size="standard"
              title="Dimensione standard">A</button>
      <button type="button"
              class="ui-font-choice"
              data-font-size="large"
              title="Dimensione grande">A+</button>
      <button type="button"
              class="ui-font-choice"
              data-font-size="xlarge"
              title="Dimensione molto grande">A++</button>
    `;

    const sync=$('#syncPill');

    if(sync){
      sync.insertAdjacentElement(
        'afterend',
        control
      );
    }else{
      $('.topbar')?.appendChild(control);
    }

    $$('.ui-font-choice')
      .forEach(button=>
        button.addEventListener(
          'click',
          ()=>{
            applyUiFontSize(
              button.dataset.fontSize
            );
          }
        )
      );

    applyUiFontSize(current);
  }
  function openModal(id){ $('#'+id)?.classList.add('open'); }
  function closeModal(id){ $('#'+id)?.classList.remove('open'); if(id==='assignmentModal'){state.activeCell=null;replacementContext=null;} if(id==='preGenerationModal'){preGenerationDraft=[];} }
  function confirmDialog(title,subtitle,text,action){$('#confirmTitle').textContent=title;$('#confirmSubtitle').textContent=subtitle;$('#confirmText').textContent=text;state.confirmAction=action;openModal('confirmModal');}
  function switchView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));}

  function employeeMeta(e){ const roles=[e.autista?'A':'',e.capo?'C':'',e.soccorritore?'S':''].filter(Boolean).join(' · '); return [roles,e.responsabile||'',e.sedeSolo?'solo Gallarate':'Gallarate · Somma · Sumirago'].filter(Boolean).join(' · ')||'nessuna abilitazione 118'; }
  function targetHoursFor(e){
    const allWorkdays=workdays();
    const activeWorkdays=activeWorkdaysForEmployee(e);
    const ratio=allWorkdays.length
      ?activeWorkdays.length/allWorkdays.length
      :0;

    if(Number(e.oreMensili)>0){
      return round2(Number(e.oreMensili)*ratio);
    }

    if(Number(e.oreSettimanali)>0){
      return round2(
        Number(e.oreSettimanali)/5*
        activeWorkdays.length
      );
    }

    if(e.turno==='Amministrazione'){
      return round2(
        activeWorkdays.reduce((sum,d)=>{
          const dow=d.getDay();
          if(slug(e.cognome)==='praderio'){
            return sum+(dow===5?4:8.5);
          }
          if(slug(e.cognome)==='vescera'){
            return sum+([1,5].includes(dow)?4:7);
          }
          return sum+7.6;
        },0)
      );
    }

    return round2(
      Number(state.settings.targetHours)*ratio
    );
  }

  function hoursBalanceFor(e){
    const stats=employeeStats(e), target=round2(targetHoursFor(e)), delta=round2(stats.hours-target);
    const tolerance=.01;
    if(delta < -tolerance){
      return {
        delta, cls:'balance-missing', label:`−${fmt(Math.abs(delta))} h`,
        title:`Programmate ${fmt(stats.hours)} h · target ${fmt(target)} h · mancano ${fmt(Math.abs(delta))} h`
      };
    }
    if(delta > tolerance){
      return {
        delta, cls:'balance-excess', label:`+${fmt(delta)} h`,
        title:`Programmate ${fmt(stats.hours)} h · target ${fmt(target)} h · eccedenza ${fmt(delta)} h`
      };
    }
    return {
      delta:0, cls:'balance-ok', label:'0 h',
      title:`Programmate ${fmt(stats.hours)} h · target ${fmt(target)} h · monte ore raggiunto`
    };
  }

  function buildAssignmentRows(){ const rows=[]; const employeesById=new Map(state.employees.map(e=>[e.id,e])); Object.entries(state.assignments).forEach(([key,items])=>{const split=key.lastIndexOf('|'),employeeId=key.slice(0,split),day=key.slice(split+1),employee=employeesById.get(employeeId); if(!employee)return; items.forEach(a=>rows.push({employeeId,employee,day,a,...assignmentTimes(a,day)}));}); return rows.sort((x,y)=>(x.start?.getTime()||0)-(y.start?.getTime()||0)||employeeName(x.employee).localeCompare(employeeName(y.employee))); }
  function indexRows(rows){const byEmployee=new Map(state.employees.map(e=>[e.id,[]])),byDay=new Map(),byShift=new Map();rows.forEach(r=>{if(!byEmployee.has(r.employeeId))byEmployee.set(r.employeeId,[]);byEmployee.get(r.employeeId).push(r);if(!byDay.has(r.day))byDay.set(r.day,[]);byDay.get(r.day).push(r);if(r.a.category==='118'){const shifts=r.a.shift==='PN'?['P','N']:[r.a.shift];shifts.forEach(s=>{const k=`${r.day}|${s}`;if(!byShift.has(k))byShift.set(k,[]);byShift.get(k).push(r);});}});return{byEmployee,byDay,byShift};}
  function allAssignmentRows(){return state._renderRows||buildAssignmentRows();}
  function rowsForEmployee(id){if(state._autoRowsByEmployee)return state._autoRowsByEmployee.get(id)||[];if(state._renderRowsByEmployee)return state._renderRowsByEmployee.get(id)||[];return allAssignmentRows().filter(r=>r.employeeId===id);}
  function rowsForDay(day){if(state._renderRowsByDay)return state._renderRowsByDay.get(day)||[];return allAssignmentRows().filter(r=>r.day===day);}
  function buildAutoSiteWeekCache(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{
      if(row.a?.category!=='118'||!['G','S'].includes(row.a.site))return;
      const wk=dateKey(mondayStart(parseDateKey(row.day)));
      const key=`${row.employeeId}|${wk}`;
      const bucket=map.get(key)||{G:0,S:0};
      bucket[row.a.site]=(bucket[row.a.site]||0)+1;
      map.set(key,bucket);
    });
    return map;
  }
  function beginAutoCache(){const rows=buildAssignmentRows(),idx=indexRows(rows);state._autoRowsByEmployee=idx.byEmployee;state._autoShiftRows=idx.byShift;state._autoSiteWeekCache=buildAutoSiteWeekCache(rows);}
  function endAutoCache(){delete state._autoRowsByEmployee;delete state._autoShiftRows;delete state._autoSiteWeekCache;}
  function cacheAutoAssignment(e,day,a){if(!state._autoRowsByEmployee)return;const t=assignmentTimes(a,day),row={employeeId:e.id,employee:e,day,a,...t};const rows=state._autoRowsByEmployee.get(e.id)||[];rows.push(row);rows.sort((x,y)=>(x.start?.getTime()||0)-(y.start?.getTime()||0));state._autoRowsByEmployee.set(e.id,rows);if(a.category==='118'&&state._autoShiftRows){const shifts=a.shift==='PN'?['P','N']:[a.shift];shifts.forEach(s=>{const k=`${day}|${s}`,sr=state._autoShiftRows.get(k)||[];sr.push(row);state._autoShiftRows.set(k,sr);});}}
  function employeeStats(e){ if(state._renderStatsCache?.has(e.id))return state._renderStatsCache.get(e.id);const rows=rowsForEmployee(e.id); const count=cat=>rows.filter(r=>r.a.category===cat).length, role=r=>rows.filter(x=>(x.a.category==='118'||isOperationalShift(x.a))&&x.a.role===r).length; const stats={hours:round2(rows.reduce((s,r)=>s+Number(r.hours||0),0)),M:rows.filter(r=>(r.a.category==='118'&&r.a.shift==='M')||(isOperationalShift(r.a)&&operationalShiftMeta(operationalCode(r.a))?.tag==='M')).length,P:rows.filter(r=>(r.a.category==='118'&&r.a.shift==='P')||(isOperationalShift(r.a)&&operationalShiftMeta(operationalCode(r.a))?.tag==='P')).length,N:rows.filter(r=>(r.a.category==='118'&&['N','PN'].includes(r.a.shift))||(isOperationalShift(r.a)&&operationalShiftMeta(operationalCode(r.a))?.night)).length,roleA:role('A'),roleC:role('C'),roleS:role('S'),weekends:rows.filter(r=>(r.a.category==='118'||isOperationalShift(r.a))&&isWeekend(parseDateKey(r.day))).length,se:rows.filter(r=>r.a.category==='SE').length,grs:rows.filter(r=>r.a.type==='GRS').length,gra:rows.filter(r=>r.a.type==='GRA').length,grm:rows.filter(r=>r.a.type==='GRM').length,gro:rows.filter(r=>['GRO','RO'].includes(r.a.type)).length,form:count('FORM'),abs:count('ABS'),am:count('AM'),auto:rows.filter(r=>sourceLabel(r.a)==='AUTO').length};if(state._renderStatsCache)state._renderStatsCache.set(e.id,stats);return stats; }


  function renderAll(){ initRequirements();const rows=buildAssignmentRows(),idx=indexRows(rows);state._renderRows=rows;state._renderRowsByEmployee=idx.byEmployee;state._renderRowsByDay=idx.byDay;state._renderShiftRows=idx.byShift;state._renderStatsCache=new Map();state._historyRowsCache=new Map();try{state.validations=validateAll();renderCalendar();renderCoverage();renderCcnlDashboard();renderSummary();renderAnomalies();renderStaff();renderKpis();renderRules();}finally{delete state._renderRows;delete state._renderRowsByEmployee;delete state._renderRowsByDay;delete state._renderShiftRows;delete state._renderStatsCache;delete state._historyRowsCache;} }
  function renderRules(){ $('#sidebarRest').textContent=`${fmt(state.settings.minRest)} ore`;$('#sidebarSe').textContent='2 persone · riducibili per priorità 118';$('#sidebarResp').textContent=`min ${state.settings.respMin} · obiettivo ${state.settings.respGoal}`; const db=$('#dbStateText'); if(db)db.textContent=`Matrice ${state.matrixLoaded?'✓':'fallback'} · Database ${state.dbLoaded?'✓':'locale'}`; }
  function filteredEmployees(){
    const q=$('#searchEmployee').value.trim().toLowerCase(),
      g=$('#groupFilter').value,
      issues=$('#issuesOnly').checked,
      ids=new Set(
        state.validations
          .filter(v=>v.employeeId)
          .map(v=>v.employeeId)
      );

    return state.employees.filter(e=>
      employeeVisibleInMonth(e)&&
      (!q||employeeName(e).toLowerCase().includes(q))&&
      (g==='all'||e.turno===g)&&
      (!issues||ids.has(e.id))
    );
  }
  function renderCalendar(){
    const dates=monthDates(),employees=filteredEmployees(); $('#calendarTitle').textContent=monthLabel(); $('#calendarSubtitle').textContent=`${employees.length} dipendenti visualizzati · saldo: − ore mancanti, + ore in eccesso · viola = turno volontari coperto · giallo = cambio collegato`;
    const issues=new Map(); state.validations.forEach(v=>{if(v.employeeId&&v.day){const k=assignmentKey(v.employeeId,v.day),p=issues.get(k);if(!p||v.severity==='error')issues.set(k,v.severity);}});
    let html='<thead><tr><th>#</th><th>Dipendente</th><th>Gruppo · Ore</th>'; dates.forEach(d=>{const cls=isSunday(d)?'sunday':d.getDay()===6?'weekend':''; const prefM=preferredGroup(d,'M');html+=`<th class="${cls}" title="${prefM?`M: ${prefM} · P: ${prefM==='A'?'B':'A'}`:''}"><div class="day-head"><div class="dow">${DOW[d.getDay()]}</div><div class="num">${d.getDate()}</div></div></th>`;}); html+='</tr></thead><tbody>';
    employees.forEach((e,i)=>{ const balance=hoursBalanceFor(e); html+=`<tr><td><span class="emp-index">${i+1}</span></td><td><div class="emp-name">${esc(employeeName(e))}</div><div class="emp-meta">${esc(employeeMeta(e))}</div></td><td><div class="group-cell"><span class="group-badge group-${e.turno.toLowerCase().replace(/\s+/g,'-')}">${esc(e.turno==='Amministrazione'?'AMM':e.turno)}</span><span class="hours-balance ${balance.cls}" title="${esc(balance.title)}">${esc(balance.label)}</span></div></td>`;
      dates.forEach(d=>{
        const day=dateKey(d),
          items=getAssignments(e.id,day),
          issue=issues.get(assignmentKey(e.id,day)),
          volunteerApprovedCoverage=items.some(item=>
            String(item.coverage||'').toUpperCase()==='VOLONTARI_APPROVATO'&&
            String(item.volunteerAssignmentKind||'').toUpperCase()==='COVERAGE'
          ),
          volunteerChanged=items.some(item=>
            String(item.volunteerAssignmentKind||'').toUpperCase()==='CHANGE'||
            (
              String(item.coverage||'').toUpperCase()==='VOLONTARI'&&
              String(item.volunteerAssignmentKind||'').toUpperCase()!=='COVERAGE'
            )
          ),
          volunteerPendingCoverage=items.some(item=>
            String(item.coverage||'').toUpperCase()==='VOLONTARI'&&
            String(item.volunteerAssignmentKind||'').toUpperCase()==='COVERAGE'
          ),
          cls=isSunday(d)?'sunday':d.getDay()===6?'weekend':'',
          ended=!employeeActiveOn(e,day);

        html+=`<td class="day-cell ${cls}">`;

        if(ended){
          html+=`<button class="cell-button employment-ended" disabled title="${esc(employeeName(e))} · rapporto non attivo il ${day}">
            <span class="employment-ended-tag">FINE</span>
          </button>`;
        }else{
          html+=`<button class="cell-button ${items.length?'':'empty'} ${issue==='error'?'has-error':issue==='warning'?'has-warning':''} ${volunteerApprovedCoverage?'volunteer-approved':(volunteerChanged||volunteerPendingCoverage)?'volunteer-adjusted':''}" data-employee="${e.id}" data-day="${day}" title="${esc(employeeName(e))} · ${day}${volunteerApprovedCoverage?' · TURNO VOLONTARI COPERTO DA DIPENDENTE':volunteerChanged?' · CAMBIO TURNO PER COPERTURA VOLONTARI':volunteerPendingCoverage?' · COPERTURA VOLONTARI DA APPROVARE':''}">`;
          if(volunteerApprovedCoverage){
            html+=`<span class="volunteer-approved-marker" title="Turno volontari approvato e coperto da personale dipendente">VOL✓</span>`;
          }else if(volunteerChanged){
            html+=`<span class="volunteer-change-marker" title="Turno modificato per rendere possibile una copertura volontari">CAMBIO</span>`;
          }else if(volunteerPendingCoverage){
            html+=`<span class="volunteer-change-marker" title="Copertura volontari applicata ma non ancora approvata">VOL</span>`;
          }
          items.slice(0,3).forEach(a=>{
            const approvedVol=String(a.coverage||'').toUpperCase()==='VOLONTARI_APPROVATO'&&String(a.volunteerAssignmentKind||'').toUpperCase()==='COVERAGE';
            html+=`<span class="shift-tag ${tagClass(a)} ${approvedVol?'volunteer-approved-tag':''}" title="${sourceLabel(a)}${a.locked?' · bloccato':''}${String(a.coverage||'').toUpperCase().startsWith('VOLONTARI')?' · copertura volontari':''}">${esc(normalizeCode(a))}${sourceLabel(a)==='AUTO'?'·':''}</span>`;
          });
          if(items.length>3){
            html+=`<span class="shift-tag tag-rc">+${items.length-3}</span>`;
          }
          html+='</button>';
        }

        html+='</td>';
      });
      html+='</tr>';
    });
    html+='</tbody>';$('#calendarTable').innerHTML=html;$$('.cell-button').forEach(b=>b.addEventListener('click',()=>openAssignment(b.dataset.employee,b.dataset.day)));
  }

  function resetAssignmentModalMode(){
    replacementContext=null;
    $('#replacementWorkspace')?.classList.add('hidden');
    if($('#replacementWorkspace'))$('#replacementWorkspace').innerHTML='';
    if($('#assignmentActionLabel'))$('#assignmentActionLabel').textContent='Inserimento rapido';
    $('#presetGrid')?.classList.remove('replacement-mode');
  }

  function openAssignment(employeeId,day){
    const e=state.employees.find(x=>x.id===employeeId);
    if(!e)return;

    if(!employeeActiveOn(e,day)){
      return toast(
        'Rapporto non attivo',
        `${employeeName(e)} non può essere programmato dopo il ${formatDateIt(e.employmentEndDate)}.`,
        'error'
      );
    }

    resetAssignmentModalMode();
    state.activeCell={employeeId,day};
    const d=parseDateKey(day);
    $('#assignmentTitle').textContent=employeeName(e);
    $('#assignmentSubtitle').textContent=`${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${employeeMeta(e)}`;
    renderExistingAssignments();
    $('#assignmentFormHost').innerHTML='';
    openModal('assignmentModal');
  }

  function replacementSource(){
    if(!replacementContext)return null;
    const items=getAssignments(replacementContext.employeeId,replacementContext.day);
    const index=items.findIndex(a=>a.id===replacementContext.assignmentId);
    if(index<0)return null;
    return {item:items[index],index,employee:state.employees.find(e=>e.id===replacementContext.employeeId),day:replacementContext.day};
  }

  function shiftSegments(a){
    return a?.shift==='PN'?['P','N']:[a?.shift].filter(Boolean);
  }

  function duplicateSlotRows(day,item,{excludeEmployeeId=null,excludeAssignmentId=null}={}){
    if(item?.category!=='118')return[];
    const wanted=new Set(shiftSegments(item));
    return buildAssignmentRows().filter(r=>{
      if(r.day!==day||r.a.category!=='118')return false;
      if(excludeEmployeeId===r.employeeId&&excludeAssignmentId===r.a.id)return false;
      if(crewKey(r.a)!==crewKey(item)||r.a.role!==item.role)return false;
      return shiftSegments(r.a).some(s=>wanted.has(s));
    });
  }

  function withReplacementSourceRemoved(fn){
    const src=replacementSource();
    if(!src)return fn();
    const key=assignmentKey(replacementContext.employeeId,replacementContext.day);
    const original=state.assignments[key];
    const filtered=original.filter(a=>a.id!==replacementContext.assignmentId);
    if(filtered.length)state.assignments[key]=filtered;else delete state.assignments[key];
    try{return fn(src);}finally{state.assignments[key]=original;}
  }

  function checkReplacementAssignment(e,day,item){
    return withReplacementSourceRemoved(()=>checkCandidate(e,day,item,{manual:true}));
  }

  function replacementCandidates(){
    const src=replacementSource();
    if(!src||src.item.category!=='118')return[];
    return state.employees
      .filter(e=>e.id!==src.employee.id&&e.attivo!==false&&e.turno!=='Amministrazione'&&employeeEligibleRole(e,src.item.role))
      .map(e=>{
        const candidate={...src.item,id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO'};
        const check=withReplacementSourceRemoved(()=>checkCandidate(e,src.day,candidate,{manual:true,allowRo:false}));
        const balance=hoursBalanceFor(e);
        return {e,check,balance};
      })
      .filter(x=>x.check.errors.length===0)
      .sort((a,b)=>{
        const groupRank=x=>x.e.turno===src.employee.turno?0:x.e.turno==='Libera'?1:2;
        return groupRank(a)-groupRank(b)||a.check.warnings.length-b.check.warnings.length||a.balance.delta-b.balance.delta||employeeName(a.e).localeCompare(employeeName(b.e),'it');
      });
  }

  function renderReplacementCandidates(filter=''){
    const host=$('#replacementCandidateList');
    if(!host)return;
    const q=String(filter||'').trim().toLowerCase();
    const list=replacementCandidates().filter(x=>employeeName(x.e).toLowerCase().includes(q));
    const count=$('#replacementCandidateCount');
    if(count)count.textContent=`${list.length} disponibili`;
    host.innerHTML=list.length?list.map(x=>{
      const group=x.e.turno==='Amministrazione'?'AMM':x.e.turno;
      const warnings=x.check.warnings.length?`<div class="replacement-candidate-warning">${esc(x.check.warnings.join(' '))}</div>`:'';
      return `<div class="replacement-candidate">
        <div>
          <div class="replacement-candidate-name">${esc(employeeName(x.e))}</div>
          <div class="replacement-candidate-meta">
            <span class="group-badge group-${x.e.turno.toLowerCase().replace(/\s+/g,'-')}">${esc(group)}</span>
            <span>abilitato al ruolo ${esc(replacementSource().item.role)}</span>
            <span class="hours-balance ${x.balance.cls}">${esc(x.balance.label)}</span>
          </div>${warnings}
        </div>
        <button class="replacement-select" data-replacement-employee="${esc(x.e.id)}">Sostituisci</button>
      </div>`;
    }).join(''):`<div class="replacement-empty">Nessuna risorsa disponibile con l’abilitazione richiesta, nel rispetto di riposi, assenze, sovrapposizioni, sede e composizione dell’equipaggio.</div>`;
    $$('[data-replacement-employee]').forEach(b=>b.addEventListener('click',()=>requestResourceReplacement(b.dataset.replacementEmployee)));
  }

  function renderReplacementWorkspace(){
    const src=replacementSource(),host=$('#replacementWorkspace');
    if(!src||!host)return;
    const t=assignmentTimes(src.item,src.day);
    const occupied=duplicateSlotRows(src.day,src.item,{excludeEmployeeId:src.employee.id,excludeAssignmentId:src.item.id});
    const occupiedNotice=occupied.length?`<div class="notice error slot-occupied"><strong>Ruolo già occupato.</strong> ${esc(crewKey(src.item))} · ruolo ${esc(src.item.role)} risulta già assegnato anche a ${esc(occupied.map(r=>employeeName(r.employee)).join(', '))}.</div>`:'';
    const resourceSection=src.item.category==='118'?`
      <div class="replacement-section">
        <div class="replacement-toolbar"><strong>Sostituisci soltanto la risorsa</strong><span id="replacementCandidateCount"></span></div>
        <input class="input replacement-search" id="replacementSearch" placeholder="Cerca tra le sole risorse disponibili…" />
        <div class="replacement-candidates" id="replacementCandidateList"></div>
      </div>`:`<div class="notice info">Questa voce non è un turno 118. Puoi sostituirla scegliendo una nuova tipologia qui sotto.</div>`;

    host.innerHTML=`
      <div class="replacement-hero">
        <strong>Con cosa vuoi sostituire questo turno?</strong>
        <p>Puoi cambiare la risorsa mantenendo turno, sede e ruolo, oppure trasformare l’assegnazione in ferie, permesso, malattia, riposo, formazione o un’altra attività.</p>
      </div>
      <div class="replacement-source">
        <span class="assignment-code ${tagClass(src.item)}" style="padding:7px;border-radius:8px">${esc(normalizeCode(src.item))}</span>
        <div class="replacement-source-main">
          <div class="replacement-source-name">${esc(employeeName(src.employee))}</div>
          <div class="replacement-source-meta">${esc(t.startText)}${t.endText?'–'+esc(t.endText):''} · ${fmt(t.hours)} h · ${esc(sourceLabel(src.item))}</div>
        </div>
        <button class="btn ghost replacement-cancel" id="cancelReplacement">Annulla</button>
      </div>
      ${occupiedNotice}
      ${resourceSection}
      <div class="field replacement-reason"><label>Motivo della modifica (facoltativo)</label><input id="replacementReason" class="input" placeholder="Es. ferie, indisponibilità, cambio operativo…" /></div>`;

    host.classList.remove('hidden');
    $('#assignmentActionLabel').textContent='Oppure sostituisci con una nuova assegnazione';
    $('#cancelReplacement')?.addEventListener('click',()=>openAssignment(src.employee.id,src.day));
    $('#replacementSearch')?.addEventListener('input',e=>renderReplacementCandidates(e.target.value));
    if(src.item.category==='118')renderReplacementCandidates();
  }

  function openReplacement(employeeId,day,index){
    const items=getAssignments(employeeId,day),item=items[index],e=state.employees.find(x=>x.id===employeeId);
    if(!item||!e)return;
    replacementContext={employeeId,day,assignmentId:item.id};
    state.activeCell={employeeId,day};
    const d=parseDateKey(day);
    $('#assignmentTitle').textContent=`Sostituisci ${normalizeCode(item)}`;
    $('#assignmentSubtitle').textContent=`${employeeName(e)} · ${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    $('#assignmentFormHost').innerHTML='';
    renderExistingAssignments();
    renderReplacementWorkspace();
    openModal('assignmentModal');
  }

  function requestResourceReplacement(candidateId){
    const src=replacementSource(),candidate=state.employees.find(e=>e.id===candidateId);
    if(!src||!candidate)return;
    const item={...src.item,id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO'};
    const check=withReplacementSourceRemoved(()=>checkCandidate(candidate,src.day,item,{manual:true}));
    if(check.errors.length)return toast('Risorsa non più disponibile',check.errors.join(' '),'error');
    const warnings=check.warnings.length?` Avvisi: ${check.warnings.join(' ')}`:'';
    confirmDialog(
      'Conferma cambio risorsa',
      `${normalizeCode(src.item)} · ${crewKey(src.item)} · ruolo ${src.item.role}`,
      `Sostituire ${employeeName(src.employee)} con ${employeeName(candidate)} mantenendo la stessa assegnazione?${warnings}`,
      ()=>commitResourceReplacement(candidate.id)
    );
  }

  function commitResourceReplacement(candidateId){
    const src=replacementSource(),candidate=state.employees.find(e=>e.id===candidateId);
    if(!src||!candidate)return;
    const reason=$('#replacementReason')?.value.trim()||'';
    const oldKey=assignmentKey(src.employee.id,src.day),newKey=assignmentKey(candidate.id,src.day);
    const oldItems=[...getAssignments(src.employee.id,src.day)];
    const oldIndex=oldItems.findIndex(a=>a.id===src.item.id);
    if(oldIndex<0)return;
    removeLinkedPostNightRest(src.employee.id,src.day,src.item);
    oldItems.splice(oldIndex,1);
    if(oldItems.length)state.assignments[oldKey]=oldItems;else delete state.assignments[oldKey];

    const note=[src.item.note,`Sostituzione risorsa: ${employeeName(src.employee)} → ${employeeName(candidate)}`,reason?`Motivo: ${reason}`:''].filter(Boolean).join(' · ');
    const newItem={...src.item,id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO',note,replacementOf:src.item.id,replacedEmployeeId:src.employee.id,updatedAt:new Date().toISOString()};
    state.assignments[newKey]=[...getAssignments(candidate.id,src.day),newItem];
    ensurePostNightRest(candidate.id,src.day,newItem,{dirty:false});
    state.localDirty=true;
    saveState();
    replacementContext=null;
    renderAll();
    openAssignment(candidate.id,src.day);
    toast('Risorsa sostituita',`${employeeName(src.employee)} → ${employeeName(candidate)} · ${normalizeCode(newItem)}`,'success');
  }

  function renderExistingAssignments(){
    const {employeeId,day}=state.activeCell||{};if(!employeeId)return;
    const items=getAssignments(employeeId,day);
    if(replacementContext){
      const src=replacementSource();
      $('#existingAssignments').innerHTML=src?`<div class="notice info">Stai modificando una voce esistente. La nuova scelta sostituirà il turno selezionato, non verrà aggiunta in parallelo.</div>`:'';
      return;
    }
    $('#existingAssignments').innerHTML=items.length?items.map((a,i)=>{const t=assignmentTimes(a,day);return `<div class="assignment-item"><span class="assignment-code ${tagClass(a)}" style="padding:7px;border-radius:8px">${esc(normalizeCode(a))}</span><span class="assignment-time">${esc(t.startText)}${t.endText?'–'+esc(t.endText):''}</span><span class="assignment-hours">${fmt(t.hours)} h</span><span class="source-badge source-${sourceLabel(a).toLowerCase()}">${sourceLabel(a)}${a.locked?' 🔒':''}</span><button class="assignment-edit" data-replace-index="${i}">Modifica / sostituisci</button><button class="assignment-delete" data-lock-index="${i}" title="Blocca/sblocca">${a.locked?'Sblocca':'Blocca'}</button><button class="assignment-delete" data-index="${i}">Elimina</button></div>`;}).join(''):'<div class="notice info">Nessuna assegnazione presente. Seleziona una tipologia qui sotto.</div>';
    $$('[data-replace-index]').forEach(b=>b.addEventListener('click',()=>openReplacement(employeeId,day,Number(b.dataset.replaceIndex))));
    $$('[data-index]').forEach(b=>b.addEventListener('click',()=>{const arr=[...getAssignments(employeeId,day)],a=arr[Number(b.dataset.index)]; if(a?.origin==='DATABASE'&&!confirm('Questa voce proviene dal Database. Eliminarla localmente?'))return;removeLinkedPostNightRest(employeeId,day,a);arr.splice(Number(b.dataset.index),1);setAssignments(employeeId,day,arr);state.activeCell={employeeId,day};renderExistingAssignments();openModal('assignmentModal');}));
    $$('[data-lock-index]').forEach(b=>b.addEventListener('click',()=>{const arr=[...getAssignments(employeeId,day)],i=Number(b.dataset.lockIndex);arr[i]={...arr[i],locked:!arr[i].locked,updatedAt:new Date().toISOString()};setAssignments(employeeId,day,arr);state.activeCell={employeeId,day};renderExistingAssignments();openModal('assignmentModal');}));
  }

  function renderAssignmentForm(type){
    const e=currentEmployee(),d=parseDateKey(state.activeCell.day),weekend=isWeekend(d);let html='';
    if(type==='118')html=`<div class="section-label">Nuovo turno 118 manuale</div><div class="form-grid cols-3"><div class="field"><label>Fascia</label><select id="fShift" class="input"><option value="M">Mattino</option><option value="P">Pomeriggio</option><option value="N">Notte</option><option value="PN">Pomeriggio + notte</option></select></div><div class="field"><label>Sede</label><select id="fSite" class="input"><option value="G">Gallarate</option><option value="S">Somma</option><option value="SU">Sumirago</option></select></div><div class="field"><label>Macchina</label><select id="fMachine" class="input"><option value="2">Macchina a 2</option><option value="3">Macchina a 3</option></select></div><div class="field"><label>Ruolo</label><select id="fRole" class="input"><option value="A">Autista</option><option value="C">Capo equipaggio</option><option value="S">Soccorritore</option></select></div><div class="field"><label>Regime ore</label><select id="fWorkRegime" class="input"><option value="ORDINARY">Ordinario</option><option value="SUPPLEMENTARY">Supplementare</option><option value="OVERTIME">Straordinario</option><option value="BANKED">Straordinario in banca ore</option></select></div><div class="field"><label>Proteggi da rigenerazione</label><select id="fLocked" class="input"><option value="SI">Sì</option><option value="NO">No</option></select></div><div class="field full"><label>Note</label><input id="fNote" class="input" placeholder="Facoltative" /></div></div><details class="ccnl-advanced"><summary>Deroga art. 27 e autorizzazioni</summary><div class="ccnl-advanced-body form-grid cols-3"><div class="field"><label>Deroga</label><select id="fDerogationCode" class="input"><option value="">Nessuna</option>${ART27_REASONS.map(x=>`<option value="${x.code}">${x.code} · ${x.label}</option>`).join('')}</select></div><div class="field"><label>Autorizzata da</label><input id="fDerogationAuthorizedBy" class="input" /></div><div class="field"><label>Recupero entro</label><input id="fDerogationRecoveryDue" class="input" type="date" /></div><div class="field full"><label class="check-card"><input id="fSplitAllowed" type="checkbox" /> Autorizza giornata frazionata per questa prestazione</label></div></div></details><div id="fPreview" class="notice info"></div><div id="fWarnings"></div><div style="margin-top:10px"><button class="btn primary" id="add118">Aggiungi turno</button></div>`;
    else if(type==='OP'){
      const options=Object.entries(OPERATIONAL_SHIFT_CATALOG).map(([code,meta])=>`<option value="${code}">${code} · ${meta.label} · ${fmt(meta.hours)} h</option>`).join('');
      html=`<div class="section-label">Sigla operativa</div><div class="form-grid cols-3"><div class="field"><label>Sigla</label><select id="fOperationalCode" class="input">${options}</select></div><div class="field"><label>Inizio</label><input id="fOperationalStart" class="input" type="time" /></div><div class="field"><label>Fine</label><input id="fOperationalEnd" class="input" type="time" /></div><div class="field"><label>Ore conteggiate</label><input id="fOperationalHours" class="input" type="number" step="0.25" /></div><div class="field"><label>Regime ore</label><select id="fOperationalRegime" class="input"><option value="ORDINARY">Ordinario</option><option value="SUPPLEMENTARY">Supplementare</option><option value="OVERTIME">Straordinario</option><option value="BANKED">Straordinario in banca ore</option></select></div><div class="field"><label>Proteggi da rigenerazione</label><select id="fOperationalLocked" class="input"><option value="SI">Sì</option><option value="NO">No</option></select></div><div class="field full"><label>Note</label><input id="fOperationalNote" class="input" placeholder="Facoltative" /></div></div><div id="fOperationalPreview" class="notice info operational-preview"></div><div id="fOperationalWarnings"></div><div style="margin-top:10px"><button class="btn primary" id="addOperational">Aggiungi sigla</button></div>`;
    }
    else if(type==='MGSE')html=`<div class="section-label">Secondari</div><div class="notice ${weekend?'error':'info'}">${weekend?'MGSE non è disponibile il sabato o la domenica.':'Orario 06:00–13:30 · 7,5 ore · incompatibile con il 118 nella stessa giornata.'}</div>${weekend?'':`<div style="margin-top:10px"><button class="btn primary" id="addMgse">Aggiungi MGSE</button></div>`}`;
    else if(type==='RESP')html=`<div class="section-label">Giornata di responsabilità</div><div class="form-grid"><div class="field"><label>Tipologia</label><select id="fResp" class="input"><option value="GRA">GRA · Autoparco</option><option value="GRM">GRM · Magazzino</option><option value="GRS">GRS · Secondari</option><option value="GRO">GRO · Responsabile operativo</option></select></div><div class="field"><label>Orario</label><input class="input" value="08:00–17:00 · 7,5 h" disabled /></div></div><div style="margin-top:10px"><button class="btn primary" id="addResp">Aggiungi giornata</button></div>`;
    else if(type==='AM')html=`<div class="section-label">Amministrazione</div><div class="form-grid"><div class="field"><label>Orario</label><select id="fAm" class="input"><option value="AM7">AM7 · 08:00–15:00</option><option value="AM8,5">AM8,5 · 08:00–17:00</option><option value="AM4">AM4 · 08:00–12:00</option></select></div></div><div style="margin-top:10px"><button class="btn primary" id="addAm">Aggiungi amministrazione</button></div>`;
    else if(type==='FORM')html=`<div class="section-label">Formazione</div><div class="form-grid cols-3"><div class="field"><label>Inizio</label><input id="fStart" class="input" type="time" value="08:00" /></div><div class="field"><label>Fine</label><input id="fEnd" class="input" type="time" value="12:00" /></div><div class="field"><label>Ore riconosciute</label><input id="fHours" class="input" type="number" step="0.25" value="4" /></div><div class="field full"><label>Descrizione</label><input id="fNote" class="input" placeholder="Titolo corso / note" /></div></div><div style="margin-top:10px"><button class="btn primary" id="addForm">Aggiungi formazione</button></div>`;
    else if(type==='ABS')html=`<div class="section-label">Assenza / permesso</div><div class="form-grid cols-3"><div class="field"><label>Causale</label><select id="fAbs" class="input">${Object.entries(ABSENCE_CATALOG).filter(([,m])=>m.category==='ABS').map(([c,m])=>`<option value="${c}">${c} · ${m.label}</option>`).join('')}</select></div><div class="field"><label>Inizio (vuoto = giornata)</label><input id="fAbsStart" class="input" type="time" /></div><div class="field"><label>Fine</label><input id="fAbsEnd" class="input" type="time" /></div><div class="field"><label>Ore conteggiate</label><input id="fAbsHours" class="input" type="number" step="0.25" value="7.6" /></div><div class="field"><label>Data evento</label><input id="fAbsEventDate" class="input" type="date" /></div><div class="field"><label>Scadenza recupero</label><input id="fAbsRecoveryDue" class="input" type="date" /></div><div class="field full"><label>Note</label><input id="fNote" class="input" /></div></div><div style="margin-top:10px"><button class="btn primary" id="addAbs">Aggiungi assenza</button></div>`;
    else if(type==='RC')html=`<div class="section-label">Riposo / recupero</div><div class="form-grid cols-3"><div class="field"><label>Codice</label><select id="fRc" class="input">${Object.entries(ABSENCE_CATALOG).filter(([,m])=>m.category==='RC').map(([c,m])=>`<option value="${c}">${c} · ${m.label}</option>`).join('')}</select></div><div class="field"><label>Ore conteggiate</label><input id="fRcHours" class="input" type="number" step="0.1" value="0" /></div><div class="field"><label>Data di riferimento</label><input id="fRcReferenceDate" class="input" type="date" /></div></div><div style="margin-top:10px"><button class="btn primary" id="addRc">Aggiungi</button></div>`;
    else html=`<div class="section-label">Voce personalizzata</div><div class="form-grid cols-3"><div class="field"><label>Codice</label><input id="fCustomCode" class="input" /></div><div class="field"><label>Inizio</label><input id="fStart" class="input" type="time" /></div><div class="field"><label>Fine</label><input id="fEnd" class="input" type="time" /></div><div class="field"><label>Ore riconosciute</label><input id="fHours" class="input" type="number" step="0.25" /></div><div class="field"><label>Regime ore</label><select id="fCustomWorkRegime" class="input"><option value="ORDINARY">Ordinario</option><option value="SUPPLEMENTARY">Supplementare</option><option value="OVERTIME">Straordinario</option><option value="BANKED">Straordinario in banca ore</option></select></div><div class="field full"><label>Note</label><input id="fNote" class="input" /></div></div><details class="ccnl-advanced"><summary>Deroga art. 27 / giornata frazionata</summary><div class="ccnl-advanced-body form-grid cols-3"><div class="field"><label>Deroga</label><select id="fCustomDerogationCode" class="input"><option value="">Nessuna</option>${ART27_REASONS.map(x=>`<option value="${x.code}">${x.code} · ${x.label}</option>`).join('')}</select></div><div class="field"><label>Autorizzata da</label><input id="fCustomAuthorizedBy" class="input" /></div><div class="field"><label>Recupero entro</label><input id="fCustomRecoveryDue" class="input" type="date" /></div><div class="field full"><label class="check-card"><input id="fCustomSplitAllowed" type="checkbox" /> Autorizza frazionamento della giornata</label></div></div></details><div style="margin-top:10px"><button class="btn primary" id="addCustom">Aggiungi voce</button></div>`;
    if(replacementContext){
      const src=replacementSource();
      html=`<div class="notice info">La nuova voce sostituirà <strong>${esc(src?normalizeCode(src.item):'il turno selezionato')}</strong> di ${esc(src?employeeName(src.employee):employeeName(e))}.</div>${html}`;
    }
    $('#assignmentFormHost').innerHTML=html;
    if(replacementContext)$('#assignmentFormHost .btn.primary')?.replaceChildren(document.createTextNode('Conferma sostituzione'));
    if(type==='118'){
      const src=replacementSource();
      if(src?.item.category==='118'){
        $('#fShift').value=src.item.shift||'M';
        $('#fSite').value=src.item.site||'G';
        $('#fMachine').value=String(src.item.machine||'3');
        $('#fRole').value=src.item.role||'S';
        $('#fLocked').value='SI';
      }
      const update=()=>{
        const shift=$('#fShift').value,site=$('#fSite').value;
        const w=shiftWindow(shift,state.activeCell.day);
        $('#fPreview').textContent=`Orario ${w.start}–${w.end}${w.nextDay?' del giorno successivo':''} · ${fmt(w.hours)} ore`;
        const fixedMachine=site!=='G'||['N','PN'].includes(shift);
        if(fixedMachine){$('#fMachine').value='3';$('#fMachine').disabled=true;}else $('#fMachine').disabled=false;
        const item={category:'118',shift,site,machine:(site==='G'&&!['N','PN'].includes(shift))?$('#fMachine').value:'3',role:$('#fRole').value,derogationCode:$('#fDerogationCode')?.value||'',derogationAuthorizedBy:$('#fDerogationAuthorizedBy')?.value||''};
        const check=replacementContext?checkReplacementAssignment(e,state.activeCell.day,item):checkCandidate(e,state.activeCell.day,item,{manual:true});
        const lines=[
          ...check.errors.map(x=>`<div class="notice error">${esc(x)}</div>`),
          ...check.warnings.map(x=>`<div class="notice">${esc(x)}</div>`)
        ];
        $('#fWarnings').innerHTML=lines.join('');
      };
      ['fShift','fSite','fMachine','fRole','fDerogationCode','fDerogationAuthorizedBy'].forEach(id=>$('#'+id).addEventListener('change',update));
      update();
      $('#add118').addEventListener('click',add118);
    }
    if(type==='OP'){
      const src=replacementSource();
      if(src?.item.category==='OP'&&operationalShiftMeta(src.item.code||src.item.type)){
        $('#fOperationalCode').value=operationalCode(src.item);
      }
      const updateOperational=()=>{
        const code=$('#fOperationalCode').value;
        const meta=operationalShiftMeta(code);
        if(!meta)return;
        if(!$('#fOperationalStart').dataset.edited)$('#fOperationalStart').value=meta.start;
        if(!$('#fOperationalEnd').dataset.edited)$('#fOperationalEnd').value=meta.end;
        if(!$('#fOperationalHours').dataset.edited)$('#fOperationalHours').value=meta.hours;
        const item={
          category:'OP',
          type:code,
          code,
          site:meta.site||'',
          role:meta.role||'',
          shift:meta.shift,
          start:$('#fOperationalStart').value||meta.start,
          end:$('#fOperationalEnd').value||meta.end,
          hours:numeric($('#fOperationalHours').value,meta.hours),
          nextDay:shiftWindow('CUSTOM',state.activeCell.day,$('#fOperationalStart').value||meta.start,$('#fOperationalEnd').value||meta.end).nextDay
        };
        const employee=currentEmployee();
        const check=replacementContext?checkReplacementAssignment(employee,state.activeCell.day,item):checkCandidate(employee,state.activeCell.day,item,{manual:true});
        $('#fOperationalPreview').innerHTML=`<strong>${esc(code)} · ${esc(meta.label)}</strong><span>${esc(item.start)}–${esc(item.end)}${item.nextDay?' del giorno successivo':''} · ${fmt(item.hours)} ore${meta.role?` · ruolo ${esc(meta.role)}`:''}</span>`;
        $('#fOperationalWarnings').innerHTML=[
          ...check.errors.map(x=>`<div class="notice error">${esc(x)}</div>`),
          ...check.warnings.map(x=>`<div class="notice">${esc(x)}</div>`)
        ].join('');
      };
      ['fOperationalStart','fOperationalEnd','fOperationalHours'].forEach(id=>{
        $('#'+id).addEventListener('input',e=>{e.target.dataset.edited='1';updateOperational();});
      });
      $('#fOperationalCode').addEventListener('change',()=>{
        ['fOperationalStart','fOperationalEnd','fOperationalHours'].forEach(id=>delete $('#'+id).dataset.edited);
        updateOperational();
      });
      updateOperational();
      $('#addOperational').addEventListener('click',addOperationalShift);
    }
    if(type==='ABS'&&$('#fAbs')){
      const updateAbsRecoveryDue=()=>{
        const meta=absenceMeta($('#fAbs').value),due=automaticRecoveryDue(state.activeCell.day,meta);
        $('#fAbsRecoveryDue').disabled=!meta.requiresRecovery;
        $('#fAbsRecoveryDue').readOnly=!!due;
        if(due)$('#fAbsRecoveryDue').value=due;else if(!meta.requiresRecovery)$('#fAbsRecoveryDue').value='';
      };
      $('#fAbs').addEventListener('change',updateAbsRecoveryDue);
      updateAbsRecoveryDue();
    }
    if($('#addMgse'))$('#addMgse').addEventListener('click',()=>addSimple({category:'SE',type:'MGSE',code:'MGSE'}));
    if($('#addResp'))$('#addResp').addEventListener('click',addResp); if($('#addAm'))$('#addAm').addEventListener('click',addAm); if($('#addForm'))$('#addForm').addEventListener('click',addForm); if($('#addAbs'))$('#addAbs').addEventListener('click',addAbs); if($('#addRc'))$('#addRc').addEventListener('click',addRc); if($('#addCustom'))$('#addCustom').addEventListener('click',addCustom);
  }

  function addOperationalShift(){
    const code=$('#fOperationalCode')?.value;
    const meta=operationalShiftMeta(code);
    if(!meta)return toast('Sigla non valida','Seleziona una sigla operativa.','error');
    const start=$('#fOperationalStart').value||meta.start;
    const end=$('#fOperationalEnd').value||meta.end;
    const hours=numeric($('#fOperationalHours').value,meta.hours);
    if(!start||!end||hours<=0)return toast('Orario incompleto','Inserisci inizio, fine e ore conteggiate.','error');
    appendAssignment({
      category:'OP',
      type:code,
      code,
      site:meta.site||'',
      role:meta.role||'',
      shift:meta.shift,
      start,
      end,
      nextDay:shiftWindow('CUSTOM',state.activeCell.day,start,end).nextDay,
      hours,
      workRegime:$('#fOperationalRegime').value,
      locked:$('#fOperationalLocked').value==='SI',
      note:$('#fOperationalNote').value.trim()
    });
  }

  function manualBase(){return{id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  function appendAssignment(item){
    const {employeeId,day}=state.activeCell;
    const employee=state.employees.find(e=>e.id===employeeId);
    const candidate={...manualBase(),...item};
    const check=replacementContext?checkReplacementAssignment(employee,day,candidate):checkCandidate(employee,day,candidate,{manual:true});

    if(replacementContext){
      if(check.errors.length)return toast('Sostituzione non consentita',check.errors.join(' '),'error');
      if(check.warnings.length)return confirmDialog('Avvisi sulla sostituzione','Conferma modifica',check.warnings.join(' '),()=>commitReplacementAssignment(candidate));
      return commitReplacementAssignment(candidate);
    }

    if(check.errors.length)return confirmDialog('Alert sulla modifica','Conferma assegnazione manuale',check.errors.concat(check.warnings).join(' '),()=>commit());
    if(check.warnings.length)return confirmDialog('Avviso','Conferma assegnazione manuale',check.warnings.join(' '),()=>commit());
    commit();

    function commit(){
      appendTo(employeeId,day,candidate,{dirty:true,render:false});
      ensurePostNightRest(employeeId,day,candidate,{dirty:true});
      saveState();renderAll();state.activeCell={employeeId,day};renderExistingAssignments();$('#assignmentFormHost').innerHTML='';openModal('assignmentModal');
      toast(
        'Assegnazione aggiunta',
        isNight118(candidate)
          ?`${normalizeCode(candidate)} · il turno successivo dovrà iniziare dopo almeno ${fmt(state.settings.minRest)} ore`
          :normalizeCode(candidate)
      );
    }
  }

  function commitReplacementAssignment(candidate){
    const src=replacementSource();if(!src)return;
    const reason=$('#replacementReason')?.value.trim()||'';
    const key=assignmentKey(src.employee.id,src.day);
    const items=[...getAssignments(src.employee.id,src.day)];
    const index=items.findIndex(a=>a.id===src.item.id);
    if(index<0)return;
    removeLinkedPostNightRest(src.employee.id,src.day,src.item);
    const note=[candidate.note,`Sostituisce ${normalizeCode(src.item)}`,reason?`Motivo: ${reason}`:''].filter(Boolean).join(' · ');
    const replacement={...candidate,id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO',note,replacementOf:src.item.id,updatedAt:new Date().toISOString()};
    items.splice(index,1,replacement);
    state.assignments[key]=items;
    ensurePostNightRest(src.employee.id,src.day,replacement,{dirty:false});
    state.localDirty=true;
    saveState();
    replacementContext=null;
    renderAll();
    openAssignment(src.employee.id,src.day);
    toast('Turno sostituito',`${normalizeCode(src.item)} → ${normalizeCode(replacement)}`,'success');
  }
  function addSimple(item){appendAssignment(item);}
  function add118(){const e=currentEmployee(),shift=$('#fShift').value,site=$('#fSite').value,machine=(site==='G'&&!['N','PN'].includes(shift))?$('#fMachine').value:'3',role=$('#fRole').value;const derogationCode=$('#fDerogationCode')?.value||'',derogationAuthorizedBy=$('#fDerogationAuthorizedBy')?.value.trim()||'';if(derogationCode&&!derogationAuthorizedBy)return toast('Autorizzazione mancante','Indica chi autorizza la deroga art. 27.','error');const item={category:'118',shift,site,machine,role,note:$('#fNote').value.trim(),locked:$('#fLocked').value==='SI',workRegime:$('#fWorkRegime')?.value||'ORDINARY',derogationCode,derogationAuthorizedBy,recoveryRequired:!!derogationCode,recoveryDue:$('#fDerogationRecoveryDue')?.value||'',ccnlRef:derogationCode?'Art. 27':'',splitAllowed:$('#fSplitAllowed')?.checked===true};const hard=[];if(e.turno==='Amministrazione')hard.push('Il personale amministrativo non può essere assegnato al 118.');if(site!=='G'&&e.sedeSolo==='G')hard.push('Dipendente abilitato solo a Gallarate.');if(role==='A'&&!e.autista)hard.push('Abilitazione Autista assente.');if(role==='C'&&!e.capo)hard.push('Abilitazione Capo equipaggio assente.');if(role==='S'&&!e.soccorritore)hard.push('Abilitazione Soccorritore assente.');if(hard.length)return toast('Assegnazione non consentita',hard.join(' '),'error');if(e.turno==='RO')return confirmDialog('Uso del Responsabile Operativo','Copertura 118 straordinaria',`Stai assegnando ${employeeName(e)} al 118. Conferma che non risultano altre risorse.`,()=>appendAssignment(item));appendAssignment(item);}
  function addResp(){const code=$('#fResp').value,e=currentEmployee(),allowed={GRA:'Autoparco',GRM:'Magazzino',GRS:'Secondari',GRO:'Operativo'}[code];if(e.responsabile!==allowed)return confirmDialog('Responsabilità non prevista','Conferma manuale',`${employeeName(e)} non è indicato come responsabile ${allowed}.`,()=>addSimple({category:'RESP',type:code,code}));addSimple({category:'RESP',type:code,code});}
  function addAm(){if(currentEmployee().turno!=='Amministrazione')return toast('Assegnazione non consentita','Attività riservata alle amministrative.','error');const code=$('#fAm').value;addSimple({category:'AM',type:code,code});}
  function addForm(){const start=$('#fStart').value,end=$('#fEnd').value,hours=numeric($('#fHours').value),note=$('#fNote').value.trim();if(!start||!end||!hours)return toast('Dati incompleti','Inserisci orari e ore riconosciute.','error');const w=shiftWindow('CUSTOM',state.activeCell.day,start,end);appendAssignment({category:'FORM',type:'FORM',code:'FORM',start,end,nextDay:w.nextDay,hours,note});}
  function addAbs(){
    const code=$('#fAbs').value,hours=numeric($('#fAbsHours').value),start=$('#fAbsStart').value,end=$('#fAbsEnd').value,e=currentEmployee(),meta=absenceMeta(code),bad=(code==='L104/92'&&!e.l104)||(code==='AVIS'&&!e.avis)||(code==='CONG'&&!e.congedo),recoveryDue=resolvedRecoveryDue(state.activeCell.day,meta,$('#fAbsRecoveryDue')?.value||'');
    if(meta.hourlyOnly&&!(start&&end))return toast('Permesso solo a ore',`${code} non può coprire l’intera giornata.`,'error');
    if(recoveryDueIsMandatory(meta)&&!recoveryDue)return toast('Scadenza recupero obbligatoria',`${code} richiede una data entro cui completare il recupero.`,'error');
    const item={category:'ABS',type:code,code,hours,start:start||'',end:end||'',allDay:!(start&&end),note:$('#fNote').value.trim(),eventDate:$('#fAbsEventDate')?.value||'',recoveryRequired:!!meta.requiresRecovery,recoveryDue,ccnlRef:meta.ccnlRef};
    if(start&&end)item.nextDay=shiftWindow('CUSTOM',state.activeCell.day,start,end).nextDay;
    if(bad)return confirmDialog('Causale non presente in matrice','Verifica autorizzazione',`La matrice non riporta ${code} per ${employeeName(e)}.`,()=>appendAssignment(item));
    appendAssignment(item);
  }
  function addRc(){const code=$('#fRc').value,hours=numeric($('#fRcHours').value),meta=absenceMeta(code),referenceDate=$('#fRcReferenceDate')?.value||'';if(meta.referenceRequired&&!referenceDate)return toast('Data di riferimento mancante',`${code} richiede la festività, deroga o permesso da recuperare.`,'error');if(meta.minHours&&hours<meta.minHours)return toast('Blocco minimo non rispettato',`${code} richiede almeno ${meta.minHours} ore.`,'error');appendAssignment({category:'RC',type:code,code,hours,allDay:true,linkedEventDay:referenceDate,ccnlRef:meta.ccnlRef});}
  function addCustom(){const code=$('#fCustomCode').value.trim().toUpperCase(),start=$('#fStart').value,end=$('#fEnd').value,hours=numeric($('#fHours').value),note=$('#fNote').value.trim(),derogationCode=$('#fCustomDerogationCode')?.value||'',authorized=$('#fCustomAuthorizedBy')?.value.trim()||'';if(!code)return toast('Codice mancante','','error');if(derogationCode&&!authorized)return toast('Autorizzazione mancante','Indica chi autorizza la deroga art. 27.','error');const w=start&&end?shiftWindow('CUSTOM',state.activeCell.day,start,end):{nextDay:false};appendAssignment({category:'CUSTOM',type:code,code,start,end,nextDay:w.nextDay,hours,note,workRegime:$('#fCustomWorkRegime')?.value||'ORDINARY',derogationCode,derogationAuthorizedBy:authorized,recoveryRequired:!!derogationCode,recoveryDue:$('#fCustomRecoveryDue')?.value||'',ccnlRef:derogationCode?'Art. 27':'',splitAllowed:$('#fCustomSplitAllowed')?.checked===true});}

  function isAllDayBlock(a){return a.allDay||['RC','REST'].includes(a.category)||(['ABS'].includes(a.category)&&!a.start);}
  function qualifiedRoles(e){return[e.autista?'A':'',e.capo?'C':'',e.soccorritore?'S':''].filter(Boolean);}
  function previous118Row(employeeId,day){const start=getDateTime(day,'00:00');return rowsForEmployee(employeeId).filter(r=>r.a.category==='118'&&r.start&&r.start<start).sort((a,b)=>b.start-a.start)[0]||null;}
  function roleCountsFor(employeeId){const counts={A:0,C:0,S:0};rowsForEmployee(employeeId).filter(r=>r.a.category==='118').forEach(r=>{if(counts[r.a.role]!==undefined)counts[r.a.role]++;});return counts;}

  function checkCandidate(e,day,item,{manual=false,allowRo=false}={}){
    const errors=[],warnings=[],d=parseDateKey(day); if(!e)return{errors:['Dipendente non trovato.'],warnings};
    if(!employeeActiveOn(e,day)){
      if(e.attivo===false)errors.push('Dipendente non attivo.');
      else errors.push(`Rapporto di lavoro terminato il ${formatDateIt(e.employmentEndDate)}.`);
    }
    if(!partTimeDayAllowed(e,day,item))errors.push('Giornata o fascia non prevista dall’accordo part-time.');
    if(isNightItem(item,day)&&nightRestrictionActive(e,day)){
      if(e.nightRestriction==='NO_NIGHT')errors.push('Lavoro notturno vietato nel periodo indicato in anagrafica.');
      else if(manual)warnings.push('Il dipendente risulta non disponibile alla notte salvo consenso espresso.');
      else errors.push('Dipendente escluso automaticamente dal lavoro notturno salvo consenso.');
    }
    const itemCode=String(item.code||item.type||'').toUpperCase();
    if(itemCode==='REP'){
      const t=assignmentTimes(item,day);
      if(!t.timed)errors.push('La reperibilità deve avere un orario di inizio e fine.');
      if(t.timed&&(t.hours<4||t.hours>12))errors.push('La reperibilità deve durare da 4 a 12 ore.');
      if(e.onCallNightRestricted&&isNightItem(item,day))errors.push('Reperibilità notturna vietata per questo dipendente.');
      const monthRep=new Set(rowsForEmployee(e.id).filter(r=>String(r.a.code||r.a.type).toUpperCase()==='REP').map(r=>r.day));
      if(!monthRep.has(day)&&monthRep.size>=8)warnings.push('Superato il limite ordinario di 8 giornate di reperibilità nel mese.');
    }
    if(isWorkingAssignment(item)){
      const projected=weekHours(
        e.id,
        parseDateKey(day),
        {day,a:item}
      );
      const weeklyLimit=Number(
        state.settings.weeklyMaxHours||44
      );

      if(e.partTime){
        const contract=Number(e.oreSettimanali)||0;
        const max=Math.min(
          state.settings.weeklyStandardHours||38,
          contract*1.4
        );
        if(
          contract&&
          projected>contract&&
          !e.supplementaryConsent
        ){
          errors.push(
            `Superamento dell’orario part-time (${fmt(projected)}/${fmt(contract)} h) senza consenso al supplementare.`
          );
        }
        if(contract&&projected>max){
          errors.push(
            `Lavoro part-time oltre il limite settimanale configurato (${fmt(max)} h).`
          );
        }
      }else if(projected>weeklyLimit){
        const message=
          `L’assegnazione porterebbe la settimana a ${fmt(projected)} ore, `+
          `oltre il limite configurato di ${fmt(weeklyLimit)}.`;

        if(manual)warnings.push(message);
        else errors.push(message);
      }
    }
    if(item.category==='OP'){
      const meta=operationalShiftMeta(item.code||item.type);
      if(e.turno==='Amministrazione')errors.push('Il personale amministrativo può svolgere solo amministrazione.');
      if(meta?.site==='S'&&e.sedeSolo==='G')errors.push('Somma Lombardo non consentita: dipendente abilitato solo a Gallarate.');
      if(meta?.role==='A'&&!e.autista)errors.push('Abilitazione Autista mancante.');
      if(meta?.role==='C'&&!e.capo)errors.push('Abilitazione Capo Equipaggio mancante.');
      if(meta?.role==='S'&&!e.soccorritore)errors.push('Abilitazione Soccorritore mancante.');
    }
    if(item.category==='118'){
      if(e.turno==='Amministrazione')errors.push('Il personale amministrativo può svolgere solo amministrazione.');
      if(item.site!=='G'&&e.sedeSolo==='G')errors.push(`${item.site==='SU'?'Sumirago':'Somma'} non consentita: dipendente abilitato solo a Gallarate.`);
      if(['N','PN'].includes(item.shift)&&String(item.machine)==='2')errors.push('Di notte tutte le macchine devono essere a 3.');
      if(item.site!=='G'&&String(item.machine)!=='3')errors.push('Somma e Sumirago prevedono esclusivamente equipaggi a 3.');
      if(d.getDay()===6&&item.shift==='P'&&!['G2','Somma'].includes(crewKey(item)))warnings.push('Il sabato pomeriggio la copertura ordinaria dipendenti prevede solo Gallarate macchina a 2 e Somma. Questa assegnazione è extra-ordinaria.');if(item.site==='SU')warnings.push('Sumirago è una postazione manuale al bisogno e non viene inserita dalla generazione automatica.');
      if(item.role==='A'&&!e.autista)errors.push('Abilitazione Autista mancante.');if(item.role==='C'&&!e.capo)errors.push('Abilitazione Capo Equipaggio mancante.');if(item.role==='S'&&!e.soccorritore)errors.push('Abilitazione Soccorritore mancante.');

      const genderExisting=shiftRows(day,item.shift).filter(r=>r.employeeId!==e.id);
      const genderCrew=crewKey(item);
      const genderCrewRows=genderExisting.filter(r=>crewKey(r.a)===genderCrew);
      if(genderCrew==='G2'&&isFemale(e)&&genderCrewRows.length>=1&&genderCrewRows.every(r=>isFemale(r.employee))){
        errors.push('La macchina a 2 di Gallarate non può essere composta da due donne. Assegnare almeno un uomo all’equipaggio.');
      }

      if(e.turno==='RO'&&!allowRo)warnings.push('Il Responsabile Operativo va usato nel 118 solo in estrema urgenza.');
      if(manual){
        const src=replacementSource();
        const duplicates=duplicateSlotRows(day,item,{excludeEmployeeId:src?.employee.id||null,excludeAssignmentId:src?.item.id||null});
        if(duplicates.length)warnings.push(`Ruolo già occupato su ${crewKey(item)} nella fascia ${item.shift}: ${duplicates.map(r=>employeeName(r.employee)).join(', ')}. L’inserimento creerebbe una doppia assegnazione dello stesso ruolo.`);
        const existing=genderExisting;const groups=[...new Set(existing.map(r=>r.employee.turno).filter(g=>['A','B'].includes(g)))];if(['A','B'].includes(e.turno)&&groups.length&&groups.some(g=>g!==e.turno))warnings.push(`Il turno contiene già personale del gruppo ${groups.join('/')}: assegnazione mista A/B.`);
        const crew=genderCrew,crewRows=genderCrewRows,expected=crew==='G2'?2:3;if(crew!=='G2'&&isFemale(e)&&crewRows.length===expected-1&&crewRows.every(r=>isFemale(r.employee)))warnings.push(`L’equipaggio ${crew} risulterà composto solo da donne. ATLAS proverà a riequilibrarlo automaticamente quando possibile.`);
        const prev=previous118Row(e.id,day);if(prev&&prev.a.role===item.role&&qualifiedRoles(e).length>1){const gap=Math.round((parseDateKey(day)-parseDateKey(prev.day))/86400000);if(gap<=1)warnings.push(`Ruolo ${item.role} ripetuto rispetto al turno precedente: valutare la rotazione su ${qualifiedRoles(e).filter(r=>r!==item.role).join(' o ')}.`);}
      }
    }
    if(item.type==='MGSE'&&isWeekend(d))errors.push('MGSE non è previsto nel weekend.');
    if(item.category==='SE'&&(e.turno==='RS'||slug(e.responsabile)==='secondari'))warnings.push('Il Responsabile Secondari viene impiegato nel servizio operativo SE solo per necessità.');


    const same=getAssignments(e.id,day);
    if(item.category==='OP'&&same.some(isWorkingAssignment))errors.push('La sigla operativa non può essere aggiunta insieme ad altre attività lavorative nella stessa giornata.');
    if(item.category!=='OP'&&isWorkingAssignment(item)&&same.some(isOperationalShift))errors.push('È già presente una sigla operativa per l’intera prestazione della giornata.');
    if(item.category==='118'&&same.some(a=>a.category==='SE'))errors.push('Secondari e 118 non possono essere svolti nella stessa giornata.'); if(item.category==='SE'&&same.some(a=>a.category==='118'))errors.push('Secondari e 118 non possono essere svolti nella stessa giornata.');
    if(item.category==='118'&&same.some(a=>a.category==='RESP'))errors.push('Giornata di responsabilità e 118 non sono compatibili nello stesso giorno.');
    if(item.category==='SE'&&same.some(a=>a.category==='RESP'))errors.push('Giornata di responsabilità e Secondari operativi non sono compatibili nello stesso giorno.');
    if(['118','OP','SE','RESP','AM'].includes(item.category)&&same.some(isAllDayBlock))errors.push('È presente un’assenza o un riposo per l’intera giornata.');
    const nt=assignmentTimes(item,day); if(nt.timed){for(const r of rowsForEmployee(e.id)){if(!r.timed)continue;if(nt.start<r.end&&nt.end>r.start)errors.push(`Sovrapposizione con ${normalizeCode(r.a)} del ${r.day}.`);else if(nt.start>=r.end){const rest=(nt.start-r.end)/36e5;if(rest>=0&&rest<state.settings.minRest){if(validDerogation(item))warnings.push(`Deroga art. 27 registrata: riposo di ${fmt(rest)} ore dopo ${normalizeCode(r.a)}.`);else errors.push(`Riposo di ${fmt(rest)} ore dopo ${normalizeCode(r.a)}: minimo ${fmt(state.settings.minRest)}.`);}}else if(r.start>=nt.end){const rest=(r.start-nt.end)/36e5;if(rest>=0&&rest<state.settings.minRest){if(validDerogation(item))warnings.push(`Deroga art. 27 registrata: riposo di ${fmt(rest)} ore prima di ${normalizeCode(r.a)}.`);else errors.push(`Riposo di ${fmt(rest)} ore prima di ${normalizeCode(r.a)}: minimo ${fmt(state.settings.minRest)}.`);}}}}
    return{errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  }


  function validation(severity,title,text,employeeId=null,day=null){return{severity,title,text,employeeId,day};}
  function dedupe(items){const seen=new Set();return items.filter(x=>{const k=[x.severity,x.title,x.text,x.employeeId,x.day].join('|');if(seen.has(k))return false;seen.add(k);return true;});}
  function validateAll(){
    const out=[],rows=allAssignmentRows();
    state.employees.forEach(e=>{
      const timed=rows.filter(r=>r.employeeId===e.id&&r.timed).sort((a,b)=>a.start-b.start);for(let i=1;i<timed.length;i++){const p=timed[i-1],a=timed[i],diff=(a.start-p.end)/36e5;if(a.start<p.end)out.push(validation('error','Sovrapposizione',`${employeeName(e)}: ${normalizeCode(p.a)} e ${normalizeCode(a.a)} si sovrappongono.`,e.id,a.day));else if(diff<state.settings.minRest){const der=validDerogation(a.a)?a.a:validDerogation(p.a)?p.a:null;if(der){out.push(validation('warning','Deroga art. 27 registrata',`${employeeName(e)} ha ${fmt(diff)} ore di riposo; deroga ${der.derogationCode} autorizzata da ${der.derogationAuthorizedBy}.`,e.id,a.day));if(der.recoveryRequired&&!recoverySatisfied(e.id,der))out.push(validation(der.recoveryDue&&der.recoveryDue<dateKey(new Date())?'error':'warning','Recupero deroga da completare',`${employeeName(e)}: programmare il recupero collegato${der.recoveryDue?` entro ${formatDateIt(der.recoveryDue)}`:''}.`,e.id,a.day));}else out.push(validation('error','Riposo insufficiente',`${employeeName(e)} ha ${fmt(diff)} ore tra ${normalizeCode(p.a)} e ${normalizeCode(a.a)}; minimo ${fmt(state.settings.minRest)}.`,e.id,a.day));}}
      monthDates().forEach(d=>{const day=dateKey(d),items=getAssignments(e.id,day),has118=items.some(a=>a.category==='118'),hasSE=items.some(a=>a.category==='SE'),hasResp=items.some(a=>a.category==='RESP'),hasAllAbs=items.some(isAllDayBlock);
        if(
          e.employmentEndType==='DATE'&&
          e.employmentEndDate&&
          day>e.employmentEndDate
        ){
          const work=items.filter(isWorkingAssignment);
          if(work.length)out.push(validation(
            'error',
            'Turno oltre il termine del rapporto',
            `${employeeName(e)} ha il rapporto terminato il ${formatDateIt(e.employmentEndDate)}, ma risultano: ${work.map(normalizeCode).join(', ')}.`,
            e.id,
            day
          ));
        }
if(has118&&hasSE)out.push(validation('error','118 e Secondari nello stesso giorno',`${employeeName(e)} è assegnato sia al 118 sia ai Secondari.`,e.id,day));if(has118&&hasResp)out.push(validation('error','118 e giornata responsabile',`${employeeName(e)} ha 118 e responsabilità nello stesso giorno.`,e.id,day));if(hasSE&&hasResp)out.push(validation('error','Secondari e giornata responsabile',`${employeeName(e)} ha servizio operativo SE e responsabilità nello stesso giorno.`,e.id,day));if(items.some(isWorkingAssignment)&&hasAllAbs)out.push(validation('error','Turno durante assenza',`${employeeName(e)} presenta attività lavorativa durante un’assenza o un riposo per l’intera giornata.`,e.id,day));
        const dailyWork=items.filter(isWorkingAssignment).map(a=>({a,...assignmentTimes(a,day)})).filter(r=>r.timed).sort((a,b)=>a.start-b.start);
        if(state.settings.enforceNoSplitDay&&dailyWork.length>1){for(let i=1;i<dailyWork.length;i++){const gap=(dailyWork[i].start-dailyWork[i-1].end)/36e5;if(gap>0.25&&!dailyWork[i].a.splitAllowed&&!dailyWork[i-1].a.splitAllowed){out.push(validation('error','Giornata lavorativa frazionata',`${employeeName(e)} presenta due fasce separate da ${fmt(gap)} ore. Registrare una prestazione unica o un’autorizzazione esplicita.`,e.id,day));break;}}}
        if(items.some(a=>['MAL','INF'].includes(a.code||a.type))&&items.some(a=>(a.code||a.type)==='F'))out.push(validation('error','Malattia e ferie sovrapposte',`${employeeName(e)} ha malattia/infortunio e ferie nello stesso giorno: le ferie devono essere interrotte.`,e.id,day));
        items.forEach(a=>{if(isNightItem(a,day)&&nightRestrictionActive(e,day)){if(e.nightRestriction==='NO_NIGHT')out.push(validation('error','Lavoro notturno vietato',`${employeeName(e)} risulta assegnato in fascia notturna durante una limitazione attiva.`,e.id,day));else out.push(validation('warning','Notte con consenso da verificare',`${employeeName(e)} è indicato come non disponibile alla notte salvo consenso.`,e.id,day));}const code=String(a.code||a.type||'').toUpperCase();if(code==='REP'){const t=assignmentTimes(a,day);if(!t.timed)out.push(validation('error','Reperibilità senza orario',`${employeeName(e)}: indicare inizio e fine.`,e.id,day));else if(t.hours<4||t.hours>12)out.push(validation('error','Durata reperibilità non conforme',`${employeeName(e)}: ${fmt(t.hours)} ore; durata ammessa 4-12 ore.`,e.id,day));if(e.onCallNightRestricted&&isNightItem(a,day))out.push(validation('error','Reperibilità notturna vietata',`${employeeName(e)} presenta una limitazione attiva.`,e.id,day));}if(a.category==='OP'){const meta=operationalShiftMeta(a.code||a.type);if(e.turno==='Amministrazione')out.push(validation('error','Amministrazione in turno operativo',`${employeeName(e)} non può essere assegnato a ${normalizeCode(a)}.`,e.id,day));if(meta?.site==='S'&&e.sedeSolo==='G')out.push(validation('error','Sede non consentita',`${employeeName(e)} può essere assegnato solo a Gallarate.`,e.id,day));if(meta?.role==='A'&&!e.autista||meta?.role==='C'&&!e.capo||meta?.role==='S'&&!e.soccorritore)out.push(validation('error','Abilitazione mancante',`${employeeName(e)} non è abilitato per ${normalizeCode(a)}.`,e.id,day));}if(a.category==='118'){if(e.turno==='Amministrazione')out.push(validation('error','Amministrazione nel 118',`${employeeName(e)} può svolgere solo amministrazione.`,e.id,day));if(a.site!=='G'&&e.sedeSolo==='G')out.push(validation('error','Sede non consentita',`${employeeName(e)} può essere assegnata solo a Gallarate.`,e.id,day));if(['N','PN'].includes(a.shift)&&String(a.machine)==='2')out.push(validation('error','Macchina a 2 in turno notturno',`${employeeName(e)}: ${normalizeCode(a)} non è valido, di notte le macchine sono sempre a 3.`,e.id,day));if(a.site!=='G'&&String(a.machine)!=='3')out.push(validation('error','Equipaggio sede non valido',`${normalizeCode(a)}: Somma e Sumirago sono sempre equipaggi a 3.`,e.id,day));if(d.getDay()===6&&a.shift==='M'&&!['G2','G3','Somma'].includes(crewKey(a)))out.push(validation('warning','Copertura extra sabato mattina',`${employeeName(e)}: ${normalizeCode(a)} non rientra nella copertura ordinaria del sabato mattina, prevista per Gallarate macchina a 2, Gallarate macchina a 3 e Somma.`,e.id,day));if(d.getDay()===6&&a.shift==='P'&&!['G2','Somma'].includes(crewKey(a)))out.push(validation('warning','Copertura extra sabato pomeriggio',`${employeeName(e)}: ${normalizeCode(a)} non rientra nella copertura ordinaria del sabato pomeriggio, prevista per Gallarate macchina a 2 e Somma.`,e.id,day));if(a.site==='SU')out.push(validation('info','Sumirago inserita manualmente',`${employeeName(e)}: ${normalizeCode(a)} è una copertura al bisogno e non fa parte della generazione ordinaria.`,e.id,day));if(a.role==='A'&&!e.autista||a.role==='C'&&!e.capo||a.role==='S'&&!e.soccorritore)out.push(validation('error','Abilitazione mancante',`${employeeName(e)} non è abilitato al ruolo ${a.role}.`,e.id,day));if(e.turno==='RO')out.push(validation('warning','Responsabile Operativo impiegato nel 118',`${employeeName(e)} deve essere utilizzato solo in estrema urgenza.`,e.id,day));}if(a.type==='MGSE'&&isWeekend(d))out.push(validation('error','MGSE nel weekend','MGSE non è previsto il sabato o la domenica.',e.id,day));if(a.category==='SE'&&(e.turno==='RS'||slug(e.responsabile)==='secondari'))out.push(validation('warning','Raschi impiegato nei Secondari operativi',`${employeeName(e)} è stato utilizzato in MGSE per necessità; normalmente svolge GRS.`,e.id,day));});});
      const repDays=new Set(rows.filter(r=>r.employeeId===e.id&&String(r.a.code||r.a.type).toUpperCase()==='REP').map(r=>r.day)).size;
      if(repDays>8)out.push(validation('warning','Reperibilità oltre il limite ordinario',`${employeeName(e)}: ${repDays} giornate nel mese; il CCNL indica di norma massimo 8.`,e.id,null));
      const stats=employeeStats(e),target=targetHoursFor(e),delta=stats.hours-target;if(delta>15)out.push(validation('warning','Monte ore elevato',`${employeeName(e)} è a +${fmt(delta)} ore rispetto al target ${fmt(target)}.`,e.id,null));else if(delta<-25)out.push(validation('info','Monte ore da completare',`${employeeName(e)} è a ${fmt(delta)} ore rispetto al target ${fmt(target)}.`,e.id,null));
      const eligible=qualifiedRoles(e),counts=roleCountsFor(e.id);if(eligible.length>1){const values=eligible.map(r=>counts[r]),total=values.reduce((a,b)=>a+b,0),max=Math.max(...values),min=Math.min(...values);if(total>=6&&max-min>=5){const detail=eligible.map(r=>`${r} ${counts[r]}`).join(' · ');out.push(validation('warning','Ruoli poco bilanciati',`${employeeName(e)}: ${detail}. Alternare i ruoli quando la copertura lo consente.`,e.id,null));}const ordered=rows.filter(r=>r.employeeId===e.id&&r.a.category==='118').sort((a,b)=>a.start-b.start);let streak=1;for(let i=1;i<ordered.length;i++){if(ordered[i].a.role===ordered[i-1].a.role)streak++;else streak=1;if(streak===3){out.push(validation('warning','Ruolo ripetuto consecutivamente',`${employeeName(e)} ha svolto il ruolo ${ordered[i].a.role} per tre turni 118 consecutivi.`,e.id,ordered[i].day));break;}}}

      const year=Number(state.month.slice(0,4)),workRows=workRowsForEmployee(e.id);
      const monthStart=parseDateKey(`${state.month}-01`),monthEnd=new Date(monthStart);monthEnd.setMonth(monthEnd.getMonth()+1);
      for(let cursor=mondayStart(monthStart);cursor<monthEnd;cursor.setDate(cursor.getDate()+7)){
        const end=new Date(cursor);end.setDate(end.getDate()+7);const h=weekHours(e.id,cursor);
        if(!e.partTime&&h>state.settings.weeklyMaxHours)out.push(validation('error','Settimana oltre 44 ore',`${employeeName(e)}: settimana dal ${formatDateIt(dateKey(cursor))} con ${fmt(h)} ore programmate; massimo ${fmt(state.settings.weeklyMaxHours)}.`,e.id,dateKey(cursor)));
        if(!e.partTime&&h>0&&h<state.settings.weeklyMinHours)out.push(validation('info','Settimana sotto 28 ore',`${employeeName(e)}: settimana dal ${formatDateIt(dateKey(cursor))} con ${fmt(h)} ore; verificare la compensazione multiperiodale.`,e.id,dateKey(cursor)));
      }
      for(let cursor=mondayStart(monthStart);cursor<monthEnd;cursor.setDate(cursor.getDate()+7)){
        const end=new Date(cursor);end.setDate(end.getDate()+14);const units=restUnitsInWindow(workRows,cursor,end,state.settings.weeklyRestHours);
        if(units<state.settings.weeklyRestOccurrences14)out.push(validation('error','Riposo settimanale insufficiente',`${employeeName(e)}: nella finestra ${formatDateIt(dateKey(cursor))} - ${formatDateIt(addDaysKey(dateKey(cursor),13))} risultano ${units} riposi da almeno ${fmt(state.settings.weeklyRestHours)} ore; richiesti ${state.settings.weeklyRestOccurrences14}.`,e.id,dateKey(cursor)));
      }
      const yearStart=new Date(year,0,1),yearEnd=new Date(year+1,0,1),weeks=[];for(let cursor=mondayStart(yearStart);cursor<yearEnd;cursor.setDate(cursor.getDate()+7))weeks.push(weekHours(e.id,cursor));
      const avg=weeks.reduce((s,h)=>s+h,0)/Math.max(1,weeks.length);if(avg>state.settings.weeklyAverageMax)out.push(validation('error','Media settimanale oltre 48 ore',`${employeeName(e)}: media annua disponibile ${fmt(avg)} ore; massimo ${fmt(state.settings.weeklyAverageMax)}.`,e.id,null));
      const overtime=workRegimeHours(e.id,year);if(overtime>state.settings.annualOvertimeExtended)out.push(validation('error','Straordinario oltre limite esteso',`${employeeName(e)}: ${fmt(overtime)} ore classificate supplementari/straordinarie; limite ${fmt(state.settings.annualOvertimeExtended)}.`,e.id,null));else if(overtime>state.settings.annualOvertimeLimit)out.push(validation('warning','Straordinario oltre soglia ordinaria',`${employeeName(e)}: ${fmt(overtime)} ore, soglia ordinaria ${fmt(state.settings.annualOvertimeLimit)}.`,e.id,null));
      const ferie=annualCodeHours(e.id,year,'F'),ferieLimit=e.vacationAnnualHours||state.settings.vacationAnnualHours;if(ferie>ferieLimit)out.push(validation('error','Ferie oltre monte annuo',`${employeeName(e)}: ${fmt(ferie)}/${fmt(ferieLimit)} ore.`,e.id,null));
      const fs=annualCodeHours(e.id,year,'FS'),fsLimit=e.suppressedHolidayAnnualHours||state.settings.suppressedHolidayAnnualHours;if(fs>fsLimit)out.push(validation('error','Festività soppresse oltre monte',`${employeeName(e)}: ${fmt(fs)}/${fmt(fsLimit)} ore.`,e.id,null));
      const pr=annualCodeHours(e.id,year,'PR36');if(pr>state.settings.personalPermitAnnualHours)out.push(validation('error','Permessi personali oltre 36 ore',`${employeeName(e)}: ${fmt(pr)}/${fmt(state.settings.personalPermitAnnualHours)} ore.`,e.id,null));if(pr>0&&fs<fsLimit)out.push(validation('warning','Permesso art. 33 prima delle festività soppresse',`${employeeName(e)} ha usato PR36 ma risultano ancora ${fmt(fsLimit-fs)} ore FS disponibili.`,e.id,null));
      if(annualCodeDays(e.id,year,'GRAVI')>5)out.push(validation('error','Permesso gravi ragioni oltre limite',`${employeeName(e)} supera 5 giorni annui.`,e.id,null));
      annualRows(e.id,year).filter(r=>isProtectedCalendarRecord(r.a)).forEach(r=>{const code=r.a.code||r.a.type,meta=absenceMeta(code);if(code==='PR36'){if(r.a.allDay||Number(r.hours)>dailyContractHours(e)/2)out.push(validation('error','Permesso art. 33 non conforme',`${employeeName(e)}: ${formatDateIt(r.day)} supera metà dell’orario giornaliero o è a giornata intera.`,e.id,r.day));}if(code==='RCB'&&Number(r.hours)<state.settings.bankHoursMinBlock)out.push(validation('error','Banca ore sotto il blocco minimo',`${employeeName(e)}: ${formatDateIt(r.day)} contiene ${fmt(r.hours)} ore, minimo ${fmt(state.settings.bankHoursMinBlock)}.`,e.id,r.day));if(meta.eventRequired&&!r.a.eventDate)out.push(validation('error','Data evento mancante',`${employeeName(e)}: ${code} del ${formatDateIt(r.day)} richiede la data dell’evento.`,e.id,r.day));if(code==='LUTTO'&&r.a.eventDate&&(daysBetween(r.a.eventDate,r.day)<0||daysBetween(r.a.eventDate,r.day)>7))out.push(validation('error','Permesso lutto fuori termine',`${employeeName(e)}: ${formatDateIt(r.day)} non è entro 7 giorni dall’evento.`,e.id,r.day));if(r.a.recoveryRequired&&!recoverySatisfied(e.id,r.a)){
        const missingDue=!r.a.recoveryDue,dueInViewedMonth=!!r.a.recoveryDue&&r.a.recoveryDue<=endOfMonthKey(state.month),overdue=!!r.a.recoveryDue&&r.a.recoveryDue<dateKey(new Date());
        out.push(validation(missingDue||dueInViewedMonth||overdue?'error':'warning',missingDue?'Scadenza recupero obbligatoria mancante':'Recupero permesso da completare',`${employeeName(e)}: ${code} del ${formatDateIt(r.day)}${r.a.recoveryDue?` da recuperare entro ${formatDateIt(r.a.recoveryDue)}`:' senza scadenza configurata'}.`,e.id,r.day));
      }});
    });
    workdays().forEach(d=>{const day=dateKey(d),count=rows.filter(r=>r.day===day&&r.a.category==='SE').length;if(count<2){if(required118OnDay(day))out.push(validation('info','MGSE ridotto per priorità 118',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 risorse MGSE. Riduzione ammessa perché nella giornata è richiesta copertura 118, che ha priorità.`,null,day));else out.push(validation('warning','Secondari sotto il minimo',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 persone operative in MGSE senza una fascia 118 richiesta che giustifichi la riduzione.`,null,day));}if(count>2)out.push(validation('error','Troppi dipendenti nei Secondari',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone, massimo 2.`,null,day));});
    const preferredSeEmployee=ordinarySecondariPreferredEmployee();
    if(preferredSeEmployee){const preferredDays=preferredSecondariDayCount(preferredSeEmployee.id),preferredMin=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0))),preferredMax=Math.max(preferredMin,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));if(preferredDays<preferredMin)out.push(validation('warning','Prevalente Secondari sotto il minimo',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE, minimo ${preferredMin}.`,preferredSeEmployee.id,null));if(preferredDays>preferredMax)out.push(validation('warning','Prevalente Secondari oltre il massimo',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE, massimo ${preferredMax}.`,preferredSeEmployee.id,null));}
    monthDates().forEach(d=>{const day=dateKey(d);['M','P','N'].forEach(shift=>{if(state.requirements[`${day}|${shift}`]!=='required')return;const cov=coverageFor(day,shift);Object.entries(cov).forEach(([crew,roles])=>Object.entries(roles).forEach(([role,people])=>{if(!people.length)out.push(validation('error','Ruolo 118 scoperto',`${DOW[d.getDay()]} ${d.getDate()} · ${shift} · ${crew}: manca ${role}.`,null,day));if(people.length>1)out.push(validation('error','Ruolo duplicato',`${DOW[d.getDay()]} ${d.getDate()} · ${shift} · ${crew}: ${role} assegnato a più persone.`,null,day));}));
      const sr=shiftRows(day,shift),groups=[...new Set(sr.map(r=>r.employee.turno).filter(g=>['A','B'].includes(g)))],crossRows=sr.filter(r=>r.a.crossGroup===true);
      if(groups.length>1)out.push(validation('warning','Gruppi A/B mischiati',`${DOW[d.getDay()]} ${d.getDate()} · ${shift}: sono presenti dipendenti dei gruppi A e B. Il cross è stato utilizzato per completare la copertura.`,null,day));
      if(crossRows.length){const detail=crossRows.map(r=>`${employeeName(r.employee)} (${r.a.crossGroupFrom||'?'}→${r.a.crossGroupTo||r.employee.turno})`).join(', ');out.push(validation('warning','Cross A/B automatico',`${DOW[d.getDay()]} ${d.getDate()} · ${shift}: ${detail}. Cross eseguito per non lasciare ruoli scoperti.`,null,day));}
      const emergencyRows=sr.filter(r=>r.a.emergencyCoverage===true);if(emergencyRows.length)out.push(validation('warning','Copertura emergenziale RO/RS',`${DOW[d.getDay()]} ${d.getDate()} · ${shift}: ${emergencyRows.map(r=>employeeName(r.employee)).join(', ')} utilizzati dopo aver esaurito le soluzioni A/B/Libere.`,null,day));
      Object.keys(cov).forEach(crew=>{const cr=sr.filter(r=>crewKey(r.a)===crew),expected=crew==='G2'?2:3;if(cr.length===expected&&cr.every(r=>isFemale(r.employee))){if(crew==='G2')out.push(validation('error','Macchina a 2 composta da due donne',`${DOW[d.getDay()]} ${d.getDate()} · ${shift} · Gallarate macchina a 2: configurazione non consentita. Inserire almeno un uomo.`,null,day));else out.push(validation('warning','Equipaggio tutto femminile',`${DOW[d.getDay()]} ${d.getDate()} · ${shift} · ${crew}: ATLAS non ha trovato un riequilibrio valido con almeno un uomo, nel rispetto di ruoli, riposi, sedi e gruppi.`,null,day));}});
    });});

    const currentYear=Number(
      state.month.slice(0,4)
    );
    const currentMonthStart=`${state.month}-01`;
    const currentMonthEnd=endOfMonthKey(
      state.month
    );

    state.employees.forEach(e=>{
      [currentYear-1,currentYear].forEach(year=>{
        rfsEntitlementLedger(e.id,year)
          .filter(item=>
            !item.used&&
            item.sourceDay<=currentMonthEnd
          )
          .forEach(item=>{
            const expired=item.due<currentMonthStart;
            const dueThisMonth=item.due>=currentMonthStart&&item.due<=currentMonthEnd;
            out.push(validation(
              expired||dueThisMonth?'error':'warning',
              expired?'RFS scaduto entro 30 giorni':dueThisMonth?'RFS obbligatorio non programmato':'RFS da programmare',
              expired
                ?`${employeeName(e)} non ha fruito entro 30 giorni l’RFS maturato il ${formatDateIt(item.sourceDay)}. Scadenza ${formatDateIt(item.due)}: verificare la liquidazione prevista dall’art. 29.`
                :`${employeeName(e)} deve fruire l’RFS maturato il ${formatDateIt(item.sourceDay)} entro il ${formatDateIt(item.due)}.`,
              e.id,
              item.sourceDay
            ));
          });
      });
    });
    monthDates().forEach(d=>{const day=dateKey(d),active=state.employees.filter(e=>employeeActiveOn(e,day)).length,study=new Set(rowsForDay(day).filter(r=>(r.a.code||r.a.type)==='STUDIO').map(r=>r.employeeId)).size,bank=new Set(rowsForDay(day).filter(r=>(r.a.code||r.a.type)==='RCB').map(r=>r.employeeId)).size,studyMax=Math.max(1,Math.floor(active*.03)),bankMax=Math.max(1,Math.floor(active*.10));if(study>studyMax)out.push(validation('warning','Permessi studio oltre il 3%',`${formatDateIt(day)}: ${study} dipendenti, soglia indicativa ${studyMax}.`,null,day));if(bank>bankMax)out.push(validation('warning','Banca ore oltre il 10%',`${formatDateIt(day)}: ${bank} dipendenti, soglia ${bankMax}.`,null,day));});
        state.employees.filter(e=>e.responsabile&&['autoparco','magazzino'].includes(slug(e.responsabile))).forEach(e=>{const code=slug(e.responsabile)==='autoparco'?'GRA':'GRM',count=rows.filter(r=>r.employeeId===e.id&&r.a.type===code).length;if(count<state.settings.respMin)out.push(validation('warning',`${code} sotto il minimo`,`${employeeName(e)}: ${count}/${state.settings.respMin}, obiettivo ${state.settings.respGoal}.`,e.id,null));else if(count<state.settings.respGoal)out.push(validation('info',`${code} vicino all’obiettivo`,`${employeeName(e)}: ${count}/${state.settings.respGoal}.`,e.id,null));});
    return dedupe(out);
  }


  function crewKey(a){return a.site==='SU'?'Sumirago':a.site==='S'?'Somma':a.machine==='2'?'G2':'G3';}
  function shiftRows(day,shift){const cached=state._autoShiftRows||state._renderShiftRows;if(cached)return cached.get(`${day}|${shift}`)||[];const rows=[];Object.entries(state.assignments).forEach(([key,items])=>{const split=key.lastIndexOf('|'),employeeId=key.slice(0,split),rowDay=key.slice(split+1);if(rowDay!==day)return;const employee=state.employees.find(e=>e.id===employeeId);if(!employee)return;items.forEach(a=>{if(a.category==='118'&&(a.shift===shift||(a.shift==='PN'&&['P','N'].includes(shift))))rows.push({employeeId,employee,day,a});});});return rows;}

  function emptyCoverage(day,shift,rows=null){const result={};const sr=rows||shiftRows(day,shift);crewSlotsForDayShift(day,shift).forEach(slot=>{if(!result[slot.crew])result[slot.crew]={};result[slot.crew][slot.role]=[];});if(sr.some(r=>r.a.site==='SU'))result.Sumirago={A:[],C:[],S:[]};return result;}
  function coverageFor(day,shift){const sr=shiftRows(day,shift),result=emptyCoverage(day,shift,sr);sr.forEach(r=>{const crew=crewKey(r.a);if(result[crew]?.[r.a.role])result[crew][r.a.role].push(employeeName(r.employee));});return result;}
  function required118OnDay(day){
    return ['M','P','N'].some(shift=>state.requirements[`${day}|${shift}`]==='required');
  }
  function secondariDayStatus(day){
    const employees=rowsForDay(day).filter(r=>r.a.category==='SE');
    const count=employees.length;
    const weekday=!isWeekend(parseDateKey(day));
    const target=weekday?2:0;
    const reduced=weekday&&count<target&&required118OnDay(day);
    return{
      count,target,reduced,
      tone:!weekday?'na':count>=target?'ok':reduced?'reduced':'bad',
      employees,
      label:!weekday?'MGSE non previsti':count>=target?'MGSE ordinario':reduced?'MGSE ridotto · priorità 118':'MGSE sotto minimo'
    };
  }
  function crewHtml(name,roles){const title=name==='Somma'?'SOMMA':name==='Sumirago'?'SUMIRAGO':`GALLARATE ${name.slice(1)}`;return`<div class="crew"><div class="crew-title">${esc(title)}</div>${Object.entries(roles).map(([role,people])=>`<div class="role-row ${people.length?'':'missing'}"><span class="role-code">${role}</span><span class="role-person">${people.length?esc(people.join(', ')):'manca'}</span></div>`).join('')}</div>`;}
  function renderCoverage(){
    const filter=$('#coverageFilter').value;
    const days=[];
    monthDates().forEach(d=>{
      const day=dateKey(d);
      let hasUncovered=false,hasRequired=false,requiredSlots=0,filledSlots=0;
      const shifts=['M','P','N'].map(shift=>{
        const req=state.requirements[`${day}|${shift}`]||'conditional';
        const cov=coverageFor(day,shift);
        let missing=0,total=0;
        Object.values(cov).forEach(roles=>Object.values(roles).forEach(people=>{
          total++;
          if(!people.length)missing++;
        }));
        if(req==='required'){
          hasRequired=true;
          requiredSlots+=total;
          filledSlots+=Math.max(0,total-missing);
          if(missing)hasUncovered=true;
        }
        return{shift,req,cov,missing,total};
      });
      const se=secondariDayStatus(day);
      const include=filter==='all'||
        filter==='required'&&hasRequired||
        filter==='uncovered'&&hasUncovered||
        filter==='weekdays'&&!isWeekend(d)||
        filter==='weekends'&&isWeekend(d)||
        filter==='se-reduced'&&se.reduced;
      if(include)days.push({d,day,shifts,se,hasRequired,hasUncovered,requiredSlots,filledSlots});
    });

    const allDays=monthDates().map(d=>{
      const day=dateKey(d);
      let requiredSlots=0,missing=0;
      ['M','P','N'].forEach(shift=>{
        if(state.requirements[`${day}|${shift}`]!=='required')return;
        const cov=coverageFor(day,shift);
        Object.values(cov).forEach(roles=>Object.values(roles).forEach(people=>{
          requiredSlots++;
          if(!people.length)missing++;
        }));
      });
      return{day,requiredSlots,missing,se:secondariDayStatus(day),weekday:!isWeekend(d)};
    });
    const totalRequired=allDays.reduce((sum,row)=>sum+row.requiredSlots,0);
    const totalMissing=allDays.reduce((sum,row)=>sum+row.missing,0);
    const completeDays=allDays.filter(row=>row.requiredSlots>0&&row.missing===0).length;
    const reducedSeDays=allDays.filter(row=>row.weekday&&row.se.reduced).length;

    const kpis=`<div class="coverage-dashboard-kpis">
      <article><span>Ruoli richiesti</span><strong>${totalRequired}</strong><small>${Math.max(0,totalRequired-totalMissing)} coperti</small></article>
      <article class="${totalMissing?'bad':'good'}"><span>Ruoli scoperti</span><strong>${totalMissing}</strong><small>${totalMissing?'da risolvere':'copertura completa'}</small></article>
      <article class="good"><span>Giorni 118 completi</span><strong>${completeDays}</strong><small>fasce richieste senza buchi</small></article>
      <article class="${reducedSeDays?'warn':'good'}"><span>MGSE ridotti</span><strong>${reducedSeDays}</strong><small>priorità assegnata al 118</small></article>
    </div>`;

    const list=days.map(({d,day,shifts,se,hasRequired,hasUncovered})=>{
      const tone=hasUncovered?'bad':se.tone==='bad'?'warn':se.reduced?'reduced':'ok';
      const shiftChips=shifts.map(s=>{
        const cls=s.req!=='required'?'idle':s.missing?'bad':'ok';
        const text=s.req!=='required'?'—':s.missing?`−${s.missing}`:'✓';
        return`<span class="coverage-shift-chip ${cls}"><b>${s.shift}</b>${text}</span>`;
      }).join('');
      const seNames=se.employees.map(r=>employeeName(r.employee)).join(', ');
      return`<details class="coverage-day-row ${tone}">
        <summary class="coverage-day-summary">
          <div class="coverage-date-block"><b>${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</b><span>${d.getFullYear()}${preferredGroup(d,'M')?` · M ${preferredGroup(d,'M')} / P ${preferredGroup(d,'P')}`:''}</span></div>
          <div class="coverage-shift-strip">${shiftChips}</div>
          <div class="coverage-se-chip ${se.tone}" title="${esc(seNames||se.label)}"><span>MGSE</span><b>${se.count}/${se.target}</b><small>${seNames?esc(seNames):esc(se.label)}</small></div>
          <span class="coverage-expand">⌄</span>
        </summary>
        <div class="coverage-day-detail">
          ${!isWeekend(d)?`<div class="coverage-priority-note ${se.tone==='bad'?'danger':''}"><strong>MGSE:</strong> ${seNames?esc(seNames):'nessun dipendente assegnato'} · ${se.count}/${se.target}</div>`:''}
          ${se.reduced?`<div class="coverage-priority-note">118 prioritario · MGSE ridotto a ${se.count}/${se.target}. ${seNames?`Presenti: ${esc(seNames)}.`:'Nessuna risorsa MGSE disponibile dopo la copertura 118.'}</div>`:''}
          ${se.tone==='bad'?`<div class="coverage-priority-note danger">MGSE sotto il minimo senza una fascia 118 richiesta nella giornata.</div>`:''}
          ${shifts.map(s=>{
            const status=s.req==='required'?(s.missing?'bad':'ok'):'warn';
            const w=shiftWindow(s.shift,day);
            const crewCards=Object.entries(s.cov).map(([name,roles])=>crewHtml(name,roles)).join('');
            return`<div class="shift-coverage compact">
              <div class="coverage-top"><span class="shift-pill">${s.shift}</span><strong>${w.start}–${w.end}</strong><span class="coverage-status ${status}"></span><div class="req-toggle"><button data-req-day="${day}" data-req-shift="${s.shift}" class="${s.req}">${s.req==='required'?'Richiesto':'Da definire'}</button></div></div>
              <div class="crew-grid">${crewCards}</div>
            </div>`;
          }).join('')}
        </div>
      </details>`;
    }).join('')||'<div class="empty-state"><div><strong>Nessun giorno corrisponde al filtro</strong>Modifica il filtro per visualizzare altre giornate.</div></div>';

    $('#coverageGrid').innerHTML=kpis+`<div class="coverage-dashboard-list">${list}</div>`;
    $$('[data-req-day]').forEach(b=>b.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const k=`${b.dataset.reqDay}|${b.dataset.reqShift}`;
      state.requirements[k]=state.requirements[k]==='required'?'conditional':'required';
      state.localDirty=true;
      saveState();
      renderAll();
    }));
  }
  function renderCcnlDashboard(){
    const host=$('#ccnlDashboard');if(!host)return;const year=Number(state.month.slice(0,4));
    const weeklyErrors=state.validations.filter(v=>['Settimana oltre 44 ore','Riposo settimanale insufficiente','Media settimanale oltre 48 ore'].includes(v.title)).length;
    const recovery=state.validations.filter(v=>/Recupero/.test(v.title)).length;
    const permits=state.validations.filter(v=>/Ferie|Permess|Festività soppresse|Banca ore/.test(v.title)).length;
    const overtime=state.employees.reduce((s,e)=>s+workRegimeHours(e.id,year),0);
    const rfsRemaining=state.employees.reduce((sum,e)=>sum+rfsCounter(e.id,year).remaining,0);
    host.innerHTML=[
      ['Riposi e orario',weeklyErrors,weeklyErrors?'bad':'good',weeklyErrors?'Controlli CCNL da correggere':'Nessuna violazione rilevata'],
      ['RFS disponibili',rfsRemaining,rfsRemaining?'warn':'good','Permessi per festività lavorate ancora da collocare'],
      ['Recuperi aperti',recovery,recovery?'warn':'good','Festività, deroghe e permessi recuperabili'],
      ['Permessi / ferie',permits,permits?'warn':'good','Contatori e limiti annuali'],
      ['Ore extra classificate',`${fmt(overtime)} h`,overtime>0?'warn':'good','Supplementare, straordinario e banca ore']
    ].map(([label,value,cls,note])=>`<article class="ccnl-card"><div class="ccnl-card-label">${esc(label)}</div><div class="ccnl-card-value ${cls}">${esc(value)}</div><div class="ccnl-card-note">${esc(note)}</div></article>`).join('');
  }
  function renderSummary(){
    const year=Number(state.month.slice(0,4));
    const head=[
      'Dipendente','Gruppo','Target','Ore','Saldo','Max settimana',
      'Ferie','FS','PR36','RFS maturati','RFS fruiti','RFS residui',
      'Ore extra','M','P','N/P+N','Ruolo A','Ruolo C','Ruolo S',
      'Weekend','SE','GRA','GRM','GRO','FORM','Assenze','AM','Auto'
    ];
    let html=`<thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>`;

    state.employees.filter(e=>employeeVisibleInMonth(e)).forEach(e=>{
      const s=employeeStats(e),
        target=targetHoursFor(e),
        delta=s.hours-target,
        cls=Math.abs(delta)<=2?'hours-ok':delta>0?'hours-pos':'hours-neg',
        weeks=monthDates().filter(d=>d.getDay()===1).map(d=>weekHours(e.id,d)),
        maxWeek=weeks.length?Math.max(...weeks):0,
        rfs=rfsCounter(e.id,year);

      html+=`<tr>
        <td><strong>${esc(employeeName(e))}</strong><div class="muted" style="font-size:9px;margin-top:2px">${esc(employeeMeta(e))}</div></td>
        <td>${esc(e.turno==='Amministrazione'?'AMM':e.turno)}</td>
        <td>${fmt(target)}</td>
        <td class="hours-cell">${fmt(s.hours)}</td>
        <td class="hours-cell ${cls}">${delta>0?'+':''}${fmt(delta)}</td>
        <td>${fmt(maxWeek)}</td>
        <td>${fmt(annualCodeHours(e.id,year,'F'))}</td>
        <td>${fmt(annualCodeHours(e.id,year,'FS'))}</td>
        <td>${fmt(annualCodeHours(e.id,year,'PR36'))}</td>
        <td>${rfs.earned}</td>
        <td>${rfs.used}</td>
        <td><span class="rfs-badge">${rfs.remaining}</span></td>
        <td>${fmt(workRegimeHours(e.id,year))}</td>
        <td>${s.M}</td><td>${s.P}</td><td>${s.N}</td>
        <td>${s.roleA}</td><td>${s.roleC}</td><td>${s.roleS}</td>
        <td>${s.weekends}</td><td>${s.se}</td><td>${s.gra}</td>
        <td>${s.grm}</td><td>${s.gro}</td><td>${s.form}</td>
        <td>${s.abs}</td><td>${s.am}</td><td>${s.auto}</td>
      </tr>`;
    });

    html+='</tbody>';
    $('#summaryTable').innerHTML=html;
  }
  function renderAnomalies(){
    const filter=$('#anomalyFilter').value;
    const priority={error:0,warning:1,info:2};
    const labels={
      error:'Bloccante',
      warning:'Da verificare',
      info:'Informativo'
    };

    const items=state.validations
      .filter(item=>
        filter==='all'||
        item.severity===filter
      )
      .sort((a,b)=>
        (priority[a.severity]??9)-
        (priority[b.severity]??9)||
        String(a.day||'9999-12-31').localeCompare(
          String(b.day||'9999-12-31')
        )||
        String(a.title||'').localeCompare(
          String(b.title||'')
        )
      );

    $('#anomalyList').innerHTML=items.length
      ?items.map(item=>`
        <div class="anomaly ${item.severity}">
          <div class="anomaly-icon">
            ${item.severity==='error'
              ?'!'
              :item.severity==='warning'
                ?'△'
                :'i'
            }
          </div>
          <div>
            <div class="anomaly-title">
              ${esc(item.title)}
            </div>
            <div class="anomaly-text">
              ${esc(item.text)}
            </div>
          </div>
          <span class="anomaly-priority">
            ${labels[item.severity]||'Informativo'}
          </span>
          ${item.employeeId&&item.day
            ?`<button class="btn small" data-jump-employee="${item.employeeId}" data-jump-day="${item.day}">Apri</button>`
            :''
          }
        </div>
      `).join('')
      :'<div class="empty-state"><div><strong>Nessuna anomalia</strong>Il calendario supera i controlli selezionati.</div></div>';

    $$('[data-jump-employee]').forEach(button=>
      button.addEventListener('click',()=>{
        switchView('calendarView');
        openAssignment(
          button.dataset.jumpEmployee,
          button.dataset.jumpDay
        );
      })
    );
  }
  function renderKpis(){const uncovered=state.validations.filter(v=>v.title==='Ruolo 118 scoperto').length,errors=state.validations.filter(v=>v.severity==='error'&&v.title!=='Ruolo 118 scoperto').length,warnings=state.validations.filter(v=>v.severity==='warning').length,seOk=workdays().filter(d=>{const day=dateKey(d),c=rowsForDay(day).filter(r=>r.a.category==='SE').length;return c>=state.settings.seTarget;}).length;$('#kpiErrors').textContent=errors;$('#kpiWarnings').textContent=warnings;$('#kpiUncovered').textContent=uncovered;$('#kpiSeOk').textContent=seOk;const required=monthDates().reduce((n,d)=>n+['M','P','N'].reduce((sum,s)=>sum+(state.requirements[`${dateKey(d)}|${s}`]==='required'?crewSlotsForDayShift(d,s).length:0),0),0),filled=allAssignmentRows().filter(r=>r.a.category==='118').length,pct=Math.min(100,Math.round(filled/Math.max(1,required)*100));$('#completionText').textContent=`${pct}%`;$('#completionBar').style.width=`${pct}%`;const chip=$('#monthStatusChip');chip.textContent=!filled?'Bozza':errors?'Da correggere':uncovered?'Incompleto':warnings?'Da verificare':'Valido';chip.style.color=!filled?'var(--muted)':errors?'#ffb0bd':warnings||uncovered?'#ffd978':'#84edbd';}

  function employeeEligibleRole(e,role){return role==='A'?e.autista:role==='C'?e.capo:e.soccorritore;}

  // Vincoli inseriti prima della generazione: non devono mai essere cancellati
  // dalla generazione automatica, anche quando si sceglie di rigenerare da zero.
  function isMandatoryGenerationConstraint(a){
    if(!a)return false;
    if(a.category==='ABS'||a.category==='RC')return true;
    // I riposi manuali/bloccati restano vincoli; quelli AUTO possono essere rigenerati.
    if(a.category==='REST'&&(a.locked||sourceLabel(a)!=='AUTO'))return true;
    return false;
  }
  function snapshotMandatoryGenerationConstraints(){
    const snapshot={};
    Object.entries(state.assignments||{}).forEach(([key,items])=>{
      const keep=(items||[]).filter(isMandatoryGenerationConstraint).map(item=>structuredClone(item));
      if(keep.length)snapshot[key]=keep;
    });
    return snapshot;
  }
  function restoreMandatoryGenerationConstraints(snapshot){
    Object.entries(snapshot||{}).forEach(([key,items])=>{
      const current=[...(state.assignments[key]||[])];
      const ids=new Set(current.map(item=>item.id));
      (items||[]).forEach(item=>{
        if(!ids.has(item.id)){current.push(structuredClone(item));ids.add(item.id);}
      });
      if(current.length)state.assignments[key]=current;
    });
  }

  // Preferenza SOFT e non bloccante: se la settimana è già orientata su una sede,
  // ATLAS prova a mantenerla. Il dato è letto da una cache O(1), così il criterio
  // non può rallentare il backtracking degli equipaggi.
  function weeklySiteContinuityAdjustment(employeeId,day,item){
    if(item?.category!=='118'||!['G','S'].includes(item.site))return 0;
    const weekStart=dateKey(mondayStart(parseDateKey(day)));
    const bucket=state._autoSiteWeekCache?.get(`${employeeId}|${weekStart}`);
    if(!bucket)return 0;
    const same=Number(bucket[item.site]||0);
    const other=Number(bucket[item.site==='G'?'S':'G']||0);
    let adjustment=0;
    if(same)adjustment-=Math.min(18,4+same*4);
    if(other)adjustment+=Math.min(28,6+other*6);
    return adjustment;
  }

  function candidateScore(e,day,item,preferred,{preferMale=false,preserveMale=false,ignoreSiteContinuity=false}={}){
    const st=employeeStats(e),
      target=Math.max(targetHoursFor(e),1),
      counts=roleCountsFor(e.id),
      eligible=qualifiedRoles(e),
      projectedWeek=isWorkingAssignment(item)
        ?weekHours(e.id,parseDateKey(day),{day,a:item})
        :weekHours(e.id,parseDateKey(day)),
      weeklyLimit=Math.max(
        1,
        Number(state.settings.weeklyMaxHours||44)
      );

    let score=
      st.hours/target*100+
      st.M+
      st.P+
      st.N*1.5+
      st.weekends*2+
      projectedWeek/weeklyLimit*58;

    if(projectedWeek>weeklyLimit-8){
      score+=(projectedWeek-(weeklyLimit-8))*9;
    }
    if(preferred){if(e.turno===preferred)score-=12;else if(e.turno==='Libera')score-=10;else if(['A','B'].includes(e.turno))score+=45;}
    if(preferMale&&isMale(e))score-=42;if(preferMale&&isFemale(e))score+=8;
    if(preserveMale&&isMale(e))score+=36;if(preserveMale&&isFemale(e))score-=4;
    if(item.category==='118'&&item.role){const minEligible=eligible.length?Math.min(...eligible.map(r=>counts[r])):0;score+=(counts[item.role]-minEligible)*15+counts[item.role]*2;const prev=previous118Row(e.id,day);if(prev){const days=(parseDateKey(day)-parseDateKey(prev.day))/86400000;if(prev.a.role===item.role&&eligible.length>1)score+=days<=1?38:16;else if(prev.a.role!==item.role&&eligible.length>1)score-=5;}}
    if(item.role==='S'){if(!e.autista&&!e.capo)score-=8;else score+=2;}
    if(item.category==='SE'&&String(state.settings.sePreferredEmployeeId||'')===String(e.id||''))score-=24;
    // La continuità di sede è solo una preferenza. Nei retry di copertura viene azzerata.
    if(!ignoreSiteContinuity)score+=weeklySiteContinuityAdjustment(e.id,day,item);
    if(e.responsabile)score+=4;if(e.turno==='RS')score+=400;if(e.turno==='RO')score+=1000;const hash=[...`${e.id}-${day}-${item.shift}-${item.site}-${item.role}`].reduce((a,c)=>a+c.charCodeAt(0),0)%17;return score+hash/100;
  }

  const RESPONSIBILITY_118_FALLBACK_TYPES=new Set(['GRS','GRA','GRM','GRO']);
  function fallbackResponsibilityCode(employee,day){
    const scheduled=getAssignments(employee.id,day).find(item=>item?.category==='RESP'&&RESPONSIBILITY_118_FALLBACK_TYPES.has(String(item.type||item.code||'').toUpperCase()));
    if(scheduled)return String(scheduled.type||scheduled.code||'').toUpperCase();
    const responsible=slug(employee.responsabile||'');
    if(employee.turno==='RS'||responsible==='secondari')return'GRS';
    if(responsible==='autoparco')return'GRA';
    if(responsible==='magazzino')return'GRM';
    if(employee.turno==='RO'||responsible==='operativo')return'GRO';
    return'';
  }
  function releasableResponsibilityAssignments(employee,day){
    return getAssignments(employee.id,day).filter(item=>
      item?.category==='RESP'&&
      RESPONSIBILITY_118_FALLBACK_TYPES.has(String(item.type||item.code||'').toUpperCase())
    );
  }
  function withResponsibilityAssignmentsRemoved(employee,day,items,fn){
    if(!items?.length)return fn();
    const key=assignmentKey(employee.id,day);
    const original=[...getAssignments(employee.id,day)];
    const ids=new Set(items.map(item=>item.id));
    const keep=original.filter(item=>!ids.has(item.id));
    if(keep.length)state.assignments[key]=keep;else delete state.assignments[key];
    refreshAutoCache();
    try{return fn();}
    finally{state.assignments[key]=original;refreshAutoCache();}
  }
  function rankCandidates(day,item,{preferred=null,allowRo=false,pool=null,preferMale=false,preserveMale=false,requireMale=false,allowResponsibilityRelease=false,ignoreSiteContinuity=false}={}){
    let list=(pool||state.employees).filter(e=>employeeActiveOn(e,day)&&e.turno!=='Amministrazione'&&(item.category!=='118'||employeeEligibleRole(e,item.role)));
    if(requireMale)list=list.filter(isMale);
    const ranked=[];
    for(const e of list){
      if(!allowRo&&e.turno==='RO')continue;
      let releases=[];
      let check=checkCandidate(e,day,item,{allowRo});
      if(check.errors.length&&allowResponsibilityRelease&&fallbackResponsibilityCode(e,day)){
        releases=releasableResponsibilityAssignments(e,day);
        if(releases.length){
          check=withResponsibilityAssignmentsRemoved(e,day,releases,()=>checkCandidate(e,day,item,{allowRo:true}));
        }
      }
      if(check.errors.length)continue;
      let score=candidateScore(e,day,item,preferred,{preferMale,preserveMale,ignoreSiteContinuity});
      // GRS/GRA/GRM/GRO sono risorse di emergenza: vengono usate solo nel fallback.
      if(allowResponsibilityRelease&&fallbackResponsibilityCode(e,day))score+=180;
      ranked.push({e,score,releaseResponsibilities:releases,fallbackResponsibility:fallbackResponsibilityCode(e,day)});
    }
    return ranked.sort((a,b)=>a.score-b.score||employeeName(a.e).localeCompare(employeeName(b.e)));
  }
  function chooseCandidate(day,item,options={}){
    return rankCandidates(day,item,options)[0]?.e||null;
  }

  function volunteerHoleItem(hole,role){
    const day=String(hole?.day||'').slice(0,10);
    const shift=String(hole?.shift||'').toUpperCase();
    const site=String(hole?.site||'G').toUpperCase();
    const machine=String(hole?.machine||'3');
    const customStart=String(hole?.start||'');
    const customEnd=String(hole?.end||'');
    const window=shiftWindow(
      shift==='CUSTOM'?'CUSTOM':shift,
      day,
      customStart,
      customEnd
    );

    return{
      id:`VOL-ANALYSIS-${role}`,
      category:'118',
      type:shift,
      code:shift,
      shift,
      site,
      machine,
      role,
      start:customStart||window.start,
      end:customEnd||window.end,
      nextDay:window.nextDay,
      hours:window.hours,
      origin:'ANALISI_VOLONTARI',
      locked:true,
      status:'PROPOSTO',
      coverage:'VOLONTARI'
    };
  }

  function volunteerEmployeeAllowed(employee,role){
    return Boolean(
      employee&&
      employee.attivo!==false&&
      employee.turno!=='Amministrazione'&&
      employeeEligibleRole(employee,role)
    );
  }

  function withVolunteerAssignmentRemoved(employeeId,day,assignmentId,fn){
    const key=assignmentKey(employeeId,day);
    const original=state.assignments[key]||[];
    const filtered=original.filter(item=>item.id!==assignmentId);

    if(filtered.length){
      state.assignments[key]=filtered;
    }else{
      delete state.assignments[key];
    }

    try{
      return fn();
    }finally{
      if(original.length){
        state.assignments[key]=original;
      }else{
        delete state.assignments[key];
      }
    }
  }


  function withVolunteerAssignmentsRemoved(employeeId,day,assignmentIds,fn){
    const key=assignmentKey(employeeId,day);
    const original=state.assignments[key]||[];
    const ids=new Set(assignmentIds||[]);
    const filtered=original.filter(item=>!ids.has(item.id));
    if(filtered.length)state.assignments[key]=filtered;else delete state.assignments[key];
    try{return fn();}
    finally{if(original.length)state.assignments[key]=original;else delete state.assignments[key];}
  }

  function volunteerRecoveryRestDay(employeeId,fromDay,toDay){
    const employee=state.employees.find(item=>item.id===employeeId);
    if(!employee)return'';
    const first=parseDateKey(fromDay),last=parseDateKey(toDay),minRest=Number(state.settings.minRest||11);
    for(let cursor=new Date(first);cursor<=last;cursor.setDate(cursor.getDate()+1)){
      const candidateDay=dateKey(cursor);
      if(!candidateDay.startsWith(state.month)||!employeeActiveOn(employee,candidateDay)||getAssignments(employeeId,candidateDay).length)continue;
      const start=getDateTime(candidateDay,'00:00'),finish=getDateTime(candidateDay,'00:00',true);
      const work=rowsForEmployee(employeeId).filter(row=>isWorkingAssignment(row.a)&&row.timed);
      const previous=work.filter(row=>row.end<=start).sort((a,b)=>b.end-a.end)[0];
      const next=work.filter(row=>row.start>=finish).sort((a,b)=>a.start-b.start)[0];
      const before=previous?(start-previous.end)/36e5:Number.POSITIVE_INFINITY;
      const after=next?(next.start-finish)/36e5:Number.POSITIVE_INFINITY;
      if(before>=minRest&&after>=minRest)return candidateDay;
    }
    return'';
  }

  function volunteerSundayRestRelease(employee,day,item){
    if(parseDateKey(day).getDay()!==0)return null;
    const same=[...getAssignments(employee.id,day)];
    const rests=same.filter(entry=>['RC','REST'].includes(entry.category));
    if(!rests.length||same.some(entry=>!['RC','REST'].includes(entry.category)))return null;
    const ids=rests.map(entry=>entry.id);
    const check=withVolunteerAssignmentsRemoved(employee.id,day,ids,()=>checkCandidate(employee,day,item,{manual:false,allowRo:true}));
    if(check.errors.length)return null;
    const times=assignmentTimes(item,day);
    let previousRestHours=Number.POSITIVE_INFINITY;
    if(times.timed){
      const previous=rowsForEmployee(employee.id).filter(row=>row.timed&&!ids.includes(row.a.id)&&row.end<=times.start).sort((a,b)=>b.end-a.end)[0];
      if(previous)previousRestHours=(times.start-previous.end)/36e5;
    }
    if(previousRestHours<Number(state.settings.minRest||11))return null;
    const monthEnd=dateKey(monthDates().at(-1));
    return{rests,check,previousRestHours,recoveryDay:volunteerRecoveryRestDay(employee.id,addDaysKey(day,1),monthEnd)};
  }

  function volunteerMostCommonReasons(reasonMap,limit=3){
    return [...reasonMap.entries()]
      .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'it'))
      .slice(0,limit)
      .map(([reason])=>reason);
  }

  function volunteerDirectOptions(hole,role,item,reasonMap){
    const day=String(hole.day||'').slice(0,10);
    const existing=duplicateSlotRows(day,item);
    if(existing.length)return[{type:'covered',cost:0,role,resources:[],cover:null,replacement:null,sourceItem:null,warnings:[],score:-1000,text:`Ruolo già coperto da ${existing.map(row=>employeeName(row.employee)).join(', ')}`}];

    return state.employees
      .filter(employee=>volunteerEmployeeAllowed(employee,role))
      .map(employee=>{
        const check=checkCandidate(employee,day,item,{manual:false,allowRo:true});
        if(!check.errors.length){
          return{type:'direct',cost:0,role,resources:[employee.id],cover:employee,replacement:null,sourceItem:null,warnings:check.warnings||[],targetHours:Number(item.hours||0),sourceHours:0,score:candidateScore(employee,day,item,null),text:`${employeeName(employee)} può coprire direttamente`};
        }
        const sunday=volunteerSundayRestRelease(employee,day,item);
        if(sunday){
          return{
            type:'sunday-rest',cost:1,role,resources:[employee.id],cover:employee,replacement:null,sourceItem:null,
            releasedRestIds:sunday.rests.map(entry=>entry.id),releasedRestCodes:sunday.rests.map(entry=>normalizeCode(entry)),
            recoveryDay:sunday.recoveryDay||'',previousRestHours:Number(sunday.previousRestHours||0),
            warnings:[...(sunday.check.warnings||[]),sunday.recoveryDay?`Riposo domenicale recuperato il ${formatDateIt(sunday.recoveryDay)}.`:'Riposo domenicale spostato: recupero da programmare.'],
            targetHours:Number(item.hours||0),sourceHours:0,score:candidateScore(employee,day,item,null)+90,
            text:`${employeeName(employee)} può coprire spostando il riposo domenicale${sunday.recoveryDay?` al ${formatDateIt(sunday.recoveryDay)}`:' e recuperandolo successivamente'}`
          };
        }
        check.errors.forEach(error=>reasonMap.set(error,(reasonMap.get(error)||0)+1));
        return null;
      })
      .filter(Boolean)
      .sort((left,right)=>left.cost-right.cost||left.warnings.length-right.warnings.length||left.score-right.score||employeeName(left.cover).localeCompare(employeeName(right.cover),'it'))
      .slice(0,10);
  }

  function volunteerReplacementCandidates(
    sourceEmployee,
    day,
    sourceItem,
    excludedIds
  ){
    return state.employees
      .filter(employee=>
        employee.id!==sourceEmployee.id&&
        employee.attivo!==false&&
        employee.turno!=='Amministrazione'&&
        employee.turno!=='RO'&&
        !excludedIds.has(employee.id)
      )
      .map(employee=>{
        const candidate={
          ...sourceItem,
          id:`VOL-REPL-${sourceItem.id||uid()}`
        };

        const check=checkCandidate(
          employee,
          day,
          candidate,
          {
            manual:false,
            allowRo:true
          }
        );

        if(check.errors.length){
          return null;
        }

        return{
          employee,
          warnings:check.warnings||[],
          score:candidateScore(employee,day,candidate,null)
        };
      })
      .filter(Boolean)
      .sort((left,right)=>
        left.warnings.length-right.warnings.length||
        left.score-right.score||
        employeeName(left.employee).localeCompare(employeeName(right.employee),'it')
      )
      .slice(0,2);
  }

  function volunteerChangeOptions(
    hole,
    role,
    item,
    reasonMap,
    totalRoles
  ){
    const day=String(hole.day||'').slice(0,10);
    const options=[];

    const blocked=state.employees
      .filter(employee=>volunteerEmployeeAllowed(employee,role))
      .filter(employee=>{
        const working=getAssignments(employee.id,day)
          .filter(isWorkingAssignment);

        return(
          working.length===1&&
          ['118','OP'].includes(working[0].category)
        );
      });

    for(const employee of blocked){
      if(options.length>=5){
        break;
      }

      const sourceItem=getAssignments(employee.id,day)
        .filter(isWorkingAssignment)[0];

      if(!sourceItem){
        continue;
      }

      const holeCheck=withVolunteerAssignmentRemoved(
        employee.id,
        day,
        sourceItem.id,
        ()=>checkCandidate(
          employee,
          day,
          item,
          {
            manual:false,
            allowRo:true
          }
        )
      );

      if(holeCheck.errors.length){
        holeCheck.errors.forEach(error=>
          reasonMap.set(
            error,
            (reasonMap.get(error)||0)+1
          )
        );
        continue;
      }

      const replacements=withVolunteerAssignmentRemoved(
        employee.id,
        day,
        sourceItem.id,
        ()=>volunteerReplacementCandidates(
          employee,
          day,
          sourceItem,
          new Set([employee.id])
        )
      );

      for(const replacement of replacements){
        options.push({
          type:'change',
          cost:1,
          role,
          resources:[
            employee.id,
            replacement.employee.id
          ],
          cover:employee,
          replacement:replacement.employee,
          sourceItem,
          warnings:[
            ...(holeCheck.warnings||[]),
            ...(replacement.warnings||[])
          ],
          targetHours:Number(item.hours||0),
          sourceHours:Number(sourceItem.hours||0),
          score:
            candidateScore(employee,day,item,null)+
            replacement.score+
            250,
          text:
            `${employeeName(employee)} può coprire ${role}; `+
            `${employeeName(replacement.employee)} può sostituirlo su ${normalizeCode(sourceItem)}`
        });

        if(options.length>=5){
          break;
        }
      }
    }

    return options
      .sort((left,right)=>
        left.warnings.length-right.warnings.length||
        left.score-right.score
      )
      .slice(0,5);
  }

  function volunteerOptionSignature(option){
    if(option.type==='covered'){
      return `${option.role}:covered`;
    }

    if(option.type==='change'){
      return[
        option.role,
        'change',
        option.cover?.id||'',
        option.sourceItem?.id||'',
        option.replacement?.id||''
      ].join(':');
    }

    if(option.type==='sunday-rest'){
      return[option.role,'sunday-rest',option.cover?.id||'',...(option.releasedRestIds||[])].join(':');
    }

    return[
      option.role,
      'direct',
      option.cover?.id||''
    ].join(':');
  }

  function volunteerPlanSignature(plan){
    return(plan||[])
      .map(volunteerOptionSignature)
      .sort()
      .join('|');
  }

  function volunteerPlanOptions(roleAnalyses,limit=16){
    const ordered=[...roleAnalyses]
      .sort((left,right)=>
        left.options.length-right.options.length
      );

    const results=[];
    let explored=0;
    const maxExplored=700;
    const searchDeadline=(globalThis.performance?.now?.()||Date.now())+70;

    function walk(index,used,plan,cost,warnings,score){
      if(
        explored>=maxExplored||
        (globalThis.performance?.now?.()||Date.now())>=searchDeadline
      ){
        return;
      }

      if(index>=ordered.length){
        explored++;
        results.push({
          cost,
          warnings,
          score,
          plan:[...plan],
          signature:volunteerPlanSignature(plan)
        });
        return;
      }

      const analysis=ordered[index];

      for(const option of analysis.options){
        if(
          explored>=maxExplored||
          (globalThis.performance?.now?.()||Date.now())>=searchDeadline
        ){
          break;
        }

        if(
          option.resources.some(
            resource=>used.has(resource)
          )
        ){
          continue;
        }

        const nextUsed=new Set(used);
        option.resources.forEach(
          resource=>nextUsed.add(resource)
        );

        plan.push(option);

        walk(
          index+1,
          nextUsed,
          plan,
          cost+Number(option.cost||0),
          warnings+(option.warnings?.length||0),
          score+Number(option.score||0)
        );

        plan.pop();
      }
    }

    walk(0,new Set(),[],0,0,0);

    const unique=new Map();

    results
      .sort((left,right)=>
        left.cost-right.cost||
        left.warnings-right.warnings||
        left.score-right.score||
        left.signature.localeCompare(right.signature,'it')
      )
      .forEach(plan=>{
        if(!unique.has(plan.signature)){
          unique.set(plan.signature,plan);
        }
      });

    return[...unique.values()]
      .slice(0,limit);
  }

  function volunteerPublicOperation(option){
    if(option.type==='covered'){
      return{
        role:option.role,
        mode:'covered',
        coverEmployeeId:'',
        coverName:'',
        replacementEmployeeId:'',
        replacementName:'',
        sourceItemId:'',
        sourceCode:'',
        text:option.text,
        warnings:option.warnings||[]
      };
    }

    if(option.type==='change'){
      return{
        role:option.role,
        mode:'change',
        coverEmployeeId:option.cover?.id||'',
        coverName:employeeName(option.cover),
        replacementEmployeeId:option.replacement?.id||'',
        replacementName:employeeName(option.replacement),
        sourceItemId:option.sourceItem?.id||'',
        sourceCode:normalizeCode(option.sourceItem),
        targetHours:Number(option.targetHours||0),
        sourceHours:Number(option.sourceHours||option.sourceItem?.hours||0),
        text:option.text,
        warnings:option.warnings||[]
      };
    }

    if(option.type==='sunday-rest'){
      return{
        role:option.role,mode:'sunday-rest',coverEmployeeId:option.cover?.id||'',coverName:employeeName(option.cover),
        replacementEmployeeId:'',replacementName:'',sourceItemId:'',sourceCode:'',
        releasedRestIds:[...(option.releasedRestIds||[])],releasedRestCodes:[...(option.releasedRestCodes||[])],
        recoveryDay:option.recoveryDay||'',previousRestHours:Number(option.previousRestHours||0),
        targetHours:Number(option.targetHours||0),sourceHours:0,text:option.text,warnings:option.warnings||[]
      };
    }

    return{
      role:option.role,
      mode:'direct',
      coverEmployeeId:option.cover?.id||'',
      coverName:employeeName(option.cover),
      replacementEmployeeId:'',
      replacementName:'',
      sourceItemId:'',
      sourceCode:'',
      targetHours:Number(option.targetHours||0),
      sourceHours:0,
      text:option.text,
      warnings:option.warnings||[]
    };
  }

  function volunteerPublicSolution(plan,index){
    const operations=plan.plan
      .map(volunteerPublicOperation)
      .sort((left,right)=>
        ['A','C','S'].indexOf(left.role)-
        ['A','C','S'].indexOf(right.role)
      );

    const changes=operations.filter(
      operation=>['change','sunday-rest'].includes(operation.mode)
    );

    const direct=operations.filter(
      operation=>operation.mode==='direct'
    );

    const covered=operations.filter(
      operation=>operation.mode==='covered'
    );

    let label='';

    if(changes.length){
      const names=changes
        .map(operation=>operation.mode==='sunday-rest'
          ?`${operation.coverName} · riposo domenicale spostato`
          :`${operation.coverName} ⇄ ${operation.replacementName}`)
        .join(' · ');

      label=`${changes.length} ${changes.length===1?'adeguamento':'adeguamenti'} · ${names}`;
    }else if(direct.length){
      label=
        `Diretta · `+
        direct
          .map(operation=>
            `${operation.role} ${operation.coverName}`
          )
          .join(' · ');
    }else{
      label='Ruoli già coperti nel calendario';
    }

    return{
      id:`solution-${index+1}`,
      signature:plan.signature,
      rank:index+1,
      cost:plan.cost,
      warningCount:plan.warnings,
      score:plan.score,
      mode:changes.length?'CHANGES':'DIRECT',
      label,
      operations,
      changes,
      direct,
      covered
    };
  }

  function volunteerHoursPreview(solution){
    if(!solution||!Array.isArray(solution.operations))return[];

    const impacts=new Map();

    function add(employeeId,delta,label=''){
      if(!employeeId||!Number.isFinite(Number(delta)))return;
      const employee=state.employees.find(item=>item.id===employeeId);
      if(!employee)return;

      const current=impacts.get(employeeId)||{
        employeeId,
        name:employeeName(employee),
        plannedBefore:Number(employeeStats(employee).hours||0),
        target:Number(targetHoursFor(employee)||0),
        delta:0,
        notes:[]
      };

      current.delta=round2(current.delta+Number(delta||0));
      if(label)current.notes.push(label);
      impacts.set(employeeId,current);
    }

    solution.operations.forEach(operation=>{
      const target=Number(operation.targetHours||0);
      const source=Number(operation.sourceHours||0);

      if(operation.mode==='direct'){
        add(operation.coverEmployeeId,target,'Copertura richiesta volontari');
      }else if(operation.mode==='sunday-rest'){
        add(operation.coverEmployeeId,target,'Copertura con riposo domenicale spostato');
      }else if(operation.mode==='change'){
        add(operation.coverEmployeeId,target-source,'Passaggio sul turno volontari');
        add(operation.replacementEmployeeId,source,'Subentro sul turno spostato');
      }
    });

    return[...impacts.values()]
      .map(row=>{
        const projected=round2(row.plannedBefore+row.delta);
        const balance=round2(projected-row.target);
        return{
          ...row,
          projected,
          balance
        };
      })
      .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.name.localeCompare(b.name,'it'));
  }

  function volunteerProposalHole(proposal){
    try{
      return typeof proposal?.hole==='string'
        ?JSON.parse(proposal.hole)
        :proposal?.hole||proposal||{};
    }catch{
      return{};
    }
  }

  function volunteerProposalMarker(proposalId){
    return `[PROPOSTA ${String(proposalId||'').trim()}]`;
  }

  function volunteerAppliedCells(proposalId){
    const marker=volunteerProposalMarker(proposalId);
    const cells=[];

    Object.entries(state.assignments||{})
      .forEach(([key,items])=>{
        const split=key.lastIndexOf('|');
        const employeeId=key.slice(0,split);
        const day=key.slice(split+1);

        if(
          (items||[]).some(item=>
            String(item.coverage||'').toUpperCase().startsWith('VOLONTARI')&&
            String(item.note||'').includes(marker)
          )
        ){
          cells.push({
            employeeId,
            day
          });
        }
      });

    return cells;
  }

  function volunteerProposalIsApplied(proposalId){
    return volunteerAppliedCells(proposalId).length>0;
  }

  function analyzeVolunteerProposalCompatibility(proposal){
    const hole=volunteerProposalHole(proposal);

    const day=String(hole.day||'').slice(0,10);
    const month=day.slice(0,7);
    const roles=[
      ...new Set(
        (Array.isArray(hole.roles)?hole.roles:[])
          .map(role=>String(role||'').toUpperCase())
          .filter(role=>['A','C','S'].includes(role))
      )
    ];

    if(!day||!month||!roles.length){
      return{
        status:'INCOMPATIBLE',
        label:'Non compatibile',
        tone:'danger',
        summary:'La richiesta non contiene data e ruoli sufficienti per l’analisi.',
        roles:[],
        changes:[],
        solutions:[],
        blockers:['Dati della richiesta incompleti.']
      };
    }

    if(month!==state.month){
      return{
        status:'OTHER_MONTH',
        label:'Apri il mese',
        tone:'neutral',
        summary:
          `La richiesta è di ${month}. Il calendario attualmente aperto è ${state.month}.`,
        roles:[],
        changes:[],
        solutions:[],
        blockers:[`Apri il mese ${month} per calcolare la compatibilità.`]
      };
    }

    const roleAnalyses=roles.map(role=>{
      const item=volunteerHoleItem(hole,role);
      const reasonMap=new Map();

      const direct=volunteerDirectOptions(
        hole,
        role,
        item,
        reasonMap
      );

      let changes=[];

      const hasCovered=direct.some(
        option=>option.type==='covered'
      );

      const directPeople=direct.filter(
        option=>option.type==='direct'
      ).length;

      if(
        !hasCovered&&
        directPeople<Math.max(roles.length,2)
      ){
        changes=volunteerChangeOptions(
          hole,
          role,
          item,
          reasonMap,
          roles.length
        );
      }

      return{
        role,
        item,
        options:[
          ...direct,
          ...changes
        ],
        directCount:directPeople,
        changeCount:changes.length,
        reasons:volunteerMostCommonReasons(reasonMap)
      };
    });

    const impossible=roleAnalyses.filter(
      analysis=>!analysis.options.length
    );

    if(impossible.length){
      return{
        status:'INCOMPATIBLE',
        label:'Non compatibile',
        tone:'danger',
        summary:
          'ATLAS non trova una copertura completa e sicura con il calendario attuale.',
        roles:roleAnalyses.map(analysis=>({
          role:analysis.role,
          directCount:analysis.directCount,
          changeCount:analysis.changeCount
        })),
        changes:[],
        solutions:[],
        blockers:impossible.flatMap(analysis=>{
          const prefix=`${analysis.role}: `;

          return analysis.reasons.length
            ?analysis.reasons.map(reason=>prefix+reason)
            :[prefix+'nessuna risorsa compatibile trovata.'];
        }).slice(0,6)
      };
    }

    const plans=volunteerPlanOptions(
      roleAnalyses,
      16
    );

    if(!plans.length){
      return{
        status:'INCOMPATIBLE',
        label:'Non compatibile',
        tone:'danger',
        summary:
          'Le singole coperture esistono, ma non possono essere combinate senza usare la stessa risorsa più volte.',
        roles:roleAnalyses.map(analysis=>({
          role:analysis.role,
          directCount:analysis.directCount,
          changeCount:analysis.changeCount
        })),
        changes:[],
        solutions:[],
        blockers:[
          'Le risorse disponibili entrano in conflitto tra loro nella composizione completa della richiesta.'
        ]
      };
    }

    const solutions=plans.map(
      volunteerPublicSolution
    );

    const best=solutions[0];
    const changes=best.changes||[];

    if(changes.length){
      return{
        status:'CHANGES',
        label:'Compatibile con cambio turno',
        tone:'warning',
        summary:
          solutions.length>1
            ?`ATLAS ha trovato ${solutions.length} soluzioni compatibili. La prima richiede ${changes.length} ${changes.length===1?'cambio turno':'cambi turno'}.`
            :changes.length===1
              ?'La richiesta è copribile con un cambio turno sicuro individuato da ATLAS.'
              :`La richiesta è copribile con ${changes.length} cambi turno sicuri individuati da ATLAS.`,
        roles:best.operations,
        changes,
        solutions,
        blockers:[],
        warningCount:best.warningCount
      };
    }

    return{
      status:'DIRECT',
      label:'Compatibile',
      tone:'success',
      summary:
        solutions.length>1
          ?`ATLAS ha trovato ${solutions.length} soluzioni compatibili senza modificare altri turni.`
          :'La richiesta è compatibile con il calendario attuale senza modificare altri turni.',
      roles:best.operations,
      changes:[],
      solutions,
      blockers:[],
      warningCount:best.warningCount
    };
  }

  function volunteerAssignmentForProposal(
    proposal,
    hole,
    role
  ){
    const auth=getServerAuthContext();
    const now=new Date().toISOString();
    const marker=volunteerProposalMarker(proposal.id);

    return{
      ...volunteerHoleItem(hole,role),
      id:uid(),
      origin:'MANUALE',
      locked:true,
      status:'CONFERMATO',
      coverage:'VOLONTARI',
      volunteerAssignmentKind:'COVERAGE',
      note:[
        marker,
        `Copertura richiesta volontari · ruolo ${role}`,
        String(hole.note||'').trim()
      ].filter(Boolean).join(' · '),
      requestedBy:String(
        proposal.createdBy||''
      ),
      requestedAt:String(
        proposal.createdAt||''
      ),
      modifiedBy:String(
        auth.user?.username||
        auth.user?.displayName||
        ''
      ),
      updatedAt:now
    };
  }

  function applyVolunteerProposalSolution(
    proposal,
    solutionSignature
  ){
    if(!proposal?.id){
      throw new Error('Proposta non valida.');
    }

    if(volunteerProposalIsApplied(proposal.id)){
      return{
        applied:true,
        alreadyApplied:true,
        affectedCells:volunteerAppliedCells(proposal.id)
      };
    }

    const fresh=
      analyzeVolunteerProposalCompatibility(
        proposal
      );

    const solution=(fresh.solutions||[])
      .find(item=>
        item.signature===solutionSignature
      );

    if(!solution){
      throw new Error(
        'La soluzione scelta non è più valida: il calendario è cambiato. Ricalcola le compatibilità.'
      );
    }

    const hole=volunteerProposalHole(proposal);
    const day=String(hole.day||'').slice(0,10);

    if(!day||!day.startsWith(state.month)){
      throw new Error(
        'Apri il mese della proposta prima di applicare la soluzione.'
      );
    }

    const snapshot=clonePlan(
      state.assignments||{}
    );

    const affected=new Set();
    const marker=volunteerProposalMarker(
      proposal.id
    );

    try{
      // Prima i cambi: liberano le risorse che devono coprire il buco.
      const changeOperations=solution.operations
        .filter(operation=>
          operation.mode==='change'
        );

      for(const operation of changeOperations){
        const cover=state.employees.find(
          employee=>
            employee.id===operation.coverEmployeeId
        );

        const replacement=state.employees.find(
          employee=>
            employee.id===operation.replacementEmployeeId
        );

        if(!cover||!replacement){
          throw new Error(
            `Risorsa non trovata per il ruolo ${operation.role}.`
          );
        }

        const sourceItems=[
          ...getAssignments(cover.id,day)
        ];

        const sourceIndex=sourceItems.findIndex(
          item=>item.id===operation.sourceItemId
        );

        if(sourceIndex<0){
          throw new Error(
            `Il turno ${operation.sourceCode} di ${employeeName(cover)} non è più presente.`
          );
        }

        const sourceItem=sourceItems[sourceIndex];

        removeLinkedPostNightRest(
          cover.id,
          day,
          sourceItem
        );

        sourceItems.splice(sourceIndex,1);

        const sourceKey=assignmentKey(
          cover.id,
          day
        );

        if(sourceItems.length){
          state.assignments[sourceKey]=sourceItems;
        }else{
          delete state.assignments[sourceKey];
        }

        const replacementItem={
          ...sourceItem,
          id:uid(),
          origin:'MANUALE',
          locked:true,
          status:'CONFERMATO',
          coverage:'VOLONTARI',
          volunteerAssignmentKind:'CHANGE',
          note:[
            sourceItem.note,
            marker,
            `Cambio per copertura volontari: ${employeeName(cover)} → ${employeeName(replacement)}`
          ].filter(Boolean).join(' · '),
          replacementOf:sourceItem.id,
          replacedEmployeeId:cover.id,
          modifiedBy:String(
            getServerAuthContext().user?.username||
            ''
          ),
          updatedAt:new Date().toISOString()
        };

        const replacementCheck=
          checkCandidate(
            replacement,
            day,
            replacementItem,
            {
              manual:false,
              allowRo:true
            }
          );

        if(replacementCheck.errors.length){
          throw new Error(
            `${employeeName(replacement)} non è più compatibile con ${normalizeCode(sourceItem)}: ${replacementCheck.errors.join(' ')}`
          );
        }

        const replacementKey=
          assignmentKey(
            replacement.id,
            day
          );

        state.assignments[replacementKey]=[
          ...getAssignments(
            replacement.id,
            day
          ),
          replacementItem
        ];

        ensurePostNightRest(
          replacement.id,
          day,
          replacementItem,
          {
            dirty:false
          }
        );

        affected.add(
          `${replacement.id}|${day}`
        );

        const holeItem=
          volunteerAssignmentForProposal(
            proposal,
            hole,
            operation.role
          );

        const coverCheck=
          checkCandidate(
            cover,
            day,
            holeItem,
            {
              manual:false,
              allowRo:true
            }
          );

        if(coverCheck.errors.length){
          throw new Error(
            `${employeeName(cover)} non è più compatibile con il buco ${operation.role}: ${coverCheck.errors.join(' ')}`
          );
        }

        state.assignments[sourceKey]=[
          ...getAssignments(
            cover.id,
            day
          ),
          holeItem
        ];

        ensurePostNightRest(
          cover.id,
          day,
          holeItem,
          {
            dirty:false
          }
        );

        affected.add(
          `${cover.id}|${day}`
        );
      }

      const sundayRestOperations=solution.operations.filter(operation=>operation.mode==='sunday-rest');
      for(const operation of sundayRestOperations){
        const employee=state.employees.find(item=>item.id===operation.coverEmployeeId);
        if(!employee)throw new Error(`Dipendente non trovato per il ruolo ${operation.role}.`);
        const key=assignmentKey(employee.id,day),releaseIds=new Set(operation.releasedRestIds||[]),current=[...getAssignments(employee.id,day)];
        const released=current.filter(entry=>releaseIds.has(entry.id));
        if(!released.length)throw new Error(`Il riposo domenicale di ${employeeName(employee)} non è più presente. Ricalcola la compatibilità.`);
        const remaining=current.filter(entry=>!releaseIds.has(entry.id));
        if(remaining.length)state.assignments[key]=remaining;else delete state.assignments[key];

        const item=volunteerAssignmentForProposal(proposal,hole,operation.role);
        const check=checkCandidate(employee,day,item,{manual:false,allowRo:true});
        if(check.errors.length)throw new Error(`${employeeName(employee)} non è più compatibile dopo lo spostamento del riposo: ${check.errors.join(' ')}`);

        const monthEnd=dateKey(monthDates().at(-1));
        const recoveryDay=volunteerRecoveryRestDay(employee.id,addDaysKey(day,1),monthEnd);
        item.note=[item.note,`Riposo domenicale del ${formatDateIt(day)} spostato per copertura volontari`,recoveryDay?`recupero programmato il ${formatDateIt(recoveryDay)}`:'recupero da programmare'].filter(Boolean).join(' · ');
        item.linkedEventDay=day;item.recoveryRequired=!recoveryDay;item.recoveryDue=recoveryDay||monthEnd;item.ccnlRef='Art. 28';
        state.assignments[key]=[...getAssignments(employee.id,day),item];
        ensurePostNightRest(employee.id,day,item,{dirty:false});affected.add(`${employee.id}|${day}`);

        if(recoveryDay){
          const recoveryKey=assignmentKey(employee.id,recoveryDay);
          const recoveryItem={id:uid(),category:'RC',type:'RC',code:'RC',hours:0,allDay:true,origin:'MANUALE',locked:true,status:'CONFERMATO',coverage:'VOLONTARI',volunteerAssignmentKind:'RECOVERY',ccnlRef:'Art. 28',linkedEventDay:day,note:[marker,`Recupero del riposo domenicale spostato dal ${formatDateIt(day)}`].join(' · '),modifiedBy:String(getServerAuthContext().user?.username||''),updatedAt:new Date().toISOString()};
          state.assignments[recoveryKey]=[...getAssignments(employee.id,recoveryDay),recoveryItem];affected.add(`${employee.id}|${recoveryDay}`);
        }
      }

      const directOperations=solution.operations
        .filter(operation=>
          operation.mode==='direct'
        );

      for(const operation of directOperations){
        const employee=state.employees.find(
          item=>
            item.id===operation.coverEmployeeId
        );

        if(!employee){
          throw new Error(
            `Dipendente non trovato per il ruolo ${operation.role}.`
          );
        }

        const item=
          volunteerAssignmentForProposal(
            proposal,
            hole,
            operation.role
          );

        const check=
          checkCandidate(
            employee,
            day,
            item,
            {
              manual:false,
              allowRo:true
            }
          );

        if(check.errors.length){
          throw new Error(
            `${employeeName(employee)} non è più disponibile per ${operation.role}: ${check.errors.join(' ')}`
          );
        }

        const key=assignmentKey(
          employee.id,
          day
        );

        state.assignments[key]=[
          ...getAssignments(
            employee.id,
            day
          ),
          item
        ];

        ensurePostNightRest(
          employee.id,
          day,
          item,
          {
            dirty:false
          }
        );

        affected.add(
          `${employee.id}|${day}`
        );
      }

      state.localDirty=true;
      saveState();
      renderAll();

      const affectedCells=[
        ...affected
      ].map(key=>{
        const split=key.lastIndexOf('|');

        return{
          employeeId:key.slice(0,split),
          day:key.slice(split+1)
        };
      });

      toast(
        'Soluzione applicata al calendario',
        `${affectedCells.length} ${
          affectedCells.length===1
            ?'cella evidenziata'
            :'celle evidenziate'
        } in giallo. Salva il calendario quando hai completato le verifiche.`,
        'success'
      );

      return{
        applied:true,
        alreadyApplied:false,
        solution,
        affectedCells
      };
    }catch(error){
      state.assignments=snapshot;
      state.localDirty=true;
      saveState();
      renderAll();
      throw error;
    }
  }


  function volunteerProposalItems(
    proposalId
  ){
    const marker=
      volunteerProposalMarker(
        proposalId
      );

    const found=[];

    Object.entries(
      state.assignments||{}
    ).forEach(([key,items])=>{
      (items||[]).forEach((item,index)=>{
        if(
          String(item.note||'')
            .includes(marker)
        ){
          found.push({
            key,
            index,
            item
          });
        }
      });
    });

    return found;
  }

  function markVolunteerProposalApprovedLocal(
    proposalId,
    {
      approvedBy='',
      approvedAt=''
    }={}
  ){
    const entries=
      volunteerProposalItems(
        proposalId
      );

    entries.forEach(entry=>{
      const items=[
        ...(state.assignments[
          entry.key
        ]||[])
      ];

      items[entry.index]={
        ...items[entry.index],
        coverage:
          'VOLONTARI_APPROVATO',
        status:'CONFERMATO',
        approvedBy,
        approvedAt,
        modifiedBy:approvedBy||
          items[entry.index].modifiedBy||
          '',
        updatedAt:
          approvedAt||
          new Date().toISOString()
      };

      state.assignments[
        entry.key
      ]=items;
    });

    return entries.length;
  }

  function approvedRowsForProposal(
    proposalId,
    approvedBy,
    approvedAt
  ){
    const marker=
      volunteerProposalMarker(
        proposalId
      );

    return allAssignmentRows()
      .map(row=>{
        const assignment={
          ...row.a
        };

        if(
          String(
            assignment.note||''
          ).includes(marker)
        ){
          assignment.coverage=
            'VOLONTARI_APPROVATO';

          assignment.status=
            'CONFERMATO';

          assignment.approvedBy=
            approvedBy;

          assignment.approvedAt=
            approvedAt;

          assignment.modifiedBy=
            approvedBy||
            assignment.modifiedBy||
            '';

          assignment.updatedAt=
            approvedAt;
        }

        return{
          employeeId:row.employeeId,
          day:row.day,
          assignment
        };
      });
  }

  async function postVolunteerPatchFast(url,payload){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),22000);

    try{
      const response=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(payload),
        redirect:'follow',
        signal:controller.signal
      });

      const raw=await response.text();
      let data;
      try{data=JSON.parse(raw);}catch(_){
        throw new Error('Risposta server non valida.');
      }
      if(!response.ok||!data.ok){
        throw new Error(data.error||`Errore HTTP ${response.status}`);
      }
      return data;
    }catch(error){
      if(error?.name==='AbortError'){
        throw new Error('Tempo scaduto durante il salvataggio rapido.');
      }
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  function volunteerPatchCells(proposalId){
    const baseCells=volunteerAppliedCells(proposalId);
    const map=new Map();

    baseCells.forEach(cell=>{
      [cell.day,addDaysKey(cell.day,1)].forEach(day=>{
        if(!String(day||'').startsWith(state.month))return;
        map.set(`${cell.employeeId}|${day}`,{
          employeeId:cell.employeeId,
          day
        });
      });
    });

    return[...map.values()];
  }

  function rowsForVolunteerPatch(cells,proposalId,approvedBy,approvedAt){
    const marker=volunteerProposalMarker(proposalId);
    const rows=[];

    (cells||[]).forEach(cell=>{
      getAssignments(cell.employeeId,cell.day).forEach(item=>{
        let assignment={...item};
        if(String(assignment.note||'').includes(marker)){
          assignment={
            ...assignment,
            coverage:'VOLONTARI_APPROVATO',
            status:'CONFERMATO',
            approvedBy,
            approvedAt,
            modifiedBy:approvedBy||assignment.modifiedBy||'',
            updatedAt:approvedAt
          };
        }
        rows.push({
          employeeId:cell.employeeId,
          day:cell.day,
          assignment
        });
      });
    });

    return rows;
  }

  async function approveVolunteerProposalAndPersist(
    proposal,
    solutionSignature,
    reason=''
  ){
    if(!proposal?.id){
      throw new Error(
        'Proposta non valida.'
      );
    }

    const hole=
      volunteerProposalHole(
        proposal
      );

    const day=
      String(
        hole.day||''
      ).slice(0,10);

    if(
      !day||
      !day.startsWith(
        state.month
      )
    ){
      throw new Error(
        'Apri il mese della proposta prima di approvarla.'
      );
    }

    if(
      !volunteerProposalIsApplied(
        proposal.id
      )
    ){
      if(!solutionSignature){
        throw new Error(
          'Seleziona una soluzione compatibile.'
        );
      }

      applyVolunteerProposalSolution(
        proposal,
        solutionSignature
      );
    }

    const auth=
      getServerAuthContext();

    const url=
      String(
        state.settings.appsScriptUrl||
        auth.serverUrl||
        ''
      ).trim();

    if(
      !url||
      !auth.token
    ){
      throw new Error(
        'Sessione server assente. Effettua nuovamente l’accesso.'
      );
    }

    if(
      !isValidAppsScriptUrl(
        url
      )
    ){
      throw new Error(
        'URL Apps Script non valido.'
      );
    }

    const approvedAt=
      new Date().toISOString();

    const approvedBy=
      String(
        auth.user?.username||
        auth.user?.displayName||
        ''
      );

    const generationAt=
      String(
        state.lastAutoSummary?.at||
        ''
      );

    const patchCellMap=new Map();
    volunteerPatchCells(proposal.id).forEach(cell=>patchCellMap.set(`${cell.employeeId}|${cell.day}`,cell));
    volunteerManualRebalanceHistory.forEach(entry=>{
      [
        {employeeId:entry.targetEmployeeId,day:entry.day},
        {employeeId:entry.donorEmployeeId,day:entry.day},
        entry.recoveryDay?{employeeId:entry.targetEmployeeId,day:entry.recoveryDay}:null
      ].filter(Boolean).forEach(cell=>{if(String(cell.day||'').startsWith(state.month))patchCellMap.set(`${cell.employeeId}|${cell.day}`,cell);});
    });
    const patchCells=[...patchCellMap.values()];

    const patchRows=
      rowsForVolunteerPatch(
        patchCells,
        proposal.id,
        approvedBy,
        approvedAt
      );

    updateSyncStatus(
      'Approvo e applico le sole modifiche necessarie…',
      'sync'
    );

    try{
      let data;

      try{
        data=await postVolunteerPatchFast(
          url,
          {
            action:'approveVolunteerProposalPatch',
            token:auth.token,
            proposalId:proposal.id,
            reason,
            month:state.month,
            rows:patchRows,
            affectedCells:patchCells,
            requirements:state.requirements,
            updatedAt:approvedAt,
            clientVersion:APP_VERSION,
            generationConfirmed:!!generationAt,
            generationAt
          }
        );
      }catch(fastError){
        const unsupported=/azione.*(non|sconosci)|supportat|approveVolunteerProposalPatch/i.test(
          String(fastError?.message||fastError||'')
        );

        if(!unsupported){
          throw fastError;
        }

        // Backend precedente: fallback sicuro al salvataggio completo.
        const rows=approvedRowsForProposal(
          proposal.id,
          approvedBy,
          approvedAt
        );

        data=await approveVolunteerProposalWithPlan({
          url,
          token:auth.token,
          proposalId:proposal.id,
          reason,
          month:state.month,
          rows,
          requirements:state.requirements,
          updatedAt:approvedAt,
          clientVersion:APP_VERSION,
          generationConfirmed:!!generationAt,
          generationAt
        });
      }

      markVolunteerProposalApprovedLocal(
        proposal.id,
        {
          approvedBy,
          approvedAt
        }
      );

      state.localDirty=false;
      saveState();
      renderAll();

      const savedAt=
        data.savedAt||
        approvedAt;

      const localTime=
        new Date(savedAt)
          .toLocaleString(
            'it-IT',
            {
              dateStyle:'short',
              timeStyle:'short'
            }
          );

      updateSyncStatus(
        `Calendario salvato · ${localTime}`,
        'local'
      );

      return{
        ...data,
        approvedBy,
        approvedAt
      };
    }catch(error){
      updateSyncStatus(
        'Approvazione non completata',
        'error'
      );

      throw error;
    }
  }


  const volunteerManualRebalanceHistory=[];

  function volunteerHoursOverview(){
    if(state._renderStatsCache)state._renderStatsCache.clear?.();
    return state.employees
      .filter(employee=>employee&&employee.attivo!==false)
      .map(employee=>{
        const planned=Number(employeeStats(employee).hours||0);
        const target=Number(targetHoursFor(employee)||0);
        return{
          employeeId:employee.id,
          name:employeeName(employee),
          plannedBefore:round2(planned),
          target:round2(target),
          balance:round2(planned-target),
          meta:employeeMeta(employee)
        };
      })
      .sort((a,b)=>a.balance-b.balance||a.name.localeCompare(b.name,'it'));
  }

  function volunteerManualReplacementOptions(targetEmployeeId){
    const target=state.employees.find(employee=>employee.id===targetEmployeeId);
    if(!target)throw new Error('Dipendente non trovato.');
    if(state._renderStatsCache)state._renderStatsCache.clear?.();

    const targetBefore=Number(employeeStats(target).hours||0);
    const targetTarget=Number(targetHoursFor(target)||0);
    const options=[];

    Object.entries(state.assignments||{}).forEach(([key,items])=>{
      const split=key.lastIndexOf('|');
      const donorId=key.slice(0,split);
      const day=key.slice(split+1);
      if(!day.startsWith(state.month)||donorId===targetEmployeeId)return;
      const donor=state.employees.find(employee=>employee.id===donorId);
      if(!donor||donor.attivo===false)return;

      (items||[]).forEach(sourceItem=>{
        if(!['118','OP'].includes(sourceItem?.category))return;
        if(String(sourceItem.coverage||'').toUpperCase().startsWith('VOLONTARI'))return;
        const hours=Number(assignmentTimes(sourceItem,day).hours||0);
        if(hours<=0)return;

        const candidate={...sourceItem,id:`VOL-MANUAL-${sourceItem.id||uid()}`};
        let check=checkCandidate(target,day,candidate,{manual:true,allowRo:true});
        let sundayRelease=null;
        if(check.errors.length){
          sundayRelease=volunteerSundayRestRelease(target,day,candidate);
          if(!sundayRelease)return;
          check=sundayRelease.check;
        }

        const donorBefore=Number(employeeStats(donor).hours||0);
        const donorTarget=Number(targetHoursFor(donor)||0);
        const targetAfter=round2(targetBefore+hours);
        const donorAfter=round2(donorBefore-hours);
        const targetBalance=round2(targetAfter-targetTarget);
        const donorBalance=round2(donorAfter-donorTarget);
        const donorExcess=Math.max(0,donorBefore-donorTarget);
        const warnings=[...(check.warnings||[])];
        if(sundayRelease){
          warnings.push(sundayRelease.recoveryDay
            ?`Riposo domenicale recuperabile il ${formatDateIt(sundayRelease.recoveryDay)}.`
            :'Riposo domenicale da recuperare successivamente.');
        }
        if(donorBalance<-0.05)warnings.push(`${employeeName(donor)} scenderebbe sotto target di ${fmt(Math.abs(donorBalance))} h.`);

        options.push({
          id:[target.id,donor.id,day,sourceItem.id].join('|'),
          targetEmployeeId:target.id,
          targetName:employeeName(target),
          donorEmployeeId:donor.id,
          donorName:employeeName(donor),
          day,
          assignmentId:sourceItem.id,
          code:normalizeCode(sourceItem),
          role:sourceItem.role||'',
          site:sourceItem.site||'',
          hours:round2(hours),
          targetBefore:round2(targetBefore),
          targetTarget:round2(targetTarget),
          targetAfter,
          targetBalance,
          donorBefore:round2(donorBefore),
          donorTarget:round2(donorTarget),
          donorAfter,
          donorBalance,
          warnings,
          releaseSundayRest:!!sundayRelease,
          score:Math.abs(targetBalance)*1.1+Math.max(0,-donorBalance)*3-warnings.length*0.15-Math.min(donorExcess,hours)*1.4
        });
      });
    });

    return options
      .sort((a,b)=>a.score-b.score||b.donorBalance-a.donorBalance||a.day.localeCompare(b.day)||a.donorName.localeCompare(b.donorName,'it'))
      .slice(0,24);
  }

  function volunteerApplyManualReplacement(selection){
    const target=state.employees.find(employee=>employee.id===selection?.targetEmployeeId);
    const donor=state.employees.find(employee=>employee.id===selection?.donorEmployeeId);
    const day=String(selection?.day||'').slice(0,10);
    if(!target||!donor||!day.startsWith(state.month))throw new Error('Sostituzione non valida per il mese aperto.');

    const donorItems=[...getAssignments(donor.id,day)];
    const sourceIndex=donorItems.findIndex(item=>item.id===selection.assignmentId);
    if(sourceIndex<0)throw new Error('Il turno da sostituire non è più presente. Ricalcola le opzioni.');
    const sourceItem=donorItems[sourceIndex];
    if(!['118','OP'].includes(sourceItem?.category))throw new Error('Il turno selezionato non è trasferibile da Buchi volontari.');

    const snapshot=clonePlan(state.assignments||{});
    const historyId=`VRB-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try{
      const candidate={...sourceItem,id:uid(),origin:'MANUALE',locked:true,status:'CONFERMATO',coverage:'VOLONTARI_RIEQUILIBRIO',volunteerAssignmentKind:'MANUAL_REBALANCE',rebalanceId:historyId,replacedEmployeeId:donor.id,note:[sourceItem.note,`Riequilibrio Buchi volontari: ${employeeName(target)} sostituisce ${employeeName(donor)}`].filter(Boolean).join(' · '),modifiedBy:String(getServerAuthContext().user?.username||getServerAuthContext().user?.displayName||''),updatedAt:new Date().toISOString()};

      let check=checkCandidate(target,day,candidate,{manual:true,allowRo:true});
      let sundayRelease=null;
      if(check.errors.length){
        sundayRelease=volunteerSundayRestRelease(target,day,candidate);
        if(!sundayRelease)throw new Error(`${employeeName(target)} non è più compatibile: ${check.errors.join(' ')}`);
        const releaseIds=new Set(sundayRelease.rests.map(item=>item.id));
        const targetKey=assignmentKey(target.id,day);
        const remaining=getAssignments(target.id,day).filter(item=>!releaseIds.has(item.id));
        if(remaining.length)state.assignments[targetKey]=remaining;else delete state.assignments[targetKey];
        check=checkCandidate(target,day,candidate,{manual:true,allowRo:true});
        if(check.errors.length)throw new Error(`${employeeName(target)} non è compatibile dopo lo spostamento del riposo: ${check.errors.join(' ')}`);
      }

      removeLinkedPostNightRest(donor.id,day,sourceItem);
      donorItems.splice(sourceIndex,1);
      const donorKey=assignmentKey(donor.id,day);
      if(donorItems.length)state.assignments[donorKey]=donorItems;else delete state.assignments[donorKey];

      const targetKey=assignmentKey(target.id,day);
      state.assignments[targetKey]=[...getAssignments(target.id,day),candidate];
      ensurePostNightRest(target.id,day,candidate,{dirty:false});

      let recoveryDay='';
      if(sundayRelease){
        const monthEnd=dateKey(monthDates().at(-1));
        recoveryDay=volunteerRecoveryRestDay(target.id,addDaysKey(day,1),monthEnd);
        candidate.note=[candidate.note,`Riposo domenicale del ${formatDateIt(day)} spostato`,recoveryDay?`recupero programmato il ${formatDateIt(recoveryDay)}`:'recupero da programmare'].join(' · ');
        candidate.recoveryRequired=!recoveryDay;
        candidate.recoveryDue=recoveryDay||monthEnd;
        candidate.ccnlRef='Art. 28';
        if(recoveryDay){
          const recoveryKey=assignmentKey(target.id,recoveryDay);
          state.assignments[recoveryKey]=[...getAssignments(target.id,recoveryDay),{id:uid(),category:'RC',type:'RC',code:'RC',hours:0,allDay:true,origin:'MANUALE',locked:true,status:'CONFERMATO',coverage:'VOLONTARI_RIEQUILIBRIO',volunteerAssignmentKind:'RECOVERY',rebalanceId:historyId,ccnlRef:'Art. 28',linkedEventDay:day,note:`Recupero del riposo domenicale spostato dal ${formatDateIt(day)} · riequilibrio Buchi volontari`,modifiedBy:String(getServerAuthContext().user?.username||''),updatedAt:new Date().toISOString()}];
        }
      }

      volunteerManualRebalanceHistory.push({id:historyId,snapshot,targetEmployeeId:target.id,targetName:employeeName(target),donorEmployeeId:donor.id,donorName:employeeName(donor),day,code:normalizeCode(sourceItem),hours:Number(assignmentTimes(sourceItem,day).hours||0),targetBefore:Number(selection.targetBefore||0),targetAfter:Number(selection.targetAfter||0),targetTarget:Number(selection.targetTarget||0),donorBefore:Number(selection.donorBefore||0),donorAfter:Number(selection.donorAfter||0),donorTarget:Number(selection.donorTarget||0),recoveryDay,at:new Date().toISOString()});
      state.localDirty=true;
      if(state._renderStatsCache)state._renderStatsCache.clear?.();
      saveState();
      renderAll();
      return volunteerManualRebalanceHistory.at(-1);
    }catch(error){
      state.assignments=snapshot;
      if(state._renderStatsCache)state._renderStatsCache.clear?.();
      saveState();
      renderAll();
      throw error;
    }
  }

  function volunteerUndoLastManualReplacement(){
    const entry=volunteerManualRebalanceHistory.pop();
    if(!entry)return null;
    state.assignments=clonePlan(entry.snapshot||{});
    state.localDirty=true;
    if(state._renderStatsCache)state._renderStatsCache.clear?.();
    saveState();
    renderAll();
    return entry;
  }

  function volunteerManualReplacementHistory(){
    return volunteerManualRebalanceHistory.map(({snapshot,...entry})=>({...entry}));
  }

  function volunteerClearManualReplacementHistory(){
    volunteerManualRebalanceHistory.length=0;
  }

  globalThis.ATLAS_VOLUNTEER_ANALYZER={
    analyzeProposal:
      analyzeVolunteerProposalCompatibility,
    applySolution:
      applyVolunteerProposalSolution,
    isApplied:
      volunteerProposalIsApplied,
    appliedCells:
      volunteerAppliedCells,
    approveProposal:
      approveVolunteerProposalAndPersist,
    hoursPreview:
      volunteerHoursPreview,
    hoursOverview:
      volunteerHoursOverview,
    manualReplacementOptions:
      volunteerManualReplacementOptions,
    applyManualReplacement:
      volunteerApplyManualReplacement,
    undoLastManualReplacement:
      volunteerUndoLastManualReplacement,
    manualReplacementHistory:
      volunteerManualReplacementHistory,
    clearManualReplacementHistory:
      volunteerClearManualReplacementHistory,
    currentMonth:
      ()=>state.month
  };

  function autoItem(item){return{id:uid(),origin:'AUTOMATICA',locked:false,status:'PROPOSTO',coverage:'ORDINARIA',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...item};}
  function removeAutoProposals(){Object.keys(state.assignments).forEach(k=>{const keep=state.assignments[k].filter(a=>!(sourceLabel(a)==='AUTO'&&!a.locked));if(keep.length)state.assignments[k]=keep;else delete state.assignments[k];});}
  function dayHasCategory(e,day,pred){return getAssignments(e.id,day).some(pred);}
  function addAuto(e,day,item){const a=autoItem(item),k=assignmentKey(e.id,day);state.assignments[k]=[...(state.assignments[k]||[]),a];cacheAutoAssignment(e,day,a);ensurePostNightRest(e.id,day,a,{dirty:false});}

  function directCurrentRowsForEmployee(employeeId){
    return buildAssignmentRows().filter(r=>r.employeeId===employeeId);
  }
  function automaticRestCandidate(employeeId,fromDay,toDay,{preferSunday=true}={}){
    const days=[];
    const first=parseDateKey(fromDay),last=parseDateKey(toDay);
    for(let cursor=new Date(first);cursor<=last;cursor.setDate(cursor.getDate()+1)){
      const day=dateKey(cursor);
      if(!day.startsWith(state.month))continue;
      const employee=state.employees.find(e=>e.id===employeeId);
      if(!employeeActiveOn(employee,day))continue;
      if(getAssignments(employeeId,day).length)continue;
      const start=getDateTime(day,'00:00',false),finish=getDateTime(day,'00:00',true);
      const work=directCurrentRowsForEmployee(employeeId).filter(r=>isWorkingAssignment(r.a)&&r.timed);
      const previous=work.filter(r=>r.end<=start).sort((a,b)=>b.end-a.end)[0];
      const next=work.filter(r=>r.start>=finish).sort((a,b)=>a.start-b.start)[0];
      const gapStart=previous?.end||new Date(start.getTime()-7*86400000);
      const gapEnd=next?.start||new Date(finish.getTime()+7*86400000);
      const restHours=(gapEnd-gapStart)/36e5;
      if(restHours>=Number(state.settings.weeklyRestHours||35)){
        days.push({day,dow:cursor.getDay(),restHours});
      }
    }
    days.sort((a,b)=>{
      if(preferSunday){
        const ar=a.dow===0?0:1,br=b.dow===0?0:1;
        if(ar!==br)return ar-br;
      }
      return a.day.localeCompare(b.day);
    });
    return days[0]||null;
  }
  function appendAutomaticRest(employee,day,code,note,extra={}){
    if(getAssignments(employee.id,day).length)return false;
    addAuto(employee,day,{
      category:'RC',
      type:code,
      code,
      hours:0,
      allDay:true,
      ccnlRef:RFS_CODES.has(code)?'Art. 29':code==='RCD'?'Art. 27':'Art. 28',
      note,
      ...extra
    });
    return true;
  }
  function scheduleAutomaticCompensatoryRests(){
    let added=0,weekly=0,holiday=0,derogation=0,unresolved=0;
    const monthStart=`${state.month}-01`;
    const monthEnd=dateKey(monthDates().at(-1));

    state.employees.filter(e=>e.attivo!==false).forEach(employee=>{
      const rows=directCurrentRowsForEmployee(employee.id);

      rows.filter(r=>validDerogation(r.a)&&r.a.recoveryRequired).forEach(source=>{
        const exists=directCurrentRowsForEmployee(employee.id).some(r=>r.a.category==='RC'&&r.a.code==='RCD'&&r.a.linkedRecordId===source.a.id);
        if(exists)return;
        const due=source.a.recoveryDue||monthEnd;
        const candidate=automaticRestCandidate(employee.id,addDaysKey(source.day,1),due,{preferSunday:false});
        if(candidate&&appendAutomaticRest(employee,candidate.day,'RCD',`Recupero automatico collegato alla deroga art. 27 del ${formatDateIt(source.day)}.`,{
          linkedRecordId:source.a.id,
          linkedEventDay:source.day,
          recoveryRequired:true,
          recoveryDue:due
        })){added++;derogation++;}
        else unresolved++;
      });

      for(let cursor=mondayStart(parseDateKey(monthStart));cursor<=parseDateKey(monthEnd);cursor.setDate(cursor.getDate()+7)){
        const from=dateKey(cursor),to=addDaysKey(from,6);
        const existingRest=directCurrentRowsForEmployee(employee.id).some(r=>
          r.day>=from&&r.day<=to&&(r.a.category==='RC'||r.a.category==='REST')
        );
        if(existingRest)continue;
        const candidate=automaticRestCandidate(employee.id,from,to,{preferSunday:true});
        if(candidate&&appendAutomaticRest(employee,candidate.day,'RC',`Riposo settimanale automatico protetto · finestra disponibile ${fmt(candidate.restHours)} ore.`,{
          autoWeeklyRest:true
        })){added++;weekly++;}
        else unresolved++;
      }
    });

    return{added,weekly,holiday,derogation,unresolved};
  }

  function scheduleAdmin(){let added=0;workdays().forEach(d=>{const day=dateKey(d);state.employees.filter(e=>e.turno==='Amministrazione'&&employeeActiveOn(e,day)).forEach(e=>{if(getAssignments(e.id,day).length)return;const dow=d.getDay();let code='AM7';if(slug(e.cognome)==='praderio')code=dow===5?'AM4':'AM8,5';else if(slug(e.cognome)==='vescera')code=[1,5].includes(dow)?'AM4':'AM7';addAuto(e,day,{category:'AM',type:code,code});added++;});});return added;}
  function scheduleFixedResponsibles(){let added=0;const bosetti=state.employees.find(e=>slug(e.responsabile)==='operativo'||e.turno==='RO');if(bosetti)workdays().forEach(d=>{const day=dateKey(d),item={category:'RESP',type:'GRO',code:'GRO'};if(employeeActiveOn(bosetti,day)&&!getAssignments(bosetti.id,day).length&&checkCandidate(bosetti,day,item).errors.length===0){addAuto(bosetti,day,item);added++;}});const raschi=state.employees.find(e=>slug(e.responsabile)==='secondari'||e.turno==='RS');if(raschi)workdays().forEach(d=>{const day=dateKey(d),item={category:'RESP',type:'GRS',code:'GRS'};if(employeeActiveOn(raschi,day)&&!getAssignments(raschi.id,day).length&&checkCandidate(raschi,day,item).errors.length===0){addAuto(raschi,day,item);added++;}});const responsibles=[...state.employees.filter(e=>slug(e.responsabile)==='autoparco').map(e=>[e,'GRA']),...state.employees.filter(e=>slug(e.responsabile)==='magazzino').map(e=>[e,'GRM'])];responsibles.forEach(([e,code],idx)=>{let count=allAssignmentRows().filter(r=>r.employeeId===e.id&&r.a.type===code).length;const candidates=workdays().filter((d,i)=>i%Math.max(1,Math.floor(workdays().length/state.settings.respGoal))===idx%2).concat(workdays());for(const d of candidates){if(count>=state.settings.respGoal)break;const day=dateKey(d);if(getAssignments(e.id,day).length)continue;const item={category:'RESP',type:code,code};if(checkCandidate(e,day,item).errors.length)continue;addAuto(e,day,item);count++;added++;}});return added;}
  function removeAutoGrsForRaschi(raschi,day){const items=getAssignments(raschi.id,day),keep=items.filter(a=>!(a.type==='GRS'&&sourceLabel(a)==='AUTO'&&!a.locked));setAssignments(raschi.id,day,keep,{dirty:false,render:false});}
  function preferredSecondariDayCount(employeeId){
    if(!employeeId)return 0;
    return workdays().reduce((count,d)=>count+(getAssignments(employeeId,dateKey(d)).some(a=>a.category==='SE')?1:0),0);
  }
  function ordinarySecondariPreferredEmployee(){
    const id=String(state.settings.sePreferredEmployeeId||'');
    const employee=id?state.employees.find(e=>e.id===id):null;
    if(!employee||!['A','B','Libera'].includes(employee.turno)||slug(employee.responsabile)==='secondari')return null;
    return employee;
  }
  function scheduleSecondari(){
    let added=0;
    const preferredEmployee=ordinarySecondariPreferredEmployee();
    const preferredMin=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));
    const preferredMax=Math.max(preferredMin,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));
    let preferredDays=preferredEmployee?preferredSecondariDayCount(preferredEmployee.id):0;
    workdays().forEach(d=>{
      const day=dateKey(d);let count=state.employees.reduce((n,e)=>n+getAssignments(e.id,day).filter(a=>a.category==='SE').length,0);
      const target=2,item={category:'SE',type:'MGSE',code:'MGSE'},pref=preferredGroup(d,'M');
      if(count<target&&preferredEmployee&&preferredDays<preferredMin&&employeeActiveOn(preferredEmployee,day)){
        const x={...item,preferredSecondari:true,note:'Dipendente prevalente Secondari · quota minima mensile'};
        if(!checkCandidate(preferredEmployee,day,x).errors.length){addAuto(preferredEmployee,day,x);added++;count++;preferredDays++;}
      }
      while(count<target){
        const atMax=preferredEmployee&&preferredDays>=preferredMax,allowed=e=>!atMax||e.id!==preferredEmployee.id;
        let pool=state.employees.filter(e=>(e.turno===pref||e.turno==='Libera')&&allowed(e));
        let employee=chooseCandidate(day,item,{preferred:pref,pool});
        if(!employee){pool=state.employees.filter(e=>['A','B','Libera'].includes(e.turno)&&allowed(e));employee=chooseCandidate(day,item,{preferred:pref,pool});}
        if(!employee)break;
        addAuto(employee,day,{...item,preferredSecondari:preferredEmployee?.id===employee.id});added++;count++;if(preferredEmployee?.id===employee.id)preferredDays++;
      }
      // GRS resta GRS: nessun fallback GRS -> MGSE. Solo il fallback 118 può liberare la responsabilità.
    });
    return added;
  }

  function currentSlotOccupied(day,shift,slot){const cov=coverageFor(day,shift);return !!cov[slot.crew]?.[slot.role]?.length;}

  function directShiftRows(day,shift){
    const rows=[];
    Object.entries(state.assignments).forEach(([key,items])=>{
      const split=key.lastIndexOf('|'),employeeId=key.slice(0,split),rowDay=key.slice(split+1);
      if(rowDay!==day)return;
      const employee=state.employees.find(e=>e.id===employeeId);
      if(!employee)return;
      items.forEach(a=>{
        if(a.category==='118'&&(a.shift===shift||(a.shift==='PN'&&['P','N'].includes(shift)))){
          rows.push({employeeId,employee,day,a});
        }
      });
    });
    return rows;
  }

  function canWorkAtSite(e,a){
    return !(a.site!=='G'&&e.sedeSolo==='G');
  }

  function swapAutoCrewMembers(day,targetRow,donorRow){
    if(!targetRow||!donorRow||targetRow.a.role!==donorRow.a.role)return false;
    if(sourceLabel(targetRow.a)!=='AUTO'||sourceLabel(donorRow.a)!=='AUTO')return false;
    if(targetRow.a.locked||donorRow.a.locked)return false;
    if(!canWorkAtSite(targetRow.employee,donorRow.a)||!canWorkAtSite(donorRow.employee,targetRow.a))return false;

    const targetKey=assignmentKey(targetRow.employeeId,day);
    const donorKey=assignmentKey(donorRow.employeeId,day);
    const targetItems=[...getAssignments(targetRow.employeeId,day)];
    const donorItems=[...getAssignments(donorRow.employeeId,day)];
    const targetIndex=targetItems.findIndex(a=>a.id===targetRow.a.id);
    const donorIndex=donorItems.findIndex(a=>a.id===donorRow.a.id);
    if(targetIndex<0||donorIndex<0)return false;

    const now=new Date().toISOString();
    const toTarget={...donorItems[donorIndex],genderBalanced:true,updatedAt:now};
    const toDonor={...targetItems[targetIndex],genderBalanced:true,updatedAt:now};

    if(toTarget.plannedGroup&&['A','B'].includes(targetRow.employee.turno)){
      toTarget.crossGroup=targetRow.employee.turno!==toTarget.plannedGroup;
    }
    if(toDonor.plannedGroup&&['A','B'].includes(donorRow.employee.turno)){
      toDonor.crossGroup=donorRow.employee.turno!==toDonor.plannedGroup;
    }

    targetItems[targetIndex]=toTarget;
    donorItems[donorIndex]=toDonor;
    state.assignments[targetKey]=targetItems;
    state.assignments[donorKey]=donorItems;
    return true;
  }

  function refreshAutoCache(){
    endAutoCache();
    beginAutoCache();
  }
  function movableWeeklyAutoRows(employeeId,weekStart){
    const start=mondayStart(weekStart),end=new Date(start);
    end.setDate(end.getDate()+7);

    return rowsForEmployee(employeeId)
      .filter(row=>
        row.timed&&
        row.start<end&&
        row.end>start&&
        isWorkingAssignment(row.a)&&
        sourceLabel(row.a)==='AUTO'&&
        !row.a.locked&&
        ['118','SE'].includes(row.a.category)
      )
      .sort((a,b)=>
        (a.a.category==='118'?0:1)-
        (b.a.category==='118'?0:1)||
        b.day.localeCompare(a.day)
      );
  }
  function moveAutomaticAssignment(row,targetEmployee){
    const sourceKey=assignmentKey(
      row.employeeId,
      row.day
    );
    const sourceItems=[
      ...getAssignments(row.employeeId,row.day)
    ];
    const index=sourceItems.findIndex(
      item=>item.id===row.a.id
    );
    if(index<0)return false;

    removeLinkedPostNightRest(
      row.employeeId,
      row.day,
      row.a
    );
    sourceItems.splice(index,1);
    if(sourceItems.length){
      state.assignments[sourceKey]=sourceItems;
    }else{
      delete state.assignments[sourceKey];
    }

    const moved={
      ...row.a,
      updatedAt:new Date().toISOString(),
      weeklyRebalanced:true,
      note:[
        row.a.note,
        `Riequilibrio automatico ore settimanali da ${employeeName(row.employee)}`
      ].filter(Boolean).join(' · ')
    };
    const targetKey=assignmentKey(
      targetEmployee.id,
      row.day
    );
    state.assignments[targetKey]=[
      ...(state.assignments[targetKey]||[]),
      moved
    ];
    ensurePostNightRest(
      targetEmployee.id,
      row.day,
      moved,
      {dirty:false}
    );
    return true;
  }
  function rebalanceWeeklyOverloads(){
    const weeklyLimit=Number(
      state.settings.weeklyMaxHours||44
    );
    let moved=0,unresolved=0;
    const details=[];
    const first=mondayStart(
      parseDateKey(`${state.month}-01`)
    );
    const last=parseDateKey(
      monthDateKeysFor(state.month).at(-1)
    );

    for(
      let weekStart=new Date(first);
      weekStart<=last;
      weekStart.setDate(weekStart.getDate()+7)
    ){
      let safety=0;

      while(safety++<60){
        const overloaded=state.employees
          .filter(employee=>!employee.partTime)
          .map(employee=>({
            employee,
            hours:weekHours(employee.id,weekStart)
          }))
          .filter(entry=>entry.hours>weeklyLimit+.01)
          .sort((a,b)=>b.hours-a.hours)[0];

        if(!overloaded)break;

        let repaired=false;
        const rows=movableWeeklyAutoRows(
          overloaded.employee.id,
          weekStart
        );

        for(const row of rows){
          const sourceKey=assignmentKey(
            row.employeeId,
            row.day
          );
          const sourceItems=[
            ...getAssignments(row.employeeId,row.day)
          ];
          const sourceIndex=sourceItems.findIndex(
            item=>item.id===row.a.id
          );
          if(sourceIndex<0)continue;

          removeLinkedPostNightRest(
            row.employeeId,
            row.day,
            row.a
          );
          sourceItems.splice(sourceIndex,1);
          if(sourceItems.length){
            state.assignments[sourceKey]=sourceItems;
          }else{
            delete state.assignments[sourceKey];
          }
          refreshAutoCache();

          const replacement=chooseCandidate(
            row.day,
            row.a,
            {
              preferred:
                row.a.plannedGroup||
                overloaded.employee.turno,
              allowRo:false,
              pool:state.employees.filter(
                employee=>
                  employee.id!==overloaded.employee.id
              )
            }
          );

          state.assignments[sourceKey]=[
            ...(state.assignments[sourceKey]||[]),
            row.a
          ];
          ensurePostNightRest(
            row.employeeId,
            row.day,
            row.a,
            {dirty:false}
          );
          refreshAutoCache();

          if(!replacement)continue;

          if(moveAutomaticAssignment(row,replacement)){
            moved++;
            repaired=true;
            details.push(
              `${employeeName(overloaded.employee)} → `+
              `${employeeName(replacement)} · `+
              `${normalizeCode(row.a)} · `+
              `${formatDateIt(row.day)}`
            );
            refreshAutoCache();
            break;
          }
        }

        if(!repaired){
          unresolved++;
          details.push(
            `${employeeName(overloaded.employee)} · `+
            `settimana ${formatDateIt(dateKey(weekStart))} · `+
            `nessuna alternativa valida`
          );
          break;
        }
      }
    }

    return{moved,unresolved,details};
  }

  function rebalanceCrewGender(){
    let swaps=0;
    monthDates().forEach(d=>{
      const day=dateKey(d);
      ['M','P','N'].forEach(shift=>{
        if(state.requirements[`${day}|${shift}`]!=='required')return;

        let safety=0;
        while(safety++<8){
          const rows=directShiftRows(day,shift);
          const crews=[...new Set(rows.map(r=>crewKey(r.a)))];
          const targetCrew=crews.find(crew=>{
            const cr=rows.filter(r=>crewKey(r.a)===crew);
            const expected=crew==='G2'?2:3;
            return crew!=='G2'&&cr.length===expected&&cr.every(r=>isFemale(r.employee));
          });
          if(!targetCrew)break;

          const targetRows=rows.filter(r=>
            crewKey(r.a)===targetCrew&&
            isFemale(r.employee)&&
            sourceLabel(r.a)==='AUTO'&&!r.a.locked
          );

          const donorRows=rows.filter(r=>{
            if(!isMale(r.employee)||sourceLabel(r.a)!=='AUTO'||r.a.locked)return false;
            const donorCrew=crewKey(r.a);
            if(donorCrew===targetCrew)return false;
            const donorCrewRows=rows.filter(x=>crewKey(x.a)===donorCrew);
            return donorCrewRows.filter(x=>isMale(x.employee)).length>=2;
          });

          const pairs=[];
          targetRows.forEach(target=>{
            donorRows.filter(donor=>donor.a.role===target.a.role).forEach(donor=>{
              if(!canWorkAtSite(target.employee,donor.a)||!canWorkAtSite(donor.employee,target.a))return;
              let penalty=0;
              if(target.employee.turno!==donor.employee.turno)penalty+=12;
              if(target.employee.turno==='Libera'||donor.employee.turno==='Libera')penalty-=3;
              pairs.push({target,donor,penalty});
            });
          });
          pairs.sort((a,b)=>a.penalty-b.penalty);

          if(!pairs.length)break;
          if(swapAutoCrewMembers(day,pairs[0].target,pairs[0].donor))swaps++;
          else break;
        }
      });
    });
    return swaps;
  }

  function chooseShiftGroup(d,shift){const existing=shiftRows(dateKey(d),shift).map(r=>r.employee.turno).filter(g=>['A','B'].includes(g));if(existing.length)return existing[0];const pref=preferredGroup(d,shift);if(pref)return pref;const score=g=>state.employees.filter(e=>e.turno===g&&employeeActiveOn(e,dateKey(d))).reduce((s,e)=>s+employeeStats(e).hours/Math.max(1,targetHoursFor(e)),0);return score('A')<=score('B')?'A':'B';}
  const yieldUi=()=>new Promise(resolve=>{const raf=globalThis.requestAnimationFrame||((cb)=>setTimeout(cb,0));raf(()=>resolve());});

  let automaticThemeTimer=null;
  let preGenerationDraft=[];

  function applyAutomaticTheme(){
    const theme='dark';
    document.documentElement.dataset.theme=theme;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content='#060a12';
    return theme;
  }

  function startAutomaticTheme(){
    applyAutomaticTheme();
    if(automaticThemeTimer)clearInterval(automaticThemeTimer);
    automaticThemeTimer=null;
  }

  function preGenDefaultDay(){
    const today=dateKey(new Date());
    return today.startsWith(state.month)?today:`${state.month}-01`;
  }

  function setPreGenStage(stage){
    $('#preGenQuestion').classList.toggle('hidden',stage!=='question');
    $('#preGenFormStage').classList.toggle('hidden',stage!=='form');
    $('#preGenRecapStage').classList.toggle('hidden',stage!=='recap');

    const titles={
      question:['Prima di generare il calendario','Verifica preventivamente ferie, permessi e indisponibilità'],
      form:['Inserisci ferie, permessi e indisponibilità','Puoi aggiungere più persone prima di passare al riepilogo'],
      recap:['Riepilogo prima della generazione','Controlla e autorizza la registrazione']
    };
    $('#preGenTitle').textContent=titles[stage][0];
    $('#preGenSubtitle').textContent=titles[stage][1];

    if(stage==='form')renderPreGenerationDraft();
    if(stage==='recap')renderPreGenerationRecap();
  }

  function openPreGenerationWizard(){
    if(state.generating)return toast('Generazione già in corso','Attendi il completamento.','info');
    preGenerationDraft=[];
    const employee=$('#preGenEmployee');
    employee.innerHTML=state.employees
      .filter(e=>employeeActiveInMonth(e))
      .sort((a,b)=>a.cognome.localeCompare(b.cognome)||a.nome.localeCompare(b.nome))
      .map(e=>`<option value="${e.id}">${esc(employeeName(e))} · ${esc(e.turno)}</option>`).join('');

    const day=preGenDefaultDay();
    $('#preGenFrom').value=day;
    $('#preGenTo').value=day;
    $('#preGenCode').value='F';
    $('#preGenMode').value='GIORNATA';
    $('#preGenHours').value='7.6';
    $('#preGenStart').value='08:00';
    $('#preGenEnd').value='12:00';
    $('#preGenStatus').value='APPROVATO';
    $('#preGenEventDate').value='';
    $('#preGenReferenceDate').value='';
    $('#preGenRecoveryDue').value='';
    $('#preGenNote').value='';
    $('#preGenConfirmCheck').checked=false;
    $('#preGenConfirmBtn').disabled=true;
    togglePreGenMode();
    setPreGenStage('question');
    openModal('preGenerationModal');
  }

  function togglePreGenMode(){
    const meta=absenceMeta($('#preGenCode').value);
    if(meta.hourlyOnly)$('#preGenMode').value='ORE';
    const hourly=$('#preGenMode').value==='ORE';
    ['#preGenStart','#preGenEnd'].forEach(sel=>{$(sel).disabled=!hourly;});
    $('#preGenHours').disabled=false;
    if(meta.minHours&&numeric($('#preGenHours').value)<meta.minHours)$('#preGenHours').value=meta.minHours;
    $('#preGenEventDate').disabled=!meta.eventRequired;
    $('#preGenReferenceDate').disabled=!meta.referenceRequired;
    $('#preGenRecoveryDue').disabled=!meta.requiresRecovery;
    const due=automaticRecoveryDue($('#preGenFrom').value,meta);
    $('#preGenRecoveryDue').readOnly=!!due;
    if(due)$('#preGenRecoveryDue').value=due;else if(!meta.requiresRecovery)$('#preGenRecoveryDue').value='';
    if(!meta.eventRequired)$('#preGenEventDate').value='';
    if(!meta.referenceRequired)$('#preGenReferenceDate').value='';
  }

  function preGenCodeLabel(code){
    return `${code} · ${absenceLabel(code)}`;
  }

  function formatDateIt(day){
    const d=parseDateKey(day);
    return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
  }

  function draftDateLabel(entry){
    const range=entry.from===entry.to?formatDateIt(entry.from):`${formatDateIt(entry.from)} → ${formatDateIt(entry.to)}`;
    const mode=entry.mode==='ORE'?`${entry.start}–${entry.end} · ${fmt(entry.hours)} h`:`giornata intera · ${fmt(entry.hours)} h/giorno`;
    const refs=[entry.eventDate?`evento ${formatDateIt(entry.eventDate)}`:'',entry.referenceDate?`riferimento ${formatDateIt(entry.referenceDate)}`:'',entry.recoveryDue?`recupero entro ${formatDateIt(entry.recoveryDue)}`:''].filter(Boolean).join(' · ');
    return `${range} · ${mode}${refs?` · ${refs}`:''}`;
  }

  function addPreGenerationDraft(){
    const employeeId=$('#preGenEmployee').value;
    const from=$('#preGenFrom').value;
    const to=$('#preGenTo').value;
    const code=$('#preGenCode').value;
    const mode=$('#preGenMode').value;
    const start=$('#preGenStart').value;
    const end=$('#preGenEnd').value;
    const hours=numeric($('#preGenHours').value);
    const status=$('#preGenStatus').value;
    const eventDate=$('#preGenEventDate').value;
    const referenceDate=$('#preGenReferenceDate').value;
    const meta=absenceMeta(code);
    const recoveryDue=resolvedRecoveryDue(from,meta,$('#preGenRecoveryDue').value);
    const note=$('#preGenNote').value.trim();

    if(!employeeId||!from||!to)return toast('Dati incompleti','Seleziona dipendente e intervallo.','error');
    if(!from.startsWith(state.month)||!to.startsWith(state.month)){
      return toast('Mese non coerente',`Le date devono appartenere a ${monthLabel()}.`,'error');
    }
    if(to<from)return toast('Intervallo non valido','La data finale precede quella iniziale.','error');
    if(mode==='ORE'&&(!start||!end||hours<=0)){
      return toast('Dati orari incompleti','Inserisci inizio, fine e ore riconosciute.','error');
    }
    if(mode==='GIORNATA'&&hours<0)return toast('Ore non valide','','error');
    if(meta.hourlyOnly&&mode!=='ORE')return toast('Causale solo a ore',`${code} non può essere registrato a giornata intera.`,'error');
    if(meta.eventRequired&&!eventDate)return toast('Data evento mancante',`${code} richiede la data dell’evento.`,'error');
    if(meta.referenceRequired&&!referenceDate)return toast('Data di riferimento mancante',`${code} richiede la festività, deroga o permesso da recuperare.`,'error');
    if(recoveryDueIsMandatory(meta)&&!recoveryDue)return toast('Scadenza recupero obbligatoria',`${code} richiede una data entro cui completare il recupero.`,'error');
    if(meta.minHours&&hours<meta.minHours)return toast('Blocco minimo non rispettato',`${code} richiede almeno ${meta.minHours} ore.`,'error');

    preGenerationDraft.push({
      id:uid(),employeeId,from,to,code,mode,start,end,hours,status,
      eventDate,referenceDate,recoveryDue,note
    });
    $('#preGenNote').value='';
    renderPreGenerationDraft();
    toast('Voce aggiunta al riepilogo',`${preGenCodeLabel(code)} · ${employeeName(state.employees.find(e=>e.id===employeeId))}`,'success');
  }

  function renderPreGenerationDraft(){
    const host=$('#preGenPendingList');
    if(!preGenerationDraft.length){
      host.innerHTML='<div class="empty-state" style="min-height:90px"><div><strong>Nessuna nuova indisponibilità</strong>Puoi comunque proseguire e controllare quelle già registrate.</div></div>';
      $('#preGenPendingCount').textContent='Nessuna voce aggiunta';
      return;
    }
    host.innerHTML=preGenerationDraft.map(entry=>{
      const employee=state.employees.find(e=>e.id===entry.employeeId);
      return `<div class="pre-gen-entry">
        <div>
          <strong>${esc(employeeName(employee))} · ${esc(preGenCodeLabel(entry.code))}</strong>
          <span>${esc(draftDateLabel(entry))}${entry.note?` · ${esc(entry.note)}`:''}</span>
        </div>
        <button class="pre-gen-remove" type="button" data-pre-gen-remove="${entry.id}">Rimuovi</button>
      </div>`;
    }).join('');
    $('#preGenPendingCount').textContent=`${preGenerationDraft.length} ${preGenerationDraft.length===1?'voce pronta':'voci pronte'}`;
    $$('[data-pre-gen-remove]').forEach(button=>button.addEventListener('click',()=>{
      preGenerationDraft=preGenerationDraft.filter(entry=>entry.id!==button.dataset.preGenRemove);
      renderPreGenerationDraft();
    }));
  }

  function existingProtectedForRecap(){
    const rows=[];
    Object.entries(state.assignments).forEach(([key,items])=>{
      const split=key.lastIndexOf('|');
      const employeeId=key.slice(0,split),day=key.slice(split+1);
      if(!day.startsWith(state.month))return;
      const employee=state.employees.find(e=>e.id===employeeId);
      (items||[]).filter(isProtectedCalendarRecord).forEach(item=>{
        rows.push({
          employeeId,employee,day,item,
          label:preGenCodeLabel(item.code||item.type),
          time:item.allDay?'giornata intera':`${item.start||'--:--'}–${item.end||'--:--'}`
        });
      });
    });
    return rows.sort((a,b)=>a.day.localeCompare(b.day)||employeeName(a.employee).localeCompare(employeeName(b.employee)));
  }

  function renderPreGenerationRecap(){
    const existing=existingProtectedForRecap();
    const host=$('#preGenRecapList');
    const blocks=[];

    if(existing.length){
      blocks.push(`<div class="section-label" style="margin-top:0">Già registrati nel calendario · ${existing.length}</div>`);
      existing.forEach(row=>{
        blocks.push(`<div class="pre-gen-recap-block existing">
          <div class="pre-gen-recap-title"><span>${esc(employeeName(row.employee))}</span><span>${esc(row.label)}</span></div>
          <div class="pre-gen-recap-meta">${esc(formatDateIt(row.day))} · ${esc(row.time)} · ${fmt(row.item.hours||0)} h${row.item.note?` · ${esc(row.item.note)}`:''}</div>
        </div>`);
      });
    }else{
      blocks.push('<div class="notice info">Nel mese non risultano ancora ferie, malattie, permessi o altre indisponibilità protette.</div>');
    }

    if(preGenerationDraft.length){
      blocks.push(`<div class="section-label">Nuovi da registrare · ${preGenerationDraft.length}</div>`);
      preGenerationDraft.forEach(entry=>{
        const employee=state.employees.find(e=>e.id===entry.employeeId);
        blocks.push(`<div class="pre-gen-recap-block new">
          <div class="pre-gen-recap-title"><span>${esc(employeeName(employee))}</span><span>${esc(preGenCodeLabel(entry.code))}</span></div>
          <div class="pre-gen-recap-meta">${esc(draftDateLabel(entry))}${entry.note?` · ${esc(entry.note)}`:''}</div>
        </div>`);
      });
    }else{
      blocks.push('<div class="notice">Non sono state aggiunte nuove indisponibilità in questa procedura.</div>');
    }

    host.innerHTML=blocks.join('');
    $('#preGenConfirmCheck').checked=false;
    $('#preGenConfirmBtn').disabled=true;
  }

  function commitPreGenerationDraft(){
    let created=0,skipped=0;
    preGenerationDraft.forEach(entry=>{
      const from=parseDateKey(entry.from),to=parseDateKey(entry.to);
      for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
        const day=dateKey(d);
        let hours=entry.hours;
        if(entry.mode==='GIORNATA'&&isWeekend(d)&&!['MAL','INF'].includes(entry.code))hours=0;

        const duplicate=getAssignments(entry.employeeId,day).some(a=>
          isProtectedCalendarRecord(a)&&
          (a.code||a.type)===entry.code&&
          !!a.allDay===(entry.mode==='GIORNATA')&&
          (a.start||'')===(entry.mode==='ORE'?entry.start:'')&&
          (a.end||'')===(entry.mode==='ORE'?entry.end:'')
        );
        if(duplicate){skipped++;continue;}

        const item={
          ...manualBase(),
          category:absenceMeta(entry.code).category,
          type:entry.code,code:entry.code,hours,
          allDay:entry.mode==='GIORNATA',
          start:entry.mode==='ORE'?entry.start:'',
          end:entry.mode==='ORE'?entry.end:'',
          nextDay:entry.mode==='ORE'?shiftWindow('CUSTOM',day,entry.start,entry.end).nextDay:false,
          note:entry.note,status:entry.status,locked:true,
          eventDate:entry.eventDate||'',linkedEventDay:entry.referenceDate||'',
          ccnlRef:absenceMeta(entry.code).ccnlRef,
          recoveryRequired:!!absenceMeta(entry.code).requiresRecovery,
          recoveryDue:resolvedRecoveryDue(day,absenceMeta(entry.code),entry.recoveryDue),
          preGeneration:true
        };
        appendTo(entry.employeeId,day,item,{dirty:true,render:false});
        created++;
      }
    });

    if(created||skipped){
      state.localDirty=true;
      saveState();
      renderAll();
    }
    preGenerationDraft=[];
    return {created,skipped};
  }

  function confirmPreGeneration(){
    if(!$('#preGenConfirmCheck').checked)return;
    const result=commitPreGenerationDraft();
    closeModal('preGenerationModal');
    openAutoModal();
    const detail=[
      result.created?`${result.created} record registrati`:'',
      result.skipped?`${result.skipped} duplicati ignorati`:''
    ].filter(Boolean).join(' · ');
    if(detail)toast('Riepilogo confermato',detail,'success');
  }


  function planForMonth(month){
    if(month===state.month){
      return{assignments:state.assignments,requirements:state.requirements,current:true};
    }

    state.monthPlans=state.monthPlans||{};
    if(!state.monthPlans[month]){
      state.monthPlans[month]={
        assignments:{},
        requirements:{},
        localDirty:true,
        lastAutoSummary:null
      };
    }

    state.monthPlans[month].assignments=state.monthPlans[month].assignments||{};
    state.monthPlans[month].requirements=state.monthPlans[month].requirements||{};
    return{
      assignments:state.monthPlans[month].assignments,
      requirements:state.monthPlans[month].requirements,
      current:false,
      plan:state.monthPlans[month]
    };
  }
  function rfsCandidateDays(employee,entitlement,targetMonth,store){
    const year=Number(targetMonth.slice(0,4));
    const holidays=holidayKeysForYear(
      year,
      state.settings.patronHoliday
    );
    const firstDay=`${targetMonth}-01`;
    const lastDay=endOfMonthKey(targetMonth);
    const minimum=[
      entitlement.recoveryWindowStart||
        addDaysKey(entitlement.sourceDay,1),
      firstDay
    ].sort().at(-1);
    const maximum=[
      entitlement.due,
      lastDay
    ].sort().at(0);

    if(minimum>maximum)return[];

    return monthDateKeysFor(targetMonth)
      .filter(day=>
        day>=minimum&&
        day<=maximum&&
        !holidays.has(day)&&
        employeeActiveOn(employee,day)
      )
      .map(day=>{
        const key=assignmentKey(employee.id,day);
        const items=store[key]||[];
        const working=items.filter(isWorkingAssignment);
        const hasProtected=items.some(item=>
          item.locked||
          isProtectedCalendarRecord(item)||
          sourceLabel(item)!=='AUTO'
        );
        const free=items.length===0;
        const replaceable=
          targetMonth===state.month&&
          !hasProtected&&
          items.length===1&&
          working.length===1&&
          ['118','SE'].includes(working[0].category)&&
          !working[0].locked&&
          sourceLabel(working[0])==='AUTO';
        const date=parseDateKey(day);
        const weekday=date.getDay()>=1&&date.getDay()<=5;
        const distance=Math.max(0,daysBetween(minimum,day));

        return{
          day,
          key,
          items,
          working,
          free,
          replaceable,
          score:
            (free?0:500)+
            (weekday?0:25)+
            distance
        };
      })
      .filter(item=>item.free||item.replaceable)
      .sort((a,b)=>
        a.score-b.score||
        a.day.localeCompare(b.day)
      );
  }
  function createRfsItem(employee,entitlement,targetMonth){
    const now=new Date().toISOString();
    return{
      id:uid(),
      origin:'AUTOMATICA',
      locked:true,
      status:'APPROVATO',
      coverage:'ORDINARIA',
      category:'RC',
      type:'RFS',
      code:'RFS',
      hours:dailyContractHours(employee),
      allDay:true,
      ccnlRef:'Art. 29',
      linkedEventDay:entitlement.sourceDay,
      linkedRecordId:entitlement.sourceRecordId,
      recoveryRequired:false,
      recoveryDue:entitlement.due,
      rfsTargetMonth:targetMonth,
      note:`RFS maturato per festività lavorata del ${formatDateIt(entitlement.sourceDay)} · da fruire obbligatoriamente entro il ${formatDateIt(entitlement.due)} (30 giorni).`,
      createdAt:now,
      updatedAt:now
    };
  }
  function rfsReplacementNeedsMale(employee,day,item){
    if(
      item.category!=='118'||
      crewKey(item)!=='G2'
    )return false;

    const peers=shiftRows(day,item.shift).filter(row=>
      crewKey(row.a)==='G2'&&
      row.employeeId!==employee.id
    );

    return peers.length>0&&peers.every(row=>
      isFemale(row.employee)
    );
  }
  function probeRfsReplacement(employee,day,item){
    const key=assignmentKey(employee.id,day);
    const original=[
      ...getAssignments(employee.id,day)
    ];
    const index=original.findIndex(current=>
      current.id===item.id
    );
    if(index<0)return null;

    removeLinkedPostNightRest(
      employee.id,
      day,
      item
    );

    const reduced=[...original];
    reduced.splice(index,1);
    if(reduced.length){
      state.assignments[key]=reduced;
    }else{
      delete state.assignments[key];
    }
    refreshAutoCache();

    const replacement=chooseCandidate(
      day,
      item,
      {
        preferred:
          item.plannedGroup||
          employee.turno,
        allowRo:false,
        pool:state.employees.filter(candidate=>
          candidate.id!==employee.id
        ),
        requireMale:rfsReplacementNeedsMale(
          employee,
          day,
          item
        )
      }
    );

    state.assignments[key]=original;
    ensurePostNightRest(
      employee.id,
      day,
      item,
      {dirty:false}
    );
    refreshAutoCache();

    return replacement||null;
  }
  function moveAssignmentForRfs(
    employee,
    day,
    item,
    replacement,
    entitlement
  ){
    const sourceKey=assignmentKey(employee.id,day);
    const sourceItems=[
      ...getAssignments(employee.id,day)
    ];
    const index=sourceItems.findIndex(current=>
      current.id===item.id
    );
    if(index<0)return false;

    removeLinkedPostNightRest(
      employee.id,
      day,
      item
    );
    sourceItems.splice(index,1);
    if(sourceItems.length){
      state.assignments[sourceKey]=sourceItems;
    }else{
      delete state.assignments[sourceKey];
    }

    const moved={
      ...item,
      crossGroup:
        item.plannedGroup&&
        !['Libera',item.plannedGroup].includes(
          replacement.turno
        )
          ?true
          :item.crossGroup,
      updatedAt:new Date().toISOString(),
      rfsCoverageReplacement:true,
      note:[
        item.note,
        `Spostamento automatico per consentire RFS a ${employeeName(employee)} del ${formatDateIt(entitlement.sourceDay)}`
      ].filter(Boolean).join(' · ')
    };
    const targetKey=assignmentKey(
      replacement.id,
      day
    );
    state.assignments[targetKey]=[
      ...(state.assignments[targetKey]||[]),
      moved
    ];
    ensurePostNightRest(
      replacement.id,
      day,
      moved,
      {dirty:false}
    );
    refreshAutoCache();
    return true;
  }
  function prepareRfsDay(
    employee,
    entitlement,
    candidate,
    targetMonth
  ){
    if(candidate.free){
      return{
        ok:true,
        replaced:false,
        replacement:null
      };
    }

    if(
      targetMonth!==state.month||
      !candidate.replaceable
    ){
      return{ok:false};
    }

    const item=candidate.working[0];
    const replacement=probeRfsReplacement(
      employee,
      candidate.day,
      item
    );
    if(!replacement)return{ok:false};

    const moved=moveAssignmentForRfs(
      employee,
      candidate.day,
      item,
      replacement,
      entitlement
    );
    return{
      ok:moved,
      replaced:moved,
      replacement:moved?replacement:null
    };
  }

  function placeRfsEntitlements(entitlements,targetMonth){
    const target=planForMonth(targetMonth);
    const store=target.assignments;
    let placed=0,
      unresolved=0,
      overdue=0,
      replacements=0;
    const details=[];

    entitlements.forEach(entitlement=>{
      const employee=state.employees.find(
        e=>e.id===entitlement.employeeId
      );
      if(!employee){
        unresolved++;
        return;
      }

      if(!rfsEligibleForMonth(entitlement,targetMonth)){
        unresolved++;
        details.push(
          `${employeeName(employee)} · fuori dalla finestra RFS`
        );
        return;
      }

      const existing=Object.entries(store).some(
        ([key,items])=>{
          const split=key.lastIndexOf('|');
          const employeeId=key.slice(0,split);
          return (
            employeeId===employee.id&&
            (items||[]).some(item=>
              isRfsRecord(item)&&
              item.linkedEventDay===entitlement.sourceDay
            )
          );
        }
      );
      if(existing)return;

      const candidates=rfsCandidateDays(
        employee,
        entitlement,
        targetMonth,
        store
      );

      let selected=null;
      let preparation=null;

      for(const candidate of candidates){
        const result=prepareRfsDay(
          employee,
          entitlement,
          candidate,
          targetMonth
        );
        if(result.ok){
          selected=candidate;
          preparation=result;
          break;
        }
      }

      if(!selected){
        unresolved++;
        details.push(
          `${employeeName(employee)} · nessun giorno libero e nessuna sostituzione sicura`
        );
        return;
      }

      const currentItems=store[selected.key]||[];
      store[selected.key]=[
        ...currentItems,
        createRfsItem(
          employee,
          entitlement,
          targetMonth
        )
      ];

      placed++;
      if(preparation?.replaced)replacements++;
      if(selected.day>entitlement.due)overdue++;

      details.push(
        `${employeeName(employee)} · ${formatDateIt(selected.day)}`+
        (
          preparation?.replacement
            ?` · turno coperto da ${employeeName(preparation.replacement)}`
            :' · giornata già libera'
        )
      );
    });

    if(target.current){
      state.assignments=store;
    }else{
      target.plan.assignments=store;
      target.plan.localDirty=true;
    }

    state.localDirty=true;
    return{
      placed,
      unresolved,
      overdue,
      replacements,
      targetMonth,
      details,
      coverageProtected:true
    };
  }
  function placeMandatoryRfsEntitlements(entitlements){
    const result={
      placed:0,
      unresolved:0,
      replacements:0,
      currentMonth:0,
      nextMonth:0,
      details:[],
      targetMonth:'automatico',
      coverageProtected:true,
      mandatory:true
    };

    const currentMonth=state.month;
    const followingMonth=nextMonthValue(
      currentMonth
    );

    entitlements.forEach(entitlement=>{
      const months=[];

      if(
        rfsEligibleForMonth(
          entitlement,
          currentMonth
        )
      ){
        months.push(currentMonth);
      }

      if(
        rfsEligibleForMonth(
          entitlement,
          followingMonth
        )
      ){
        months.push(followingMonth);
      }

      let done=false;

      for(const month of months){
        const attempt=placeRfsEntitlements(
          [entitlement],
          month
        );

        if(!attempt.placed)continue;

        result.placed+=attempt.placed;
        result.replacements+=
          attempt.replacements||0;
        result.details.push(
          ...(attempt.details||[])
        );

        if(month===currentMonth){
          result.currentMonth++;
        }else{
          result.nextMonth++;
        }

        done=true;
        break;
      }

      if(!done){
        result.unresolved++;
        result.details.push(
          `${employeeName(entitlement.employee)} · RFS del ${formatDateIt(entitlement.sourceDay)} non collocabile entro ${formatDateIt(entitlement.due)}`
        );
      }
    });

    return result;
  }

  function rfsModalRows(entitlements){
    const year=Number(state.month.slice(0,4));
    const grouped=new Map();

    entitlements.forEach(item=>{
      const entry=grouped.get(item.employeeId)||{employee:item.employee,pending:[]};
      entry.pending.push(item);
      grouped.set(item.employeeId,entry);
    });

    return [...grouped.values()]
      .sort((a,b)=>employeeName(a.employee).localeCompare(employeeName(b.employee)))
      .map(entry=>{
        const counter=rfsCounter(entry.employee.id,year);
        const days=entry.pending.map(item=>
          `${formatDateIt(item.sourceDay)} → entro ${formatDateIt(item.due)}`
        ).join(', ');
        return`<tr>
          <td><strong>${esc(employeeName(entry.employee))}</strong></td>
          <td class="rfs-number">${counter.earned}</td>
          <td class="rfs-number">${counter.used}</td>
          <td class="rfs-number rfs-residual">${counter.remaining}</td>
          <td class="rfs-open-days">${esc(days)}</td>
        </tr>`;
      }).join('');
  }
  function openRfsPlacementModal(entitlements,context){
    const year=Number(state.month.slice(0,4));
    const total=state.employees.reduce((acc,employee)=>{
      const counter=rfsCounter(employee.id,year);
      acc.earned+=counter.earned;
      acc.used+=counter.used;
      acc.remaining+=counter.remaining;
      return acc;
    },{earned:0,used:0,remaining:0});

    const nextMonth=nextMonthValue(state.month);
    const currentEligible=entitlements.filter(item=>
      rfsEligibleForMonth(item,state.month)
    ).length;
    const nextEligible=entitlements.filter(item=>
      rfsEligibleForMonth(item,nextMonth)
    ).length;

    state.pendingRfsPrompt={entitlements,context};
    $('#rfsPlacementSubtitle').textContent=
      `${entitlements.length} RFS disponibili · collocamento senza scoperture`;
    $('#rfsTotalEarned').textContent=total.earned;
    $('#rfsTotalUsed').textContent=total.used;
    $('#rfsTotalPending').textContent=entitlements.length;
    $('#rfsCounterBody').innerHTML=rfsModalRows(entitlements);

    $('#rfsCurrentMonthLabel').textContent=
      `${monthLabel(state.month)} · ${currentEligible} collocabili`;
    $('#rfsNextMonthLabel').textContent=
      `${monthLabel(nextMonth)} · ${nextEligible} collocabili`;

    $('#rfsCurrentMonthBtn').disabled=currentEligible===0;
    $('#rfsNextMonthBtn').disabled=nextEligible===0;

    $('#rfsPlacementResult').classList.add('hidden');
    $('#rfsPlacementResult').textContent='';
    openModal('rfsPlacementModal');
  }
  function finishAutomaticGeneration(summary,rfsPlacement=null){
    const restText=summary.autoRc
      ?` · ${summary.restSummary.added} RC automatici${summary.restSummary.unresolved?` · ${summary.restSummary.unresolved} recuperi da verificare`:''}`
      :'';
    const rfsText=rfsPlacement
      ?` · ${rfsPlacement.placed} RFS obbligatori pianificati${rfsPlacement.replacements?` · ${rfsPlacement.replacements} turni sostituiti e coperti`:''}${rfsPlacement.unresolved?` · ${rfsPlacement.unresolved} RFS bloccanti da risolvere`:''}`
      :'';

    toast(
      'ATLAS ha generato la proposta',
      `${summary.added} assegnazioni proposte · ${summary.missing} ruoli scoperti · ${summary.cross} cross A/B segnalati${summary.emergencyCoverage?` · ${summary.emergencyCoverage} coperture emergenziali GRS/GRA/GRM/GRO`:''} · ${summary.weeklyBalance?.moved||0} spostamenti per limite settimanale · ${summary.genderSwaps} riequilibri equipaggio${summary.weeklyBalance?.unresolved?` · ${summary.weeklyBalance.unresolved} settimane sovraccariche non risolte`:''}${restText}${rfsText}.`,
      summary.missing?'error':'success'
    );
    switchView('anomaliesView');
  }
  async function handleRfsPlacement(mode){
    const pending=state.pendingRfsPrompt;
    if(!pending)return;

    const {entitlements,context}=pending;
    state.pendingRfsPrompt=null;
    closeModal('rfsPlacementModal');

    if(mode==='ro'){
      saveState();
      renderAll();
      finishAutomaticGeneration(context.summary,{
        placed:0,
        unresolved:entitlements.length,
        targetMonth:'',
        roChoice:true
      });
      toast(
        'RFS lasciati alla scelta del RO',
        `${entitlements.length} permessi restano disponibili nel contatore.`,
        'info'
      );
      return;
    }

    const targetMonth=mode==='next'
      ?nextMonthValue(state.month)
      :state.month;
    const eligible=entitlements.filter(item=>
      rfsEligibleForMonth(item,targetMonth)
    );
    const outsideWindow=
      entitlements.length-eligible.length;

    const placement=placeRfsEntitlements(
      eligible,
      targetMonth
    );
    placement.unresolved+=outsideWindow;
    placement.outsideWindow=outsideWindow;

    saveState();
    renderAll();
    finishAutomaticGeneration(
      context.summary,
      placement
    );
    const message=[
      `${placement.placed} RFS inseriti in ${monthLabel(targetMonth)}.`,
      placement.replacements?`${placement.replacements} turni sono stati spostati soltanto dopo aver trovato un sostituto valido.`:'',
      placement.unresolved?`${placement.unresolved} non collocati: nessun buco è stato creato e restano alla scelta del RO.`:'',
      placement.outsideWindow?`${placement.outsideWindow} non rientrano nella finestra del mese scelto.`:''
    ].filter(Boolean).join(' ');

    toast(
      mode==='current'
        ?'RFS programmati senza scoperture'
        :'RFS programmati nel mese successivo',
      message,
      placement.unresolved?'info':'success'
    );
  }

  let generationCancelRequested=false;
  function generationCancelError(){const error=new Error('GENERAZIONE_ANNULLATA');error.code='ATLAS_GENERATION_CANCELLED';return error;}
  function ensureGenerationNotCancelled(){if(generationCancelRequested)throw generationCancelError();}
  function cancelAutomaticGeneration(){
    if(!state.generating)return;
    generationCancelRequested=true;
    updateGeneration(0,'Annullamento in corso…');
    const button=$('#generationCancelBtn');if(button){button.disabled=true;button.textContent='Annullamento…';}
  }
  function setGenerationUi(active,percent=0,label='Preparazione…'){state.generating=active;['#generateAutoBtn','#autoBtn'].forEach(sel=>{const b=$(sel);if(b)b.disabled=active;});const overlay=$('#generationOverlay');if(overlay)overlay.classList.toggle('open',active);const bar=$('#generationProgressBar');if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;const pct=$('#generationProgressPct');if(pct)pct.textContent=`${Math.round(percent)}%`;const stage=$('#generationStage');if(stage)stage.textContent=label;}
  function updateGeneration(percent,label){setGenerationUi(true,percent,label);}
  function coverageCandidatePool({emergency=false,day=''}={}){
    if(!emergency)return state.employees.filter(e=>['A','B','Libera'].includes(e.turno));
    // In fallback aggiunge ESCLUSIVAMENTE le responsabilità operative autorizzate
    // (GRS/GRA/GRM/GRO) oltre alle risorse ordinarie.
    return state.employees.filter(e=>
      e.turno!=='Amministrazione'&&
      (['A','B','Libera'].includes(e.turno)||!!fallbackResponsibilityCode(e,day))
    );
  }
  function slotCandidateRanking(day,shift,slot,targetGroup,{emergency=false,ignoreSiteContinuity=false}={}){
    const item={category:'118',shift,site:slot.site,machine:slot.machine,role:slot.role,plannedGroup:targetGroup};
    const currentRows=shiftRows(day,shift),crewRows=currentRows.filter(r=>crewKey(r.a)===slot.crew),hasMale=crewRows.some(r=>isMale(r.employee));
    const activeCrews=[...new Set(crewSlotsForDayShift(parseDateKey(day),shift).map(x=>x.crew))];
    const requireMale=slot.crew==='G2'&&crewRows.length>=1&&!hasMale;
    const otherCrewNeedsMale=activeCrews.some(crew=>crew!==slot.crew&&!currentRows.filter(r=>crewKey(r.a)===crew).some(r=>isMale(r.employee)));
    return rankCandidates(day,item,{
      preferred:targetGroup,
      allowRo:emergency,
      pool:coverageCandidatePool({emergency,day}),
      preferMale:!hasMale,
      preserveMale:hasMale&&otherCrewNeedsMale,
      requireMale,
      allowResponsibilityRelease:emergency,
      ignoreSiteContinuity
    }).map(x=>({...x,item}));
  }
  function placeCoverageTrial(employee,day,item,releaseResponsibilities=[]){
    const key=assignmentKey(employee.id,day);
    const releaseIds=new Set((releaseResponsibilities||[]).map(entry=>entry.id));
    const removedResponsibilities=(state.assignments[key]||[]).filter(entry=>releaseIds.has(entry.id));
    if(removedResponsibilities.length){
      const keep=(state.assignments[key]||[]).filter(entry=>!releaseIds.has(entry.id));
      if(keep.length)state.assignments[key]=keep;else delete state.assignments[key];
      refreshAutoCache();
    }
    const crossGroup=['A','B'].includes(employee.turno)&&employee.turno!==item.plannedGroup;
    const releasedCodes=[...new Set(removedResponsibilities.map(entry=>String(entry.type||entry.code||'').toUpperCase()))];
    const emergencyNote=releasedCodes.length?`${releasedCodes.join('/')} convertito in 118 per garantire la copertura.`:'';
    const assignment=autoItem({...item,crossGroup,crossGroupFrom:crossGroup?item.plannedGroup:'',crossGroupTo:crossGroup?employee.turno:'',crossReason:crossGroup?`Copertura completa: gruppo ${employee.turno} utilizzato sul turno ${item.plannedGroup}.`:'',emergencyCoverage:releasedCodes.length>0,releasedResponsibility:releasedCodes.join('/'),note:[crossGroup?`Cross A/B automatico per evitare una scopertura: gruppo ${employee.turno} utilizzato sul turno ${item.plannedGroup}.`:'',emergencyNote].filter(Boolean).join(' · ')});
    state.assignments[key]=[...(state.assignments[key]||[]),assignment];
    refreshAutoCache();
    return{employee,day,assignment,key,crossGroup,removedResponsibilities};
  }
  function removeCoverageTrial(trial){
    const keep=(state.assignments[trial.key]||[]).filter(a=>a.id!==trial.assignment.id);
    const restored=[...keep,...(trial.removedResponsibilities||[])];
    if(restored.length)state.assignments[trial.key]=restored;else delete state.assignments[trial.key];
    refreshAutoCache();
  }
  function solveRequiredShift(day,shift,targetGroup,{emergency=false,ignoreSiteContinuity=false,maxNodes=1800,maxMs=450,maxCandidates=8}={}){
    const initial=crewSlotsForDayShift(parseDateKey(day),shift).filter(slot=>!currentSlotOccupied(day,shift,slot));
    const started=(globalThis.performance?.now?.()??Date.now());
    let nodes=0,timedOut=false;
    const overBudget=()=>{
      const now=(globalThis.performance?.now?.()??Date.now());
      if(nodes>=maxNodes||now-started>=maxMs){timedOut=true;return true;}
      return false;
    };
    function search(slots,trials){
      if(generationCancelRequested||overBudget())return null;
      nodes++;
      if(!slots.length)return trials;
      const ranked=slots.map(slot=>({
        slot,
        candidates:slotCandidateRanking(day,shift,slot,targetGroup,{emergency,ignoreSiteContinuity}).slice(0,maxCandidates)
      })).sort((a,b)=>a.candidates.length-b.candidates.length||(['A','C','S'].indexOf(a.slot.role)-['A','C','S'].indexOf(b.slot.role)));
      const current=ranked[0];
      if(!current||!current.candidates.length)return null;
      const next=slots.filter(s=>s!==current.slot);
      for(const candidate of current.candidates){
        if(overBudget())break;
        const trial=placeCoverageTrial(candidate.e,day,candidate.item,candidate.releaseResponsibilities||[]);
        const solved=search(next,[...trials,trial]);
        if(solved)return solved;
        removeCoverageTrial(trial);
      }
      return null;
    }
    const trials=search(initial,[]);
    return{success:!!trials,trials:trials||[],nodes,emergency,timedOut,ignoreSiteContinuity};
  }
  function finalizeCoverageTrials(trials){
    let added=0,cross=0,emergency=0;
    trials.forEach(trial=>{
      ensurePostNightRest(trial.employee.id,trial.day,trial.assignment,{dirty:false});
      if(trial.crossGroup)cross++;
      if(trial.removedResponsibilities?.length){
        emergency++;
        trial.assignment.emergencyCoverage=true;
      }
      added++;
    });
    refreshAutoCache();
    return{added,cross,emergency};
  }
  function scheduleShiftCompletely(day,shift,targetGroup){
    // 1) Tentativo ordinario con preferenza SOFT della sede settimanale.
    let solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:false});
    // 2) PRIORITÀ COPERTURA: se non chiude, riprova senza alcun peso Somma/Gallarate.
    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:true,maxNodes:2400,maxMs:520,maxCandidates:10});
    // 3) Ultimo fallback: GRS/GRA/GRM/GRO possono lasciare la responsabilità e fare 118.
    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:true,ignoreSiteContinuity:true,maxNodes:2800,maxMs:620,maxCandidates:12});
    if(!solved.success){
      return{success:false,added:0,cross:0,emergency:0,missing:crewSlotsForDayShift(parseDateKey(day),shift).filter(slot=>!currentSlotOccupied(day,shift,slot)).length};
    }
    return{success:true,missing:0,...finalizeCoverageTrials(solved.trials)};
  }

  async function schedule118({allowRo=false,onProgress=null}={}){
    let added=0,missing=0,cross=0,emergency=0;
    const dates=monthDates();
    for(let i=0;i<dates.length;i++){
      ensureGenerationNotCancelled();
      const d=dates[i],day=dateKey(d);
      for(const shift of ['M','P','N']){
        ensureGenerationNotCancelled();
        if(state.requirements[`${day}|${shift}`]!=='required')continue;
        const targetGroup=chooseShiftGroup(d,shift);
        const result=scheduleShiftCompletely(day,shift,targetGroup);
        added+=result.added;missing+=result.missing;cross+=result.cross;emergency+=result.emergency;
      }
      // Aggiorna la barra ad ogni giorno: l'interfaccia non deve mai sembrare ferma.
      if(onProgress)onProgress(i+1,dates.length);
      await yieldUi();
    }
    return{added,missing,cross,emergency};
  }

  async function generateAutomatic(options=null){
    if(state.generating)return toast('Generazione già in corso','Attendi il completamento della proposta.','info');

    const override=options?.__atlasGeneration===true?options:null;
    const preserve=override?.preserve??($('#autoPreserve')?.checked!==false),
      admin=override?.admin??($('#autoAdmin')?.checked!==false),
      resp=override?.resp??($('#autoResp')?.checked!==false),
      se=override?.se??($('#autoSe')?.checked!==false),
      allowRo=override?.allowRo??($('#autoRo')?.checked===true),
      autoRc=override?.autoRc??($('#autoRc')?.checked===true),
      suppressRfsPrompt=override?.suppressRfsPrompt===true,
      inheritedRfsPlacement=override?.rfsPlacement||null;

    state.settings.autoCompensatoryRestDefault=autoRc;
    const generationSnapshot={
      assignments:structuredClone(state.assignments||{}),
      requirements:structuredClone(state.requirements||{}),
      lastAutoSummary:structuredClone(state.lastAutoSummary||null),
      localDirty:!!state.localDirty
    };
    const mandatoryGenerationConstraints=snapshotMandatoryGenerationConstraints();
    generationCancelRequested=false;
    const cancelButton=$('#generationCancelBtn');if(cancelButton){cancelButton.disabled=false;cancelButton.textContent='Annulla';}
    closeModal('autoModal');
    setGenerationUi(true,2,'Avvio del motore di turnazione…');
    await yieldUi();

    let added=0,
      r={added:0,missing:0,cross:0,emergency:0},
      restSummary={added:0,weekly:0,holiday:0,derogation:0,unresolved:0};

    try{
      if(!preserve){
        state.assignments={};
        restoreMandatoryGenerationConstraints(mandatoryGenerationConstraints);
      }else{
        removeAutoProposals();
      }
      updateGeneration(8,'Indicizzazione permessi, disponibilità e vincoli…');
      beginAutoCache();
      await yieldUi();
      ensureGenerationNotCancelled();

      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}
      if(resp){updateGeneration(22,'Pianificazione giornate responsabili…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}

      updateGeneration(32,'Copertura prioritaria equipaggi 118…');
      r=await schedule118({
        allowRo,
        onProgress:(done,total)=>
          updateGeneration(32+(done/total)*34,`Copertura prioritaria 118 · giorno ${done}/${total}`)
      });
      added+=r.added;

      if(se){
        updateGeneration(68,'Completamento Secondari dopo la copertura 118…');
        added+=scheduleSecondari();
        await yieldUi();
        ensureGenerationNotCancelled();
      }

      updateGeneration(73,'Riequilibrio delle ore settimanali…');
      const weeklyBalance=rebalanceWeeklyOverloads();
      await yieldUi();

      updateGeneration(78,'Riequilibrio della composizione equipaggi…');
      const genderSwaps=rebalanceCrewGender();
      await yieldUi();

      if(autoRc){
        updateGeneration(82,'Pianificazione riposi compensativi CCNL…');
        restSummary=scheduleAutomaticCompensatoryRests();
        added+=restSummary.added;
        await yieldUi();
      }

      endAutoCache();
      updateGeneration(88,'Salvataggio della proposta…');
      state.localDirty=true;

      const summary={
        at:new Date().toISOString(),
        added,
        missing:r.missing,
        cross:r.cross,
        emergencyCoverage:r.emergency||0,
        genderSwaps,
        weeklyBalance,
        automaticRests:restSummary,
        restSummary,
        autoRc
      };
      state.lastAutoSummary=summary;
      saveState();
      await yieldUi();

      updateGeneration(94,'Verifica riposi, ruoli e coperture…');
      renderAll();
      await yieldUi();
      updateGeneration(100,'Proposta pronta');

      const pendingRfs=pendingRfsEntitlements();
      let mandatoryRfs=inheritedRfsPlacement;

      if(
        pendingRfs.length&&
        !suppressRfsPrompt
      ){
        updateGeneration(
          97,
          'Pianificazione obbligatoria RFS…'
        );

        mandatoryRfs=
          placeMandatoryRfsEntitlements(
            pendingRfs
          );

        summary.mandatoryRfs=mandatoryRfs;
        state.lastAutoSummary=summary;
        state.localDirty=true;
        saveState();
        renderAll();
      }

      finishAutomaticGeneration(
        summary,
        mandatoryRfs
      );

      if(mandatoryRfs?.unresolved){
        switchView('anomaliesView');
      }
    }catch(err){
      if(err?.code==='ATLAS_GENERATION_CANCELLED'||generationCancelRequested){
        state.assignments=generationSnapshot.assignments;
        state.requirements=generationSnapshot.requirements;
        state.lastAutoSummary=generationSnapshot.lastAutoSummary;
        state.localDirty=generationSnapshot.localDirty;
        saveState();
        renderAll();
        toast('Generazione annullata','Il calendario è stato riportato allo stato precedente.','info');
      }else{
        console.error(err);
        toast('Generazione non completata',err.message||'Errore imprevisto','error');
      }
    }finally{
      generationCancelRequested=false;
      const cancelButton=$('#generationCancelBtn');if(cancelButton){cancelButton.disabled=false;cancelButton.textContent='Annulla';}
      endAutoCache();
      setGenerationUi(false);
    }
  }

  function openAutoModal(){if(state.generating)return toast('Generazione già in corso','Attendi il completamento.','info');const req=Object.values(state.requirements).filter(v=>v==='required').length;const protectedCount=existingProtectedForRecap().length;$('#autoInfo').innerHTML=`Sono state verificate <strong>${protectedCount} indisponibilità protette</strong> per ${monthLabel()}. <strong>Ferie, permessi, malattie, 104, AVIS, congedi, RC e riposi manuali già inseriti restano vincoli e non vengono sovrascritti dalla generazione.</strong> <strong>ATLAS</strong> mantiene separati i gruppi <strong>A/B</strong>; le <strong>Libere</strong> partecipano come risorse neutrali secondo le abilitazioni. Alterna i ruoli A/C/S, distribuisce gli uomini tra gli equipaggi che ne sono privi e applica la regola rigida: <strong>la macchina a 2 non può avere due donne</strong>. La generazione ordinaria comprende <strong>Gallarate e Somma</strong>; <strong>Sumirago è inserita solo manualmente al bisogno</strong>. <strong>Priorità organizzativa: coprire tutti i ruoli 118 prima di impegnare risorse sui Secondari.</strong> Laddove la copertura sia già garantita, ATLAS privilegia settimane coerenti sulla stessa sede (Somma oppure Gallarate) per limitare gli spostamenti; questa preferenza viene ignorata appena ostacola la copertura. Il sabato mattina pianifica <strong>Gallarate macchina a 2, Gallarate macchina a 3 e Somma</strong>; il sabato pomeriggio pianifica <strong>Gallarate macchina a 2 e Somma</strong>; di notte usa soltanto equipaggi a 3. Le giornate <strong>GRS, GRA, GRM e GRO</strong> restano responsabilità finché il 118 è coperto; se, dopo i tentativi ordinari, rimane un buco 118, ATLAS può convertirle in servizio 118 nel rispetto di qualifiche, riposi e assenze. Saranno completate ${req} fasce richieste. L’opzione <strong>RC automatici</strong> è facoltativa. Gli RFS sono utilizzabili fino all’ultimo giorno del mese successivo alla festività e vengono collocati soltanto senza creare scoperture: giornata già libera oppure sostituto compatibile trovato prima dello spostamento.`;if($('#autoRc'))$('#autoRc').checked=!!state.settings.autoCompensatoryRestDefault;openModal('autoModal');}

  let selectedAbsenceIds=new Set();
  function setAbsencePane(mode){const create=mode==='create';$('#absenceCreatePane').classList.toggle('hidden',!create);$('#absenceManagePane').classList.toggle('hidden',create);$('#absenceCreateTab').classList.toggle('active',create);$('#absenceManageTab').classList.toggle('active',!create);$('#saveAbsenceBtn').classList.toggle('hidden',!create);if(!create)renderAbsenceBulkList();}
  function openAbsenceModal(){const options=state.employees.slice().sort((a,b)=>employeeName(a).localeCompare(employeeName(b))).map(e=>`<option value="${e.id}">${esc(employeeName(e))} · ${esc(e.turno)}</option>`).join('');$('#absEmployee').innerHTML=options;$('#absManageEmployee').innerHTML='<option value="all">Tutti</option>'+options;$('#absManageCode').innerHTML='<option value="all">Tutte</option>'+Object.entries(ABSENCE_CATALOG).map(([c,m])=>`<option value="${c}">${c} · ${esc(m.label)}</option>`).join('');$('#absFrom').value=`${state.month}-01`;$('#absTo').value=`${state.month}-01`;$('#absManageFrom').value=`${state.month}-01`;$('#absManageTo').value=dateKey(monthDates().at(-1));$('#absEventDate').value='';$('#absReferenceDate').value='';$('#absRecoveryDue').value='';$('#absRecoveredHours').value='0';selectedAbsenceIds.clear();setAbsencePane('create');openModal('absenceModal');toggleAbsenceMode();updateAbsenceRuleHint();}
  function toggleAbsenceMode(){const hourly=$('#absMode').value==='ORE',meta=absenceMeta($('#absCode').value);if(meta.hourlyOnly&&$('#absMode').value!=='ORE')$('#absMode').value='ORE';const finalHourly=$('#absMode').value==='ORE';$('#absStart').disabled=!finalHourly;$('#absEnd').disabled=!finalHourly;$('#absHours').value=finalHourly?'4':'7.6';}
  function updateAbsenceRuleHint(){
    const code=$('#absCode').value,meta=absenceMeta(code),parts=[`${code} · ${meta.label}`,meta.ccnlRef];
    if(meta.hourlyOnly)parts.push('solo a ore');
    if(meta.requiresRecovery)parts.push('recupero obbligatorio');
    if(meta.recoveryDeadlineDays)parts.push(`entro ${meta.recoveryDeadlineDays} giorni`);
    if(meta.autoRecoveryMonths)parts.push(`entro ${meta.autoRecoveryMonths} mesi`);
    if(meta.eventRequired)parts.push('richiede data evento');
    if(meta.referenceRequired)parts.push('richiede data di riferimento');
    if(meta.minHours)parts.push(`minimo ${meta.minHours} ore`);
    $('#absenceRuleHint').innerHTML=`<strong>${esc(parts.filter(Boolean).join(' · '))}</strong><br>Il record è protetto e non viene sovrascritto dal generatore.`;
    $('#absEventDate').disabled=!meta.eventRequired;
    $('#absReferenceDate').disabled=!meta.referenceRequired;
    $('#absRecoveryDue').disabled=!meta.requiresRecovery;
    const due=automaticRecoveryDue($('#absFrom').value,meta);
    $('#absRecoveryDue').readOnly=!!due;
    if(due)$('#absRecoveryDue').value=due;else if(!meta.requiresRecovery)$('#absRecoveryDue').value='';
    if(!meta.eventRequired)$('#absEventDate').value='';
    if(!meta.referenceRequired)$('#absReferenceDate').value='';
    toggleAbsenceMode();
  }
  function interruptVacationForSickness(employeeId,day){const key=assignmentKey(employeeId,day),items=getAssignments(employeeId,day),keep=items.filter(a=>(a.code||a.type)!=='F'),removed=items.length-keep.length;if(removed){if(keep.length)state.assignments[key]=keep;else delete state.assignments[key];}return removed;}
  function declareAbsence(){
    const employeeId=$('#absEmployee').value,from=parseFlexibleDate($('#absFrom').value),to=parseFlexibleDate($('#absTo').value),code=$('#absCode').value,meta=absenceMeta(code),mode=$('#absMode').value,hours=numeric($('#absHours').value),start=$('#absStart').value,end=$('#absEnd').value,note=$('#absNote').value.trim(),status=$('#absStatus').value,eventDate=$('#absEventDate').value,referenceDate=$('#absReferenceDate').value,recoveredHours=numeric($('#absRecoveredHours').value);
    if(!employeeId||!from||!to)return toast('Dati incompleti','Seleziona dipendente e intervallo.','error');
    if(!from.startsWith(state.month)||!to.startsWith(state.month))return toast('Mese non coerente',`Le date devono appartenere a ${monthLabel()}.`,'error');
    if(mode==='ORE'&&(!start||!end||hours<=0))return toast('Dati orari incompleti','Inserisci inizio, fine e ore.','error');
    if(meta.hourlyOnly&&mode!=='ORE')return toast('Causale solo a ore',`${code} non può essere registrato a giornata intera.`,'error');
    if(meta.eventRequired&&!eventDate)return toast('Data evento mancante',`${code} richiede la data dell’evento.`,'error');
    if(meta.referenceRequired&&!referenceDate)return toast('Data di riferimento mancante',`${code} richiede il record o evento da recuperare.`,'error');
    if(meta.minHours&&hours<meta.minHours)return toast('Blocco minimo non rispettato',`${code} richiede almeno ${meta.minHours} ore.`,'error');
    const firstDue=resolvedRecoveryDue(from,meta,$('#absRecoveryDue').value||'');
    if(recoveryDueIsMandatory(meta)&&!firstDue)return toast('Scadenza recupero obbligatoria',`${code} richiede una data entro cui completare il recupero.`,'error');
    const a=parseDateKey(from),b=parseDateKey(to);
    if(b<a)return toast('Intervallo non valido','','error');
    let created=0,interrupted=0,skipped=0;
    for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
      const day=dateKey(d);let h=hours;
      if(mode==='GIORNATA'&&isWeekend(d)&&!['MAL','INF','MATR','LUTTO'].includes(code))h=0;
      if(['MAL','INF'].includes(code))interrupted+=interruptVacationForSickness(employeeId,day);
      const duplicate=getAssignments(employeeId,day).some(x=>isProtectedCalendarRecord(x)&&(x.code||x.type)===code&&!!x.allDay===(mode==='GIORNATA')&&(x.start||'')===(mode==='ORE'?start:'')&&(x.end||'')===(mode==='ORE'?end:''));
      if(duplicate){skipped++;continue;}
      const recoveryDue=resolvedRecoveryDue(day,meta,$('#absRecoveryDue').value||'');
      const item={...manualBase(),category:meta.category,type:code,code,hours:h,allDay:mode==='GIORNATA',start:mode==='ORE'?start:'',end:mode==='ORE'?end:'',nextDay:mode==='ORE'?shiftWindow('CUSTOM',day,start,end).nextDay:false,note,status,locked:true,eventDate,linkedEventDay:referenceDate,recoveryRequired:!!meta.requiresRecovery,recoveryDue,recoveredHours,ccnlRef:meta.ccnlRef};
      appendTo(employeeId,day,item,{dirty:true,render:false});created++;
    }
    state.localDirty=true;saveState();renderAll();renderAbsenceBulkList();
    toast('Dichiarazione registrata e protetta',[`${created} record creati`,skipped?`${skipped} duplicati ignorati`:'',interrupted?`${interrupted} ferie interrotte da malattia/infortunio`:''].filter(Boolean).join(' · '),'success');
  }
  function filteredAbsenceRows(){const employee=$('#absManageEmployee')?.value||'all',code=$('#absManageCode')?.value||'all',status=$('#absManageStatus')?.value||'all',from=$('#absManageFrom')?.value||`${state.month}-01`,to=$('#absManageTo')?.value||`${state.month}-31`,q=($('#absManageSearch')?.value||'').trim().toLowerCase();return absenceRowsForMonth().filter(r=>(employee==='all'||r.employeeId===employee)&&(code==='all'||(r.item.code||r.item.type)===code)&&(status==='all'||(r.item.status||'APPROVATO')===status)&&r.day>=from&&r.day<=to&&(!q||String(r.item.note||'').toLowerCase().includes(q)));}
  function renderAbsenceBulkList(){const host=$('#absenceBulkList');if(!host)return;const rows=filteredAbsenceRows();$('#absManageCount').textContent=`${rows.length} record · ${selectedAbsenceIds.size} selezionati`;$('#absDeleteSelectedBtn').disabled=selectedAbsenceIds.size===0;host.innerHTML=`<div class="absence-bulk-row header"><span></span><span>Dipendente</span><span>Data</span><span>Causale</span><span>Ore</span><span>Note</span></div>`+(rows.length?rows.map(r=>`<label class="absence-bulk-row"><input type="checkbox" data-absence-id="${esc(r.item.id)}" ${selectedAbsenceIds.has(r.item.id)?'checked':''}/><span><strong>${esc(employeeName(r.employee))}</strong><br><span class="muted">${esc(r.item.status||'APPROVATO')}</span></span><span>${esc(formatDateIt(r.day))}</span><span class="absence-bulk-code">${esc(r.item.code||r.item.type)}</span><span>${fmt(r.item.hours||0)} h</span><span class="absence-bulk-note" title="${esc(r.item.note||'')}">${esc(r.item.note||'—')}</span></label>`).join(''):'<div class="empty-state"><div><strong>Nessun record corrispondente</strong>Modifica i filtri.</div></div>');$$('[data-absence-id]').forEach(box=>box.addEventListener('change',()=>{if(box.checked)selectedAbsenceIds.add(box.dataset.absenceId);else selectedAbsenceIds.delete(box.dataset.absenceId);renderAbsenceBulkList();}));}
  function selectVisibleAbsences(){filteredAbsenceRows().forEach(r=>selectedAbsenceIds.add(r.item.id));renderAbsenceBulkList();}
  function clearAbsenceSelection(){selectedAbsenceIds.clear();renderAbsenceBulkList();}
  function requestBulkDeleteAbsences(){const count=selectedAbsenceIds.size;if(!count)return;confirmDialog('Eliminare le assenze selezionate?','Cancellazione massiva',`${count} record protetti saranno rimossi dal calendario del mese e dall’archivio locale.`,bulkDeleteAbsences);}
  function bulkDeleteAbsences(){const ids=new Set(selectedAbsenceIds),store=readProtectedRecords();Object.keys(state.assignments).forEach(key=>{const keep=(state.assignments[key]||[]).filter(a=>!ids.has(a.id));if(keep.length)state.assignments[key]=keep;else delete state.assignments[key];});Object.keys(store).forEach(key=>{const keep=(store[key]||[]).filter(a=>!ids.has(a.id));if(keep.length)store[key]=keep;else delete store[key];});writeProtectedRecords(store);state.dbRecords=state.dbRecords.filter(r=>!ids.has(r.item?.id));selectedAbsenceIds.clear();state.localDirty=true;saveState();renderAll();renderAbsenceBulkList();toast('Cancellazione massiva completata',`${ids.size} record eliminati. Usa Salva calendario per sincronizzare il mese.`,'success');}

  function importEmployeesFromText(text){const objects=csvObjects(text),employees=objects.map(o=>{const cognome=getField(o,'Cognome'),nome=getField(o,'Nome');if(!cognome||!nome)return null;const id=getField(o,'ID Dipendente','ID_Dipendente')||slug(`${cognome}-${nome}`),turno=normalizeTurno(getField(o,'Turno'));return normalizeEmployee({id,cognome,nome,sesso:normalizeSesso(getField(o,'Sesso','Genere')),turno,autista:yes(getField(o,'Autista')),capo:yes(getField(o,'Capo Equipaggio')),soccorritore:yes(getField(o,'Soccorritore')),l104:yes(getField(o,'104')),avis:yes(getField(o,'AVIS')),congedo:yes(getField(o,'Congedo parentale')),responsabile:getField(o,'Responsabile'),sedeSolo:String(getField(o,'Sedi Abilitate')).trim().toUpperCase()==='G'?'G':'',attivo:getField(o,'Attivo')?yes(getField(o,'Attivo')):true,employmentEndDate:parseFlexibleDate(getField(o,'Data Fine Rapporto','Fine Rapporto','Data Termine','Termine Rapporto'))||'',employmentEndType:(()=>{const date=parseFlexibleDate(getField(o,'Data Fine Rapporto','Fine Rapporto','Data Termine','Termine Rapporto'))||'';const indefinite=getField(o,'Fine Indeterminata','Rapporto Indeterminato','Tempo Indeterminato');return indefinite?yes(indefinite)?'INDEFINITE':'DATE':date?'DATE':'INDEFINITE';})(),oreSettimanali:numeric(getField(o,'Ore Settimanali'),0)||null,oreMensili:numeric(getField(o,'Ore Mensili','Ore di lavoro mensili'),0)||null,vacationAnnualHours:numeric(getField(o,'Ferie Annue Ore'),0)||null,suppressedHolidayAnnualHours:numeric(getField(o,'Festività Soppresse Ore','Festivita Soppresse Ore'),0)||null,nightRestriction:getField(o,'Restrizione Notte')||'NONE',nightRestrictionFrom:parseFlexibleDate(getField(o,'Restrizione Notte Dal'))||'',nightRestrictionUntil:parseFlexibleDate(getField(o,'Restrizione Notte Al'))||'',nightRestrictionNote:getField(o,'Nota Limitazione'),onCallNightRestricted:yes(getField(o,'Reperibilità Notturna Vietata','Reperibilita Notturna Vietata')),partTime:yes(getField(o,'Part Time')),supplementaryConsent:yes(getField(o,'Consenso Supplementare')),elasticClause:yes(getField(o,'Clausola Elastica')),partTimeDays:getField(o,'Giorni Part Time'),partTimeShifts:getField(o,'Fasce Part Time')});}).filter(Boolean);if(!employees.length)throw new Error('Nessun dipendente riconosciuto nella Matrice.');state.employees=employees;state.matrixLoaded=true;return employees.length;}
  function mapDatabaseObject(o){
    const day=parseFlexibleDate(getField(o,'Data Turno','Data_Turno','Data')),employeeId=getField(o,'ID Dipendente','ID_Dipendente'),cognome=getField(o,'Cognome'),nome=getField(o,'Nome'),tipo=getField(o,'Tipo Record','Tipo_Record').toUpperCase(),causale=getField(o,'Causale','Codice'),sigla=getField(o,'Sigla'),fascia=getField(o,'Fascia'),sede=getField(o,'Sede'),mezzo=getField(o,'Mezzo','Macchina'),ruolo=getField(o,'Ruolo'),startRaw=getField(o,'DataOra Inizio','DataOra_Inizio','Inizio'),endRaw=getField(o,'DataOra Fine','DataOra_Fine','Fine'),ore=numeric(getField(o,'Ore Conteggiate','Ore_Conteggiate','Ore Dichiarate','Ore_Dichiarate'),0),status=getField(o,'Stato')||'CONFERMATO',origin=getField(o,'Origine')||'DATABASE',locked=yes(getField(o,'Bloccato')),note=getField(o,'Note');
    if(!day)return null;let empId=employeeId;if(!empId&&cognome&&nome)empId=slug(`${cognome}-${nome}`);const code=causale||sigla; if(tipo==='FABBISOGNO'||(!empId&&['M','P','N'].includes(fascia||code)))return{requirement:true,day,shift:(fascia||code).toUpperCase()};
    if(!empId)return null;let category='CUSTOM',item={id:getField(o,'ID Record','ID_Record')||uid(),origin:origin.toUpperCase().startsWith('AUTO')?'AUTOMATICA':'DATABASE',locked,status,coverage:getField(o,'Copertura'),note,createdAt:getField(o,'Data Richiesta','Data_Richiesta')||new Date().toISOString()};
    if(tipo.includes('118'))category='118';else if(tipo.includes('SECOND'))category='SE';else if(tipo.includes('RESP'))category='RESP';else if(tipo.includes('AMMIN'))category='AM';else if(tipo.includes('FORMA'))category='FORM';else if(tipo.includes('ASSEN'))category='ABS';else if(tipo.includes('RIPOS'))category='RC';else if(tipo.includes('CODIFICATO')||operationalShiftMeta(code))category='OP';else if(['M','P','N','PN'].includes((fascia||code).toUpperCase())&&ruolo)category='118';else if(code==='MGSE')category='SE';else if(['GRA','GRM','GRS','GRO','RO'].includes(code))category='RESP';else if(String(code).startsWith('AM'))category='AM';else if(code==='FORM')category='FORM';else if(['F','F4','FS','PR36','VIS','STUDIO','ESAME','LUTTO','MATR','GRAVI','PCIV','SIND','RIPALL','MALFIG','MAL','INF','L104/92','AVIS','CONG','PERM'].includes(code))category='ABS';else if(code==='SM')category='REST';else if(['RC','A','RFS','RCF','RCD','RCB','RCP'].includes(code))category='RC';
    if(code==='SM')category='REST';
    item.category=category;item.type=code;item.code=sigla||code;if(category==='118'){const rawCode=String(sigla||code||'').toUpperCase();item.shift=(fascia||(rawCode.startsWith('PN')?'PN':rawCode.slice(0,1))).toUpperCase();item.site=(sede||siteFromCode(rawCode)||'G').toUpperCase();item.machine=item.site!=='G'?'3':String(mezzo||rawCode.match(/G([23])/)?.[1]||'3');item.role=(ruolo||roleFromCode(rawCode,item.site)).toUpperCase();}if(category==='OP'){const meta=operationalShiftMeta(sigla||code);if(meta){item.type=String(sigla||code).toUpperCase();item.code=item.type;item.shift=meta.shift;item.site=(sede||meta.site||'').toUpperCase();item.role=(ruolo||meta.role||'').toUpperCase();item.start=meta.start;item.end=meta.end;item.nextDay=!!meta.nextDay;item.hours=ore||meta.hours;}}
    const st=parseTimeFromDate(startRaw)||(/^[0-2]?\d:\d{2}$/.test(startRaw)?startRaw.padStart(5,'0'):''),en=parseTimeFromDate(endRaw)||(/^[0-2]?\d:\d{2}$/.test(endRaw)?endRaw.padStart(5,'0'):'');if(st&&en){item.start=st;item.end=en;item.nextDay=shiftWindow('CUSTOM',day,st,en).nextDay;}item.hours=ore||undefined;item.allDay=['ABS','RC','REST'].includes(category)&&!st;item.workRegime=getField(o,'Regime Ore','Regime_Ore')||'ORDINARY';item.ccnlRef=getField(o,'Riferimento CCNL','Riferimento_CCNL');item.derogationCode=getField(o,'Deroga Codice','Deroga_Codice');item.derogationAuthorizedBy=getField(o,'Autorizzato Da','Autorizzato_Da');item.recoveryRequired=yes(getField(o,'Recupero Richiesto','Recupero_Richiesto'));item.recoveryDue=parseFlexibleDate(getField(o,'Scadenza Recupero','Scadenza_Recupero'))||'';item.recoveredHours=numeric(getField(o,'Ore Recuperate','Ore_Recuperate'),0);item.eventDate=parseFlexibleDate(getField(o,'Data Evento','Data_Evento'))||'';item.linkedEventDay=parseFlexibleDate(getField(o,'Data Riferimento','Data_Riferimento'))||'';item.linkedRecordId=getField(o,'Record Collegato','Record_Collegato');item.splitAllowed=yes(getField(o,'Frazionamento Autorizzato','Frazionamento_Autorizzato'));item.splitReason=getField(o,'Motivo Frazionamento','Motivo_Frazionamento');return{employeeId:empId,day,item:normalizeAssignmentItem(item)};
  }
  function applyDbRecordsToMonth({replace=true}={}){
    if(replace){
      state.assignments={};
      state.requirements={};
      initRequirements();
    }

    state.dbRecords.forEach(r=>{
      if(r.requirement){
        if(r.day.startsWith(state.month)){
          state.requirements[`${r.day}|${r.shift}`]='required';
        }
        return;
      }

      if(!r.day.startsWith(state.month))return;

      let emp=state.employees.find(
        e=>e.id===r.employeeId
      );

      if(!emp){
        const simple=slug(r.employeeId);
        emp=state.employees.find(
          e=>slug(e.id)===simple
        );
      }

      if(
        emp&&
        employeeActiveOn(emp,r.day)
      ){
        appendTo(
          emp.id,
          r.day,
          normalizeAssignmentItem(r.item),
          {dirty:false,render:false}
        );
      }
    });

    restoreProtectedRecordsForCurrentMonth();
    ensureAllPostNightRests();
    if(replace)state.localDirty=false;
  }
  function importDatabaseFromText(text,{replace=true}={}){const objects=csvObjects(text),records=objects.map(mapDatabaseObject).filter(Boolean);state.dbRecords=records;state.dbLoaded=true;applyDbRecordsToMonth({replace});return records.length;}
  async function reloadSheets({replaceDb=true,silent=false,throwOnError=false}={}){
    updateSyncStatus('Caricamento protetto dal server…','sync');
    let matrixCount=0,dbCount=0;

    try{
      const auth=getServerAuthContext();
      const url=String(
        state.settings.appsScriptUrl||auth.serverUrl||''
      ).trim();

      if(!url||!auth.token){
        throw new Error(
          'Sessione server assente. Effettua nuovamente l’accesso.'
        );
      }

      const {
        matrixText,
        databaseText,
        securityMode,
        sharedSettings
      }=await loadProtectedSheets({
        url,
        token:auth.token
      });

      matrixCount=importEmployeesFromText(matrixText);
      dbCount=importDatabaseFromText(databaseText,{replace:replaceDb});
      restoreProtectedRecordsForCurrentMonth();

      if(
        sharedSettings?.configured
      ){
        applySharedSettings(
          sharedSettings,
          {
            persist:false,
            render:false
          }
        );
      }else if(
        auth.user?.profileType==='ADMIN'
      ){
        // Migrazione trasparente:
        // se il server non ha ancora una configurazione condivisa,
        // il primo Admin trasferisce le impostazioni locali correnti.
        try{
          const seeded=
            await saveSharedSettings({
              url,
              token:auth.token,
              settings:
                sharedSettingsPayload(
                  state.settings
                )
            });

          applySharedSettings(
            seeded.sharedSettings,
            {
              persist:false,
              render:false
            }
          );
        }catch(error){
          console.warn(
            'Inizializzazione impostazioni condivise non riuscita:',
            error
          );
        }
      }

      state.settings.matrixCsvUrl='';
      state.settings.databaseCsvUrl='';
      state.settings.appsScriptUrl=url;
      rememberServerUrl(url);

      saveState();
      renderAll();

      updateSyncStatus(
        `Matrice ${matrixCount} · Database ${dbCount} · ${securityMode||'AUTH'}`,
        'local'
      );

      if(!silent){
        toast(
          'Dati protetti caricati',
          `${matrixCount} dipendenti · ${dbCount} record database.`,
          'success'
        );
      }
    }catch(e){
      console.error(e);
      updateSyncStatus('Lettura protetta non riuscita','error');

      if(!silent){
        toast(
          'Caricamento protetto non riuscito',
          e.message,
          'error'
        );
      }

      if(throwOnError)throw e;
      return false;
    }

    return true;
  }

  function nextEmployeeId(){const nums=state.employees.map(e=>String(e.id).match(/^D(\d+)$/i)?.[1]).filter(Boolean).map(Number);return `D${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}`;}
  function renderStaff(){
    const host=$('#staffTable');if(!host)return;
    const q=($('#staffSearch')?.value||'').trim().toLowerCase(),
      group=$('#staffGroupFilter')?.value||'all',
      year=Number(state.month.slice(0,4));
    const list=state.employees.filter(e=>
      (!q||employeeName(e).toLowerCase().includes(q))&&
      (group==='all'||e.turno===group)
    );

    let html='<thead><tr><th>Dipendente</th><th>Sesso</th><th>Gruppo</th><th>Ruoli</th><th>Responsabile</th><th>Sedi</th><th>Ore</th><th>Termine rapporto</th><th>RFS</th><th>Vincoli</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>';

    list.forEach(e=>{
      const roles=[e.autista?'A':'',e.capo?'C':'',e.soccorritore?'S':''].filter(Boolean).join(' · ')||'—',
        limits=[
          e.nightRestriction!=='NONE'?(e.nightRestriction==='NO_NIGHT'?'No notte':'Notte su consenso'):'',
          e.partTime?'Part-time':'',
          e.onCallNightRestricted?'No reperibilità N':''
        ].filter(Boolean).join(' · ')||'—',
        rfs=rfsCounter(e.id,year);

      html+=`<tr class="${e.attivo===false?'staff-inactive':''}">
        <td><strong>${esc(employeeName(e))}</strong></td>
        <td>${esc(e.sesso||'n.d.')}</td>
        <td>${esc(e.turno)}</td>
        <td>${esc(roles)}</td>
        <td>${esc(e.responsabile||'—')}</td>
        <td>${esc(e.sedeSolo==='G'?'Solo G':'G + S + SU')}</td>
        <td>${fmt(targetHoursFor(e))}</td>
        <td>${(()=>{const term=employeeEmploymentLabel(e);return`<span class="employment-term ${term.className}">${esc(term.label)}</span>`;})()}</td>
        <td><span class="rfs-badge">${rfs.remaining}</span><div class="muted" style="font-size:8px;margin-top:3px">${rfs.used}/${rfs.earned} fruiti</div></td>
        <td>${esc(limits)}</td>
        <td><span class="chip">${e.attivo===false?'Non attivo':employeeActiveOn(e,dateKey(new Date()))?'Attivo':'Rapporto terminato'}</span></td>
        <td><div class="staff-actions"><button class="btn small" data-edit-staff="${esc(e.id)}">Modifica</button><button class="btn small danger" data-delete-staff="${esc(e.id)}">Rimuovi</button></div></td>
      </tr>`;
    });

    html+='</tbody>';
    host.innerHTML=html;
    $$('[data-edit-staff]').forEach(b=>b.addEventListener('click',()=>openStaffModal(b.dataset.editStaff)));
    $$('[data-delete-staff]').forEach(b=>b.addEventListener('click',()=>requestDeleteEmployee(b.dataset.deleteStaff)));
    $('#staffCount').textContent=`${state.employees.length} anagrafiche · ${state.employees.filter(e=>employeeActiveOn(e,dateKey(new Date()))).length} attive oggi`;
  }
  function toggleEmploymentEndFields(){
    const type=$('#staffEmploymentEndType')?.value||'INDEFINITE';
    const dateInput=$('#staffEmploymentEndDate');
    const preview=$('#staffEmploymentEndPreview');
    if(!dateInput||!preview)return;

    const dated=type==='DATE';
    dateInput.disabled=!dated;
    if(!dated)dateInput.value='';

    preview.classList.remove('is-dated','is-ended');
    if(!dated){
      preview.textContent='Rapporto senza scadenza';
      return;
    }

    if(!dateInput.value){
      preview.textContent='Seleziona la data di termine';
      preview.classList.add('is-dated');
      return;
    }

    const ended=dateInput.value<dateKey(new Date());
    preview.textContent=ended
      ?`Rapporto terminato il ${formatDateIt(dateInput.value)}`
      :`Rapporto attivo fino al ${formatDateIt(dateInput.value)} compreso`;
    preview.classList.add(ended?'is-ended':'is-dated');
  }

  function openStaffModal(id=null){state.staffEditingId=id;const e=id?state.employees.find(x=>x.id===id):null;$('#staffModalTitle').textContent=e?'Modifica anagrafica':'Nuovo dipendente';$('#staffId').value=e?.id||nextEmployeeId();$('#staffId').disabled=!!e;$('#staffSurname').value=e?.cognome||'';$('#staffName').value=e?.nome||'';$('#staffSex').value=e?.sesso||'';$('#staffTurn').value=e?.turno||'A';$('#staffDriver').checked=!!e?.autista;$('#staffLeader').checked=!!e?.capo;$('#staffRescuer').checked=!!e?.soccorritore;$('#staff104').checked=!!e?.l104;$('#staffAvis').checked=!!e?.avis;$('#staffParental').checked=!!e?.congedo;$('#staffResponsible').value=e?.responsabile||'';$('#staffSites').value=e?.sedeSolo==='G'?'G':'G,S,SU';$('#staffWeeklyHours').value=e?.oreSettimanali||'';$('#staffMonthlyHours').value=e?.oreMensili||'';$('#staffVacationHours').value=e?.vacationAnnualHours||'';$('#staffSuppressedHours').value=e?.suppressedHolidayAnnualHours||'';$('#staffNightRestriction').value=e?.nightRestriction||'NONE';$('#staffNightFrom').value=e?.nightRestrictionFrom||'';$('#staffNightUntil').value=e?.nightRestrictionUntil||'';$('#staffNightNote').value=e?.nightRestrictionNote||'';$('#staffOnCallNightRestricted').checked=!!e?.onCallNightRestricted;$('#staffPartTime').checked=!!e?.partTime;$('#staffSupplementaryConsent').checked=!!e?.supplementaryConsent;$('#staffElasticClause').checked=!!e?.elasticClause;$('#staffPartTimeDays').value=e?.partTimeDays||'';$('#staffPartTimeShifts').value=e?.partTimeShifts||'';$('#staffEmploymentEndType').value=e?.employmentEndType||'INDEFINITE';$('#staffEmploymentEndDate').value=e?.employmentEndDate||'';$('#staffActive').checked=e?.attivo!==false;toggleEmploymentEndFields();openModal('staffModal');}
  function removeFutureEmployeeAssignments(employeeId,endDate){
    if(!employeeId||!endDate)return 0;
    let removed=0;

    const prune=store=>{
      Object.keys(store||{}).forEach(key=>{
        const split=key.lastIndexOf('|');
        const id=key.slice(0,split);
        const day=key.slice(split+1);

        if(id===employeeId&&day>endDate){
          removed+=(store[key]||[]).length;
          delete store[key];
        }
      });
    };

    prune(state.assignments);
    Object.values(state.monthPlans||{}).forEach(
      plan=>prune(plan?.assignments)
    );

    state.dbRecords=(state.dbRecords||[]).filter(record=>
      record.requirement||
      record.employeeId!==employeeId||
      record.day<=endDate
    );

    return removed;
  }

  async function persistStaffMatrix(rec,calendarWasDirty){
    const auth=getServerAuthContext();
    const url=String(
      state.settings.appsScriptUrl||
      auth.serverUrl||
      ATLAS_SERVER_URL
    ).trim();

    if(!url||!auth.token){
      toast(
        'Anagrafica salvata solo localmente',
        'Accedi nuovamente per memorizzare il termine nella Matrice Google.',
        'error'
      );
      return;
    }

    updateSyncStatus(
      'Salvataggio automatico Matrice…',
      'sync'
    );

    try{
      const data=await saveEmployeesToSheet({
        url,
        token:auth.token,
        employees:state.employees.map(
          employeeSheetObject
        )
      });

      state.localDirty=calendarWasDirty;
      saveState();
      updateSyncStatus(
        'Matrice sincronizzata',
        'local'
      );

      toast(
        'Termine rapporto memorizzato',
        rec.employmentEndType==='DATE'
          ?`${employeeName(rec)} è attivo fino al ${formatDateIt(rec.employmentEndDate)} compreso.`
          :`${employeeName(rec)} è impostato senza scadenza.`,
        'success'
      );

      return data;
    }catch(error){
      state.localDirty=true;
      saveState();
      updateSyncStatus(
        'Errore salvataggio Matrice',
        'error'
      );
      toast(
        'Anagrafica salvata localmente, Matrice non aggiornata',
        error.message,
        'error'
      );
    }
  }

  function saveStaffRecord(){
    const oldId=state.staffEditingId,
      id=oldId||nextEmployeeId(),
      cognome=$('#staffSurname').value.trim(),
      nome=$('#staffName').value.trim(),
      employmentEndType=$('#staffEmploymentEndType').value,
      employmentEndDate=$('#staffEmploymentEndDate').value;

    if(!cognome||!nome){
      return toast(
        'Dati incompleti',
        'Cognome e nome sono obbligatori.',
        'error'
      );
    }

    if(
      employmentEndType==='DATE'&&
      !employmentEndDate
    ){
      return toast(
        'Data termine mancante',
        'Seleziona la data di termine oppure scegli Fine indeterminata.',
        'error'
      );
    }

    const rec=normalizeEmployee({
      id,
      cognome,
      nome,
      sesso:$('#staffSex').value,
      turno:$('#staffTurn').value,
      autista:$('#staffDriver').checked,
      capo:$('#staffLeader').checked,
      soccorritore:$('#staffRescuer').checked,
      l104:$('#staff104').checked,
      avis:$('#staffAvis').checked,
      congedo:$('#staffParental').checked,
      responsabile:$('#staffResponsible').value,
      sedeSolo:$('#staffSites').value==='G'?'G':'',
      oreSettimanali:numeric($('#staffWeeklyHours').value,0)||null,
      oreMensili:numeric($('#staffMonthlyHours').value,0)||null,
      vacationAnnualHours:numeric($('#staffVacationHours').value,0)||null,
      suppressedHolidayAnnualHours:numeric($('#staffSuppressedHours').value,0)||null,
      nightRestriction:$('#staffNightRestriction').value,
      nightRestrictionFrom:$('#staffNightFrom').value,
      nightRestrictionUntil:$('#staffNightUntil').value,
      nightRestrictionNote:$('#staffNightNote').value.trim(),
      onCallNightRestricted:$('#staffOnCallNightRestricted').checked,
      partTime:$('#staffPartTime').checked,
      supplementaryConsent:$('#staffSupplementaryConsent').checked,
      elasticClause:$('#staffElasticClause').checked,
      partTimeDays:$('#staffPartTimeDays').value.trim(),
      partTimeShifts:$('#staffPartTimeShifts').value.trim(),
      employmentEndType,
      employmentEndDate:
        employmentEndType==='DATE'
          ?employmentEndDate
          :'',
      attivo:$('#staffActive').checked
    });

    const calendarWasDirty=state.localDirty;

    if(oldId){
      const index=state.employees.findIndex(
        employee=>employee.id===oldId
      );

      if(index<0){
        return toast(
          'Anagrafica non trovata',
          'Ricarica la Matrice e riprova.',
          'error'
        );
      }

      state.employees[index]=rec;
    }else{
      state.employees.push(rec);
    }

    const removed=
      rec.employmentEndType==='DATE'
        ?removeFutureEmployeeAssignments(
            rec.id,
            rec.employmentEndDate
          )
        :0;

    state.employees.sort((a,b)=>
      a.turno.localeCompare(b.turno)||
      a.cognome.localeCompare(b.cognome)
    );

    state.localDirty=
      calendarWasDirty||
      removed>0;

    saveState();
    renderAll();
    closeModal('staffModal');

    toast(
      oldId
        ?'Anagrafica aggiornata'
        :'Dipendente aggiunto',
      removed
        ?`${employeeName(rec)} · rimossi ${removed} record successivi al termine.`
        :employeeName(rec),
      'success'
    );

    void persistStaffMatrix(
      rec,
      state.localDirty
    );
  }
  function requestDeleteEmployee(id){const e=state.employees.find(x=>x.id===id);if(!e)return;const records=Object.keys(state.assignments).filter(k=>k.startsWith(id+'|')).length;confirmDialog('Rimuovere anagrafica?','Eliminazione definitiva',`${employeeName(e)} verrà rimosso. Saranno eliminati anche ${records} giorni con assegnazioni locali.`,()=>deleteEmployee(id));}
  function deleteEmployee(id){state.employees=state.employees.filter(e=>e.id!==id);Object.keys(state.assignments).filter(k=>k.startsWith(id+'|')).forEach(k=>delete state.assignments[k]);Object.values(state.monthPlans||{}).forEach(plan=>{Object.keys(plan.assignments||{}).filter(k=>k.startsWith(id+'|')).forEach(k=>delete plan.assignments[k]);});state.localDirty=true;saveState();renderAll();toast('Anagrafica rimossa');}
  function employeeSheetObject(e){return{ID_Dipendente:e.id,Cognome:e.cognome,Nome:e.nome,Sesso:e.sesso||'',Turno:e.turno,Autista:e.autista?'SI':'NO',Capo_Equipaggio:e.capo?'SI':'NO',Soccorritore:e.soccorritore?'SI':'NO','104':e.l104?'SI':'NO',AVIS:e.avis?'SI':'NO',Congedo_parentale:e.congedo?'SI':'NO',Responsabile:e.responsabile||'',Attivo:e.attivo===false?'NO':'SI',Sedi_Abilitate:e.sedeSolo==='G'?'G':'G,S,SU',Ore_Settimanali:e.oreSettimanali||'',Ore_Mensili:e.oreMensili||'',Ferie_Annue_Ore:e.vacationAnnualHours||'',Festivita_Soppresse_Ore:e.suppressedHolidayAnnualHours||'',Restrizione_Notte:e.nightRestriction||'NONE',Restrizione_Notte_Dal:e.nightRestrictionFrom||'',Restrizione_Notte_Al:e.nightRestrictionUntil||'',Nota_Limitazione:e.nightRestrictionNote||'',Reperibilita_Notturna_Vietata:e.onCallNightRestricted?'SI':'NO',Part_Time:e.partTime?'SI':'NO',Consenso_Supplementare:e.supplementaryConsent?'SI':'NO',Clausola_Elastica:e.elasticClause?'SI':'NO',Giorni_Part_Time:e.partTimeDays||'',Fasce_Part_Time:e.partTimeShifts||'',Data_Fine_Rapporto:e.employmentEndType==='DATE'?e.employmentEndDate:'',Fine_Indeterminata:e.employmentEndType==='DATE'?'NO':'SI'};}
  function exportEmployeesCsv(){const headers=['ID_Dipendente','Cognome','Nome','Sesso','Turno','Autista','Capo Equipaggio','Soccorritore','104','AVIS','Congedo parentale','Responsabile','Attivo','Sedi Abilitate','Ore Settimanali','Ore Mensili','Ferie Annue Ore','Festività Soppresse Ore','Restrizione Notte','Restrizione Notte Dal','Restrizione Notte Al','Nota Limitazione','Reperibilità Notturna Vietata','Part Time','Consenso Supplementare','Clausola Elastica','Giorni Part Time','Fasce Part Time','Data Fine Rapporto','Fine Indeterminata'];const rows=[headers];state.employees.forEach(e=>{const o=employeeSheetObject(e);rows.push(Object.values(o));});download('Matrice_Dipendenti.csv','\uFEFF'+rows.map(r=>r.map(csvEscape).join(';')).join('\n'),'text/csv;charset=utf-8');}
  async function syncEmployeesGoogle(){
    const auth=getServerAuthContext();
    const url=String(
      state.settings.appsScriptUrl||auth.serverUrl||''
    ).trim();

    if(!url||!auth.token){
      return toast(
        'Sessione server assente',
        'Effettua nuovamente l’accesso prima di salvare le anagrafiche.',
        'error'
      );
    }

    updateSyncStatus('Salvataggio anagrafiche autenticato…','sync');

    try{
      const data=await saveEmployeesToSheet({
        url,
        token:auth.token,
        employees:state.employees.map(employeeSheetObject)
      });

      state.localDirty=false;
      saveState();
      updateSyncStatus('Anagrafiche sincronizzate','local');

      toast(
        'Matrice aggiornata',
        `${data.employees||state.employees.length} anagrafiche salvate.`,
        'success'
      );
    }catch(e){
      updateSyncStatus('Errore sincronizzazione','error');
      toast(
        'Salvataggio anagrafiche fallito',
        e.message,
        'error'
      );
    }
  }

  function download(name,content,mime='text/plain;charset=utf-8'){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function csvEscape(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function toIsoDateTime(day,time,nextDay=false){if(!time)return'';const d=getDateTime(day,time,nextDay);return `${dateKey(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function exportDatabaseCsv(){const headers=['ID_Record','ID_Dipendente','Data_Turno','Tipo_Record','Causale','Sigla','Fascia','Sede','Mezzo','Ruolo','Servizio_ID','DataOra_Inizio','DataOra_Fine','Ore_Dichiarate','Ore_Conteggiate','Stato','Copertura','Origine','Bloccato','Forzatura','Motivo_Forzatura','Note','Richiesto_Da','Data_Richiesta','Approvato_Da','Data_Approvazione','Modificato_Da','Ultima_Modifica','Regime_Ore','Riferimento_CCNL','Deroga_Codice','Autorizzato_Da','Recupero_Richiesto','Scadenza_Recupero','Ore_Recuperate','Data_Evento','Data_Riferimento','Record_Collegato','Frazionamento_Autorizzato','Motivo_Frazionamento'];const rows=[headers];allAssignmentRows().forEach(r=>{const a=r.a,tipo=a.category==='118'?'TURNO_118':a.category==='OP'?'TURNO_CODIFICATO':a.category==='SE'?'SECONDARI':a.category==='RESP'?'RESPONSABILE':a.category==='AM'?'AMMINISTRAZIONE':a.category==='FORM'?'FORMAZIONE':a.category==='ABS'?'ASSENZA':['RC','REST'].includes(a.category)?'RIPOSO':'ALTRO';rows.push([a.id,r.employeeId,r.day,tipo,a.type||a.code||'',normalizeCode(a),a.shift||'',a.site||'',a.machine||'',a.role||'',a.serviceId||'',r.timed?toIsoDateTime(r.day,r.startText,false):'',r.timed?toIsoDateTime(r.day,r.endText,r.end<r.start):'',r.hours,r.hours,a.status||'CONFERMATO',a.coverage||'ORDINARIA',sourceLabel(a)==='AUTO'?'AUTOMATICA':sourceLabel(a)==='DB'?'IMPORTATA':'MANUALE',a.locked?'SI':'NO',a.forced?'SI':'NO',a.forceReason||'',a.note||'',a.requestedBy||'',a.requestedAt||'',a.approvedBy||'',a.approvedAt||'',a.modifiedBy||'',a.updatedAt||'',a.workRegime||'ORDINARY',a.ccnlRef||'',a.derogationCode||'',a.derogationAuthorizedBy||'',a.recoveryRequired?'SI':'NO',a.recoveryDue||'',a.recoveredHours||0,a.eventDate||'',a.linkedEventDay||'',a.linkedRecordId||'',a.splitAllowed?'SI':'NO',a.splitReason||'']);});download(`Database_Turni_${state.month}.csv`,'\uFEFF'+rows.map(r=>r.map(csvEscape).join(';')).join('\n'),'text/csv;charset=utf-8');}
  function exportSummaryCsv(){const year=Number(state.month.slice(0,4)),rows=[['Dipendente','Gruppo','Target','Ore','Saldo','RFS Maturati','RFS Fruiti','RFS Residui','Mattini','Pomeriggi','Notti/P+N','Ruolo A','Ruolo C','Ruolo S','Weekend','Secondari','GRA','GRM','GRO','FORM','Assenze','AM']];state.employees.filter(e=>employeeVisibleInMonth(e)).forEach(e=>{const s=employeeStats(e),target=targetHoursFor(e),rfs=rfsCounter(e.id,year);rows.push([employeeName(e),e.turno,target,s.hours,s.hours-target,rfs.earned,rfs.used,rfs.remaining,s.M,s.P,s.N,s.roleA,s.roleC,s.roleS,s.weekends,s.se,s.gra,s.grm,s.gro,s.form,s.abs,s.am]);});download(`Riepilogo_${state.month}.csv`,'\uFEFF'+rows.map(r=>r.map(csvEscape).join(';')).join('\n'),'text/csv;charset=utf-8');}
  function downloadBackup(){download(`Backup_turnazione_${state.month}.json`,JSON.stringify({version:APP_VERSION,exportedAt:new Date().toISOString(),month:state.month,employees:state.employees,assignments:state.assignments,requirements:state.requirements,monthPlans:state.monthPlans,settings:state.settings},null,2),'application/json');}
  function importBackupFile(file){const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(!d.assignments)throw new Error('Formato non valido');state.month=d.month||state.month;state.employees=d.employees||state.employees;state.monthPlans=d.monthPlans||{};state.assignments=d.assignments||state.monthPlans?.[state.month]?.assignments||{};state.requirements=d.requirements||state.monthPlans?.[state.month]?.requirements||{};state.settings={...DEFAULT_SETTINGS,...(d.settings||{}),holidayRecoveryDays:30};state.localDirty=true;updateMonthControls();saveState();renderAll();toast('Backup importato');}catch(e){toast('Importazione fallita',e.message,'error');}};reader.readAsText(file);}
  let calendarSaveController=null;
  let calendarSaveCancelled=false;
  function ensureCalendarSaveOverlay(){
    let overlay=$('#calendarSaveOverlay');if(overlay)return overlay;
    const style=document.createElement('style');style.id='calendarSaveOverlayStyle';style.textContent=`
      .calendar-save-overlay{position:fixed;inset:0;z-index:12050;display:none;place-items:center;padding:24px;background:rgba(2,10,16,.76);backdrop-filter:blur(10px)}.calendar-save-overlay.open{display:grid}
      .calendar-save-card{width:min(500px,calc(100vw - 38px));padding:22px;border:1px solid rgba(125,211,252,.18);border-radius:18px;background:linear-gradient(150deg,#0a2737,#061b27);box-shadow:0 28px 90px rgba(0,0,0,.5)}
      .calendar-save-kicker{color:#7dd3fc;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.calendar-save-title{margin-top:5px;color:#f4fbff;font-size:20px;font-weight:900}.calendar-save-text{margin-top:7px;color:#8da7b4;font-size:11px;line-height:1.55}
      .calendar-save-progress{height:6px;margin-top:17px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07)}.calendar-save-progress i{display:block;width:38%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#38bdf8,#22d3ee);animation:atlasSaveMove 1.15s ease-in-out infinite alternate}.calendar-save-actions{display:flex;justify-content:flex-end;margin-top:15px}.calendar-save-cancel{min-height:38px;padding:8px 14px;border:1px solid rgba(145,188,214,.2);border-radius:10px;background:rgba(255,255,255,.04);color:#eef8fb;font-weight:850;cursor:pointer}@keyframes atlasSaveMove{from{transform:translateX(-35%)}to{transform:translateX(165%)}}`;
    document.head.appendChild(style);
    overlay=document.createElement('div');overlay.id='calendarSaveOverlay';overlay.className='calendar-save-overlay';overlay.innerHTML=`<section class="calendar-save-card" role="status" aria-live="polite" aria-busy="true"><div class="calendar-save-kicker">ATLAS 118 · Calendario</div><div class="calendar-save-title">Salvataggio calendario…</div><div class="calendar-save-text">Invio il mese al server e attendo la conferma.</div><div class="calendar-save-progress"><i></i></div><div class="calendar-save-actions"><button class="calendar-save-cancel" id="calendarSaveCancelBtn" type="button">Annulla</button></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#calendarSaveCancelBtn')?.addEventListener('click',()=>{calendarSaveCancelled=true;calendarSaveController?.abort();overlay.classList.remove('open');setCalendarSaveUi(false);updateSyncStatus('Salvataggio annullato · modifiche ancora da salvare','local');});
    return overlay;
  }
  function showCalendarSaveOverlay(){ensureCalendarSaveOverlay().classList.add('open');}
  function hideCalendarSaveOverlay(){$('#calendarSaveOverlay')?.classList.remove('open');}

  function setCalendarSaveUi(active){
    const button=$('#syncBtn'),text=$('#syncBtnText');
    if(button){button.disabled=active;button.classList.toggle('saving',active);}
    if(text)text.textContent=active?'Salvataggio…':'Salva calendario';
  }

  function requestCalendarSave(){
    const auth=getServerAuthContext();
    const url=String(
      state.settings.appsScriptUrl||auth.serverUrl||''
    ).trim();

    if(!url||!auth.token){
      return toast(
        'Sessione server assente',
        'Effettua nuovamente l’accesso prima di salvare il calendario.',
        'error'
      );
    }

    const count=allAssignmentRows().length;

    confirmDialog(
      'Salvare il calendario su Google Sheet?',
      `${monthLabel()} · foglio Database`,
      `Saranno scritti ${count} record tramite sessione autenticata. I record già presenti per ${state.month} verranno sostituiti; gli altri mesi resteranno invariati.`,
      syncCalendarGoogle
    );
  }

  async function syncCalendarGoogle(){
    const auth=getServerAuthContext();
    const url=String(
      state.settings.appsScriptUrl||auth.serverUrl||''
    ).trim();

    if(!url||!auth.token){
      return toast(
        'Sessione server assente',
        'Effettua nuovamente l’accesso prima di salvare il calendario.',
        'error'
      );
    }

    if(!isValidAppsScriptUrl(url)){
      return toast(
        'URL Apps Script non valido',
        'Usa l’indirizzo della Web App che termina con /exec.',
        'error'
      );
    }

    calendarSaveCancelled=false;
    calendarSaveController=new AbortController();
    setCalendarSaveUi(true);
    showCalendarSaveOverlay();
    updateSyncStatus(
      `Salvataggio autenticato ${monthLabel()}…`,
      'sync'
    );

    try{
      const generationAt=
        String(state.lastAutoSummary?.at||'');

      const payload={
        month:state.month,
        rows:allAssignmentRows().map(r=>({
          employeeId:r.employeeId,
          day:r.day,
          assignment:r.a
        })),
        requirements:state.requirements,
        updatedAt:new Date().toISOString(),
        clientVersion:APP_VERSION,
        generationConfirmed:!!generationAt,
        generationAt
      };

      const data=await saveCalendarPlanToSheet({
        url,
        token:auth.token,
        ...payload
      });

      state.localDirty=false;
      saveState();

      const savedAt=data.savedAt||new Date().toISOString();
      const localTime=new Date(savedAt).toLocaleString('it-IT',{
        dateStyle:'short',
        timeStyle:'medium'
      });

      updateSyncStatus(
        `Calendario salvato · ${localTime}`,
        'local'
      );

      $('#saveResultText').innerHTML=
        `<strong>${esc(monthLabel())}</strong><br>`+
        `${Number(data.rows||0)} record scritti nel foglio `+
        `<strong>${esc(data.sheet||'Database')}</strong>.<br>`+
        `<span class="muted">Conferma server ricevuta alle ${esc(localTime)}.</span>`;

      openModal('saveResultModal');

      toast(
        'Calendario salvato correttamente',
        data.calendarStatus?.ready
          ?`${Number(data.rows||0)} record sincronizzati. Le proposte volontari di ${state.month} possono ora essere valutate dal RO.`
          :`${Number(data.rows||0)} record sincronizzati. Per abilitare la valutazione delle proposte volontari è necessario generare prima il calendario con ATLAS.`,
        data.calendarStatus?.ready
          ?'success'
          :'info'
      );

      try{
        await refreshWorkspace();
      }catch(error){
        console.warn(
          'Aggiornamento proposte volontari non riuscito:',
          error
        );
      }
    }catch(e){
      if(e?.name==='AbortError'||calendarSaveCancelled){
        updateSyncStatus('Salvataggio annullato · modifiche ancora da salvare','local');
        toast('Salvataggio annullato','La richiesta lato browser è stata interrotta. Il calendario resta da salvare.','info');
      }else{
        console.error(e);updateSyncStatus('Calendario non salvato','error');toast('Scrittura autenticata non riuscita',e.message||'Errore imprevisto','error');
      }
    }finally{
      calendarSaveController=null;hideCalendarSaveOverlay();setCalendarSaveUi(false);
    }
  }

  let printSnapshot=null;
  function prepareA3Print(){
    const table=$('#calendarTable');
    if(!table)return;

    const PX_PER_MM=96/25.4;
    const availableWidthMm=414;
    const availableHeightMm=279;
    const naturalWidthPx=Math.max(table.scrollWidth,table.getBoundingClientRect().width,1);
    const naturalHeightPx=Math.max(table.scrollHeight,table.getBoundingClientRect().height,1);

    const widthScale=(availableWidthMm*PX_PER_MM)/naturalWidthPx;
    const heightScale=(availableHeightMm*PX_PER_MM)/naturalHeightPx;
    const scale=Math.min(1,widthScale,heightScale);

    const scaledWidthMm=(naturalWidthPx/PX_PER_MM)*scale;
    const scaledHeightMm=(naturalHeightPx/PX_PER_MM)*scale;
    const leftMm=Math.max(0,(availableWidthMm-scaledWidthMm)/2);
    const topMm=Math.max(0,(availableHeightMm-scaledHeightMm)/2);

    document.documentElement.style.setProperty('--print-scale',scale.toFixed(6));
    document.documentElement.style.setProperty('--print-natural-width-px',`${naturalWidthPx.toFixed(2)}px`);
    document.documentElement.style.setProperty('--print-natural-height-px',`${naturalHeightPx.toFixed(2)}px`);
    document.documentElement.style.setProperty('--print-left',`${leftMm.toFixed(3)}mm`);
    document.documentElement.style.setProperty('--print-top',`${topMm.toFixed(3)}mm`);
    document.documentElement.style.setProperty('--print-scaled-height',`${scaledHeightMm.toFixed(3)}mm`);
  }
  function printCalendarA3(){
    if(printSnapshot)return;
    const activeView=$('.view.active')?.id||'calendarView';
    printSnapshot={
      activeView,
      search:$('#searchEmployee').value,
      group:$('#groupFilter').value,
      issues:$('#issuesOnly').checked
    };
    $('#searchEmployee').value='';
    $('#groupFilter').value='all';
    $('#issuesOnly').checked=false;
    switchView('calendarView');
    renderCalendar();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{prepareA3Print();setTimeout(()=>window.print(),80);}));
  }
  function restoreAfterPrint(){
    if(!printSnapshot)return;
    $('#searchEmployee').value=printSnapshot.search;
    $('#groupFilter').value=printSnapshot.group;
    $('#issuesOnly').checked=printSnapshot.issues;
    const activeView=printSnapshot.activeView;
    printSnapshot=null;
    document.documentElement.style.removeProperty('--print-scale');
    document.documentElement.style.removeProperty('--print-natural-width-px');
    document.documentElement.style.removeProperty('--print-natural-height-px');
    document.documentElement.style.removeProperty('--print-left');
    document.documentElement.style.removeProperty('--print-top');
    document.documentElement.style.removeProperty('--print-scaled-height');
    renderCalendar();
    switchView(activeView);
  }

  function openSettings(){
    const auth=getServerAuthContext();
    const isRo=String(auth.user?.profileType||'').toUpperCase()==='RO';
    $('#setTargetHours').value=state.settings.targetHours;
    $('#setMinRest').value=state.settings.minRest;
    $('#setSeMin').value=2;
    $('#setSeMax').value=2;
    $('#setRespMin').value=state.settings.respMin;
    $('#setRespGoal').value=state.settings.respGoal;
    $('#setWeeklyStandard').value=state.settings.weeklyStandardHours;
    $('#setWeeklyMin').value=state.settings.weeklyMinHours;
    $('#setWeeklyMax').value=state.settings.weeklyMaxHours;
    $('#setWeeklyAverageMax').value=state.settings.weeklyAverageMax;
    $('#setWeeklyRestHours').value=state.settings.weeklyRestHours;
    $('#setWeeklyRestOccurrences').value=state.settings.weeklyRestOccurrences14;
    $('#setOvertimeLimit').value=state.settings.annualOvertimeLimit;
    $('#setOvertimeExtended').value=state.settings.annualOvertimeExtended;
    $('#setVacationAnnual').value=state.settings.vacationAnnualHours;
    $('#setSuppressedHolidayAnnual').value=state.settings.suppressedHolidayAnnualHours;
    $('#setPersonalPermitAnnual').value=state.settings.personalPermitAnnualHours;
    $('#setHolidayRecoveryDays').value=30;
    $('#setBankHoursMinBlock').value=state.settings.bankHoursMinBlock;
    $('#setPatronHoliday').value=state.settings.patronHoliday||'';
    $('#setNoSplitDay').checked=state.settings.enforceNoSplitDay!==false;
    $('#setAppsScript').value=ATLAS_SERVER_URL;
    $('#setRotation').checked=state.settings.useABRotation;

    const preferred=$('#setSePreferredEmployee');
    preferred.innerHTML='<option value="">Nessuna preferenza</option>'+state.employees
      .filter(e=>e.attivo!==false&&['A','B','Libera'].includes(e.turno)&&slug(e.responsabile)!=='secondari')
      .sort((a,b)=>employeeName(a).localeCompare(employeeName(b),'it'))
      .map(e=>`<option value="${esc(e.id)}">${esc(employeeName(e))} · ${esc(e.turno)}</option>`).join('');
    preferred.value=String(state.settings.sePreferredEmployeeId||'');
    $('#setSePreferredMinDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));
    $('#setSePreferredMaxDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));

    const note=$('#settingsPermissionNote');
    if(note){
      note.classList.toggle('hidden',!isRo);
      note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Minimo e massimo mensile sono definiti dall’Admin.':'';
    }
    $$('#settingsModal input, #settingsModal select').forEach(control=>{
      const fixed=['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].includes(control.id);
      control.disabled=isRo&&control.id!=='setSePreferredEmployee';
      if(!isRo&&fixed)control.disabled=false;
    });
    ['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].forEach(id=>{const control=$('#'+id);if(control){control.readOnly=true;control.disabled=false;}});
    openModal('settingsModal');
  }
  async function saveSettings(){
    const auth=getServerAuthContext();
    const serverUrl=
      String(
        auth.serverUrl||
        ATLAS_SERVER_URL||
        ''
      ).trim();

    if(
      !serverUrl||
      !auth.token
    ){
      toast(
        'Sessione server assente',
        'Effettua nuovamente l’accesso prima di modificare le impostazioni condivise.',
        'error'
      );
      return;
    }

    const nextSettings={
      ...state.settings,
      targetHours:
        numeric(
          $('#setTargetHours').value
        ),
      minRest:
        numeric(
          $('#setMinRest').value
        ),
      seMin:2,
      seMax:2,
      seTarget:2,
      sePreferredEmployeeId:
        $('#setSePreferredEmployee')?.value||'',
      sePreferredMinDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMinDays').value,0))),
      sePreferredMaxDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMaxDays').value,31))),
      respMin:
        numeric(
          $('#setRespMin').value
        ),
      respGoal:
        numeric(
          $('#setRespGoal').value
        ),
      weeklyStandardHours:
        numeric(
          $('#setWeeklyStandard').value,
          38
        ),
      weeklyMinHours:
        numeric(
          $('#setWeeklyMin').value,
          28
        ),
      weeklyMaxHours:
        numeric(
          $('#setWeeklyMax').value,
          44
        ),
      weeklyAverageMax:
        numeric(
          $('#setWeeklyAverageMax').value,
          48
        ),
      weeklyRestHours:
        numeric(
          $('#setWeeklyRestHours').value,
          35
        ),
      weeklyRestOccurrences14:
        numeric(
          $('#setWeeklyRestOccurrences').value,
          2
        ),
      annualOvertimeLimit:
        numeric(
          $('#setOvertimeLimit').value,
          150
        ),
      annualOvertimeExtended:
        numeric(
          $('#setOvertimeExtended').value,
          250
        ),
      vacationAnnualHours:
        numeric(
          $('#setVacationAnnual').value,
          190
        ),
      suppressedHolidayAnnualHours:
        numeric(
          $('#setSuppressedHolidayAnnual').value,
          26
        ),
      personalPermitAnnualHours:
        numeric(
          $('#setPersonalPermitAnnual').value,
          36
        ),
      holidayRecoveryDays:30,
      bankHoursMinBlock:
        numeric(
          $('#setBankHoursMinBlock').value,
          4
        ),
      patronHoliday:
        $('#setPatronHoliday').value.trim(),
      enforceNoSplitDay:
        $('#setNoSplitDay').checked,
      matrixCsvUrl:'',
      databaseCsvUrl:'',
      appsScriptUrl:serverUrl,
      useABRotation:
        $('#setRotation').checked
    };

    if(nextSettings.seMin>nextSettings.seMax){
      toast(
        'Impostazioni non valide',
        'Secondari: il minimo non può essere maggiore del massimo.',
        'error'
      );
      return;
    }

    if(nextSettings.sePreferredMinDays>nextSettings.sePreferredMaxDays){toast('Impostazioni non valide','Le giornate minime del prevalente non possono superare le massime.','error');return;}

    if(nextSettings.respMin>nextSettings.respGoal){
      toast(
        'Impostazioni non valide',
        'GRA/GRM: il minimo non può essere maggiore dell’obiettivo.',
        'error'
      );
      return;
    }

    const isRo=String(auth.user?.profileType||'').toUpperCase()==='RO';
    if(isRo){
      state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId};
      state.localDirty=true;
      saveState();
      renderAll();
      closeModal('settingsModal');
      toast('Preferenza Secondari salvata',nextSettings.sePreferredEmployeeId?'Il dipendente selezionato sarà privilegiato su MGSE, salvo necessità del 118.':'Nessun dipendente prevalente configurato.','success');
      try{
        const data=await saveSharedSettings({url:serverUrl,token:auth.token,settings:sharedSettingsPayload(nextSettings)});
        if(data?.sharedSettings?.settings){
          state.settings={...state.settings,...data.sharedSettings.settings,seMin:2,seMax:2,seTarget:2};
          state.sharedSettingsUpdatedAt=String(data.sharedSettings.updatedAt||'');
          state.sharedSettingsUpdatedBy=String(data.sharedSettings.updatedBy||auth.user?.username||'');
          saveState();
          renderAll();
          toast('Preferenza condivisa sincronizzata','La configurazione MGSE è disponibile anche sugli altri dispositivi.','success');
        }
      }catch(error){
        console.warn('Preferenza MGSE salvata localmente: backend non autorizza la modifica RO.',error);
        toast('Preferenza salvata su questo dispositivo','Il server non ha autorizzato la modifica condivisa del RO; il generatore locale userà comunque la preferenza.','info');
      }
      return;
    }

    const button=
      $('#saveSettingsBtn');

    if(button){
      button.disabled=true;
      button.textContent=
        'Salvataggio condiviso…';
    }

    updateSyncStatus(
      'Salvataggio impostazioni condivise…',
      'sync'
    );

    try{
      const data=
        await saveSharedSettings({
          url:serverUrl,
          token:auth.token,
          settings:
            sharedSettingsPayload(
              nextSettings
            )
        });

      state.settings={
        ...nextSettings,
        ...(data.sharedSettings?.settings||{}),
        matrixCsvUrl:'',
        databaseCsvUrl:'',
        appsScriptUrl:serverUrl,
        seMin:2,
        seMax:2,
        seTarget:2
      };

      state.sharedSettingsUpdatedAt=
        String(
          data.sharedSettings?.updatedAt||
          ''
        );

      state.sharedSettingsUpdatedBy=
        String(
          data.sharedSettings?.updatedBy||
          auth.user?.username||
          ''
        );

      rememberServerUrl(
        serverUrl
      );

      state.localDirty=true;
      saveState();
      renderAll();
      closeModal('settingsModal');

      updateSyncStatus(
        'Impostazioni condivise sincronizzate',
        'local'
      );

      toast(
        'Impostazioni condivise salvate',
        'Le stesse regole saranno utilizzate anche dal Responsabile Operativo.',
        'success'
      );
    }catch(error){
      console.error(error);

      updateSyncStatus(
        'Salvataggio impostazioni non riuscito',
        'error'
      );

      toast(
        'Impostazioni non salvate',
        error.message||
        'Impossibile sincronizzare le regole con il server.',
        'error'
      );
    }finally{
      if(button){
        button.disabled=false;
        button.textContent=
          'Salva impostazioni';
      }
    }
  }
  function clearAuto(){removeAutoProposals();state.localDirty=true;saveState();renderAll();toast('Proposte automatiche rimosse');}
  function clearMonth(){
    const kept={};
    Object.entries(state.assignments).forEach(([key,items])=>{
      const protectedItems=(items||[]).filter(isProtectedCalendarRecord);
      if(protectedItems.length)kept[key]=protectedItems;
    });
    state.assignments=kept;
    state.requirements={};
    initRequirements();
    state.localDirty=true;
    saveState();
    renderAll();
    toast('Turnazione cancellata',`${protectedRecordCount()} record di ferie, malattia, permesso o altra assenza sono rimasti registrati.`);
  }
  async function resetCalendarCompletely(){
    const auth=getServerAuthContext();
    const url=String(state.settings.appsScriptUrl||auth.serverUrl||ATLAS_SERVER_URL||'').trim();
    if(!url||!auth.token){return toast('Sessione server assente','Riaccedi prima di resettare il calendario.','error');}

    const snapshot={
      assignments:structuredClone(state.assignments||{}),
      requirements:structuredClone(state.requirements||{}),
      dbRecords:structuredClone(state.dbRecords||[]),
      lastAutoSummary:structuredClone(state.lastAutoSummary||null),
      localDirty:!!state.localDirty,
      protectedStore:structuredClone(readProtectedRecords())
    };
    const button=$('#resetCalendarBtn');
    if(button){button.disabled=true;button.textContent='Reset…';}

    try{
      state.assignments={};
      state.requirements={};
      state.lastAutoSummary=null;
      state.dbRecords=(state.dbRecords||[]).filter(record=>!String(record?.day||'').startsWith(state.month));

      const protectedStore=readProtectedRecords();
      Object.keys(protectedStore).forEach(key=>{
        const day=key.slice(key.lastIndexOf('|')+1);
        if(day.startsWith(state.month))delete protectedStore[key];
      });
      writeProtectedRecords(protectedStore);

      state.localDirty=true;
      saveState();
      renderAll();
      updateSyncStatus(`Reset completo ${monthLabel()}…`,'sync');

      await saveCalendarPlanToSheet({
        url,
        token:auth.token,
        month:state.month,
        rows:[],
        requirements:{},
        updatedAt:new Date().toISOString(),
        clientVersion:APP_VERSION,
        generationConfirmed:false,
        generationAt:''
      });

      // Il database del mese è ora vuoto. Ripristiniamo soltanto i fabbisogni
      // di default nell'interfaccia, senza ricreare turni/riposi/assenze.
      state.requirements={};
      initRequirements();
      state.localDirty=false;
      saveState();
      renderAll();
      updateSyncStatus(`Calendario ${monthLabel()} completamente vuoto`,'local');
      toast('Calendario resettato',`${monthLabel()} è stato ripulito completamente: turni, riposi, assenze, permessi e coperture sono stati rimossi.`,'success');
    }catch(error){
      state.assignments=snapshot.assignments;
      state.requirements=snapshot.requirements;
      state.dbRecords=snapshot.dbRecords;
      state.lastAutoSummary=snapshot.lastAutoSummary;
      state.localDirty=snapshot.localDirty;
      writeProtectedRecords(snapshot.protectedStore);
      saveState();
      renderAll();
      updateSyncStatus('Reset calendario non riuscito','error');
      toast('Reset non completato',error?.message||'Il calendario è stato ripristinato allo stato precedente.','error');
    }finally{
      if(button){button.disabled=false;button.textContent='Reset calendario';}
    }
  }

  function resetApp(){localStorage.removeItem(STORAGE_KEY);LEGACY_STORAGE_KEYS.forEach(k=>localStorage.removeItem(k));localStorage.removeItem(PROTECTED_STORAGE_KEY);location.reload();}

  function bindEvents(){
    $('#preGenYesBtn').addEventListener('click',()=>setPreGenStage('form'));
    $('#preGenNoBtn').addEventListener('click',()=>setPreGenStage('recap'));
    $('#preGenBackQuestionBtn').addEventListener('click',()=>setPreGenStage('question'));
    $('#preGenAddBtn').addEventListener('click',addPreGenerationDraft);
    $('#preGenGoRecapBtn').addEventListener('click',()=>setPreGenStage('recap'));
    $('#preGenBackFormBtn').addEventListener('click',()=>setPreGenStage('form'));
    $('#preGenMode').addEventListener('change',togglePreGenMode);$('#preGenCode').addEventListener('change',togglePreGenMode);$('#preGenFrom').addEventListener('change',togglePreGenMode);
    $('#preGenConfirmCheck').addEventListener('change',e=>{$('#preGenConfirmBtn').disabled=!e.target.checked;});
    $('#preGenConfirmBtn').addEventListener('click',confirmPreGeneration);
    $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&m.id!=='rfsPlacementModal')closeModal(m.id);}));$$('.preset').forEach(b=>b.addEventListener('click',()=>renderAssignmentForm(b.dataset.preset)));
    ['searchEmployee','groupFilter','issuesOnly'].forEach(id=>$('#'+id).addEventListener(id==='searchEmployee'?'input':'change',renderCalendar));$('#resetFilters').addEventListener('click',()=>{$('#searchEmployee').value='';$('#groupFilter').value='all';$('#issuesOnly').checked=false;renderCalendar();});$('#coverageFilter').addEventListener('change',renderCoverage);$('#anomalyFilter').addEventListener('change',renderAnomalies);
    $('#settingsBtn').addEventListener('click',openSettings);$('#saveSettingsBtn').addEventListener('click',saveSettings);$('#importEmployeesBtn').addEventListener('click',()=>reloadSheets({replaceDb:true}));$('#downloadBackupBtn').addEventListener('click',downloadBackup);$('#syncBtn').addEventListener('click',requestCalendarSave);$('#exportBtn').addEventListener('click',exportDatabaseCsv);$('#exportSummaryBtn').addEventListener('click',exportSummaryCsv);$('#printBtn').addEventListener('click',printCalendarA3);
    $('#addStaffBtn').addEventListener('click',()=>openStaffModal());$('#saveStaffBtn').addEventListener('click',saveStaffRecord);$('#staffEmploymentEndType').addEventListener('change',toggleEmploymentEndFields);$('#staffEmploymentEndDate').addEventListener('change',toggleEmploymentEndFields);$('#exportStaffBtn').addEventListener('click',exportEmployeesCsv);$('#syncStaffBtn').addEventListener('click',syncEmployeesGoogle);$('#staffSearch').addEventListener('input',renderStaff);$('#staffGroupFilter').addEventListener('change',renderStaff);
    $('#generationCancelBtn')?.addEventListener('click',cancelAutomaticGeneration);
    $('#resetCalendarBtn')?.addEventListener('click',()=>confirmDialog(
      'Resettare completamente il calendario?',
      `${monthLabel()} · cancellazione totale`,
      'Verranno eliminati TUTTI i record del mese: turni 118, Secondari, responsabilità, amministrazione, formazione, riposi, ferie, malattie, 104, AVIS, congedi, permessi, RC e coperture. Anagrafiche e impostazioni non vengono toccate.',
      resetCalendarCompletely
    ));
    $('#reloadSheetBtn').addEventListener('click',()=>confirmDialog('Ricaricare Matrice e Database?','Turni e coperture saranno riletti dal foglio','Ferie, malattie, permessi e altre assenze locali protette resteranno registrate.',()=>reloadSheets({replaceDb:true})));$('#autoBtn').addEventListener('click',openPreGenerationWizard);$('#generateAutoBtn').addEventListener('click',generateAutomatic);$('#rfsCurrentMonthBtn').addEventListener('click',()=>handleRfsPlacement('current'));$('#rfsNextMonthBtn').addEventListener('click',()=>handleRfsPlacement('next'));$('#rfsRoChoiceBtn').addEventListener('click',()=>handleRfsPlacement('ro'));$('#absenceBtn').addEventListener('click',openAbsenceModal);$('#absenceCreateTab').addEventListener('click',()=>setAbsencePane('create'));$('#absenceManageTab').addEventListener('click',()=>setAbsencePane('manage'));$('#absMode').addEventListener('change',toggleAbsenceMode);$('#absCode').addEventListener('change',updateAbsenceRuleHint);$('#absFrom').addEventListener('change',updateAbsenceRuleHint);$('#saveAbsenceBtn').addEventListener('click',declareAbsence);['absManageEmployee','absManageCode','absManageStatus','absManageFrom','absManageTo'].forEach(id=>$('#'+id).addEventListener('change',renderAbsenceBulkList));$('#absManageSearch').addEventListener('input',renderAbsenceBulkList);$('#absSelectVisibleBtn').addEventListener('click',selectVisibleAbsences);$('#absClearSelectionBtn').addEventListener('click',clearAbsenceSelection);$('#absDeleteSelectedBtn').addEventListener('click',requestBulkDeleteAbsences);
    $('#importBtn').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',e=>{if(e.target.files[0])importBackupFile(e.target.files[0]);e.target.value='';});$('#clearAutoBtn').addEventListener('click',()=>confirmDialog('Rimuovere le proposte automatiche?','Le voci manuali, bloccate e importate restano','La turnazione potrà essere rigenerata successivamente.',clearAuto));$('#clearMonthBtn').addEventListener('click',()=>confirmDialog('Cancellare la turnazione?','Assenze e indisponibilità restano protette','Saranno rimossi turni 118, Secondari, responsabilità, amministrazione e formazione. Ferie, malattia, infortunio, 104, AVIS, congedi, permessi e RC manuali resteranno registrati.',clearMonth));$('#resetAppBtn').addEventListener('click',()=>confirmDialog('Ripristinare l’app?','Cancellazione dati locali','Saranno eliminati turni, impostazioni e collegamenti salvati nel browser.',resetApp));$('#confirmActionBtn').addEventListener('click',()=>{const fn=state.confirmAction;state.confirmAction=null;closeModal('confirmModal');if(fn)fn();});
    $('#monthPicker').addEventListener('change',e=>openMonth(e.target.value));
    $('#prevMonthBtn').addEventListener('click',()=>stepMonth(-1));
    $('#nextMonthBtn').addEventListener('click',()=>stepMonth(1));
    $('#currentMonthBtn').addEventListener('click',openCurrentMonth);
    $('#calendarPrevMonthBtn').addEventListener('click',()=>stepMonth(-1));
    $('#calendarNextMonthBtn').addEventListener('click',()=>stepMonth(1));
    $('#calendarCurrentMonthBtn').addEventListener('click',openCurrentMonth);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){
        refreshSharedSettings({
          force:false,
          silent:false
        });
      }
    });
    window.addEventListener('focus',()=>{
      refreshSharedSettings({
        force:false,
        silent:false
      });
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-backdrop.open').filter(m=>m.id!=='rfsPlacementModal').forEach(m=>closeModal(m.id));});window.addEventListener('beforeprint',prepareA3Print);window.addEventListener('afterprint',restoreAfterPrint);
  }


  async function init(user){
    setBootLoadingStep(
      'Preparo l’interfaccia',
      'Carico impostazioni, mese e dati locali protetti.',
      24
    );

    loadState();

    const auth=getServerAuthContext();
    const permissions=new Set(user?.permissions||[]);
    state.settings.matrixCsvUrl='';
    state.settings.databaseCsvUrl='';
    state.settings.appsScriptUrl=ATLAS_SERVER_URL;

    rememberServerUrl();
    restoreProtectedRecordsForCurrentMonth();
    updateMonthControls();
    initRequirements();
    bindEvents();
    initSidebarLayout();
    initUiFontControl();
    applyAccessProfile(user);
    renderAll();

    if(!permissions.has('read')){
      finishBootLoading('Profilo caricato.');
      return;
    }

    // Prima viene caricato il calendario. Le proposte volontari non devono
    // mai impedire l'apertura di Admin o Responsabile Operativo.
    setBootLoadingStep(
      'Carico dipendenti e calendario',
      'Sto leggendo Matrice e Database dal server protetto.',
      48
    );

    await reloadSheets({
      replaceDb:true,
      silent:true,
      throwOnError:true
    });

    setBootLoadingStep(
      'Costruisco il calendario',
      'Applico turni, assenze, coperture e controlli del mese.',
      76
    );
    renderAll();

    setBootLoadingStep(
      'Preparo l’area richieste volontari',
      'Il caricamento delle proposte avverrà soltanto quando aprirai Buchi volontari.',
      90
    );

    try{
      await initVolunteerCoverage({
        user,
        onProposalApplied:async()=>{
          if(permissions.has('read')){
            await reloadSheets({replaceDb:true,silent:true});
          }
        }
      });
    }catch(error){
      // Un problema nel foglio/proposte volontari è non bloccante:
      // il calendario deve rimanere utilizzabile e l'utente non viene espulso.
      console.warn(
        'Caricamento proposte volontari non riuscito:',
        error
      );
      toast(
        'Richieste volontari non caricate',
        error.message||'Riprova dalla pagina Buchi volontari.',
        'warning'
      );
    }

    finishBootLoading(
      `Calendario ${monthLabel()} caricato e pronto all’uso.`
    );
  }

  bootAuthentication({
    beforeBoot:startAutomaticTheme,
    onAuthenticated:init
  });
})();
