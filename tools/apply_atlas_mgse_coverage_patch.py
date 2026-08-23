from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 exact match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 regex match, found {count}')
    return new


# ---------------------------------------------------------------------------
# Config: MGSE ordinario 2/2 + dipendente prevalente.
# ---------------------------------------------------------------------------
config = read('atlas/js/config.js')
config = replace_once(config, '    seMin: 1,\n    seMax: 2,\n    seTarget: 2,',
'''    seMin: 2,
    seMax: 2,
    seTarget: 2,
    sePreferredEmployeeId: '', ''', 'config MGSE defaults')
write('atlas/js/config.js', config)


# ---------------------------------------------------------------------------
# HTML condiviso Admin / RO: impostazioni a fisarmonica + Coperture compatte.
# ---------------------------------------------------------------------------
settings_modal = r'''  <div class="modal-backdrop" id="settingsModal">
    <div class="modal settings-modal settings-modal-redesign">
      <div class="modal-head">
        <div>
          <div class="modal-title">Impostazioni ATLAS 118</div>
          <div class="modal-sub">Regole operative organizzate per area · apri solo la sezione che ti serve</div>
        </div>
        <button class="modal-close" data-close="settingsModal">✕</button>
      </div>
      <div class="modal-body">
        <div class="notice info hidden" id="settingsPermissionNote"></div>
        <div class="settings-accordion">
          <details class="settings-section" open>
            <summary><span><b>Turnazione e 118</b><small>Monte ore, riposi e rotazione A/B</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Monte ore mensile</label><input id="setTargetHours" class="input" type="number" step="0.1" /></div>
              <div class="field"><label>Riposo minimo (ore)</label><input id="setMinRest" class="input" type="number" step="0.5" /></div>
              <div class="field full"><label class="settings-check"><input id="setRotation" type="checkbox" /> Usa rotazione A/B settimanale (settimane pari A=M, B=P; dispari B=M, A=P)</label></div>
            </div>
          </details>

          <details class="settings-section settings-section-se" open>
            <summary><span><b>Secondari · MGSE</b><small>Obiettivo ordinario 2 risorse · il 118 mantiene sempre la priorità</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>MGSE ordinario feriale</label><input id="setSeMin" class="input" type="number" value="2" readonly /></div>
              <div class="field"><label>MGSE massimo feriale</label><input id="setSeMax" class="input" type="number" value="2" readonly /></div>
              <div class="field full">
                <label>Dipendente prevalentemente assegnato ai Secondari</label>
                <select id="setSePreferredEmployee" class="input"><option value="">Nessuna preferenza</option></select>
                <small>È una preferenza soft: ferie, riposi, vincoli e soprattutto la copertura 118 hanno priorità. Se necessario, il dipendente può essere utilizzato nel 118.</small>
              </div>
              <div class="field full"><div class="notice warning"><strong>Regola operativa:</strong> ATLAS prova a mantenere 2 MGSE nei feriali. Può scendere sotto 2 soltanto quando le risorse sono necessarie per il 118; la pagina Coperture evidenzia il caso in arancione.</div></div>
            </div>
          </details>

          <details class="settings-section">
            <summary><span><b>Responsabilità</b><small>GRA / GRM e obiettivi mensili</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>GRA/GRM minimo</label><input id="setRespMin" class="input" type="number" min="0" /></div>
              <div class="field"><label>GRA/GRM obiettivo</label><input id="setRespGoal" class="input" type="number" min="0" /></div>
              <div class="field full"><div class="notice info">Le giornate GRS, GRA, GRM e GRO restano responsabilità finché il 118 è coperto; possono essere convertite dal fallback emergenziale quando servono a chiudere un ruolo 118.</div></div>
            </div>
          </details>

          <details class="settings-section">
            <summary><span><b>Orario e CCNL</b><small>Settimane, media, riposi e straordinario</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Orario settimanale standard</label><input id="setWeeklyStandard" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Minimo settimana multiperiodale</label><input id="setWeeklyMin" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Massimo settimana multiperiodale</label><input id="setWeeklyMax" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Media massima settimanale</label><input id="setWeeklyAverageMax" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Riposo settimanale complessivo</label><input id="setWeeklyRestHours" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Riposi minimi in 14 giorni</label><input id="setWeeklyRestOccurrences" class="input" type="number" min="1" max="4" /></div>
              <div class="field"><label>Straordinario annuo · soglia</label><input id="setOvertimeLimit" class="input" type="number" step="1" /></div>
              <div class="field"><label>Straordinario annuo · limite esteso</label><input id="setOvertimeExtended" class="input" type="number" step="1" /></div>
              <div class="field full"><label class="settings-check"><input id="setNoSplitDay" type="checkbox" /> Blocca le giornate lavorative frazionate, salvo autorizzazione esplicita</label></div>
            </div>
          </details>

          <details class="settings-section">
            <summary><span><b>Ferie, permessi e recuperi</b><small>Contatori annuali e regole di recupero</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Ferie annue standard (ore)</label><input id="setVacationAnnual" class="input" type="number" step="1" /></div>
              <div class="field"><label>Festività soppresse (ore)</label><input id="setSuppressedHolidayAnnual" class="input" type="number" step="1" /></div>
              <div class="field"><label>Permesso personale art. 33 (ore)</label><input id="setPersonalPermitAnnual" class="input" type="number" step="1" /></div>
              <div class="field"><label>Recupero festività</label><input id="setHolidayRecoveryDays" class="input" type="number" value="30" readonly /><small>30 giorni fissi dalla festività · Art. 29 CCNL</small></div>
              <div class="field"><label>Blocco minimo banca ore (ore)</label><input id="setBankHoursMinBlock" class="input" type="number" step="0.5" /></div>
              <div class="field"><label>Santo patrono (MM-GG)</label><input id="setPatronHoliday" class="input" placeholder="es. 07-25" /></div>
            </div>
          </details>

          <details class="settings-section">
            <summary><span><b>Sistema e sincronizzazione</b><small>Server ATLAS, backup e ricarica dati</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field full"><div class="notice info"><strong>Lettura protetta:</strong> Matrice e Database vengono caricati tramite la sessione Apps Script. I collegamenti CSV pubblici non vengono utilizzati.</div></div>
              <div class="field full"><label>Server ATLAS preconfigurato</label><input id="setAppsScript" class="input" readonly aria-readonly="true" /></div>
              <div class="field full settings-system-actions">
                <button class="btn small" id="importEmployeesBtn" data-access="admin">Ricarica Matrice + Database</button>
                <button class="btn small" id="downloadBackupBtn">Scarica backup JSON</button>
                <button class="btn small danger" id="resetAppBtn" data-access="admin">Ripristina dati iniziali</button>
              </div>
            </div>
          </details>
        </div>
      </div>
      <div class="modal-foot"><button class="btn ghost" data-close="settingsModal">Annulla</button><button class="btn primary" id="saveSettingsBtn">Salva impostazioni</button></div>
    </div>
  </div>


'''

for html_path in ('ro.html', 'admin.html'):
    html = read(html_path)
    html = sub_once(
        html,
        r'  <div class="modal-backdrop" id="settingsModal">.*?(?=  <div class="modal-backdrop" id="preGenerationModal">)',
        settings_modal,
        f'{html_path} settings modal',
        flags=re.S,
    )
    html = replace_once(
        html,
        '<option value="weekends">Solo weekend</option></select>',
        '<option value="weekends">Solo weekend</option><option value="se-reduced">MGSE ridotti</option></select>',
        f'{html_path} coverage filter',
    )
    html = html.replace('id="sidebarSe">1–2 persone', 'id="sidebarSe">2 persone · priorità 118')
    html = html.replace('Secondari tra 1 e 2 risorse feriali.', 'Secondari ordinariamente a 2 risorse feriali; riduzione ammessa solo per priorità 118.')
    html = html.replace('Raschi passa a MGSE soltanto se non si raggiunge il minimo con altri dipendenti.', 'ATLAS usa prima il dipendente prevalente configurato, poi le altre risorse disponibili. Il 118 mantiene sempre la priorità; Raschi passa a MGSE soltanto se necessario.')
    html = html.replace('atlas/css/core.css?v=1.0.0-final-generator-fix-20260810', 'atlas/css/core.css?v=1.0.0-MGSE-COVERAGE-20260823')
    html = html.replace('atlas/js/atlas-app.js?v=1.0.0-COVERAGE-FIRST-1620', 'atlas/js/atlas-app.js?v=1.0.0-MGSE-COVERAGE-20260823')
    if html_path == 'ro.html':
        html = replace_once(html, 'id="settingsBtn" data-access="admin" title="Impostazioni"', 'id="settingsBtn" title="Impostazioni operative"', 'RO settings access')
    write(html_path, html)


# ---------------------------------------------------------------------------
# JS: setting condiviso, generazione 118 prima dei Secondari, UI Coperture.
# ---------------------------------------------------------------------------
app = read('atlas/js/atlas-app.js')

app = replace_once(
    app,
    "    'seTarget',\n    'respMin',",
    "    'seTarget',\n    'sePreferredEmployeeId',\n    'respMin',",
    'shared key sePreferredEmployeeId',
)

# Pianificatore Secondari: preferenza soft, poi risorse del gruppo, poi fallback.
new_schedule_secondari = r'''  function scheduleSecondari(){
    let added=0;
    workdays().forEach(d=>{
      const day=dateKey(d);
      let count=state.employees.reduce((n,e)=>n+getAssignments(e.id,day).filter(a=>a.category==='SE').length,0);
      const target=2;
      const item={category:'SE',type:'MGSE',code:'MGSE'};
      const preferredId=String(state.settings.sePreferredEmployeeId||'');
      const preferredEmployee=preferredId?state.employees.find(e=>e.id===preferredId):null;

      if(count<target&&preferredEmployee&&employeeActiveOn(preferredEmployee,day)&&preferredEmployee.turno!=='Amministrazione'){
        const preferredItem={...item,preferredSecondari:true,note:'Dipendente prevalente Secondari · preferenza organizzativa soft'};
        const check=checkCandidate(preferredEmployee,day,preferredItem);
        if(!check.errors.length){
          addAuto(preferredEmployee,day,preferredItem);
          added++;
          count++;
        }
      }

      const pref=preferredGroup(d,'M');
      while(count<target){
        let pool=state.employees.filter(e=>e.turno===pref||e.turno==='Libera');
        let employee=chooseCandidate(day,item,{preferred:pref,pool});
        if(!employee){
          pool=state.employees.filter(e=>['A','B','Libera'].includes(e.turno));
          employee=chooseCandidate(day,item,{preferred:pref,pool});
        }
        if(!employee)break;
        addAuto(employee,day,item);
        added++;
        count++;
      }

      if(count<target){
        const raschi=state.employees.find(e=>slug(e.responsabile)==='secondari'||e.turno==='RS');
        if(raschi){
          const grs=getAssignments(raschi.id,day).find(a=>a.type==='GRS');
          if(!grs||(!grs.locked&&sourceLabel(grs)==='AUTO')){
            removeAutoGrsForRaschi(raschi,day);
            const emergencyItem={category:'SE',type:'MGSE',code:'MGSE',raschiEmergency:true,note:'Responsabile Secondari impiegato operativamente per necessità'};
            if(checkCandidate(raschi,day,emergencyItem).errors.length===0){
              addAuto(raschi,day,emergencyItem);
              added++;
              count++;
            }
          }
        }
      }
    });
    return added;
  }
'''
app = sub_once(
    app,
    r'  function scheduleSecondari\(\)\{.*?\n  \}\n(?=  function currentSlotOccupied)',
    new_schedule_secondari,
    'scheduleSecondari replacement',
    flags=re.S,
)

# Il 118 viene composto prima di impegnare risorse su MGSE.
old_generation_order = '''      if(admin){updateGeneration(15,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}
      if(resp){updateGeneration(24,'Pianificazione giornate responsabili…');added+=scheduleFixedResponsibles();await yieldUi();ensureGenerationNotCancelled();}
      if(se){updateGeneration(34,'Pianificazione Secondari…');added+=scheduleSecondari();await yieldUi();ensureGenerationNotCancelled();}

      updateGeneration(42,'Composizione equipaggi 118…');
      r=await schedule118({
        allowRo,
        onProgress:(done,total)=>
          updateGeneration(42+(done/total)*30,`Composizione equipaggi 118 · giorno ${done}/${total}`)
      });
      added+=r.added;

      updateGeneration(73,'Riequilibrio delle ore settimanali…');'''
new_generation_order = '''      if(admin){updateGeneration(14,'Pianificazione amministrazione…');added+=scheduleAdmin();await yieldUi();ensureGenerationNotCancelled();}
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

      updateGeneration(73,'Riequilibrio delle ore settimanali…');'''
app = replace_once(app, old_generation_order, new_generation_order, 'generation priority order')

# Helper live per distinguere MGSE ordinario e riduzione per priorità 118.
coverage_helpers = r'''  function required118OnDay(day){
    return ['M','P','N'].some(shift=>state.requirements[`${day}|${shift}`]==='required');
  }
  function secondariDayStatus(day){
    const employees=rowsForDay(day).filter(r=>r.a.category==='SE');
    const count=employees.length;
    const target=2;
    const reduced=count<target&&required118OnDay(day);
    return{
      count,target,reduced,
      tone:count>=target?'ok':reduced?'reduced':'bad',
      employees,
      label:count>=target?'MGSE ordinario':reduced?'MGSE ridotto · priorità 118':'MGSE sotto minimo'
    };
  }
'''
app = replace_once(app, '  function crewHtml(name,roles){', coverage_helpers + '  function crewHtml(name,roles){', 'coverage helpers insertion')

new_render_coverage = r'''  function renderCoverage(){
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
          <div class="coverage-se-chip ${se.tone}"><span>MGSE</span><b>${se.count}/${se.target}</b><small>${esc(se.label)}</small></div>
          <span class="coverage-expand">⌄</span>
        </summary>
        <div class="coverage-day-detail">
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
'''
app = sub_once(
    app,
    r'  function renderCoverage\(\)\{.*?\n  function renderCcnlDashboard\(\)\{',
    new_render_coverage + '  function renderCcnlDashboard(){',
    'renderCoverage replacement',
    flags=re.S,
)

# Validazione MGSE: sotto 2 è consentito/esplicitato quando il 118 è richiesto.
old_validation = """    workdays().forEach(d=>{const day=dateKey(d),count=rows.filter(r=>r.day===day&&r.a.category==='SE').length;if(count<state.settings.seMin)out.push(validation('warning','Secondari sotto il minimo',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone operative in SE, minimo ${state.settings.seMin}. GRS non viene conteggiato.`,null,day));if(count>state.settings.seMax)out.push(validation('error','Troppi dipendenti nei Secondari',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone, massimo ${state.settings.seMax}.`,null,day));});"""
new_validation = """    workdays().forEach(d=>{const day=dateKey(d),count=rows.filter(r=>r.day===day&&r.a.category==='SE').length;if(count<2){if(required118OnDay(day))out.push(validation('info','MGSE ridotto per priorità 118',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 risorse MGSE. Riduzione ammessa perché nella giornata è richiesta copertura 118, che ha priorità.`,null,day));else out.push(validation('warning','Secondari sotto il minimo',`${DOW[d.getDay()]} ${d.getDate()}: ${count}/2 persone operative in MGSE senza una fascia 118 richiesta che giustifichi la riduzione.`,null,day));}if(count>2)out.push(validation('error','Troppi dipendenti nei Secondari',`${DOW[d.getDay()]} ${d.getDate()}: ${count} persone, massimo 2.`,null,day));});"""
app = replace_once(app, old_validation, new_validation, 'SE validation')

# Sidebar: regola fissa 2, con possibilità di riduzione per il 118.
app = replace_once(
    app,
    "$('#sidebarSe').textContent=`${state.settings.seMin}–${state.settings.seMax} persone`;",
    "$('#sidebarSe').textContent='2 persone · riducibili per priorità 118';",
    'sidebar SE rule',
)

# Settings: popola dipendente prevalente e limita il RO alla sola impostazione operativa.
new_open_settings = r'''  function openSettings(){
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
      .filter(e=>e.attivo!==false&&e.turno!=='Amministrazione')
      .sort((a,b)=>employeeName(a).localeCompare(employeeName(b),'it'))
      .map(e=>`<option value="${esc(e.id)}">${esc(employeeName(e))} · ${esc(e.turno)}</option>`).join('');
    preferred.value=String(state.settings.sePreferredEmployeeId||'');

    const note=$('#settingsPermissionNote');
    if(note){
      note.classList.toggle('hidden',!isRo);
      note.innerHTML=isRo?'<strong>Profilo Responsabile Operativo:</strong> puoi scegliere il dipendente prevalente MGSE. Gli altri parametri sono visibili in sola lettura.':'';
    }
    $$('#settingsModal input, #settingsModal select').forEach(control=>{
      const fixed=['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].includes(control.id);
      control.disabled=isRo&&control.id!=='setSePreferredEmployee';
      if(!isRo&&fixed)control.disabled=false;
    });
    ['setAppsScript','setHolidayRecoveryDays','setSeMin','setSeMax'].forEach(id=>{const control=$('#'+id);if(control){control.readOnly=true;control.disabled=false;}});
    openModal('settingsModal');
  }
'''
app = sub_once(
    app,
    r'  function openSettings\(\)\{.*?\n  \}\n(?=  async function saveSettings\(\)\{)',
    new_open_settings,
    'openSettings replacement',
    flags=re.S,
)

# Forza 2/2 e salva la preferenza.
app = replace_once(
    app,
    "      seMin:\n        numeric(\n          $('#setSeMin').value\n        ),\n      seMax:\n        numeric(\n          $('#setSeMax').value\n        ),\n      seTarget:\n        Math.min(\n          numeric(\n            $('#setSeMax').value\n          ),\n          2\n        ),",
    "      seMin:2,\n      seMax:2,\n      seTarget:2,\n      sePreferredEmployeeId:\n        $('#setSePreferredEmployee')?.value||'',",
    'saveSettings MGSE fields',
)

# Il RO può salvare la preferenza anche se il backend corrente non autorizza saveSettings.
ro_fallback_marker = """    const button=\n      $('#saveSettingsBtn');"""
ro_fallback = """    const isRo=String(auth.user?.profileType||'').toUpperCase()==='RO';
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
      $('#saveSettingsBtn');"""
app = replace_once(app, ro_fallback_marker, ro_fallback, 'RO settings save fallback')

# Testo generatore coerente con il nuovo ordine.
app = app.replace(
    "<strong>Priorità organizzativa: coprire tutti i ruoli 118.</strong>",
    "<strong>Priorità organizzativa: coprire tutti i ruoli 118 prima di impegnare risorse sui Secondari.</strong>"
)

write('atlas/js/atlas-app.js', app)


# ---------------------------------------------------------------------------
# CSS: fisarmonica Impostazioni + dashboard Coperture.
# ---------------------------------------------------------------------------
css_path = 'atlas/css/core.css'
css = read(css_path)
marker = '/* ATLAS MGSE SETTINGS + COVERAGE DASHBOARD 2026-08-23 */'
if marker not in css:
    css += r'''

/* ATLAS MGSE SETTINGS + COVERAGE DASHBOARD 2026-08-23 */
.settings-modal-redesign{width:min(900px,calc(100vw - 28px));max-height:min(92vh,980px)}
.settings-modal-redesign .modal-body{padding:14px 18px 20px;background:linear-gradient(180deg,rgba(7,26,39,.65),rgba(4,18,28,.35))}
.settings-accordion{display:grid;gap:9px;margin-top:10px}
.settings-section{overflow:hidden;border:1px solid rgba(125,211,252,.12);border-radius:14px;background:rgba(255,255,255,.025);transition:border-color .18s ease,background .18s ease}
.settings-section[open]{border-color:rgba(56,189,248,.24);background:rgba(14,51,70,.34)}
.settings-section-se[open]{border-color:rgba(34,211,238,.30);box-shadow:inset 0 0 0 1px rgba(34,211,238,.035)}
.settings-section>summary{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px;cursor:pointer;list-style:none;user-select:none}
.settings-section>summary::-webkit-details-marker{display:none}
.settings-section>summary span{display:grid;gap:3px}
.settings-section>summary b{font-size:12px;color:#eef9fd;letter-spacing:.01em}
.settings-section>summary small{font-size:9px;line-height:1.4;color:#7894a3}
.settings-section>summary i{font-style:normal;color:#7dd3fc;font-size:16px;transition:transform .18s ease}
.settings-section[open]>summary i{transform:rotate(180deg)}
.settings-section-body{padding:4px 15px 16px;border-top:1px solid rgba(125,211,252,.08)}
.settings-check{display:flex!important;align-items:center;gap:9px;text-transform:none!important;letter-spacing:0!important;line-height:1.45}
.settings-system-actions{display:flex;gap:8px;flex-wrap:wrap}
body.role-ro .settings-section:not(.settings-section-se) .input:disabled,
body.role-ro .settings-section:not(.settings-section-se) input:disabled{opacity:.58;cursor:not-allowed}

.coverage-grid{display:block!important;padding:14px!important}
.coverage-dashboard-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.coverage-dashboard-kpis article{min-width:0;padding:13px 14px;border:1px solid rgba(125,211,252,.11);border-radius:14px;background:rgba(255,255,255,.025)}
.coverage-dashboard-kpis span{display:block;color:#7d98a7;font-size:8px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.coverage-dashboard-kpis strong{display:block;margin-top:5px;color:#eefaff;font-size:23px;line-height:1;font-weight:950}
.coverage-dashboard-kpis small{display:block;margin-top:5px;color:#6f8c9b;font-size:8px;line-height:1.35}
.coverage-dashboard-kpis article.bad strong{color:#fb7185}.coverage-dashboard-kpis article.warn strong{color:#fbbf24}.coverage-dashboard-kpis article.good strong{color:#6ee7b7}
.coverage-dashboard-list{display:grid;gap:8px}
.coverage-day-row{overflow:hidden;border:1px solid rgba(125,211,252,.10);border-left:3px solid rgba(110,231,183,.55);border-radius:14px;background:rgba(6,25,37,.74)}
.coverage-day-row.bad{border-left-color:#fb7185}.coverage-day-row.warn{border-left-color:#fbbf24}.coverage-day-row.reduced{border-left-color:#fb923c}
.coverage-day-summary{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(190px,1fr) minmax(180px,.8fr) 22px;align-items:center;gap:12px;padding:11px 13px;cursor:pointer;list-style:none}
.coverage-day-summary::-webkit-details-marker{display:none}
.coverage-date-block{display:grid;gap:3px}.coverage-date-block>b{font-size:11px;color:#f1f9fc;text-transform:capitalize}.coverage-date-block>span{font-size:8px;color:#6f8c9b}
.coverage-shift-strip{display:flex;gap:6px;flex-wrap:wrap}.coverage-shift-chip{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:47px;padding:5px 7px;border-radius:9px;border:1px solid rgba(145,188,214,.12);font-size:8px;font-weight:900;background:rgba(255,255,255,.025);color:#718c9b}.coverage-shift-chip b{font-size:9px}.coverage-shift-chip.ok{color:#7ce8b7;background:rgba(52,211,153,.07);border-color:rgba(52,211,153,.15)}.coverage-shift-chip.bad{color:#ff9cad;background:rgba(251,113,133,.08);border-color:rgba(251,113,133,.18)}.coverage-shift-chip.idle{opacity:.62}
.coverage-se-chip{display:grid;grid-template-columns:auto auto;align-items:center;justify-content:start;column-gap:7px;row-gap:2px;padding:7px 9px;border-radius:10px;background:rgba(52,211,153,.065);border:1px solid rgba(52,211,153,.14)}.coverage-se-chip span{font-size:7px;color:#7894a3;font-weight:900;letter-spacing:.08em}.coverage-se-chip b{font-size:12px;color:#7ce8b7}.coverage-se-chip small{grid-column:1/-1;font-size:7px;color:#6f8c9b}.coverage-se-chip.reduced{background:rgba(251,146,60,.08);border-color:rgba(251,146,60,.2)}.coverage-se-chip.reduced b{color:#fdba74}.coverage-se-chip.bad{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.19)}.coverage-se-chip.bad b{color:#fcd34d}
.coverage-expand{justify-self:end;color:#6f8c9b;font-size:14px;transition:transform .18s ease}.coverage-day-row[open] .coverage-expand{transform:rotate(180deg)}
.coverage-day-detail{display:grid;gap:9px;padding:0 13px 13px;border-top:1px solid rgba(125,211,252,.07)}.coverage-day-detail .shift-coverage.compact{margin-top:9px;padding:10px;border-radius:12px;background:rgba(255,255,255,.018)}
.coverage-priority-note{margin-top:10px;padding:9px 11px;border:1px solid rgba(251,146,60,.20);border-radius:10px;background:rgba(251,146,60,.075);color:#fdba74;font-size:9px;line-height:1.45}.coverage-priority-note.danger{border-color:rgba(251,113,133,.18);background:rgba(251,113,133,.07);color:#fda4af}
@media(max-width:900px){.coverage-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.coverage-day-summary{grid-template-columns:1fr auto}.coverage-shift-strip{grid-column:1}.coverage-se-chip{grid-column:2;grid-row:1/3}.coverage-expand{display:none}}
@media(max-width:560px){.coverage-dashboard-kpis{grid-template-columns:1fr 1fr}.coverage-day-summary{grid-template-columns:1fr}.coverage-se-chip{grid-column:1;grid-row:auto}.settings-modal-redesign .modal-body{padding:10px}.settings-section>summary{padding:12px}.settings-section-body{padding:4px 12px 14px}}
'''
write(css_path, css)

print('ATLAS patch applied successfully.')
