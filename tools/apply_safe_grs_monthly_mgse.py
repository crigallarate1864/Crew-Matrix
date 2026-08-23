from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# config.js
p = Path('atlas/js/config.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "    sePreferredEmployeeId: '', \n    respMin: 4,",
    "    sePreferredEmployeeId: '',\n    sePreferredMinDays: 0,\n    sePreferredMaxDays: 31,\n    respMin: 4,",
    'config quota defaults'
)
p.write_text(s, encoding='utf-8')

# atlas-app.js
p = Path('atlas/js/atlas-app.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "    'sePreferredEmployeeId',\n    'respMin',",
    "    'sePreferredEmployeeId',\n    'sePreferredMinDays',\n    'sePreferredMaxDays',\n    'respMin',",
    'shared settings keys'
)
s = replace_once(
    s,
    "    if(item.role==='S'){if(!e.autista&&!e.capo)score-=8;else score+=2;}\n    // La continuità di sede è solo una preferenza.",
    "    if(item.role==='S'){if(!e.autista&&!e.capo)score-=8;else score+=2;}\n    if(item.category==='SE'&&String(state.settings.sePreferredEmployeeId||'')===String(e.id||''))score-=18;\n    // La continuità di sede è solo una preferenza.",
    'preferred MGSE score'
)

scheduler = re.search(
    r"  function scheduleFixedResponsibles\(\)\{.*?\n"
    r"  function removeAutoGrsForRaschi\(raschi,day\)\{.*?\n"
    r"  function scheduleSecondari\(\)\{.*?\n  \}\n\n"
    r"  function currentSlotOccupied",
    s,
    re.S,
)
if not scheduler:
    raise SystemExit('scheduler block not found')

replacement = r'''  function secondariResponsibleEmployee(){
    return state.employees.find(e=>
      slug(e.responsabile)==='secondari'||
      e.turno==='RS'||
      slug(e.cognome)==='raschi'
    )||null;
  }

  function scheduleGrsResponsibility(){
    let added=0;
    const raschi=secondariResponsibleEmployee();
    if(!raschi)return added;
    workdays().forEach(d=>{
      const day=dateKey(d);
      if(!employeeActiveOn(raschi,day))return;
      const existing=getAssignments(raschi.id,day);
      if(existing.some(a=>String(a.type||a.code||'').toUpperCase()==='GRS'))return;
      if(existing.length)return;
      const item={category:'RESP',type:'GRS',code:'GRS',structuralGrs:true,note:'Responsabile Secondari · GRS feriale ordinario'};
      if(checkCandidate(raschi,day,item).errors.length)return;
      addAuto(raschi,day,item);
      added++;
    });
    return added;
  }

  function scheduleFixedResponsibles(){
    let added=0;
    const bosetti=state.employees.find(e=>slug(e.responsabile)==='operativo'||e.turno==='RO');
    if(bosetti)workdays().forEach(d=>{
      const day=dateKey(d),item={category:'RESP',type:'GRO',code:'GRO'};
      if(employeeActiveOn(bosetti,day)&&!getAssignments(bosetti.id,day).length&&!checkCandidate(bosetti,day,item).errors.length){
        addAuto(bosetti,day,item);added++;
      }
    });
    const responsibles=[
      ...state.employees.filter(e=>slug(e.responsabile)==='autoparco').map(e=>[e,'GRA']),
      ...state.employees.filter(e=>slug(e.responsabile)==='magazzino').map(e=>[e,'GRM'])
    ];
    responsibles.forEach(([e,code],idx)=>{
      let count=allAssignmentRows().filter(r=>r.employeeId===e.id&&r.a.type===code).length;
      const candidates=workdays().filter((d,i)=>i%Math.max(1,Math.floor(workdays().length/state.settings.respGoal))===idx%2).concat(workdays());
      for(const d of candidates){
        if(count>=state.settings.respGoal)break;
        const day=dateKey(d);
        if(getAssignments(e.id,day).length)continue;
        const item={category:'RESP',type:code,code};
        if(checkCandidate(e,day,item).errors.length)continue;
        addAuto(e,day,item);count++;added++;
      }
    });
    return added;
  }

  function preferredSecondariDayCount(employeeId){
    if(!employeeId)return 0;
    return workdays().reduce((count,d)=>
      count+(getAssignments(employeeId,dateKey(d)).some(a=>a.category==='SE')?1:0),0
    );
  }

  function ordinarySecondariPreferredEmployee(){
    const id=String(state.settings.sePreferredEmployeeId||'');
    const employee=id?state.employees.find(e=>e.id===id):null;
    if(!employee)return null;
    if(!['A','B','Libera'].includes(employee.turno))return null;
    if(slug(employee.responsabile)==='secondari')return null;
    return employee;
  }

  function scheduleSecondari(){
    let added=0;
    const preferredEmployee=ordinarySecondariPreferredEmployee();
    const preferredMin=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));
    const preferredMax=Math.max(preferredMin,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));
    let preferredDays=preferredEmployee?preferredSecondariDayCount(preferredEmployee.id):0;

    workdays().forEach(d=>{
      const day=dateKey(d);
      let count=state.employees.reduce((n,e)=>n+getAssignments(e.id,day).filter(a=>a.category==='SE').length,0);
      const target=2;
      const item={category:'SE',type:'MGSE',code:'MGSE'};
      const pref=preferredGroup(d,'M');

      if(count<target&&preferredEmployee&&preferredDays<preferredMin&&employeeActiveOn(preferredEmployee,day)){
        const preferredItem={...item,preferredSecondari:true,note:'Dipendente prevalente Secondari · raggiungimento minimo mensile'};
        if(!checkCandidate(preferredEmployee,day,preferredItem).errors.length){
          addAuto(preferredEmployee,day,preferredItem);
          added++;count++;preferredDays++;
        }
      }

      while(count<target){
        const preferredAtMax=preferredEmployee&&preferredDays>=preferredMax;
        const allowed=e=>!preferredAtMax||e.id!==preferredEmployee.id;
        let pool=state.employees.filter(e=>(e.turno===pref||e.turno==='Libera')&&allowed(e));
        let employee=chooseCandidate(day,item,{preferred:pref,pool});
        if(!employee){
          pool=state.employees.filter(e=>['A','B','Libera'].includes(e.turno)&&allowed(e));
          employee=chooseCandidate(day,item,{preferred:pref,pool});
        }
        if(!employee)break;
        addAuto(employee,day,{...item,preferredSecondari:preferredEmployee?.id===employee.id});
        added++;count++;
        if(preferredEmployee?.id===employee.id)preferredDays++;
      }
    });
    return added;
  }

  function currentSlotOccupied'''
s = s[:scheduler.start()] + replacement + s[scheduler.end():]

s = replace_once(
    s,
    "      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}\n      if(resp){updateGeneration(22,'Pianificazione giornate responsabili…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(32,'Copertura prioritaria equipaggi 118…');",
    "      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(19,'Pianificazione GRS feriali…');\n      added+=scheduleGrsResponsibility();\n      await yieldUi();\n      ensureGenerationNotCancelled();\n\n      if(resp){updateGeneration(24,'Pianificazione GRO / GRA / GRM…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(32,'Copertura prioritaria equipaggi 118…');",
    'generation sequence'
)

validation_marker = "    monthDates().forEach(d=>{const day=dateKey(d);['M','P','N'].forEach(shift=>{if(state.requirements[`${day}|${shift}`]!=='required')return;"
validation_insert = """    const preferredSeEmployee=ordinarySecondariPreferredEmployee();
    if(preferredSeEmployee){
      const preferredDays=preferredSecondariDayCount(preferredSeEmployee.id);
      const preferredMin=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));
      const preferredMax=Math.max(preferredMin,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));
      if(preferredDays<preferredMin)out.push(validation('warning','Prevalente Secondari sotto il minimo mensile',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE nel mese, minimo configurato ${preferredMin}.`,preferredSeEmployee.id,null));
      if(preferredDays>preferredMax)out.push(validation('warning','Prevalente Secondari oltre il massimo mensile',`${employeeName(preferredSeEmployee)}: ${preferredDays} giornate MGSE nel mese, massimo configurato ${preferredMax}.`,preferredSeEmployee.id,null));
    }
    const grsEmployee=secondariResponsibleEmployee();
    if(grsEmployee){
      workdays().forEach(d=>{
        const day=dateKey(d),items=getAssignments(grsEmployee.id,day);
        if(!employeeActiveOn(grsEmployee,day)||items.some(a=>isProtectedCalendarRecord(a)||a.category==='FORM'))return;
        const hasGrs=items.some(a=>String(a.type||a.code||'').toUpperCase()==='GRS');
        const has118=items.some(a=>a.category==='118');
        if(!hasGrs&&!has118&&!items.length)out.push(validation('warning','GRS feriale mancante',`${employeeName(grsEmployee)}: ${formatDateIt(day)} senza GRS e senza impiego 118.`,grsEmployee.id,day));
      });
    }
    monthDates().forEach(d=>{const day=dateKey(d);['M','P','N'].forEach(shift=>{if(state.requirements[`${day}|${shift}`]!=='required')return;"""
s = replace_once(s, validation_marker, validation_insert, 'validation insertion')

s = replace_once(
    s,
    "    preferred.value=String(state.settings.sePreferredEmployeeId||'');\n\n    const note=$('#settingsPermissionNote');",
    "    preferred.value=String(state.settings.sePreferredEmployeeId||'');\n    $('#setSePreferredMinDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));\n    $('#setSePreferredMaxDays').value=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMaxDays,31)));\n\n    const note=$('#settingsPermissionNote');",
    'settings quota values'
)
s = s.replace(
    ".filter(e=>e.attivo!==false&&e.turno!=='Amministrazione')",
    ".filter(e=>e.attivo!==false&&['A','B','Libera'].includes(e.turno)&&slug(e.responsabile)!=='secondari')",
    1,
)
s = s.replace(
    "note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Gli altri parametri sono visibili in sola lettura.':'';",
    "note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Il minimo e il massimo MENSILE sono definiti dall’Admin e restano in sola lettura.':'';",
    1,
)
s = replace_once(
    s,
    "      sePreferredEmployeeId:\n        $('#setSePreferredEmployee')?.value||'',\n      respMin:",
    "      sePreferredEmployeeId:\n        $('#setSePreferredEmployee')?.value||'',\n      sePreferredMinDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMinDays').value,0))),\n      sePreferredMaxDays:Math.max(0,Math.min(31,numeric($('#setSePreferredMaxDays').value,31))),\n      respMin:",
    'save quota fields'
)
s = replace_once(
    s,
    "    if(nextSettings.respMin>nextSettings.respGoal){",
    "    if(nextSettings.sePreferredMinDays>nextSettings.sePreferredMaxDays){\n      toast('Impostazioni non valide','Dipendente prevalente Secondari: il minimo MENSILE non può superare il massimo MENSILE.','error');\n      return;\n    }\n\n    if(nextSettings.respMin>nextSettings.respGoal){",
    'quota validation'
)
s = replace_once(
    s,
    "      state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId};",
    "      state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId,sePreferredMinDays:numeric(state.settings.sePreferredMinDays,0),sePreferredMaxDays:numeric(state.settings.sePreferredMaxDays,31)};",
    'RO quota preservation'
)
p.write_text(s, encoding='utf-8')

# admin / RO HTML
for name in ['admin.html', 'ro.html']:
    p = Path(name)
    s = p.read_text(encoding='utf-8')
    preferred = '''              <div class="field full">\n                <label>Dipendente prevalentemente assegnato ai Secondari</label>\n                <select id="setSePreferredEmployee" class="input"><option value="">Nessuna preferenza</option></select>\n                <small>È una preferenza soft: ferie, riposi, vincoli e soprattutto la copertura 118 hanno priorità. Se necessario, il dipendente può essere utilizzato nel 118.</small>\n              </div>'''
    quota = preferred + '''\n              <div class="field full"><div class="section-label">QUOTA MENSILE DEL DIPENDENTE PREVALENTE</div></div>\n              <div class="field"><label>Minimo MENSILE di giornate MGSE</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 8" /></div>\n              <div class="field"><label>Massimo MENSILE di giornate MGSE</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 12" /></div>\n              <div class="field full"><div class="notice info"><strong>Quota mensile del prevalente:</strong> questi due valori NON sono il minimo/massimo giornaliero. Indicano quante giornate MGSE deve svolgere nel mese il dipendente selezionato sopra. Esempio: minimo 8 e massimo 12 = ATLAS prova a tenerlo tra 8 e 12 giornate MGSE nell’intero mese.</div></div>'''
    s = replace_once(s, preferred, quota, f'{name} quota UI')
    s = s.replace(
        '<label class="auto-option"><input id="autoResp" type="checkbox" checked /><div><strong>Pianifica responsabili</strong><span>GRO feriali, GRS feriali e 5 giornate obiettivo per GRA/GRM.</span></div></label>',
        '<label class="auto-option"><input id="autoResp" type="checkbox" checked /><div><strong>Pianifica altre responsabilità</strong><span>GRS viene sempre pianificato nei feriali. Questa opzione gestisce GRO e le giornate obiettivo GRA/GRM.</span></div></label>',
        1,
    )
    s = s.replace(
        'GRS non conta come risorsa operativa. ATLAS usa prima il dipendente prevalente configurato, poi le altre risorse disponibili. Il 118 mantiene sempre la priorità; Raschi passa a MGSE soltanto se necessario.',
        'GRS non conta come risorsa operativa e non viene convertito in MGSE. Il dipendente prevalente segue il minimo/massimo mensile configurato; il 118 mantiene sempre la priorità.',
        1,
    )
    s = s.replace(
        'atlas/js/atlas-app.js?v=1.0.0-MGSE-COVERAGE-20260823',
        'atlas/js/atlas-app.js?v=1.0.0-GRS-MONTHLY-SAFE-20260823',
    )
    p.write_text(s, encoding='utf-8')
