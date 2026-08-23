from pathlib import Path
import re

# config
p=Path('atlas/js/config.js'); s=p.read_text(encoding='utf-8')
s=s.replace("    sePreferredEmployeeId: '', \n    respMin: 4,", "    sePreferredEmployeeId: '',\n    sePreferredMinDays: 0,\n    sePreferredMaxDays: 31,\n    respMin: 4,",1)
p.write_text(s,encoding='utf-8')

p=Path('atlas/js/atlas-app.js'); s=p.read_text(encoding='utf-8')
s=s.replace("    'sePreferredEmployeeId',\n    'respMin',", "    'sePreferredEmployeeId',\n    'sePreferredMinDays',\n    'sePreferredMaxDays',\n    'respMin',",1)
s=s.replace("    if(item.role==='S'){if(!e.autista&&!e.capo)score-=8;else score+=2;}\n    // La continuità di sede", "    if(item.role==='S'){if(!e.autista&&!e.capo)score-=8;else score+=2;}\n    if(item.category==='SE'&&String(state.settings.sePreferredEmployeeId||'')===String(e.id||''))score-=24;\n    // La continuità di sede",1)
pattern=r"  function scheduleSecondari\(\)\{.*?(?=\n  function currentSlotOccupied)"
replacement=r'''  function preferredSecondariDayCount(employeeId){
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
'''
s,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1: raise SystemExit('scheduleSecondari replacement failed')
marker="    monthDates().forEach(d=>{const day=dateKey(d);['M','P','N'].forEach(shift=>{if(state.requirements[`${day}|${shift}`]!=='required')return;const cov=coverageFor(day,shift);"
insert="""    const preferredSeEmployee=ordinarySecondariPreferredEmployee();
    if(preferredSeEmployee){const preferredDays=preferredSecondariDayCount(preferredSeEmployee.id),preferredMin=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0))),preferredMax=Math.max(preferredMin,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));if(preferredDays<preferredMin)out.push(validation('warning','Prevalente Secondari sotto il minimo',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE, minimo ${preferredMin}.`,preferredSeEmployee.id,null));if(preferredDays>preferredMax)out.push(validation('warning','Prevalente Secondari oltre il massimo',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE, massimo ${preferredMax}.`,preferredSeEmployee.id,null));}
    monthDates().forEach(d=>{const day=dateKey(d);['M','P','N'].forEach(shift=>{if(state.requirements[`${day}|${shift}`]!=='required')return;const cov=coverageFor(day,shift);"""
if marker not in s: raise SystemExit('validation marker missing')
s=s.replace(marker,insert,1)
s=s.replace(".filter(e=>e.attivo!==false&&e.turno!=='Amministrazione')", ".filter(e=>e.attivo!==false&&['A','B','Libera'].includes(e.turno)&&slug(e.responsabile)!=='secondari')",1)
s=s.replace("    preferred.value=String(state.settings.sePreferredEmployeeId||'');\n\n    const note=$('#settingsPermissionNote');", "    preferred.value=String(state.settings.sePreferredEmployeeId||'');\n    $('#setSePreferredMinDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));\n    $('#setSePreferredMaxDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));\n\n    const note=$('#settingsPermissionNote');",1)
s=s.replace("note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Gli altri parametri sono visibili in sola lettura.':'';", "note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Minimo e massimo mensile sono definiti dall’Admin.':'';",1)
s=s.replace("      sePreferredEmployeeId:\n        $('#setSePreferredEmployee')?.value||'',\n      respMin:", "      sePreferredEmployeeId:\n        $('#setSePreferredEmployee')?.value||'',\n      sePreferredMinDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMinDays').value,0))),\n      sePreferredMaxDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMaxDays').value,31))),\n      respMin:",1)
s=s.replace("    if(nextSettings.respMin>nextSettings.respGoal){", "    if(nextSettings.sePreferredMinDays>nextSettings.sePreferredMaxDays){toast('Impostazioni non valide','Le giornate minime del prevalente non possono superare le massime.','error');return;}\n\n    if(nextSettings.respMin>nextSettings.respGoal){",1)
s=s.replace("state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId};", "state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId};",1)
p.write_text(s,encoding='utf-8')

for name in ('admin.html','ro.html'):
    p=Path(name); s=p.read_text(encoding='utf-8')
    old='''              <div class="field full">\n                <label>Dipendente prevalentemente assegnato ai Secondari</label>\n                <select id="setSePreferredEmployee" class="input"><option value="">Nessuna preferenza</option></select>\n                <small>È una preferenza soft: ferie, riposi, vincoli e soprattutto la copertura 118 hanno priorità. Se necessario, il dipendente può essere utilizzato nel 118.</small>\n              </div>'''
    new=old+'''\n              <div class="field"><label>Giornate MGSE minime · prevalente</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field"><label>Giornate MGSE massime · prevalente</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field full"><small>Le quote mensili min/max sono modificabili dall’Admin; per il RO sono in sola lettura.</small></div>'''
    if old not in s: raise SystemExit(f'{name}: html marker missing')
    s=s.replace(old,new,1)
    s=s.replace('Le giornate GRS, GRA, GRM e GRO restano responsabilità finché il 118 è coperto; possono essere convertite dal fallback emergenziale quando servono a chiudere un ruolo 118.','GRS viene pianificato in tutti i feriali compatibili con assenze e riposi obbligatori. Non viene usato per colmare MGSE: può essere convertito esclusivamente in 118 quando serve a chiudere una copertura. GRA, GRM e GRO restano convertibili nel fallback 118.',1)
    s=s.replace('Raschi svolge GRS; MGSE solo quando il minimo SE non è raggiungibile.','Raschi svolge GRS nei feriali; viene liberato dalla responsabilità esclusivamente quando serve come risorsa di fallback 118.',1)
    s=s.replace('atlas/js/atlas-app.js?v=1.0.0-MGSE-COVERAGE-20260823','atlas/js/atlas-app.js?v=1.0.0-GRS-MGSE-QUOTA-20260823')
    p.write_text(s,encoding='utf-8')
