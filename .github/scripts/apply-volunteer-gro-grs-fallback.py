from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'atlas/js/atlas-app.js'
UI = ROOT / 'atlas/js/volunteer-coverage.js'


def sub_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: attesa 1 sostituzione, trovate {count}')
    return updated


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: attesa 1 occorrenza, trovate {count}')
    return text.replace(old, new, 1)


app = APP.read_text(encoding='utf-8')

# 1) Le coperture ordinarie restano invariate; GRO/GRS entrano solo nel secondo passaggio.
app = sub_once(
    app,
    r"  function volunteerDirectOptions\(hole,role,item,reasonMap\)\{.*?\n  \}\n\n  function volunteerReplacementCandidates\(",
    r'''  function volunteerDirectOptions(hole,role,item,reasonMap,{allowResponsibilityFallback=false}={}){
    const day=String(hole.day||'').slice(0,10);
    const existing=duplicateSlotRows(day,item);
    if(existing.length)return[{type:'covered',cost:0,role,resources:[],cover:null,replacement:null,sourceItem:null,warnings:[],score:-1000,text:`Ruolo già coperto da ${existing.map(row=>employeeName(row.employee)).join(', ')}`}];

    const ordinary=state.employees
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

    if(!allowResponsibilityFallback){
      return ordinary;
    }

    const fallback=volunteerResponsibilityFallbackOptions(hole,role,item,reasonMap);
    return[...ordinary,...fallback]
      .sort((left,right)=>left.cost-right.cost||left.warnings.length-right.warnings.length||left.score-right.score||employeeName(left.cover).localeCompare(employeeName(right.cover),'it'))
      .slice(0,12);
  }

  const VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES=new Set(['GRO','GRS']);

  function volunteerResponsibilityFallbackOptions(hole,role,item,reasonMap){
    const day=String(hole.day||'').slice(0,10);

    return state.employees
      .filter(employee=>volunteerEmployeeAllowed(employee,role))
      .map(employee=>{
        const releases=releasableResponsibilityAssignments(employee,day)
          .filter(entry=>VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES.has(String(entry.type||entry.code||'').toUpperCase()));

        if(!releases.length){
          return null;
        }

        const check=withResponsibilityAssignmentsRemoved(
          employee,
          day,
          releases,
          ()=>checkCandidate(employee,day,item,{manual:false,allowRo:true})
        );

        if(check.errors.length){
          check.errors.forEach(error=>reasonMap.set(error,(reasonMap.get(error)||0)+1));
          return null;
        }

        const codes=[...new Set(releases.map(entry=>String(entry.type||entry.code||'').toUpperCase()))];
        const sourceHours=releases.reduce((total,entry)=>{
          const times=assignmentTimes(entry,day);
          return total+Number(times?.hours||entry.hours||0);
        },0);
        const fallbackResponsibility=codes.join(' + ');

        return{
          type:'direct',
          cost:4,
          role,
          resources:[employee.id],
          cover:employee,
          replacement:null,
          sourceItem:null,
          releasedResponsibilityIds:releases.map(entry=>entry.id),
          releasedResponsibilityCodes:codes,
          fallbackResponsibility,
          warnings:[
            ...(check.warnings||[]),
            `Fallback Buchi volontari: ${fallbackResponsibility} viene liberato per coprire il 118.`
          ],
          targetHours:Number(item.hours||0),
          sourceHours,
          score:candidateScore(employee,day,item,null)+1200,
          text:`${employeeName(employee)} può coprire liberando ${fallbackResponsibility}`
        };
      })
      .filter(Boolean)
      .sort((left,right)=>left.warnings.length-right.warnings.length||left.score-right.score||employeeName(left.cover).localeCompare(employeeName(right.cover),'it'))
      .slice(0,6);
  }

  function volunteerReplacementCandidates(''',
    'volunteerDirectOptions + fallback GRO/GRS',
    flags=re.S,
)

# 2) Costruzione analisi ruoli riutilizzabile nel secondo passaggio.
app = replace_once(
    app,
    "  function volunteerOptionSignature(option){",
    r'''  function volunteerRoleAnalyses(hole,roles,{allowResponsibilityFallback=false}={}){
    return roles.map(role=>{
      const item=volunteerHoleItem(hole,role);
      const reasonMap=new Map();

      const direct=volunteerDirectOptions(
        hole,
        role,
        item,
        reasonMap,
        {allowResponsibilityFallback}
      );

      let changes=[];

      const hasCovered=direct.some(
        option=>option.type==='covered'
      );

      const directPeople=direct.filter(
        option=>option.type==='direct'&&!option.fallbackResponsibility
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
        fallbackCount:direct.filter(option=>!!option.fallbackResponsibility).length,
        reasons:volunteerMostCommonReasons(reasonMap)
      };
    });
  }

  function volunteerOptionSignature(option){''',
    'insert volunteerRoleAnalyses',
)

# 3) Primo passaggio ordinario; GRO/GRS soltanto se non esiste un piano completo.
app = sub_once(
    app,
    r"    const roleAnalyses=roles\.map\(role=>\{.*?\n    \}\);\n\n    const impossible=",
    "    let roleAnalyses=volunteerRoleAnalyses(hole,roles);\n\n    let impossible=",
    'replace inline role analyses',
    flags=re.S,
)

app = replace_once(
    app,
    """    let impossible=roleAnalyses.filter(
      analysis=>!analysis.options.length
    );

    if(impossible.length){""",
    """    let impossible=roleAnalyses.filter(
      analysis=>!analysis.options.length
    );

    let plans=impossible.length
      ?[]
      :volunteerPlanOptions(roleAnalyses,16);

    if(impossible.length||!plans.length){
      const fallbackAnalyses=volunteerRoleAnalyses(
        hole,
        roles,
        {allowResponsibilityFallback:true}
      );
      const fallbackImpossible=fallbackAnalyses.filter(
        analysis=>!analysis.options.length
      );
      const fallbackPlans=fallbackImpossible.length
        ?[]
        :volunteerPlanOptions(fallbackAnalyses,16);

      roleAnalyses=fallbackAnalyses;
      impossible=fallbackImpossible;
      plans=fallbackPlans;
    }

    if(impossible.length){""",
    'insert second-pass GRO/GRS fallback',
)

app = replace_once(
    app,
    """    const plans=volunteerPlanOptions(
      roleAnalyses,
      16
    );

""",
    "",
    'remove old plans declaration',
)

# 4) Trasporta i metadati GRO/GRS nella soluzione pubblica.
app = replace_once(
    app,
    """      targetHours:Number(option.targetHours||0),
      sourceHours:0,
      text:option.text,
      warnings:option.warnings||[]
""",
    """      targetHours:Number(option.targetHours||0),
      sourceHours:Number(option.sourceHours||0),
      releasedResponsibilityIds:[...(option.releasedResponsibilityIds||[])],
      releasedResponsibilityCodes:[...(option.releasedResponsibilityCodes||[])],
      fallbackResponsibility:String(option.fallbackResponsibility||''),
      text:option.text,
      warnings:option.warnings||[]
""",
    'public direct responsibility metadata',
)

app = replace_once(
    app,
    """    const changes=operations.filter(
      operation=>['change','sunday-rest'].includes(operation.mode)
    );

    const direct=operations.filter(
      operation=>operation.mode==='direct'
    );
""",
    """    const changes=operations.filter(
      operation=>
        ['change','sunday-rest'].includes(operation.mode)||
        !!operation.fallbackResponsibility
    );

    const direct=operations.filter(
      operation=>operation.mode==='direct'&&!operation.fallbackResponsibility
    );
""",
    'classify GRO/GRS fallback as an adjustment',
)

app = replace_once(
    app,
    """        .map(operation=>operation.mode==='sunday-rest'
          ?`${operation.coverName} · riposo domenicale spostato`
          :`${operation.coverName} ⇄ ${operation.replacementName}`)
""",
    """        .map(operation=>operation.fallbackResponsibility
          ?`${operation.coverName} · ${operation.fallbackResponsibility} → 118`
          :operation.mode==='sunday-rest'
            ?`${operation.coverName} · riposo domenicale spostato`
            :`${operation.coverName} ⇄ ${operation.replacementName}`)
""",
    'fallback solution label',
)

# 5) Ore: la giornata GRO/GRS viene sostituita, non sommata.
app = replace_once(
    app,
    """      if(operation.mode==='direct'){
        add(operation.coverEmployeeId,target,'Copertura richiesta volontari');
""",
    """      if(operation.mode==='direct'){
        add(
          operation.coverEmployeeId,
          target-source,
          operation.fallbackResponsibility
            ?`Copertura volontari · ${operation.fallbackResponsibility} convertito in 118`
            :'Copertura richiesta volontari'
        );
""",
    'hours preview for GRO/GRS conversion',
)

# 6) Applicazione: rimuove solo GRO/GRS selezionato e inserisce il turno volontari.
app = sub_once(
    app,
    r"      const directOperations=solution\.operations\n        \.filter\(operation=>\n          operation\.mode==='direct'\n        \);\n\n      for\(const operation of directOperations\)\{.*?\n      \}\n\n      state\.localDirty=true;",
    r'''      const directOperations=solution.operations
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

        const key=assignmentKey(
          employee.id,
          day
        );

        const releaseIds=new Set(
          operation.releasedResponsibilityIds||[]
        );

        if(releaseIds.size){
          const current=[...getAssignments(employee.id,day)];
          const released=current.filter(entry=>releaseIds.has(entry.id));
          const invalid=released.filter(entry=>
            entry?.category!=='RESP'||
            !VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES.has(String(entry.type||entry.code||'').toUpperCase())
          );

          if(released.length!==releaseIds.size||invalid.length){
            throw new Error(
              `La giornata ${operation.fallbackResponsibility||'GRO/GRS'} di ${employeeName(employee)} non è più disponibile. Ricalcola la compatibilità.`
            );
          }

          const remaining=current.filter(entry=>!releaseIds.has(entry.id));
          if(remaining.length){
            state.assignments[key]=remaining;
          }else{
            delete state.assignments[key];
          }
        }

        const item=
          volunteerAssignmentForProposal(
            proposal,
            hole,
            operation.role
          );

        if(operation.fallbackResponsibility){
          item.note=[
            item.note,
            `${operation.fallbackResponsibility} liberato come fallback per il buco volontari`
          ].filter(Boolean).join(' · ');
        }

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

      state.localDirty=true;''',
    'apply GRO/GRS fallback',
    flags=re.S,
)

# 7) Messaggio compatibilità più esplicito quando il piano usa GRO/GRS.
app = replace_once(
    app,
    """    const best=solutions[0];
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
""",
    """    const best=solutions[0];
    const changes=best.changes||[];
    const responsibilityFallbacks=changes.filter(operation=>!!operation.fallbackResponsibility);

    if(changes.length){
      return{
        status:'CHANGES',
        label:responsibilityFallbacks.length
          ?'Compatibile con fallback GRO/GRS'
          :'Compatibile con cambio turno',
        tone:'warning',
        summary:responsibilityFallbacks.length
          ?`Copertura trovata solo come fallback: ${responsibilityFallbacks.map(operation=>`${operation.coverName} ${operation.fallbackResponsibility} → 118`).join(' · ')}.`
          :solutions.length>1
            ?`ATLAS ha trovato ${solutions.length} soluzioni compatibili. La prima richiede ${changes.length} ${changes.length===1?'cambio turno':'cambi turno'}.`
            :changes.length===1
              ?'La richiesta è copribile con un cambio turno sicuro individuato da ATLAS.'
              :`La richiesta è copribile con ${changes.length} cambi turno sicuri individuati da ATLAS.`,
""",
    'fallback compatibility summary',
)

APP.write_text(app, encoding='utf-8')

ui = UI.read_text(encoding='utf-8')

ui = replace_once(
    ui,
    """    if(operation.mode==='direct'){
      return{type:'DIRECT',role:String(operation.role||''),text:`${operation.coverName||'Risorsa'} copre direttamente ${roleLabel(operation.role)}`};
    }
""",
    """    if(operation.mode==='direct'){
      return{
        type:operation.fallbackResponsibility?'RESP_FALLBACK':'DIRECT',
        role:String(operation.role||''),
        text:operation.fallbackResponsibility
          ?`${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)} liberando ${operation.fallbackResponsibility}`
          :`${operation.coverName||'Risorsa'} copre direttamente ${roleLabel(operation.role)}`
      };
    }
""",
    'approval report direct fallback',
)

ui = replace_once(
    ui,
    """          }else{
            text=
              `<strong>${esc(operation.coverName)}</strong> `+
              `copre direttamente il ruolo senza spostare altri turni.`;
          }
""",
    """          }else{
            text=operation.fallbackResponsibility
              ?`<strong>${esc(operation.coverName)}</strong> copre il ruolo liberando <strong>${esc(operation.fallbackResponsibility)}</strong>, usato come fallback per il 118.`
              :`<strong>${esc(operation.coverName)}</strong> copre direttamente il ruolo senza spostare altri turni.`;
          }
""",
    'solution preview GRO/GRS fallback',
)

ui = replace_once(
    ui,
    """          <span class=\"compat-role-detail\">
            <strong>${esc(detail.coverName)}</strong>
            disponibile direttamente.
          </span>
""",
    """          <span class=\"compat-role-detail\">
            <strong>${esc(detail.coverName)}</strong>
            ${detail.fallbackResponsibility
              ?`può coprire liberando <strong>${esc(detail.fallbackResponsibility)}</strong> come ultima risorsa.`
              :'disponibile direttamente.'}
          </span>
""",
    'compatibility detail GRO/GRS fallback',
)

ui = replace_once(
    ui,
    """            ...direct.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} copertura diretta`
            ),
""",
    """            ...direct.map(operation=>
              operation.fallbackResponsibility
                ?`${roleLabel(operation.role)}: ${operation.coverName} copre liberando ${operation.fallbackResponsibility}`
                :`${roleLabel(operation.role)}: ${operation.coverName} copertura diretta`
            ),
""",
    'apply confirmation fallback text',
)

ui = replace_once(
    ui,
    """                    return(
                      `${roleLabel(operation.role)}: `+
                      `${operation.coverName} copertura diretta`
                    );
""",
    """                    return operation.fallbackResponsibility
                      ?`${roleLabel(operation.role)}: ${operation.coverName} copre liberando ${operation.fallbackResponsibility}`
                      :(
                        `${roleLabel(operation.role)}: `+
                        `${operation.coverName} copertura diretta`
                      );
""",
    'approval confirmation fallback text',
)

ui = replace_once(
    ui,
    """    CHANGES:{
      label:'Con cambio turno',
""",
    """    CHANGES:{
      label:'Con adeguamento',
""",
    'generic CHANGES badge label',
)

UI.write_text(ui, encoding='utf-8')

# Guardrail test statici: fallire il workflow se un pezzo fondamentale manca.
checks = {
    'GRO/GRS set': "VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES=new Set(['GRO','GRS'])" in app,
    'second pass': 'allowResponsibilityFallback:true' in app,
    'release metadata': 'releasedResponsibilityIds' in app,
    'apply release': 'fallback per il buco volontari' in app,
    'UI fallback': 'RESP_FALLBACK' in ui,
}
missing = [name for name, ok in checks.items() if not ok]
if missing:
    raise SystemExit('Controlli finali falliti: ' + ', '.join(missing))

print('Patch GRO/GRS Buchi Volontari applicata correttamente.')
