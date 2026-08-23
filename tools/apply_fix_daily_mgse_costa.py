from pathlib import Path

APP = Path('atlas/js/atlas-app.js')
HTMLS = [Path('admin.html'), Path('ro.html')]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 occurrence, found {count}')
    return text.replace(old, new, 1)


s = APP.read_text(encoding='utf-8')

# 1) Canonical configurable daily MGSE target.
s = replace_once(
    s,
    "  function preferredSecondariDayCount(employeeId){\n",
    "  function secondariDailyTarget(source=state.settings){\n"
    "    const raw=Number(source?.seTarget??source?.seMin??2);\n"
    "    return Math.max(0,Math.min(6,Math.round(Number.isFinite(raw)?raw:2)));\n"
    "  }\n\n"
    "  function preferredSecondariDayCount(employeeId){\n",
    'insert secondariDailyTarget'
)

# Shared settings: use server value unless a local admin override is needed because an old backend echoed another value.
s = replace_once(
    s,
    "    state.settings={\n      ...DEFAULT_SETTINGS,",
    "    const localDailyTarget=secondariDailyTarget(state.settings);\n"
    "    const sharedDailyRaw=Number(shared.settings.seTarget??shared.settings.seMin);\n"
    "    const sharedDailyTarget=Math.max(0,Math.min(6,Math.round(Number.isFinite(sharedDailyRaw)?sharedDailyRaw:localDailyTarget)));\n"
    "    const keepLocalDaily=state.settings.seDailyTargetLocalOverride===true&&localDailyTarget!==sharedDailyTarget;\n"
    "    const dailyTarget=keepLocalDaily?localDailyTarget:sharedDailyTarget;\n\n"
    "    state.settings={\n      ...DEFAULT_SETTINGS,",
    'applySharedSettings daily prelude'
)
s = replace_once(
    s,
    "      // Regola strutturale ATLAS: MGSE ordinario sempre 2/2.\n"
    "      // Un vecchio valore condiviso non deve riattivare il precedente minimo 1.\n"
    "      seMin:2,\n"
    "      seMax:2,\n"
    "      seTarget:2\n",
    "      // Il numero MGSE giornaliero è configurabile dall'Admin.\n"
    "      seMin:dailyTarget,\n"
    "      seMax:dailyTarget,\n"
    "      seTarget:dailyTarget,\n"
    "      seDailyTargetLocalOverride:keepLocalDaily\n",
    'remove hardcoded daily 2 applySharedSettings'
)

# Coverage/status and rules use the configured daily value.
s = replace_once(s, "    const target=weekday?2:0;", "    const target=weekday?secondariDailyTarget():0;", 'secondariDayStatus target')
s = replace_once(
    s,
    "  function renderRules(){ $('#sidebarRest').textContent=`${fmt(state.settings.minRest)} ore`;$('#sidebarSe').textContent='2 persone · riducibili per priorità 118';$('#sidebarResp').textContent=`min ${state.settings.respMin} · obiettivo ${state.settings.respGoal}`; const db=$('#dbStateText'); if(db)db.textContent=`Matrice ${state.matrixLoaded?'✓':'fallback'} · Database ${state.dbLoaded?'✓':'locale'}`; }",
    "  function renderRules(){ $('#sidebarRest').textContent=`${fmt(state.settings.minRest)} ore`;$('#sidebarSe').textContent=`${secondariDailyTarget()} persone · riducibili per priorità 118`;$('#sidebarResp').textContent=`min ${state.settings.respMin} · obiettivo ${state.settings.respGoal}`; const db=$('#dbStateText'); if(db)db.textContent=`Matrice ${state.matrixLoaded?'✓':'fallback'} · Database ${state.dbLoaded?'✓':'locale'}`; }",
    'sidebar daily target'
)

old_validation = "    workdays().forEach(d=>{const day=dateKey(d),count=rows.filter(r=>r.day===day&&r.a.category==='SE').length;if(count<2){if(required118OnDay(day))out.push(validation('info','MGSE ridotto per priorità 118',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 risorse MGSE. Riduzione ammessa perché nella giornata è richiesta copertura 118, che ha priorità.`,null,day));else out.push(validation('warning','Secondari sotto il minimo',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 persone operative in MGSE senza una fascia 118 richiesta che giustifichi la riduzione.`,null,day));}if(count>2)out.push(validation('error','Troppi dipendenti nei Secondari',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone, massimo 2.`,null,day));});"
new_validation = "    const dailySeTarget=secondariDailyTarget();\n    workdays().forEach(d=>{const day=dateKey(d),count=rows.filter(r=>r.day===day&&r.a.category==='SE').length;if(count<dailySeTarget){if(required118OnDay(day))out.push(validation('info','MGSE ridotto per priorità 118',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/${dailySeTarget} risorse MGSE. Riduzione ammessa perché nella giornata è richiesta copertura 118, che ha priorità.`,null,day));else out.push(validation('warning','Secondari sotto il minimo',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/${dailySeTarget} persone operative in MGSE senza una fascia 118 richiesta che giustifichi la riduzione.`,null,day));}if(count>dailySeTarget)out.push(validation('error','Troppi dipendenti nei Secondari',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone, massimo giornaliero configurato ${dailySeTarget}.`,null,day));});"
s = replace_once(s, old_validation, new_validation, 'validation daily target')

# 2) Preferred employee minimum must influence 118 candidate selection BEFORE MGSE is scheduled.
old_preferred = "  function ordinarySecondariPreferredEmployee(){\n    const id=String(state.settings.sePreferredEmployeeId||'');\n    const employee=id?state.employees.find(e=>e.id===id):null;\n    if(!employee)return null;\n    if(!['A','B','Libera'].includes(employee.turno))return null;\n    if(slug(employee.responsabile)==='secondari')return null;\n    return employee;\n  }\n"
new_preferred = old_preferred + "\n  function preferredSecondariNeedsReservation(){\n    const employee=ordinarySecondariPreferredEmployee();\n    if(!employee)return null;\n    const minimum=Math.max(0,Math.min(31,numeric(state.settings.sePreferredMinDays,0)));\n    if(minimum<=0)return null;\n    return preferredSecondariDayCount(employee.id)<minimum?employee:null;\n  }\n\n  function shouldPreservePreferredSecondariFrom118(employee,day){\n    const preferred=preferredSecondariNeedsReservation();\n    return !!preferred&&preferred.id===employee?.id&&!isWeekend(parseDateKey(day))&&employeeActiveOn(employee,day);\n  }\n"
s = replace_once(s, old_preferred, new_preferred, 'preferred reservation helpers')

# Scheduler target is configurable.
s = replace_once(s, "      const target=2;\n      const item={category:'SE',type:'MGSE',code:'MGSE'};", "      const target=secondariDailyTarget();\n      const item={category:'SE',type:'MGSE',code:'MGSE'};", 'scheduleSecondari daily target')

# 118 pool: first attempts preserve preferred employee; fallback can still use them.
old_pool = "  function coverageCandidatePool({emergency=false,day=''}={}){\n    if(!emergency)return state.employees.filter(e=>['A','B','Libera'].includes(e.turno));\n    // In fallback aggiunge ESCLUSIVAMENTE le responsabilità operative autorizzate\n    // (GRS/GRA/GRM/GRO) oltre alle risorse ordinarie.\n    return state.employees.filter(e=>\n      e.turno!=='Amministrazione'&&\n      (['A','B','Libera'].includes(e.turno)||!!fallbackResponsibilityCode(e,day))\n    );\n  }"
new_pool = "  function coverageCandidatePool({emergency=false,day='',preservePreferredSe=false}={}){\n    let pool;\n    if(!emergency){\n      pool=state.employees.filter(e=>['A','B','Libera'].includes(e.turno));\n    }else{\n      // In fallback aggiunge ESCLUSIVAMENTE le responsabilità operative autorizzate\n      // (GRS/GRA/GRM/GRO) oltre alle risorse ordinarie.\n      pool=state.employees.filter(e=>\n        e.turno!=='Amministrazione'&&\n        (['A','B','Libera'].includes(e.turno)||!!fallbackResponsibilityCode(e,day))\n      );\n    }\n    if(preservePreferredSe){\n      pool=pool.filter(e=>!shouldPreservePreferredSecondariFrom118(e,day));\n    }\n    return pool;\n  }"
s = replace_once(s, old_pool, new_pool, 'coverageCandidatePool reservation')
s = replace_once(
    s,
    "  function slotCandidateRanking(day,shift,slot,targetGroup,{emergency=false,ignoreSiteContinuity=false}={}){",
    "  function slotCandidateRanking(day,shift,slot,targetGroup,{emergency=false,ignoreSiteContinuity=false,preservePreferredSe=false}={}){",
    'slotCandidateRanking signature'
)
s = replace_once(s, "      pool:coverageCandidatePool({emergency,day}),", "      pool:coverageCandidatePool({emergency,day,preservePreferredSe}),", 'slotCandidateRanking pool')
s = replace_once(
    s,
    "  function solveRequiredShift(day,shift,targetGroup,{emergency=false,ignoreSiteContinuity=false,maxNodes=1800,maxMs=450,maxCandidates=8}={}){",
    "  function solveRequiredShift(day,shift,targetGroup,{emergency=false,ignoreSiteContinuity=false,preservePreferredSe=false,maxNodes=1800,maxMs=450,maxCandidates=8}={}){",
    'solveRequiredShift signature'
)
s = replace_once(
    s,
    "        candidates:slotCandidateRanking(day,shift,slot,targetGroup,{emergency,ignoreSiteContinuity}).slice(0,maxCandidates)",
    "        candidates:slotCandidateRanking(day,shift,slot,targetGroup,{emergency,ignoreSiteContinuity,preservePreferredSe}).slice(0,maxCandidates)",
    'solveRequiredShift ranking'
)

old_shift = "  function scheduleShiftCompletely(day,shift,targetGroup){\n    // 1) Tentativo ordinario con preferenza SOFT della sede settimanale.\n    let solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:false});\n    // 2) PRIORITÀ COPERTURA: se non chiude, riprova senza alcun peso Somma/Gallarate.\n    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:true,maxNodes:2400,maxMs:520,maxCandidates:10});\n    // 3) Ultimo fallback: GRS/GRA/GRM/GRO possono lasciare la responsabilità e fare 118.\n    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:true,ignoreSiteContinuity:true,maxNodes:2800,maxMs:620,maxCandidates:12});\n    if(!solved.success){\n      return{success:false,added:0,cross:0,emergency:0,missing:crewSlotsForDayShift(parseDateKey(day),shift).filter(slot=>!currentSlotOccupied(day,shift,slot)).length};\n    }\n    return{success:true,missing:0,...finalizeCoverageTrials(solved.trials)};\n  }"
new_shift = "  function scheduleShiftCompletely(day,shift,targetGroup){\n    // 1) Prima prova a preservare il dipendente prevalente MGSE se è ancora sotto il minimo mensile.\n    let solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:false,preservePreferredSe:true});\n    // 2) Stessa protezione, ma senza preferenza di continuità sede.\n    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:true,preservePreferredSe:true,maxNodes:2400,maxMs:520,maxCandidates:10});\n    // 3) PRIORITÀ 118: se serve davvero, libera anche il prevalente MGSE.\n    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:false,ignoreSiteContinuity:true,preservePreferredSe:false,maxNodes:2600,maxMs:570,maxCandidates:12});\n    // 4) Ultimo fallback: GRS/GRA/GRM/GRO possono lasciare la responsabilità e fare 118.\n    if(!solved.success)solved=solveRequiredShift(day,shift,targetGroup,{emergency:true,ignoreSiteContinuity:true,preservePreferredSe:false,maxNodes:3000,maxMs:650,maxCandidates:14});\n    if(!solved.success){\n      return{success:false,added:0,cross:0,emergency:0,missing:crewSlotsForDayShift(parseDateKey(day),shift).filter(slot=>!currentSlotOccupied(day,shift,slot)).length};\n    }\n    return{success:true,missing:0,...finalizeCoverageTrials(solved.trials)};\n  }"
s = replace_once(s, old_shift, new_shift, 'scheduleShiftCompletely reservation flow')

# Settings UI / persistence.
s = replace_once(s, "    $('#setSeMin').value=2;\n    $('#setSeMax').value=2;", "    const dailySeTarget=secondariDailyTarget();\n    $('#setSeMin').value=dailySeTarget;\n    $('#setSeMax').value=dailySeTarget;", 'openSettings daily values')
s = replace_once(
    s,
    "      const fixed=['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].includes(control.id);\n      control.disabled=isRo&&control.id!=='setSePreferredEmployee';\n      if(!isRo&&fixed)control.disabled=false;\n    });\n    ['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].forEach(id=>{const control=$('#'+id);if(control){control.readOnly=true;control.disabled=false;}});",
    "      const fixed=['setAppsScript','setHolidayRecoveryDays','setSeMax'].includes(control.id);\n      control.disabled=isRo&&control.id!=='setSePreferredEmployee';\n      if(!isRo)control.disabled=false;\n      if(!isRo&&fixed)control.disabled=false;\n    });\n    ['setAppsScript','setHolidayRecoveryDays','setSeMax'].forEach(id=>{const control=$('#'+id);if(control){control.readOnly=true;if(!isRo)control.disabled=false;}});\n    const dailyControl=$('#setSeMin');\n    if(dailyControl){dailyControl.readOnly=isRo;dailyControl.disabled=isRo;}",
    'settings role access daily target'
)
s = replace_once(s, "    const nextSettings={\n", "    const dailyTarget=Math.max(0,Math.min(6,Math.round(numeric($('#setSeMin')?.value,secondariDailyTarget()))));\n    const nextSettings={\n", 'saveSettings daily variable')
s = replace_once(s, "      seMin:2,\n      seMax:2,\n      seTarget:2,", "      seMin:dailyTarget,\n      seMax:dailyTarget,\n      seTarget:dailyTarget,", 'saveSettings daily triple')

old_ro_state = "      state.settings={...state.settings,seMin:2,seMax:2,seTarget:2,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId,sePreferredMinDays:numeric(state.settings.sePreferredMinDays,0),sePreferredMaxDays:numeric(state.settings.sePreferredMaxDays,31)};"
new_ro_state = "      const roDailyTarget=secondariDailyTarget(state.settings);\n      state.settings={...state.settings,seMin:roDailyTarget,seMax:roDailyTarget,seTarget:roDailyTarget,sePreferredEmployeeId:nextSettings.sePreferredEmployeeId,sePreferredMinDays:numeric(state.settings.sePreferredMinDays,0),sePreferredMaxDays:numeric(state.settings.sePreferredMaxDays,31)};"
s = replace_once(s, old_ro_state, new_ro_state, 'RO preserve daily target')
s = replace_once(s, "          state.settings={...state.settings,...data.sharedSettings.settings,seMin:2,seMax:2,seTarget:2};", "          const roDailyTarget=secondariDailyTarget(state.settings);\n          state.settings={...state.settings,...data.sharedSettings.settings,seMin:roDailyTarget,seMax:roDailyTarget,seTarget:roDailyTarget};", 'RO shared merge preserve daily')

old_admin_merge = "      state.settings={\n        ...nextSettings,\n        ...(data.sharedSettings?.settings||{}),\n        matrixCsvUrl:'',\n        databaseCsvUrl:'',\n        appsScriptUrl:serverUrl,\n        seMin:2,\n        seMax:2,\n        seTarget:2\n      };"
new_admin_merge = "      const serverSettings=data.sharedSettings?.settings||{};\n      const echoedDailyRaw=Number(serverSettings.seTarget??serverSettings.seMin);\n      const echoedDaily=Number.isFinite(echoedDailyRaw)?Math.max(0,Math.min(6,Math.round(echoedDailyRaw))):null;\n      const localDailyOverride=echoedDaily===null||echoedDaily!==dailyTarget;\n      state.settings={\n        ...nextSettings,\n        ...serverSettings,\n        matrixCsvUrl:'',\n        databaseCsvUrl:'',\n        appsScriptUrl:serverUrl,\n        seMin:dailyTarget,\n        seMax:dailyTarget,\n        seTarget:dailyTarget,\n        seDailyTargetLocalOverride:localDailyOverride\n      };"
s = replace_once(s, old_admin_merge, new_admin_merge, 'Admin merge preserve daily target')

APP.write_text(s, encoding='utf-8')

# HTML: one visible daily target field, monthly quota remains separate.
for p in HTMLS:
    h = p.read_text(encoding='utf-8')
    h = replace_once(
        h,
        '<summary><span><b>Secondari · MGSE</b><small>Obiettivo ordinario 2 risorse · il 118 mantiene sempre la priorità</small></span><i>⌄</i></summary>',
        '<summary><span><b>Secondari · MGSE</b><small>Numero giornaliero configurabile · il 118 mantiene sempre la priorità</small></span><i>⌄</i></summary>',
        f'{p.name} settings summary'
    )
    h = replace_once(
        h,
        '<div class="field"><label>MGSE ordinario feriale</label><input id="setSeMin" class="input" type="number" value="2" readonly /></div>\n              <div class="field"><label>MGSE massimo feriale</label><input id="setSeMax" class="input" type="number" value="2" readonly /></div>',
        '<div class="field"><label>Numero MGSE giornalieri</label><input id="setSeMin" class="input" type="number" min="0" max="6" step="1" value="2" /></div>\n              <input id="setSeMax" type="hidden" value="2" />\n              <div class="field"><label>Regola</label><div class="notice info">L’Admin imposta quante persone ATLAS prova ad assegnare ogni giorno feriale ai Secondari. Il 118 resta prioritario e può ridurre questa dotazione quando necessario.</div></div>',
        f'{p.name} daily MGSE field'
    )
    h = h.replace(
        '<div class="field full"><div class="notice warning"><strong>Regola operativa:</strong> ATLAS prova a mantenere 2 MGSE nei feriali. Può scendere sotto 2 soltanto quando le risorse sono necessarie per il 118; la pagina Coperture evidenzia il caso in arancione.</div></div>',
        '<div class="field full"><div class="notice warning"><strong>Regola operativa:</strong> ATLAS prova a mantenere il numero MGSE giornaliero configurato dall’Admin. Può scendere sotto quel valore quando le risorse sono necessarie per il 118; la pagina Coperture evidenzia il caso in arancione.</div></div>',
        1
    )
    h = h.replace(
        '<label class="auto-option"><input id="autoSe" type="checkbox" checked /><div><strong>Porta i Secondari a 2 risorse feriali</strong><span>GRS non conta come risorsa operativa e non viene convertito in MGSE. Il dipendente prevalente segue il minimo/massimo mensile configurato; il 118 mantiene sempre la priorità.</span></div></label>',
        '<label class="auto-option"><input id="autoSe" type="checkbox" checked /><div><strong>Completa i Secondari alla dotazione giornaliera configurata</strong><span>GRS non conta come risorsa operativa e non viene convertito in MGSE. Il dipendente prevalente segue il minimo/massimo mensile configurato; il 118 mantiene sempre la priorità.</span></div></label>',
        1
    )
    h = h.replace('atlas/js/atlas-app.js?v=1.0.0-GRS-MONTHLY-SAFE-20260823','atlas/js/atlas-app.js?v=1.0.0-MGSE-DAILY-PREFERRED-20260823',1)
    p.write_text(h, encoding='utf-8')

print('Patch applied')
