from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'
UI=ROOT/'atlas/js/volunteer-coverage.js'


def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return text.replace(old,new,1)


def sub_once(text,pattern,replacement,label,flags=0):
    updated,count=re.subn(pattern,replacement,text,count=1,flags=flags)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 replacement, found {count}')
    return updated

app=APP.read_text(encoding='utf-8')

# 1. Non tagliare arbitrariamente le liste di candidati: nei Buchi Volontari
#    la ricerca deve usare tutte le risorse compatibili disponibili.
app=app.replace("      .slice(0,10);\n\n    if(!allowResponsibilityFallback){",";\n\n    if(!allowResponsibilityFallback){",1)
app=app.replace("      .slice(0,12);\n  }\n\n  const VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES", ";\n  }\n\n  const VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES",1)
app=app.replace("      .slice(0,6);\n  }\n\n  function volunteerReplacementCandidates", ";\n  }\n\n  function volunteerReplacementCandidates",1)
app=app.replace("      .slice(0,allowResponsibilityFallback?5:2);", ";",1)

# 2. Anche MGSE può essere spostato in un cambio: il 118 ha priorità.
app=replace_once(
    app,
    "          ['118','OP'].includes(working[0].category)",
    "          ['118','OP','SE'].includes(working[0].category)",
    'movable SE source'
)

# 3. Nessun limite di cinque cambi candidati per ruolo.
app=app.replace("      if(options.length>=5)break;\n\n      const sourceItem=", "      const sourceItem=",1)
app=app.replace("        if(options.length>=5)break;\n      }", "      }",1)
app=app.replace("      .sort((left,right)=>left.cost-right.cost||left.warnings.length-right.warnings.length||left.score-right.score)\n      .slice(0,5);", "      .sort((left,right)=>left.cost-right.cost||left.warnings.length-right.warnings.length||left.score-right.score);",1)

# 4. Planner completo sul pool generato: nessun deadline da 70 ms e nessun tetto 700.
#    Si ferma solo quando ha trovato abbastanza soluzioni; se non ne trova,
#    esaurisce tutte le combinazioni prima di dichiarare impossibile.
pattern=r"  function volunteerPlanOptions\(roleAnalyses,limit=16\)\{.*?\n  \}\n\n  function volunteerPublicOperation"
replacement="""  function volunteerPlanOptions(roleAnalyses,limit=16){
    const ordered=[...roleAnalyses]
      .map(analysis=>({
        ...analysis,
        options:[...analysis.options].sort((left,right)=>
          Number(left.cost||0)-Number(right.cost||0)||
          (left.warnings?.length||0)-(right.warnings?.length||0)||
          Number(left.score||0)-Number(right.score||0)
        )
      }))
      .sort((left,right)=>left.options.length-right.options.length);

    const results=[];
    const unique=new Set();
    const started=(globalThis.performance?.now?.()||Date.now());
    const watchdogMs=45000;
    let explored=0;
    let watchdogLogged=false;

    function watchdog(){
      explored++;
      if(!watchdogLogged&&(globalThis.performance?.now?.()||Date.now())-started>watchdogMs){
        watchdogLogged=true;
        console.warn('[ATLAS] Buchi Volontari: analisi combinatoria oltre 45 secondi; la ricerca continua fino a soluzione o impossibilità reale.');
      }
    }

    function walk(index,used,plan,cost,warnings,score){
      watchdog();
      if(results.length>=limit)return true;

      if(index>=ordered.length){
        const signature=volunteerPlanSignature(plan);
        if(!unique.has(signature)){
          unique.add(signature);
          results.push({cost,warnings,score,plan:[...plan],signature});
        }
        return results.length>=limit;
      }

      const analysis=ordered[index];
      for(const option of analysis.options){
        if(option.resources.some(resource=>used.has(resource)))continue;

        const nextUsed=new Set(used);
        option.resources.forEach(resource=>nextUsed.add(resource));
        plan.push(option);
        const enough=walk(
          index+1,
          nextUsed,
          plan,
          cost+Number(option.cost||0),
          warnings+(option.warnings?.length||0),
          score+Number(option.score||0)
        );
        plan.pop();
        if(enough)return true;
      }
      return false;
    }

    walk(0,new Set(),[],0,0,0);

    return results
      .sort((left,right)=>
        left.cost-right.cost||
        left.warnings-right.warnings||
        left.score-right.score||
        left.signature.localeCompare(right.signature,'it')
      )
      .slice(0,limit);
  }

  function volunteerPublicOperation"""
app=sub_once(app,pattern,replacement,'exhaustive volunteer planner',flags=re.S)

APP.write_text(app,encoding='utf-8')

ui=UI.read_text(encoding='utf-8')

# 5. Nessun esito "Da verificare" nei Buchi Volontari.
ui=replace_once(
    ui,
    "    REVIEW:{\n      label:'Da verificare',\n      cls:'compat-review',\n      icon:'?'\n    },",
    "    ANALYSIS_ERROR:{\n      label:'Errore analisi',\n      cls:'compat-incompatible',\n      icon:'!'\n    },",
    'compatibility meta review -> error'
)
ui=replace_once(
    ui,
    '<div class="vol-ops-stat review"><span>Da verificare</span><strong id="volOpsReview">0</strong></div>',
    '<div class="vol-ops-stat review"><span>Errori analisi</span><strong id="volOpsError">0</strong></div>',
    'overview review -> error'
)
ui=replace_once(
    ui,
    '<button class="compat-filter" type="button" data-compat-filter="REVIEW">? Da verificare <span class="count" data-compat-count="REVIEW">0</span></button>',
    '<button class="compat-filter" type="button" data-compat-filter="ANALYSIS_ERROR">! Errori <span class="count" data-compat-count="ANALYSIS_ERROR">0</span></button>',
    'filter review -> error'
)
ui=replace_once(
    ui,
    "  const counts={ALL:0,DIRECT:0,CHANGES:0,WAITING_CALENDAR:0,REVIEW:0,INCOMPATIBLE:0};",
    "  const counts={ALL:0,DIRECT:0,CHANGES:0,WAITING_CALENDAR:0,ANALYSIS_ERROR:0,INCOMPATIBLE:0};",
    'compatibility counts'
)
ui=replace_once(
    ui,
    "  setStat('#volOpsTotal',total);setStat('#volOpsWaiting',counts.WAITING_CALENDAR);setStat('#volOpsReady',ready);setStat('#volOpsReview',counts.REVIEW);setStat('#volOpsApproved',approved);",
    "  setStat('#volOpsTotal',total);setStat('#volOpsWaiting',counts.WAITING_CALENDAR);setStat('#volOpsReady',ready);setStat('#volOpsError',counts.ANALYSIS_ERROR);setStat('#volOpsApproved',approved);",
    'toolbar error count'
)
ui=ui.replace("                      result.status==='REVIEW'", "                      result.status==='ANALYSIS_ERROR'",1)
ui=ui.replace("                    :result?.status==='REVIEW'\n                      ?'Da verificare'", "                    :result?.status==='ANALYSIS_ERROR'\n                      ?'Errore analisi'",1)

# 6. Watchdog a 45 s: informativo, non tronca e non cambia lo stato della richiesta.
ui=replace_once(ui,"  const watchdogMs=5200;","  const watchdogMs=45000;",'45 second watchdog')
old_watchdog="""    if(performance.now()-started>watchdogMs){
      pending.slice(processed).forEach(left=>{
        if(!compatibility.has(left.id)||compatibility.get(left.id)?.status==='ANALYZING'){
          compatibility.set(left.id,{
            status:'REVIEW',
            label:'Da verificare',
            tone:'warning',
            summary:'Il controllo automatico ha raggiunto il limite di sicurezza. La richiesta non viene dichiarata impossibile.',
            roles:[],changes:[],solutions:[],blockers:[]
          });
        }
      });
      break;
    }
"""
new_watchdog="""    if(performance.now()-started>watchdogMs){
      const progress=$('#compatibilityProgressText');
      if(progress){
        progress.textContent='Analisi approfondita oltre 45 s · ATLAS continua la ricerca';
      }
      if(blocking){
        updateVolunteerAnalysisOverlay({
          title:'Analisi approfondita',
          text:'Sono trascorsi più di 45 secondi. ATLAS continua a cercare cambi e combinazioni finché trova una soluzione o dimostra che non esiste.',
          stage:'Ricerca estesa',
          current:processed,
          total:pending.length
        });
      }
    }
"""
ui=replace_once(ui,old_watchdog,new_watchdog,'non terminating watchdog')

# 7. Un errore tecnico non è "impossibile" e non è "da verificare".
old_catch="""      compatibility.set(
        item.id,
        {
          status:'REVIEW',
          label:'Da verificare',
          tone:'warning',
          summary:
            'ATLAS non è riuscito a completare il controllo locale.',
          roles:[],
          changes:[],
          solutions:[],
          blockers:[
            String(
              error?.message||
              error||
              'Errore non specificato.'
            )
          ]
        }
      );"""
new_catch="""      compatibility.set(
        item.id,
        {
          status:'ANALYSIS_ERROR',
          label:'Errore analisi',
          tone:'danger',
          summary:'Errore tecnico durante il calcolo. Ricalcola la compatibilità: la richiesta non viene classificata come impossibile.',
          roles:[],
          changes:[],
          solutions:[],
          blockers:[String(error?.message||error||'Errore non specificato.')]
        }
      );"""
ui=replace_once(ui,old_catch,new_catch,'analysis catch')

# 8. Dettaglio errore distinto dall'impossibilità.
ui=replace_once(
    ui,
    "  const boxClass=\n    result.status==='DIRECT'\n      ?'direct'\n      :result.status==='CHANGES'\n        ?'changes'\n        :'incompatible';",
    "  const boxClass=\n    result.status==='DIRECT'\n      ?'direct'\n      :result.status==='CHANGES'\n        ?'changes'\n        :'incompatible';",
    'box marker'
)
# No-op above asserts the expected block exists.
ui=ui.replace(
    "  const icon=\n    result.status==='DIRECT'\n      ?'✓'\n      :result.status==='CHANGES'\n        ?'⇄'\n        :'×';",
    "  const icon=\n    result.status==='DIRECT'\n      ?'✓'\n      :result.status==='CHANGES'\n        ?'⇄'\n        :result.status==='ANALYSIS_ERROR'\n          ?'!'\n          :'×';",
    1
)

# Assertions: the forbidden user-facing phrase/status must be gone from logic/UI.
for forbidden in [
    "status:'REVIEW'",
    "data-compat-filter=\"REVIEW\"",
    "Da verificare",
    "limite di sicurezza"
]:
    if forbidden in ui:
        raise SystemExit(f'Forbidden volunteer review marker still present: {forbidden}')

if 'const watchdogMs=45000;' not in ui:
    raise SystemExit('45-second watchdog missing')
if 'searchDeadline' in app or 'maxExplored=700' in app:
    raise SystemExit('Old truncated planner still present')
if "['118','OP','SE'].includes" not in app:
    raise SystemExit('MGSE change source not enabled')

UI.write_text(ui,encoding='utf-8')
print('Volunteer exhaustive analysis patch applied.')
