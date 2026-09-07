from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'
CSS=ROOT/'atlas/css/core.css'
HTMLS=[ROOT/'admin.html',ROOT/'ro.html']


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)


def sub_once(text, pattern, replacement, label, flags=0):
    updated,count=re.subn(pattern,replacement,text,count=1,flags=flags)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 replacement, found {count}')
    return updated

SETTINGS_MODAL=r'''  <div class="modal-backdrop" id="settingsModal">
    <div class="modal settings-modal settings-modal-redesign settings-control-center">
      <div class="modal-head settings-head">
        <div>
          <div class="settings-kicker">ATLAS 118 · CONTROL CENTER</div>
          <div class="modal-title">Impostazioni operative</div>
          <div class="modal-sub">Regole, orari contrattuali, permessi e automazioni organizzati per area</div>
        </div>
        <button class="modal-close" data-close="settingsModal">✕</button>
      </div>
      <div class="modal-body">
        <div class="notice info hidden" id="settingsPermissionNote"></div>

        <div class="settings-commandbar">
          <div class="settings-menu-grid" aria-label="Menu impostazioni">
            <button type="button" data-settings-jump="#settingsGeneral"><b>118</b><span>Turnazione</span></button>
            <button type="button" data-settings-jump="#settingsSecondari"><b>SE</b><span>Secondari</span></button>
            <button type="button" data-settings-jump="#settingsResponsibility"><b>R</b><span>Responsabilità</span></button>
            <button type="button" data-settings-jump="#settingsGeneration"><b>⚙</b><span>Generazione</span></button>
            <button type="button" data-settings-jump="#settingsCcnl"><b>h</b><span>Orario / CCNL</span></button>
            <button type="button" data-settings-jump="#settingsLeave"><b>P</b><span>Permessi</span></button>
            <button type="button" data-settings-jump="#settingsSystem"><b>↻</b><span>Sistema</span></button>
          </div>
          <div class="settings-expand-actions">
            <button class="btn small" id="settingsExpandAllBtn" type="button">Espandi tutto</button>
            <button class="btn small" id="settingsCollapseAllBtn" type="button">Comprimi</button>
          </div>
        </div>

        <div class="settings-accordion">
          <details class="settings-section" id="settingsGeneral" open>
            <summary><span class="settings-summary-icon">118</span><span><b>Turnazione e 118</b><small>Monte ore, riposo minimo e rotazione dei gruppi</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Monte ore mensile standard</label><input id="setTargetHours" class="input" type="number" step="0.1" min="0" /></div>
              <div class="field"><label>Riposo minimo tra servizi (ore)</label><input id="setMinRest" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field full"><label class="settings-check"><input id="setRotation" type="checkbox" /> Usa rotazione A/B settimanale</label><small>Settimane pari: A mattina / B pomeriggio; settimane dispari: inversione.</small></div>
            </div>
          </details>

          <details class="settings-section settings-section-se" id="settingsSecondari">
            <summary><span class="settings-summary-icon">SE</span><span><b>Secondari · MGSE</b><small>Dotazione giornaliera e quota mensile del dipendente prevalente</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Numero MGSE giornalieri</label><input id="setSeMin" class="input" type="number" min="0" max="6" step="1" value="2" /></div>
              <input id="setSeMax" type="hidden" value="2" />
              <div class="field"><label>Priorità</label><div class="notice info">Il 118 resta prioritario: la dotazione MGSE può essere ridotta solo quando serve alla copertura.</div></div>
              <div class="field full"><label>Dipendente prevalentemente assegnato ai Secondari</label><select id="setSePreferredEmployee" class="input"><option value="">Nessuna preferenza</option></select><small>Preferenza soft: il dipendente resta utilizzabile nel 118 se necessario.</small></div>
              <div class="field full"><div class="settings-subtitle">Quota mensile del prevalente</div></div>
              <div class="field"><label>Minimo mensile giornate MGSE</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" /></div>
              <div class="field"><label>Massimo mensile giornate MGSE</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" /></div>
            </div>
          </details>

          <details class="settings-section" id="settingsResponsibility">
            <summary><span class="settings-summary-icon">R</span><span><b>Responsabilità</b><small>Obiettivi GRA / GRM e fallback operativo</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>GRA/GRM minimo mensile</label><input id="setRespMin" class="input" type="number" min="0" /></div>
              <div class="field"><label>GRA/GRM obiettivo mensile</label><input id="setRespGoal" class="input" type="number" min="0" /></div>
              <div class="field full"><div class="notice info">GRS/GRO e le altre responsabilità restano assegnate finché il 118 è coperto; i fallback previsti possono liberarle quando necessario.</div></div>
            </div>
          </details>

          <details class="settings-section" id="settingsGeneration">
            <summary><span class="settings-summary-icon">⚙</span><span><b>Generazione automatica</b><small>Decidi quali moduli ATLAS deve proporre automaticamente</small></span><i>⌄</i></summary>
            <div class="settings-section-body settings-toggle-grid">
              <label class="settings-toggle"><input id="setAutoAdmin" type="checkbox" /><span><b>Pianifica Amministrazione</b><small>Usa le regole AM durante la generazione.</small></span></label>
              <label class="settings-toggle"><input id="setAutoResponsabili" type="checkbox" /><span><b>Pianifica responsabilità</b><small>Gestisce GRO e obiettivi GRA/GRM; GRS resta strutturale.</small></span></label>
              <label class="settings-toggle"><input id="setAutoSecondari" type="checkbox" /><span><b>Pianifica Secondari</b><small>Completa MGSE alla dotazione configurata dopo la priorità 118.</small></span></label>
              <label class="settings-toggle"><input id="setAllowRoAuto" type="checkbox" /><span><b>Consenti RO nel 118</b><small>Solo come risorsa di ultima istanza.</small></span></label>
              <label class="settings-toggle"><input id="setAutoCompensatoryRestDefault" type="checkbox" /><span><b>Riposi compensativi automatici</b><small>Imposta come predefinita la pianificazione automatica dei recuperi.</small></span></label>
              <label class="settings-toggle"><input id="setNoSplitDay" type="checkbox" /><span><b>Blocca giornata frazionata</b><small>Impedisce due prestazioni separate nello stesso giorno salvo autorizzazione.</small></span></label>
            </div>
          </details>

          <details class="settings-section" id="settingsCcnl">
            <summary><span class="settings-summary-icon">h</span><span><b>Orario, riposi e straordinario</b><small>Parametri settimanali e limiti del regime orario</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Orario settimanale standard</label><input id="setWeeklyStandard" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Minimo settimana multiperiodale</label><input id="setWeeklyMin" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Massimo settimana multiperiodale</label><input id="setWeeklyMax" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Media massima settimanale</label><input id="setWeeklyAverageMax" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Riposo settimanale complessivo</label><input id="setWeeklyRestHours" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Riposi minimi in 14 giorni</label><input id="setWeeklyRestOccurrences" class="input" type="number" min="1" max="14" /></div>
              <div class="field"><label>Straordinario annuo · soglia</label><input id="setOvertimeLimit" class="input" type="number" step="1" min="0" /></div>
              <div class="field"><label>Straordinario annuo · limite esteso</label><input id="setOvertimeExtended" class="input" type="number" step="1" min="0" /></div>
            </div>
          </details>

          <details class="settings-section" id="settingsLeave">
            <summary><span class="settings-summary-icon">P</span><span><b>Ferie, permessi e recuperi</b><small>Contatori annuali, scadenze e banca ore</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field"><label>Ferie annue standard (ore)</label><input id="setVacationAnnual" class="input" type="number" step="1" min="0" /></div>
              <div class="field"><label>Festività soppresse (ore)</label><input id="setSuppressedHolidayAnnual" class="input" type="number" step="1" min="0" /></div>
              <div class="field"><label>Permesso personale art. 33 (ore)</label><input id="setPersonalPermitAnnual" class="input" type="number" step="1" min="0" /></div>
              <div class="field"><label>Termine recupero permesso art. 33 (mesi)</label><input id="setPersonalPermitRecoveryMonths" class="input" type="number" min="0" max="24" step="1" /></div>
              <div class="field"><label>Recupero festività lavorata (giorni)</label><input id="setHolidayRecoveryDays" class="input" type="number" min="1" max="365" step="1" /><small>Scadenza entro cui ATLAS deve collocare RFS/RCF.</small></div>
              <div class="field"><label>Blocco minimo banca ore (ore)</label><input id="setBankHoursMinBlock" class="input" type="number" step="0.5" min="0" /></div>
              <div class="field"><label>Santo patrono (MM-GG)</label><input id="setPatronHoliday" class="input" placeholder="es. 07-25" /></div>
              <div class="field full"><div class="notice warning"><strong>Attenzione:</strong> questi valori modificano le regole usate da ATLAS per conteggi, scadenze e validazioni. Le assenze già registrate non vengono cancellate.</div></div>
            </div>
          </details>

          <details class="settings-section" id="settingsSystem">
            <summary><span class="settings-summary-icon">↻</span><span><b>Sistema e sincronizzazione</b><small>Dati, backup e collegamento al backend ATLAS</small></span><i>⌄</i></summary>
            <div class="settings-section-body form-grid">
              <div class="field full"><div class="notice info"><strong>Endpoint protetto:</strong> il server ATLAS resta preconfigurato e non viene modificato dalle regole operative.</div></div>
              <div class="field full"><label>Server ATLAS</label><input id="setAppsScript" class="input" readonly aria-readonly="true" /></div>
              <div class="field full settings-system-actions">
                <button class="btn small" id="importEmployeesBtn" data-access="admin">Ricarica Matrice + Database</button>
                <button class="btn small" id="downloadBackupBtn">Scarica backup JSON</button>
                <button class="btn small danger" id="resetAppBtn" data-access="admin">Ripristina dati iniziali</button>
              </div>
            </div>
          </details>
        </div>
      </div>
      <div class="modal-foot settings-foot"><span class="settings-foot-hint">Le modifiche Admin vengono condivise con il Responsabile Operativo.</span><button class="btn ghost" data-close="settingsModal">Annulla</button><button class="btn primary" id="saveSettingsBtn">Salva impostazioni</button></div>
    </div>
  </div>
'''

for path in HTMLS:
    html=path.read_text(encoding='utf-8')
    pattern=r'  <div class="modal-backdrop" id="settingsModal">.*?(?=\n\n  <div class="modal-backdrop" id="preGenerationModal">)'
    html,count=re.subn(pattern,SETTINGS_MODAL,html,count=1,flags=re.S)
    if count!=1:
        raise SystemExit(f'{path.name}: settings modal replacement count={count}')
    # Force a fresh module load after the settings redesign.
    html=html.replace('atlas/js/atlas-app.js?v=1.0.0-GRS-MGSE-QUOTA-20260823','atlas/js/atlas-app.js?v=1.0.0-ADMIN-SETTINGS-20260907')
    html=html.replace('atlas/js/atlas-app.js?v=1.0.0-MGSE-DAILY-COSTA-20260823','atlas/js/atlas-app.js?v=1.0.0-ADMIN-SETTINGS-20260907')
    path.write_text(html,encoding='utf-8')

app=APP.read_text(encoding='utf-8')

# Dynamic recovery windows: Admin settings must actually drive the rules.
app=replace_once(
    app,
    "  function rfsRecoveryWindow(sourceDay){\n    const due=addDaysKey(sourceDay,30);",
    "  function rfsRecoveryWindow(sourceDay){\n    const recoveryDays=Math.max(1,Math.round(numeric(state.settings.holidayRecoveryDays,30)));\n    const due=addDaysKey(sourceDay,recoveryDays);",
    'RFS recovery window'
)
app=app.replace(
    "`RFS maturato per festività lavorata del ${formatDateIt(entitlement.sourceDay)} · da fruire obbligatoriamente entro il ${formatDateIt(entitlement.due)} (30 giorni).`",
    "`RFS maturato per festività lavorata del ${formatDateIt(entitlement.sourceDay)} · da fruire obbligatoriamente entro il ${formatDateIt(entitlement.due)} (${Math.max(1,Math.round(numeric(state.settings.holidayRecoveryDays,30)))} giorni).`",
    1
)

old_auto_due="""  function automaticRecoveryDue(day,meta){
    if(!day||!meta?.requiresRecovery)return'';
    if(Number(meta.recoveryDeadlineDays)>0){
      return addDaysKey(day,Number(meta.recoveryDeadlineDays));
    }
    if(Number(meta.autoRecoveryMonths)>0){
      return addMonthsKey(day,Number(meta.autoRecoveryMonths));
    }
    return'';
  }"""
new_auto_due="""  function automaticRecoveryDue(day,meta){
    if(!day||!meta?.requiresRecovery)return'';
    if(Number(meta.recoveryDeadlineDays)>0){
      const days=String(meta.ccnlRef||'').includes('Art. 29')
        ?Math.max(1,Math.round(numeric(state.settings.holidayRecoveryDays,meta.recoveryDeadlineDays)))
        :Number(meta.recoveryDeadlineDays);
      return addDaysKey(day,days);
    }
    if(Number(meta.autoRecoveryMonths)>0){
      const months=String(meta.ccnlRef||'').includes('Art. 33')
        ?Math.max(0,Math.round(numeric(state.settings.personalPermitRecoveryMonths,meta.autoRecoveryMonths)))
        :Number(meta.autoRecoveryMonths);
      return addMonthsKey(day,months);
    }
    return'';
  }"""
app=replace_once(app,old_auto_due,new_auto_due,'configurable recovery due')

# Backup import must no longer overwrite the Admin recovery rule with 30.
app=replace_once(
    app,
    "state.settings={...DEFAULT_SETTINGS,...(d.settings||{}),holidayRecoveryDays:30};",
    "state.settings={...DEFAULT_SETTINGS,...(d.settings||{})};",
    'backup settings recovery rule'
)

# Populate every operational setting exposed to Admin.
app=replace_once(
    app,
    "    $('#setPersonalPermitAnnual').value=state.settings.personalPermitAnnualHours;\n    $('#setHolidayRecoveryDays').value=30;",
    "    $('#setPersonalPermitAnnual').value=state.settings.personalPermitAnnualHours;\n    $('#setPersonalPermitRecoveryMonths').value=Math.max(0,Math.round(numeric(state.settings.personalPermitRecoveryMonths,2)));\n    $('#setHolidayRecoveryDays').value=Math.max(1,Math.round(numeric(state.settings.holidayRecoveryDays,30)));",
    'open settings leave values'
)
app=replace_once(
    app,
    "    $('#setNoSplitDay').checked=state.settings.enforceNoSplitDay!==false;\n    $('#setAppsScript').value=ATLAS_SERVER_URL;\n    $('#setRotation').checked=state.settings.useABRotation;",
    "    $('#setNoSplitDay').checked=state.settings.enforceNoSplitDay!==false;\n    $('#setAutoAdmin').checked=state.settings.autoAdmin!==false;\n    $('#setAutoResponsabili').checked=state.settings.autoResponsabili!==false;\n    $('#setAutoSecondari').checked=state.settings.autoSecondari!==false;\n    $('#setAllowRoAuto').checked=state.settings.allowRoAuto===true;\n    $('#setAutoCompensatoryRestDefault').checked=state.settings.autoCompensatoryRestDefault===true;\n    $('#setAppsScript').value=ATLAS_SERVER_URL;\n    $('#setRotation').checked=state.settings.useABRotation;",
    'open settings generation values'
)

old_access="""    $$('#settingsModal input, #settingsModal select').forEach(control=>{
      const fixed=['setAppsScript','setHolidayRecoveryDays','setSeMax'].includes(control.id);
      control.disabled=isRo&&control.id!=='setSePreferredEmployee';
      if(!isRo)control.disabled=false;
      if(!isRo&&fixed)control.disabled=false;
    });
    ['setAppsScript','setHolidayRecoveryDays','setSeMax'].forEach(id=>{const control=$('#'+id);if(control){control.readOnly=true;if(!isRo)control.disabled=false;}});
    const dailyControl=$('#setSeMin');
    if(dailyControl){dailyControl.readOnly=isRo;dailyControl.disabled=isRo;}
    openModal('settingsModal');"""
new_access="""    $$('#settingsModal input, #settingsModal select').forEach(control=>{
      control.disabled=isRo&&control.id!=='setSePreferredEmployee';
      if(!isRo)control.disabled=false;
      control.readOnly=false;
    });
    const serverControl=$('#setAppsScript');
    if(serverControl){serverControl.readOnly=true;serverControl.disabled=false;}
    const dailyControl=$('#setSeMin');
    if(dailyControl){dailyControl.readOnly=isRo;dailyControl.disabled=isRo;}
    bindSettingsMenu();
    openModal('settingsModal');"""
app=replace_once(app,old_access,new_access,'Admin full settings access')

# Insert settings navigator and generation default synchronizer before openSettings.
marker="""  function openSettings(){"""
helpers="""  function bindSettingsMenu(){
    const modal=$('#settingsModal');
    if(!modal||modal.dataset.settingsMenuBound==='1')return;
    modal.dataset.settingsMenuBound='1';

    $$('[data-settings-jump]').forEach(button=>button.addEventListener('click',()=>{
      const target=$(button.dataset.settingsJump);
      if(!target)return;
      $$('#settingsModal details.settings-section').forEach(section=>{section.open=section===target;});
      requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'start'}));
    }));
    $('#settingsExpandAllBtn')?.addEventListener('click',()=>
      $$('#settingsModal details.settings-section').forEach(section=>{section.open=true;})
    );
    $('#settingsCollapseAllBtn')?.addEventListener('click',()=>
      $$('#settingsModal details.settings-section').forEach(section=>{section.open=false;})
    );
  }

  function syncGenerationOptionControls(){
    const set=(id,value)=>{const control=$(id);if(control)control.checked=!!value;};
    set('#autoAdmin',state.settings.autoAdmin!==false);
    set('#autoResp',state.settings.autoResponsabili!==false);
    set('#autoSe',state.settings.autoSecondari!==false);
    set('#autoRo',state.settings.allowRoAuto===true);
    set('#autoRc',state.settings.autoCompensatoryRestDefault===true);
  }

  function openSettings(){"""
app=replace_once(app,marker,helpers,'settings helpers')

# Save all exposed Admin parameters.
app=replace_once(
    app,
    "      personalPermitAnnualHours:\n        numeric(\n          $('#setPersonalPermitAnnual').value,\n          36\n        ),\n      holidayRecoveryDays:30,",
    "      personalPermitAnnualHours:\n        numeric(\n          $('#setPersonalPermitAnnual').value,\n          36\n        ),\n      personalPermitRecoveryMonths:\n        Math.max(0,Math.min(24,Math.round(numeric($('#setPersonalPermitRecoveryMonths').value,2)))),\n      holidayRecoveryDays:\n        Math.max(1,Math.min(365,Math.round(numeric($('#setHolidayRecoveryDays').value,30)))),",
    'save leave settings'
)
app=replace_once(
    app,
    "      enforceNoSplitDay:\n        $('#setNoSplitDay').checked,\n      matrixCsvUrl:'',",
    "      enforceNoSplitDay:\n        $('#setNoSplitDay').checked,\n      autoAdmin:$('#setAutoAdmin').checked,\n      autoResponsabili:$('#setAutoResponsabili').checked,\n      autoSecondari:$('#setAutoSecondari').checked,\n      allowRoAuto:$('#setAllowRoAuto').checked,\n      autoCompensatoryRestDefault:$('#setAutoCompensatoryRestDefault').checked,\n      matrixCsvUrl:'',",
    'save generation settings'
)

# Stronger validation for parameters that Admin can now modify.
validation_marker="""    if(nextSettings.sePreferredMinDays>nextSettings.sePreferredMaxDays){"""
validation_insert="""    if(nextSettings.weeklyMinHours>nextSettings.weeklyMaxHours){
      toast('Impostazioni non valide','Orario multiperiodale: il minimo settimanale non può superare il massimo.','error');
      return;
    }
    if(nextSettings.annualOvertimeLimit>nextSettings.annualOvertimeExtended){
      toast('Impostazioni non valide','Straordinario: la soglia annua non può superare il limite esteso.','error');
      return;
    }
    if(nextSettings.weeklyRestOccurrences14<1){
      toast('Impostazioni non valide','Imposta almeno un riposo nel periodo di 14 giorni.','error');
      return;
    }

    if(nextSettings.sePreferredMinDays>nextSettings.sePreferredMaxDays){"""
app=replace_once(app,validation_marker,validation_insert,'settings cross validation')

# Generator checkboxes must inherit Admin defaults every time generation starts.
app=replace_once(
    app,
    "$('#autoBtn').addEventListener('click',openPreGenerationWizard);",
    "$('#autoBtn').addEventListener('click',()=>{syncGenerationOptionControls();openPreGenerationWizard();});",
    'generation defaults binding'
)

APP.write_text(app,encoding='utf-8')

css=CSS.read_text(encoding='utf-8')
marker='/* ATLAS ADMIN SETTINGS CONTROL CENTER 2026-09-07 */'
if marker not in css:
    css += r'''

/* ATLAS ADMIN SETTINGS CONTROL CENTER 2026-09-07 */
.settings-control-center{width:min(1040px,calc(100vw - 26px));max-height:94vh}
.settings-control-center .modal-body{overflow:auto;padding:14px 18px 22px}
.settings-head{background:linear-gradient(110deg,rgba(14,48,67,.96),rgba(6,27,40,.96))}
.settings-kicker{margin-bottom:4px;color:#67e8f9;font-size:8px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}
.settings-commandbar{position:sticky;top:-14px;z-index:5;display:grid;gap:8px;margin:-2px 0 12px;padding:10px 0 9px;background:linear-gradient(180deg,#071d2b 72%,rgba(7,29,43,0))}
.settings-menu-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
.settings-menu-grid button{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:7px;min-width:0;padding:8px 9px;border:1px solid rgba(125,211,252,.12);border-radius:11px;background:rgba(255,255,255,.025);color:#dff6ff;text-align:left;cursor:pointer;transition:.16s ease}
.settings-menu-grid button:hover{transform:translateY(-1px);border-color:rgba(34,211,238,.34);background:rgba(34,211,238,.07)}
.settings-menu-grid button b{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:rgba(56,189,248,.10);color:#7dd3fc;font-size:9px;font-weight:950}
.settings-menu-grid button span{overflow:hidden;text-overflow:ellipsis;color:#b9d0dc;font-size:8px;font-weight:850;white-space:nowrap}
.settings-expand-actions{display:flex;justify-content:flex-end;gap:6px}
.settings-control-center .settings-accordion{gap:8px}
.settings-control-center .settings-section{scroll-margin-top:108px}
.settings-control-center .settings-section>summary{display:grid;grid-template-columns:36px minmax(0,1fr) 20px;align-items:center}
.settings-summary-icon{display:grid!important;place-items:center!important;width:32px;height:32px;border:1px solid rgba(125,211,252,.13);border-radius:10px;background:rgba(56,189,248,.07);color:#7dd3fc!important;font-size:8px!important;font-weight:950!important;letter-spacing:.02em!important}
.settings-control-center .settings-section[open] .settings-summary-icon{border-color:rgba(34,211,238,.28);background:rgba(34,211,238,.10);color:#a5f3fc!important}
.settings-subtitle{padding:8px 10px;border-left:3px solid rgba(34,211,238,.55);border-radius:7px;background:rgba(34,211,238,.055);color:#a5f3fc;font-size:8px;font-weight:950;letter-spacing:.09em;text-transform:uppercase}
.settings-toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:13px 15px 16px;border-top:1px solid rgba(125,211,252,.08)}
.settings-toggle{display:flex;align-items:flex-start;gap:10px;padding:11px;border:1px solid rgba(125,211,252,.10);border-radius:11px;background:rgba(255,255,255,.02);cursor:pointer}
.settings-toggle input{margin-top:2px}
.settings-toggle span{display:grid;gap:3px}.settings-toggle b{color:#e9f8fc;font-size:10px}.settings-toggle small{color:#7894a3;font-size:8px;line-height:1.4}
.settings-foot{gap:8px}.settings-foot-hint{margin-right:auto;color:#7693a2;font-size:8px}
body.role-ro .settings-control-center input:disabled,body.role-ro .settings-control-center select:disabled{opacity:.46;cursor:not-allowed}
@media(max-width:860px){.settings-menu-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.settings-toggle-grid{grid-template-columns:1fr}.settings-commandbar{top:-10px}.settings-control-center .settings-section{scroll-margin-top:170px}}
@media(max-width:540px){.settings-menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-expand-actions{justify-content:stretch}.settings-expand-actions .btn{flex:1}.settings-foot-hint{display:none}.settings-control-center .modal-body{padding:10px}.settings-control-center .settings-section>summary{grid-template-columns:34px minmax(0,1fr) 18px}}
'''
CSS.write_text(css,encoding='utf-8')

# Final assertions.
for path in HTMLS:
    html=path.read_text(encoding='utf-8')
    for required in ['settings-menu-grid','setPersonalPermitRecoveryMonths','setAutoAdmin','setAutoResponsabili','setAutoSecondari','setAllowRoAuto','setAutoCompensatoryRestDefault']:
        if required not in html:
            raise SystemExit(f'{path.name}: missing {required}')
    if 'id="setHolidayRecoveryDays"' not in html or 'id="setHolidayRecoveryDays" class="input" type="number" value="30" readonly' in html:
        raise SystemExit(f'{path.name}: holiday recovery must be editable')

app=APP.read_text(encoding='utf-8')
for required in ['bindSettingsMenu','syncGenerationOptionControls','personalPermitRecoveryMonths:',"autoAdmin:$('#setAutoAdmin').checked",'holidayRecoveryDays:\n        Math.max']:
    if required not in app:
        raise SystemExit(f'app missing marker: {required}')
if "$('#setHolidayRecoveryDays').value=30" in app:
    raise SystemExit('hard-coded holiday recovery remains in openSettings')
if 'state.settings={...DEFAULT_SETTINGS,...(d.settings||{}),holidayRecoveryDays:30}' in app:
    raise SystemExit('backup still forces holiday recovery to 30')

print('Admin full settings UI patch applied successfully.')
