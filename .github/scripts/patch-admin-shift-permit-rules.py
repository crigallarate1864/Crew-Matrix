from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'
CONFIG=ROOT/'atlas/js/config.js'
CSS=ROOT/'atlas/css/core.css'
HTMLS=[ROOT/'admin.html',ROOT/'ro.html']


def replace_once(text, old, new, label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)

# ---- config.js: complete operational defaults ----
config=CONFIG.read_text(encoding='utf-8')
config=replace_once(
    config,
    "    autoCompensatoryRestDefault: false\n  };",
    """    autoCompensatoryRestDefault: false,
    personalPermitDailyMaxRatio: 0.5,
    seriousReasonsMaxDaysAnnual: 5,
    bereavementEventWindowDays: 7,
    shiftTemplates: {
      WD_M:{start:'06:00',end:'13:30',hours:7.5},
      WD_P:{start:'13:00',end:'20:30',hours:7.5},
      WD_N:{start:'20:30',end:'06:00',hours:9.5,nextDay:true},
      SAT_M:{start:'06:00',end:'13:30',hours:7.5},
      SAT_P:{start:'13:00',end:'20:00',hours:7},
      SAT_N:{start:'20:00',end:'08:00',hours:12,nextDay:true},
      SUN_M:{start:'08:00',end:'14:00',hours:6},
      SUN_P:{start:'14:00',end:'20:00',hours:6},
      SUN_N:{start:'20:00',end:'06:00',hours:10,nextDay:true},
      MGSE:{start:'06:00',end:'13:30',hours:7.5},
      RESP:{start:'08:00',end:'17:00',hours:7.5},
      AM7:{start:'08:00',end:'15:00',hours:7},
      AM85:{start:'08:00',end:'17:00',hours:8.5},
      AM4:{start:'08:00',end:'12:00',hours:4},
      OP_GM:{start:'08:00',end:'14:00',hours:6},
      OP_GP:{start:'14:00',end:'20:00',hours:6},
      OP_GN:{start:'20:00',end:'08:00',hours:12,nextDay:true},
      OP_GG:{start:'08:00',end:'20:00',hours:12},
      OP_GSA:{start:'08:00',end:'20:00',hours:12},
      OP_GSC:{start:'08:00',end:'20:00',hours:12},
      OP_GSS:{start:'08:00',end:'20:00',hours:12},
      OP_N:{start:'20:00',end:'08:00',hours:12,nextDay:true},
      OP_NS:{start:'20:00',end:'08:00',hours:12,nextDay:true}
    }
  };""",
    'default advanced settings'
)
CONFIG.write_text(config,encoding='utf-8')

# ---- HTML: quick menu + shift templates + numeric permit rules ----
SHIFT_SECTION=r'''

          <details class="settings-section settings-section-times" id="settingsShiftTimes">
            <summary><span class="settings-summary-icon">⏱</span><span><b>Orari turni</b><small>Fasce orarie e ore riconosciute usate dal generatore</small></span><i>⌄</i></summary>
            <div class="settings-section-body">
              <div class="notice info settings-times-note">Modifica il template standard. Le assegnazioni inserite manualmente con un orario personalizzato mantengono il proprio orario.</div>
              <div class="settings-times-table-wrap">
                <table class="settings-times-table">
                  <thead><tr><th>Turno</th><th>Inizio</th><th>Fine</th><th>Ore riconosciute</th></tr></thead>
                  <tbody>
                    <tr class="settings-times-group"><th colspan="4">118 · fasce ordinarie</th></tr>
                    <tr data-shift-template="WD_M"><th>Feriale M</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="WD_P"><th>Feriale P</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="WD_N"><th>Feriale N</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SAT_M"><th>Sabato M</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SAT_P"><th>Sabato P</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SAT_N"><th>Sabato N</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SUN_M"><th>Domenica M</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SUN_P"><th>Domenica P</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="SUN_N"><th>Domenica N</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr class="settings-times-group"><th colspan="4">Attività interne</th></tr>
                    <tr data-shift-template="MGSE"><th>MGSE</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="RESP"><th>GRA / GRM / GRS / GRO / RO</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="AM7"><th>AM7</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="AM85"><th>AM8,5</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="AM4"><th>AM4</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr class="settings-times-group"><th colspan="4">Sigle operative</th></tr>
                    <tr data-shift-template="OP_GM"><th>GM</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GP"><th>GP</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GN"><th>GN</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GG"><th>GG</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GSA"><th>GSA</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GSC"><th>GSC</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_GSS"><th>GSS</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_N"><th>N operativo</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                    <tr data-shift-template="OP_NS"><th>NS</th><td><input class="input" data-shift-part="start" type="time" /></td><td><input class="input" data-shift-part="end" type="time" /></td><td><input class="input" data-shift-part="hours" type="number" min="0" step="0.25" /></td></tr>
                  </tbody>
                </table>
              </div>
              <div class="notice info settings-times-foot">Il turno <strong>P+N</strong> viene calcolato automaticamente sommando le ore riconosciute di P e N della stessa giornata.</div>
            </div>
          </details>'''

for path in HTMLS:
    html=path.read_text(encoding='utf-8')
    html=replace_once(
        html,
        '<button type="button" data-settings-jump="#settingsGeneral"><b>118</b><span>Turnazione</span></button>\n            <button type="button" data-settings-jump="#settingsSecondari"><b>SE</b><span>Secondari</span></button>',
        '<button type="button" data-settings-jump="#settingsGeneral"><b>118</b><span>Turnazione</span></button>\n            <button type="button" data-settings-jump="#settingsShiftTimes"><b>⏱</b><span>Orari turni</span></button>\n            <button type="button" data-settings-jump="#settingsSecondari"><b>SE</b><span>Secondari</span></button>',
        f'{path.name} quick menu shift times'
    )
    marker='''          </details>\n\n          <details class="settings-section settings-section-se" id="settingsSecondari">'''.replace('\\n','\n')
    html=replace_once(html,marker,'          </details>'+SHIFT_SECTION+'\n\n          <details class="settings-section settings-section-se" id="settingsSecondari">',f'{path.name} shift section')
    leave_anchor='<div class="field"><label>Permesso personale art. 33 (ore)</label><input id="setPersonalPermitAnnual" class="input" type="number" step="1" min="0" /></div>\n              <div class="field"><label>Termine recupero permesso art. 33 (mesi)</label>'
    leave_new='<div class="field"><label>Permesso personale art. 33 (ore)</label><input id="setPersonalPermitAnnual" class="input" type="number" step="1" min="0" /></div>\n              <div class="field"><label>Quota massima giornaliera art. 33</label><input id="setPersonalPermitDailyMaxRatio" class="input" type="number" min="0" max="1" step="0.05" /><small>0,50 = massimo metà dell’orario giornaliero.</small></div>\n              <div class="field"><label>Gravi ragioni · giorni massimi annui</label><input id="setSeriousReasonsMaxDaysAnnual" class="input" type="number" min="0" max="365" step="1" /></div>\n              <div class="field"><label>Lutto · finestra dall’evento (giorni)</label><input id="setBereavementEventWindowDays" class="input" type="number" min="0" max="365" step="1" /></div>\n              <div class="field"><label>Termine recupero permesso art. 33 (mesi)</label>'
    html=replace_once(html,leave_anchor,leave_new,f'{path.name} permit rules')
    html=html.replace('atlas/js/atlas-app.js?v=1.0.0-ADMIN-SETTINGS-20260907','atlas/js/atlas-app.js?v=1.0.0-ADMIN-RULES-20260907')
    path.write_text(html,encoding='utf-8')

# ---- atlas-app.js ----
app=APP.read_text(encoding='utf-8')

# Shared settings include advanced rules.
app=replace_once(
    app,
    "    'autoCompensatoryRestDefault'\n  ];",
    "    'autoCompensatoryRestDefault',\n    'personalPermitDailyMaxRatio',\n    'seriousReasonsMaxDaysAnnual',\n    'bereavementEventWindowDays',\n    'shiftTemplates'\n  ];",
    'shared advanced keys'
)

# Fix the remaining local-state hard reset to 30 days.
app=replace_once(
    app,
    "      state.settings={...DEFAULT_SETTINGS,...(data.settings||{}),holidayRecoveryDays:30};",
    "      state.settings={...DEFAULT_SETTINGS,...(data.settings||{})};",
    'loadState recovery override'
)

# Replace shiftWindow with a settings-driven implementation.
shift_pattern=r"  function shiftWindow\(type,day,customStart,customEnd\)\{.*?\n  \}\n  function getDateTime"
shift_replacement="""  function shiftTemplateKey(type,dow,category=''){
    const code=String(type||'').toUpperCase();
    if(category==='OP')return `OP_${code}`;
    if(code==='M')return dow===0?'SUN_M':dow===6?'SAT_M':'WD_M';
    if(code==='P')return dow===0?'SUN_P':dow===6?'SAT_P':'WD_P';
    if(code==='N')return dow===0?'SUN_N':dow===6?'SAT_N':'WD_N';
    if(code==='MGSE')return'MGSE';
    if(['GRA','GRM','GRS','GRO','RO'].includes(code))return'RESP';
    if(code==='AM7')return'AM7';
    if(code==='AM8,5')return'AM85';
    if(code==='AM4')return'AM4';
    return'';
  }
  function configuredShiftTemplate(key){
    const base=DEFAULT_SETTINGS.shiftTemplates?.[key]||{};
    const local=state.settings.shiftTemplates?.[key]||{};
    const template={...base,...local};
    const start=String(template.start||'');
    const end=String(template.end||'');
    let nextDay=template.nextDay;
    if(nextDay==null&&start&&end)nextDay=end<=start;
    return{start,end,hours:Math.max(0,numeric(template.hours,0)),nextDay:!!nextDay};
  }
  function shiftWindow(type,day,customStart,customEnd,category=''){
    const d=parseDateKey(day),dow=d.getDay();let start='',end='',nextDay=false,hours=0;
    if(customStart&&customEnd){
      start=customStart;end=customEnd;
      const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
      let mins=eh*60+em-(sh*60+sm);
      if(mins<0){mins+=1440;nextDay=true;}
      hours=mins/60;
      return{start,end,nextDay,hours};
    }
    if(String(type||'').toUpperCase()==='PN'&&category!=='OP'){
      const p=shiftWindow('P',day,'','',category);
      const n=shiftWindow('N',day,'','',category);
      return{start:p.start,end:n.end,nextDay:true,hours:round2(Number(p.hours||0)+Number(n.hours||0))};
    }
    const key=shiftTemplateKey(type,dow,category);
    if(key){
      const configured=configuredShiftTemplate(key);
      if(configured.start&&configured.end)return configured;
    }
    const operational=category==='OP'?operationalShiftMeta(type):null;
    if(operational){
      return{start:operational.start,end:operational.end,nextDay:!!operational.nextDay,hours:Number(operational.hours||0)};
    }
    return{start,end,nextDay,hours};
  }
  function getDateTime"""
app,count=re.subn(shift_pattern,shift_replacement,app,count=1,flags=re.S)
if count!=1: raise SystemExit(f'shiftWindow replacement count={count}')

app=replace_once(
    app,
    "    const w=shiftWindow(a.shift||a.type||a.code,day,a.start,a.end); const st=a.start||w.start, en=a.end||w.end;",
    "    const w=shiftWindow(a.shift||a.type||a.code,day,a.start,a.end,a.category||''); const st=a.start||w.start, en=a.end||w.end;",
    'assignmentTimes category aware'
)

# Settings table helpers before bindSettingsMenu.
marker='''  function bindSettingsMenu(){'''
helpers="""  function populateShiftTemplateSettings(){
    $$('[data-shift-template]').forEach(row=>{
      const key=row.dataset.shiftTemplate;
      const template=configuredShiftTemplate(key);
      const start=row.querySelector('[data-shift-part="start"]');
      const end=row.querySelector('[data-shift-part="end"]');
      const hours=row.querySelector('[data-shift-part="hours"]');
      if(start)start.value=template.start||'';
      if(end)end.value=template.end||'';
      if(hours)hours.value=Number(template.hours||0);
    });
  }
  function readShiftTemplateSettings(){
    const output=structuredClone(DEFAULT_SETTINGS.shiftTemplates||{});
    $$('[data-shift-template]').forEach(row=>{
      const key=row.dataset.shiftTemplate;
      const start=row.querySelector('[data-shift-part="start"]')?.value||'';
      const end=row.querySelector('[data-shift-part="end"]')?.value||'';
      const hours=Math.max(0,numeric(row.querySelector('[data-shift-part="hours"]')?.value,0));
      output[key]={start,end,hours,nextDay:!!(start&&end&&end<=start)};
    });
    return output;
  }
  function validateShiftTemplateSettings(templates){
    for(const [key,template] of Object.entries(templates||{})){
      if(!template.start||!template.end)return`Orario ${key}: indica sia inizio sia fine.`;
      if(!/^\\d{2}:\\d{2}$/.test(template.start)||!/^\\d{2}:\\d{2}$/.test(template.end))return`Orario ${key}: formato non valido.`;
      if(!Number.isFinite(Number(template.hours))||Number(template.hours)<0)return`Orario ${key}: ore riconosciute non valide.`;
    }
    return'';
  }

  function bindSettingsMenu(){"""
app=replace_once(app,marker,helpers,'shift settings helpers')

# Populate permit rules and templates.
app=replace_once(
    app,
    "    $('#setPersonalPermitAnnual').value=state.settings.personalPermitAnnualHours;\n    $('#setPersonalPermitRecoveryMonths').value=Math.max(0,Math.round(numeric(state.settings.personalPermitRecoveryMonths,2)));",
    "    $('#setPersonalPermitAnnual').value=state.settings.personalPermitAnnualHours;\n    $('#setPersonalPermitDailyMaxRatio').value=Math.max(0,Math.min(1,numeric(state.settings.personalPermitDailyMaxRatio,0.5)));\n    $('#setSeriousReasonsMaxDaysAnnual').value=Math.max(0,Math.round(numeric(state.settings.seriousReasonsMaxDaysAnnual,5)));\n    $('#setBereavementEventWindowDays').value=Math.max(0,Math.round(numeric(state.settings.bereavementEventWindowDays,7)));\n    $('#setPersonalPermitRecoveryMonths').value=Math.max(0,Math.round(numeric(state.settings.personalPermitRecoveryMonths,2)));",
    'populate permit rules'
)
app=replace_once(
    app,
    "    $('#setRotation').checked=state.settings.useABRotation;\n\n    const preferred=$('#setSePreferredEmployee');",
    "    $('#setRotation').checked=state.settings.useABRotation;\n    populateShiftTemplateSettings();\n\n    const preferred=$('#setSePreferredEmployee');",
    'populate shift templates'
)

# Save permit rules and shift templates.
app=replace_once(
    app,
    "      personalPermitAnnualHours:\n        numeric(\n          $('#setPersonalPermitAnnual').value,\n          36\n        ),\n      personalPermitRecoveryMonths:",
    "      personalPermitAnnualHours:\n        numeric(\n          $('#setPersonalPermitAnnual').value,\n          36\n        ),\n      personalPermitDailyMaxRatio:Math.max(0,Math.min(1,numeric($('#setPersonalPermitDailyMaxRatio').value,0.5))),\n      seriousReasonsMaxDaysAnnual:Math.max(0,Math.round(numeric($('#setSeriousReasonsMaxDaysAnnual').value,5))),\n      bereavementEventWindowDays:Math.max(0,Math.round(numeric($('#setBereavementEventWindowDays').value,7))),\n      personalPermitRecoveryMonths:",
    'save permit numeric rules'
)
app=replace_once(
    app,
    "      autoCompensatoryRestDefault:$('#setAutoCompensatoryRestDefault').checked,\n      matrixCsvUrl:'',",
    "      autoCompensatoryRestDefault:$('#setAutoCompensatoryRestDefault').checked,\n      shiftTemplates:readShiftTemplateSettings(),\n      matrixCsvUrl:'',",
    'save shift templates'
)

# Validate template table before persistence.
validation_anchor="""    if(nextSettings.seMin>nextSettings.seMax){"""
validation_new="""    const shiftSettingsError=validateShiftTemplateSettings(nextSettings.shiftTemplates);
    if(shiftSettingsError){
      toast('Impostazioni non valide',shiftSettingsError,'error');
      return;
    }

    if(nextSettings.seMin>nextSettings.seMax){"""
app=replace_once(app,validation_anchor,validation_new,'validate shift settings')

# Use Admin permit rules in validation instead of hard-coded values.
app=replace_once(
    app,
    "if(annualCodeDays(e.id,year,'GRAVI')>5)out.push(validation('error','Permesso gravi ragioni oltre limite',`${employeeName(e)} supera 5 giorni annui.`,e.id,null));",
    "if(annualCodeDays(e.id,year,'GRAVI')>state.settings.seriousReasonsMaxDaysAnnual)out.push(validation('error','Permesso gravi ragioni oltre limite',`${employeeName(e)} supera ${state.settings.seriousReasonsMaxDaysAnnual} giorni annui.`,e.id,null));",
    'serious reasons configurable'
)
app=replace_once(
    app,
    "if(code==='PR36'){if(r.a.allDay||Number(r.hours)>dailyContractHours(e)/2)out.push(validation('error','Permesso art. 33 non conforme',`${employeeName(e)}: ${formatDateIt(r.day)} supera metà dell’orario giornaliero o è a giornata intera.`,e.id,r.day));}",
    "if(code==='PR36'){const maxDaily=round2(dailyContractHours(e)*Math.max(0,Math.min(1,numeric(state.settings.personalPermitDailyMaxRatio,0.5))));if(r.a.allDay||Number(r.hours)>maxDaily)out.push(validation('error','Permesso art. 33 non conforme',`${employeeName(e)}: ${formatDateIt(r.day)} supera il massimo giornaliero configurato (${fmt(maxDaily)} h) o è a giornata intera.`,e.id,r.day));}",
    'PR36 daily ratio configurable'
)
app=replace_once(
    app,
    "if(code==='LUTTO'&&r.a.eventDate&&(daysBetween(r.a.eventDate,r.day)<0||daysBetween(r.a.eventDate,r.day)>7))out.push(validation('error','Permesso lutto fuori termine',`${employeeName(e)}: ${formatDateIt(r.day)} non è entro 7 giorni dall’evento.`,e.id,r.day));",
    "if(code==='LUTTO'&&r.a.eventDate&&(daysBetween(r.a.eventDate,r.day)<0||daysBetween(r.a.eventDate,r.day)>state.settings.bereavementEventWindowDays))out.push(validation('error','Permesso lutto fuori termine',`${employeeName(e)}: ${formatDateIt(r.day)} non è entro ${state.settings.bereavementEventWindowDays} giorni dall’evento.`,e.id,r.day));",
    'bereavement window configurable'
)

APP.write_text(app,encoding='utf-8')

# ---- CSS ----
css=CSS.read_text(encoding='utf-8')
marker='/* ATLAS ADMIN SHIFT TEMPLATES + PERMIT RULES 2026-09-07 */'
if marker not in css:
    css += r'''

/* ATLAS ADMIN SHIFT TEMPLATES + PERMIT RULES 2026-09-07 */
.settings-control-center .settings-menu-grid{grid-template-columns:repeat(8,minmax(0,1fr))}
.settings-section-times[open]{border-color:rgba(167,139,250,.28)}
.settings-times-note{margin:12px 0 10px}
.settings-times-table-wrap{overflow:auto;border:1px solid rgba(125,211,252,.10);border-radius:12px;background:rgba(3,18,28,.42)}
.settings-times-table{width:100%;min-width:610px;border-collapse:collapse}
.settings-times-table th,.settings-times-table td{padding:7px 9px;border-bottom:1px solid rgba(125,211,252,.07);text-align:left}
.settings-times-table thead th{position:sticky;top:0;z-index:1;background:#092433;color:#82a9ba;font-size:7px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
.settings-times-table tbody th{color:#dff4fb;font-size:8px;font-weight:850}
.settings-times-table .input{min-height:34px;padding:6px 8px;font-size:9px}
.settings-times-group th{padding-top:11px!important;background:rgba(56,189,248,.055);color:#7dd3fc!important;font-size:7px!important;letter-spacing:.09em;text-transform:uppercase}
.settings-times-foot{margin-top:10px}
@media(max-width:900px){.settings-control-center .settings-menu-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:540px){.settings-control-center .settings-menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
'''
CSS.write_text(css,encoding='utf-8')

# Assertions.
config=CONFIG.read_text(encoding='utf-8')
app=APP.read_text(encoding='utf-8')
for key in ['WD_M','SAT_N','SUN_N','MGSE','RESP','OP_GN','OP_NS']:
    if key not in config: raise SystemExit(f'missing default shift key {key}')
for required in ["'shiftTemplates'",'configuredShiftTemplate','populateShiftTemplateSettings','readShiftTemplateSettings','personalPermitDailyMaxRatio','seriousReasonsMaxDaysAnnual','bereavementEventWindowDays']:
    if required not in app: raise SystemExit(f'app missing {required}')
if 'holidayRecoveryDays:30};' in app: raise SystemExit('hard-coded holiday recovery override remains')
for path in HTMLS:
    html=path.read_text(encoding='utf-8')
    if 'id="settingsShiftTimes"' not in html: raise SystemExit(f'{path.name}: shift section missing')
    if html.count('data-shift-template=') < 20: raise SystemExit(f'{path.name}: insufficient shift templates')
print('Admin shift templates and permit rules patch applied successfully.')
