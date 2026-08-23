from pathlib import Path
import re

APP=Path('atlas/js/atlas-app.js')
app=APP.read_text(encoding='utf-8')

# 1) GRS strutturale: sempre pianificato nei feriali, indipendentemente dal toggle delle altre responsabilita.
pattern=r"  function scheduleFixedResponsibles\(\)\{.*?return added;\}\n  function removeAutoGrsForRaschi"
replacement=r'''  function secondariResponsibleEmployee(){
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
      // Assenze, RC, formazione o altri vincoli gia presenti restano prioritari e protetti.
      if(existing.length)return;
      const item={category:'RESP',type:'GRS',code:'GRS',structuralGrs:true,note:'Responsabile Secondari · giornata GRS ordinaria'};
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
      if(employeeActiveOn(bosetti,day)&&!getAssignments(bosetti.id,day).length&&checkCandidate(bosetti,day,item).errors.length===0){addAuto(bosetti,day,item);added++;}
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
  function removeAutoGrsForRaschi'''
app,n=re.subn(pattern,replacement,app,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'scheduleFixedResponsibles replacement count={n}')

# 2) Inserisci GRS SEMPRE prima della composizione 118; il toggle responsabili governa solo GRO/GRA/GRM.
old="""      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}\n      if(resp){updateGeneration(22,'Pianificazione giornate responsabili…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(32,'Copertura prioritaria equipaggi 118…');"""
new="""      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(19,'Pianificazione GRS feriali…');\n      added+=scheduleGrsResponsibility();\n      await yieldUi();\n      ensureGenerationNotCancelled();\n\n      if(resp){updateGeneration(24,'Pianificazione altre responsabilità…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}\n\n      updateGeneration(32,'Copertura prioritaria equipaggi 118…');"""
if old not in app:
    raise SystemExit('generation order marker not found')
app=app.replace(old,new,1)

# 3) Validazione esplicita GRS mancante nei feriali, salvo assenza/RC/formazione/118.
marker="""    const preferredSeEmployee=ordinarySecondariPreferredEmployee();"""
insert="""    const structuralGrsEmployee=secondariResponsibleEmployee();
    if(structuralGrsEmployee){
      workdays().forEach(d=>{
        const day=dateKey(d);
        if(!employeeActiveOn(structuralGrsEmployee,day))return;
        const items=getAssignments(structuralGrsEmployee.id,day);
        const hasGrs=items.some(a=>String(a.type||a.code||'').toUpperCase()==='GRS');
        const has118=items.some(a=>a.category==='118');
        const excused=items.some(a=>['ABS','RC','REST','FORM'].includes(a.category));
        if(!hasGrs&&!has118&&!excused){
          out.push(validation('warning','GRS feriale mancante',`${employeeName(structuralGrsEmployee)}: ${formatDateIt(day)} senza GRS e senza impiego 118/assenza protetta.`,structuralGrsEmployee.id,day));
        }
      });
    }

    const preferredSeEmployee=ordinarySecondariPreferredEmployee();"""
if marker not in app:
    raise SystemExit('validation marker not found')
app=app.replace(marker,insert,1)

# 4) Rimuovi testi/logica obsoleti che suggeriscono uso GRS in MGSE.
app=app.replace("    if(item.category==='SE'&&(e.turno==='RS'||slug(e.responsabile)==='secondari'))warnings.push('Il Responsabile Secondari viene impiegato nel servizio operativo SE solo per necessità.');\n",'',1)
app=app.replace("if(a.category==='SE'&&(e.turno==='RS'||slug(e.responsabile)==='secondari'))out.push(validation('warning','Raschi impiegato nei Secondari operativi',`${employeeName(e)} è stato utilizzato in MGSE per necessità; normalmente svolge GRS.`,e.id,day));",'',1)

APP.write_text(app,encoding='utf-8')

# 5) UI: rendi le quote min/max Admin molto visibili e aggiorna i testi del generatore.
for filename in ['admin.html','ro.html']:
    p=Path(filename)
    s=p.read_text(encoding='utf-8')
    old='''              <div class="field"><label>Giornate MGSE minime · prevalente</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field"><label>Giornate MGSE massime · prevalente</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field full"><small>Le quote mensili min/max sono modificabili dall’Admin; per il RO sono in sola lettura.</small></div>'''
    new='''              <div class="field full"><div class="section-label">Quote mensili del dipendente prevalente · ADMIN</div></div>\n              <div class="field"><label>Minimo giornate MGSE nel mese</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 8" /></div>\n              <div class="field"><label>Massimo giornate MGSE nel mese</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 12" /></div>\n              <div class="field full"><div class="notice info"><strong>Quote del prevalente:</strong> l’Admin definisce quante giornate MGSE deve svolgere almeno e al massimo nel mese. Il 118 e i vincoli protetti restano prioritari. Nel profilo RO questi valori non sono modificabili.</div></div>'''
    if old not in s:
        raise SystemExit(f'{filename}: quota UI marker not found')
    s=s.replace(old,new,1)
    s=s.replace(
      '<label class="auto-option"><input id="autoResp" type="checkbox" checked /><div><strong>Pianifica responsabili</strong><span>GRO feriali, GRS feriali e 5 giornate obiettivo per GRA/GRM.</span></div></label>',
      '<label class="auto-option"><input id="autoResp" type="checkbox" checked /><div><strong>Pianifica altre responsabilità</strong><span>GRS viene sempre pianificato nei feriali. Questa opzione gestisce GRO e le giornate obiettivo GRA/GRM.</span></div></label>',
      1
    )
    s=s.replace(
      '<label class="auto-option"><input id="autoSe" type="checkbox" checked /><div><strong>Porta i Secondari a 2 risorse feriali</strong><span>GRS non conta come risorsa operativa. ATLAS usa prima il dipendente prevalente configurato, poi le altre risorse disponibili. Il 118 mantiene sempre la priorità; Raschi passa a MGSE soltanto se necessario.</span></div></label>',
      '<label class="auto-option"><input id="autoSe" type="checkbox" checked /><div><strong>Porta i Secondari a 2 risorse feriali</strong><span>GRS non conta come risorsa operativa e non viene convertito in MGSE. ATLAS usa il dipendente prevalente entro le quote min/max configurate, poi le altre risorse disponibili. Il 118 mantiene sempre la priorità.</span></div></label>',
      1
    )
    s=s.replace('atlas/css/core.css?v=1.0.0-MGSE-COVERAGE-20260823','atlas/css/core.css?v=1.0.0-GRS-STRUCTURAL-QUOTA-2112')
    s=s.replace('atlas/js/atlas-app.js?v=1.0.0-GRS-MGSE-QUOTA-20260823','atlas/js/atlas-app.js?v=1.0.0-GRS-STRUCTURAL-QUOTA-2112')
    p.write_text(s,encoding='utf-8')

print('ATLAS GRS structural/quota UI fix applied')
