from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'
UI=ROOT/'atlas/js/volunteer-coverage.js'


def sub_once(text,pattern,replacement,label,flags=0):
    updated,count=re.subn(pattern,replacement,text,count=1,flags=flags)
    if count!=1:
        raise SystemExit(f'{label}: attesa 1 sostituzione, trovate {count}')
    return updated


def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: attesa 1 occorrenza, trovate {count}')
    return text.replace(old,new,1)


app=APP.read_text(encoding='utf-8')

# GRO/GRS possono anche ricevere il turno del collega che viene liberato per il buco.
app=sub_once(
    app,
    r"  function volunteerReplacementCandidates\(.*?\n  \}\n\n  function volunteerChangeOptions\(",
    r'''  function volunteerReplacementCandidates(
    sourceEmployee,
    day,
    sourceItem,
    excludedIds,
    {allowResponsibilityFallback=false}={}
  ){
    return state.employees
      .filter(employee=>
        employee.id!==sourceEmployee.id&&
        employee.attivo!==false&&
        employee.turno!=='Amministrazione'&&
        !excludedIds.has(employee.id)
      )
      .map(employee=>{
        const releases=allowResponsibilityFallback
          ?releasableResponsibilityAssignments(employee,day)
            .filter(entry=>VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES.has(String(entry.type||entry.code||'').toUpperCase()))
          :[];

        // Il Responsabile Operativo entra in una catena soltanto se in quella giornata
        // è effettivamente presente una giornata GRO liberabile.
        if(employee.turno==='RO'&&!releases.some(entry=>String(entry.type||entry.code||'').toUpperCase()==='GRO')){
          return null;
        }

        const candidate={
          ...sourceItem,
          id:`VOL-REPL-${sourceItem.id||uid()}`
        };

        let check=checkCandidate(
          employee,
          day,
          candidate,
          {
            manual:false,
            allowRo:true
          }
        );

        let released=[];
        if(check.errors.length&&releases.length){
          check=withResponsibilityAssignmentsRemoved(
            employee,
            day,
            releases,
            ()=>checkCandidate(
              employee,
              day,
              candidate,
              {
                manual:false,
                allowRo:true
              }
            )
          );
          if(!check.errors.length){
            released=releases;
          }
        }

        if(check.errors.length){
          return null;
        }

        const codes=[...new Set(released.map(entry=>String(entry.type||entry.code||'').toUpperCase()))];
        const fallbackResponsibility=codes.join(' + ');
        const releasedHours=released.reduce((total,entry)=>{
          const times=assignmentTimes(entry,day);
          return total+Number(times?.hours||entry.hours||0);
        },0);

        return{
          employee,
          warnings:[
            ...(check.warnings||[]),
            ...(fallbackResponsibility
              ?[`Fallback Buchi volontari: ${fallbackResponsibility} viene liberato per consentire il cambio turno.`]
              :[])
          ],
          score:candidateScore(employee,day,candidate,null)+(fallbackResponsibility?1200:0),
          releasedResponsibilityIds:released.map(entry=>entry.id),
          releasedResponsibilityCodes:codes,
          fallbackResponsibility,
          releasedResponsibilityHours:releasedHours
        };
      })
      .filter(Boolean)
      .sort((left,right)=>
        left.warnings.length-right.warnings.length||
        left.score-right.score||
        employeeName(left.employee).localeCompare(employeeName(right.employee),'it')
      )
      .slice(0,allowResponsibilityFallback?5:2);
  }

  function volunteerChangeOptions(''',
    'replacement candidates GRO/GRS',
    flags=re.S,
)

app=replace_once(
    app,
    '''  function volunteerChangeOptions(
    hole,
    role,
    item,
    reasonMap,
    totalRoles
  ){''',
    '''  function volunteerChangeOptions(
    hole,
    role,
    item,
    reasonMap,
    totalRoles,
    {allowResponsibilityFallback=false}={}
  ){''',
    'change options signature',
)

app=replace_once(
    app,
    '''        ()=>volunteerReplacementCandidates(
          employee,
          day,
          sourceItem,
          new Set([employee.id])
        )''',
    '''        ()=>volunteerReplacementCandidates(
          employee,
          day,
          sourceItem,
          new Set([employee.id]),
          {allowResponsibilityFallback}
        )''',
    'pass fallback to replacement candidates',
)

app=replace_once(
    app,
    '''          sourceItem,
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
''',
    '''          sourceItem,
          replacementReleasedResponsibilityIds:[...(replacement.releasedResponsibilityIds||[])],
          replacementReleasedResponsibilityCodes:[...(replacement.releasedResponsibilityCodes||[])],
          replacementFallbackResponsibility:String(replacement.fallbackResponsibility||''),
          replacementReleasedResponsibilityHours:Number(replacement.releasedResponsibilityHours||0),
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
            `${employeeName(replacement.employee)} può sostituirlo su ${normalizeCode(sourceItem)}`+
            (replacement.fallbackResponsibility?` liberando ${replacement.fallbackResponsibility}`:'')
''',
    'change option replacement metadata',
)

app=replace_once(
    app,
    '''        changes=volunteerChangeOptions(
          hole,
          role,
          item,
          reasonMap,
          roles.length
        );''',
    '''        changes=volunteerChangeOptions(
          hole,
          role,
          item,
          reasonMap,
          roles.length,
          {allowResponsibilityFallback}
        );''',
    'role analyses forwards fallback',
)

app=replace_once(
    app,
    '''        sourceItemId:option.sourceItem?.id||'',
        sourceCode:normalizeCode(option.sourceItem),
        targetHours:Number(option.targetHours||0),
        sourceHours:Number(option.sourceHours||option.sourceItem?.hours||0),
        text:option.text,
''',
    '''        sourceItemId:option.sourceItem?.id||'',
        sourceCode:normalizeCode(option.sourceItem),
        targetHours:Number(option.targetHours||0),
        sourceHours:Number(option.sourceHours||option.sourceItem?.hours||0),
        replacementReleasedResponsibilityIds:[...(option.replacementReleasedResponsibilityIds||[])],
        replacementReleasedResponsibilityCodes:[...(option.replacementReleasedResponsibilityCodes||[])],
        replacementFallbackResponsibility:String(option.replacementFallbackResponsibility||''),
        replacementReleasedResponsibilityHours:Number(option.replacementReleasedResponsibilityHours||0),
        text:option.text,
''',
    'public change replacement metadata',
)

app=replace_once(
    app,
    '''          :operation.mode==='sunday-rest'
            ?`${operation.coverName} · riposo domenicale spostato`
            :`${operation.coverName} ⇄ ${operation.replacementName}`)''',
    '''          :operation.mode==='sunday-rest'
            ?`${operation.coverName} · riposo domenicale spostato`
            :operation.replacementFallbackResponsibility
              ?`${operation.coverName} ⇄ ${operation.replacementName} · ${operation.replacementFallbackResponsibility} liberato`
              :`${operation.coverName} ⇄ ${operation.replacementName}`)''',
    'solution label replacement GRO/GRS',
)

app=replace_once(
    app,
    '''      }else if(operation.mode==='change'){
        add(operation.coverEmployeeId,target-source,'Passaggio sul turno volontari');
        add(operation.replacementEmployeeId,source,'Subentro sul turno spostato');
      }
''',
    '''      }else if(operation.mode==='change'){
        const releasedResponsibilityHours=Number(operation.replacementReleasedResponsibilityHours||0);
        add(operation.coverEmployeeId,target-source,'Passaggio sul turno volontari');
        add(
          operation.replacementEmployeeId,
          source-releasedResponsibilityHours,
          operation.replacementFallbackResponsibility
            ?`Subentro sul turno spostato · ${operation.replacementFallbackResponsibility} liberato`
            :'Subentro sul turno spostato'
        );
      }
''',
    'hours preview replacement GRO/GRS',
)

app=replace_once(
    app,
    '''    const responsibilityFallbacks=changes.filter(operation=>!!operation.fallbackResponsibility);''',
    '''    const responsibilityFallbacks=changes.filter(operation=>
      !!operation.fallbackResponsibility||
      !!operation.replacementFallbackResponsibility
    );''',
    'summary recognizes replacement fallback',
)

app=replace_once(
    app,
    '''          ?`Copertura trovata solo come fallback: ${responsibilityFallbacks.map(operation=>`${operation.coverName} ${operation.fallbackResponsibility} → 118`).join(' · ')}.`''',
    '''          ?`Copertura trovata solo come fallback: ${responsibilityFallbacks.map(operation=>
              operation.fallbackResponsibility
                ?`${operation.coverName} ${operation.fallbackResponsibility} → 118`
                :`${operation.replacementName} libera ${operation.replacementFallbackResponsibility} per prendere ${operation.sourceCode}`
            ).join(' · ')}.`''',
    'summary text replacement fallback',
)

# Prima del controllo del sostituto, libera l'eventuale GRO/GRS e verifica che sia ancora presente.
app=replace_once(
    app,
    '''        const replacementItem={
          ...sourceItem,
          id:uid(),''',
    '''        const replacementKey=assignmentKey(
          replacement.id,
          day
        );

        const replacementReleaseIds=new Set(
          operation.replacementReleasedResponsibilityIds||[]
        );

        if(replacementReleaseIds.size){
          const replacementCurrent=[...getAssignments(replacement.id,day)];
          const released=replacementCurrent.filter(entry=>replacementReleaseIds.has(entry.id));
          const invalid=released.filter(entry=>
            entry?.category!=='RESP'||
            !VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES.has(String(entry.type||entry.code||'').toUpperCase())
          );

          if(released.length!==replacementReleaseIds.size||invalid.length){
            throw new Error(
              `La giornata ${operation.replacementFallbackResponsibility||'GRO/GRS'} di ${employeeName(replacement)} non è più disponibile. Ricalcola la compatibilità.`
            );
          }

          const remaining=replacementCurrent.filter(entry=>!replacementReleaseIds.has(entry.id));
          if(remaining.length){
            state.assignments[replacementKey]=remaining;
          }else{
            delete state.assignments[replacementKey];
          }
        }

        const replacementItem={
          ...sourceItem,
          id:uid(),''',
    'apply replacement releases responsibility',
)

app=replace_once(
    app,
    '''          note:[
            sourceItem.note,
            marker,
            `Cambio per copertura volontari: ${employeeName(cover)} → ${employeeName(replacement)}`
          ].filter(Boolean).join(' · '),''',
    '''          note:[
            sourceItem.note,
            marker,
            `Cambio per copertura volontari: ${employeeName(cover)} → ${employeeName(replacement)}`,
            operation.replacementFallbackResponsibility
              ?`${operation.replacementFallbackResponsibility} liberato come fallback per consentire il cambio`
              :''
          ].filter(Boolean).join(' · '),''',
    'replacement note fallback',
)

app=replace_once(
    app,
    '''        const replacementKey=
          assignmentKey(
            replacement.id,
            day
          );

        state.assignments[replacementKey]=[''',
    '''        state.assignments[replacementKey]=[''',
    'remove duplicate replacementKey',
)

APP.write_text(app,encoding='utf-8')

ui=UI.read_text(encoding='utf-8')

ui=replace_once(
    ui,
    '''        text:
          `${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)}; `+
          `${operation.replacementName||'Risorsa'} prende ${operation.sourceCode||'il turno liberato'}`
''',
    '''        text:
          `${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)}; `+
          `${operation.replacementName||'Risorsa'} prende ${operation.sourceCode||'il turno liberato'}`+
          (operation.replacementFallbackResponsibility
            ?` liberando ${operation.replacementFallbackResponsibility}`
            :'')
''',
    'report change replacement fallback',
)

ui=replace_once(
    ui,
    '''              `prende il suo turno `+
              `<strong>${esc(operation.sourceCode)}</strong>.`;''',
    '''              `prende il suo turno `+
              `<strong>${esc(operation.sourceCode)}</strong>`+
              (operation.replacementFallbackResponsibility
                ?` liberando <strong>${esc(operation.replacementFallbackResponsibility)}</strong>.`
                :'.');''',
    'preview change replacement fallback',
)

ui=replace_once(
    ui,
    '''              può subentrare
              <strong>${esc(detail.replacementName)}</strong>.''',
    '''              può subentrare
              <strong>${esc(detail.replacementName)}</strong>${detail.replacementFallbackResponsibility
                ?`, liberando <strong>${esc(detail.replacementFallbackResponsibility)}</strong>`
                :''}.''',
    'detail change replacement fallback',
)

ui=replace_once(
    ui,
    '''            ...changes.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} sulla richiesta; ${operation.replacementName} sul turno ${operation.sourceCode}`
            )''',
    '''            ...changes.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} sulla richiesta; ${operation.replacementName} sul turno ${operation.sourceCode}`+
              (operation.replacementFallbackResponsibility?` liberando ${operation.replacementFallbackResponsibility}`:'')
            )''',
    'apply confirmation change fallback',
)

ui=replace_once(
    ui,
    '''                      `${operation.coverName} copre il buco; `+
                      `${operation.replacementName} prende ${operation.sourceCode}`''',
    '''                      `${operation.coverName} copre il buco; `+
                      `${operation.replacementName} prende ${operation.sourceCode}`+
                      (operation.replacementFallbackResponsibility
                        ?` liberando ${operation.replacementFallbackResponsibility}`
                        :'')''',
    'approval confirmation change fallback',
)

UI.write_text(ui,encoding='utf-8')

checks={
  'replacement fallback signature':'allowResponsibilityFallback=false' in app,
  'replacement release ids':'replacementReleasedResponsibilityIds' in app,
  'replacement release hours':'replacementReleasedResponsibilityHours' in app,
  'apply replacement release':'replacementReleaseIds' in app,
  'night-safe automatic checks':app.count('manual:false')>10,
  'ui replacement fallback':'replacementFallbackResponsibility' in ui,
}
missing=[name for name,ok in checks.items() if not ok]
if missing:
    raise SystemExit('Controlli finali falliti: '+', '.join(missing))

print('Fallback GRO/GRS esteso alle catene di cambio.')
