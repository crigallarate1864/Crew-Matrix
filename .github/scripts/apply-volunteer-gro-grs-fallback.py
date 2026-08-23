from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'


def replace_once(text,old,new,label):
    if new in text:
        return text
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: attesa 1 occorrenza, trovate {count}')
    return text.replace(old,new,1)


def sub_once(text,pattern,replacement,label,marker=None):
    if marker and marker in text:
        return text
    updated,count=re.subn(pattern,replacement,text,count=1,flags=re.S)
    if count!=1:
        raise SystemExit(f'{label}: attesa 1 sostituzione, trovate {count}')
    return updated


app=APP.read_text(encoding='utf-8')

replacement_candidates=r'''  function volunteerReplacementCandidates(
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

        // RO entra nella catena solo quando la sua giornata GRO è davvero liberabile.
        if(employee.turno==='RO'&&!releases.some(entry=>String(entry.type||entry.code||'').toUpperCase()==='GRO') ){
          return null;
        }

        const candidate={
          ...sourceItem,
          id:`VOL-REPL-${sourceItem.id||uid()}`
        };

        let check=checkCandidate(employee,day,candidate,{manual:false,allowRo:true});
        let released=[];

        if(check.errors.length&&releases.length){
          check=withResponsibilityAssignmentsRemoved(
            employee,
            day,
            releases,
            ()=>checkCandidate(employee,day,candidate,{manual:false,allowRo:true})
          );
          if(!check.errors.length)released=releases;
        }

        if(check.errors.length)return null;

        const codes=[...new Set(released.map(entry=>String(entry.type||entry.code||'').toUpperCase()))];
        const fallbackResponsibility=codes.join(' + ');
        const releasedResponsibilityHours=released.reduce((total,entry)=>{
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
          releasedResponsibilityHours
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

'''

app=sub_once(
    app,
    r"  function volunteerReplacementCandidates\(.*?\n  \}\n\n(?=  function volunteerChangeOptions\()",
    replacement_candidates,
    'volunteerReplacementCandidates',
    marker='releasedResponsibilityHours\n        };',
)

change_options=r'''  function volunteerChangeOptions(
    hole,
    role,
    item,
    reasonMap,
    totalRoles,
    {allowResponsibilityFallback=false}={}
  ){
    const day=String(hole.day||'').slice(0,10);
    const options=[];

    const blocked=state.employees
      .filter(employee=>volunteerEmployeeAllowed(employee,role))
      .filter(employee=>{
        const working=getAssignments(employee.id,day)
          .filter(isWorkingAssignment);

        return(
          working.length===1&&
          ['118','OP'].includes(working[0].category)
        );
      });

    for(const employee of blocked){
      if(options.length>=5)break;

      const sourceItem=getAssignments(employee.id,day)
        .filter(isWorkingAssignment)[0];
      if(!sourceItem)continue;

      const holeCheck=withVolunteerAssignmentRemoved(
        employee.id,
        day,
        sourceItem.id,
        ()=>checkCandidate(employee,day,item,{manual:false,allowRo:true})
      );

      if(holeCheck.errors.length){
        holeCheck.errors.forEach(error=>reasonMap.set(error,(reasonMap.get(error)||0)+1));
        continue;
      }

      const replacements=withVolunteerAssignmentRemoved(
        employee.id,
        day,
        sourceItem.id,
        ()=>volunteerReplacementCandidates(
          employee,
          day,
          sourceItem,
          new Set([employee.id]),
          {allowResponsibilityFallback}
        )
      );

      for(const replacement of replacements){
        options.push({
          type:'change',
          cost:replacement.fallbackResponsibility?4:1,
          role,
          resources:[employee.id,replacement.employee.id],
          cover:employee,
          replacement:replacement.employee,
          sourceItem,
          replacementReleasedResponsibilityIds:[...(replacement.releasedResponsibilityIds||[])],
          replacementReleasedResponsibilityCodes:[...(replacement.releasedResponsibilityCodes||[])],
          replacementFallbackResponsibility:String(replacement.fallbackResponsibility||''),
          replacementReleasedResponsibilityHours:Number(replacement.releasedResponsibilityHours||0),
          warnings:[...(holeCheck.warnings||[]),...(replacement.warnings||[])],
          targetHours:Number(item.hours||0),
          sourceHours:Number(sourceItem.hours||0),
          score:candidateScore(employee,day,item,null)+replacement.score+250,
          text:
            `${employeeName(employee)} può coprire ${role}; `+
            `${employeeName(replacement.employee)} può sostituirlo su ${normalizeCode(sourceItem)}`+
            (replacement.fallbackResponsibility?` liberando ${replacement.fallbackResponsibility}`:'')
        });
        if(options.length>=5)break;
      }
    }

    return options
      .sort((left,right)=>left.cost-right.cost||left.warnings.length-right.warnings.length||left.score-right.score)
      .slice(0,5);
  }

'''

app=sub_once(
    app,
    r"  function volunteerChangeOptions\(.*?\n  \}\n\n(?=  function volunteerRoleAnalyses\()",
    change_options,
    'volunteerChangeOptions',
    marker='replacementReleasedResponsibilityHours:Number(replacement.releasedResponsibilityHours||0)',
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
    'role analyses fallback forwarding',
)

# Esporta i metadati della responsabilità liberata sul sostituto.
app=replace_once(
    app,
    '''        sourceCode:normalizeCode(option.sourceItem),
        targetHours:Number(option.targetHours||0),
        sourceHours:Number(option.sourceHours||option.sourceItem?.hours||0),
        text:option.text,''',
    '''        sourceCode:normalizeCode(option.sourceItem),
        targetHours:Number(option.targetHours||0),
        sourceHours:Number(option.sourceHours||option.sourceItem?.hours||0),
        replacementReleasedResponsibilityIds:[...(option.replacementReleasedResponsibilityIds||[])],
        replacementReleasedResponsibilityCodes:[...(option.replacementReleasedResponsibilityCodes||[])],
        replacementFallbackResponsibility:String(option.replacementFallbackResponsibility||''),
        replacementReleasedResponsibilityHours:Number(option.replacementReleasedResponsibilityHours||0),
        text:option.text,''',
    'public change metadata',
)

# Etichetta leggibile delle soluzioni a catena.
app=replace_once(
    app,
    ''':operation.mode==='sunday-rest'
            ?`${operation.coverName} · riposo domenicale spostato`
            :`${operation.coverName} ⇄ ${operation.replacementName}`)''',
    ''':operation.mode==='sunday-rest'
            ?`${operation.coverName} · riposo domenicale spostato`
            :operation.replacementFallbackResponsibility
              ?`${operation.coverName} ⇄ ${operation.replacementName} · ${operation.replacementFallbackResponsibility} liberato`
              :`${operation.coverName} ⇄ ${operation.replacementName}`)''',
    'solution label chain fallback',
)

# Impatto ore netto: il turno ricevuto sostituisce la giornata GRO/GRS.
app=replace_once(
    app,
    '''      }else if(operation.mode==='change'){
        add(operation.coverEmployeeId,target-source,'Passaggio sul turno volontari');
        add(operation.replacementEmployeeId,source,'Subentro sul turno spostato');
      }''',
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
      }''',
    'hours preview chain fallback',
)

app=replace_once(
    app,
    '''    const responsibilityFallbacks=changes.filter(operation=>!!operation.fallbackResponsibility);''',
    '''    const responsibilityFallbacks=changes.filter(operation=>
      !!operation.fallbackResponsibility||
      !!operation.replacementFallbackResponsibility
    );''',
    'recognize chain fallback in summary',
)

# L'applicazione della catena libera GRO/GRS prima di assegnare il turno al sostituto.
app=replace_once(
    app,
    '''        const replacementItem={
          ...sourceItem,
          id:uid(),''',
    '''        const replacementKey=assignmentKey(replacement.id,day);
        const replacementReleaseIds=new Set(operation.replacementReleasedResponsibilityIds||[]);

        if(replacementReleaseIds.size){
          const replacementCurrent=[...getAssignments(replacement.id,day)];
          const released=replacementCurrent.filter(entry=>replacementReleaseIds.has(entry.id));
          const invalid=released.filter(entry=>
            entry?.category!=='RESP'||
            !VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES.has(String(entry.type||entry.code||'').toUpperCase())
          );
          if(released.length!==replacementReleaseIds.size||invalid.length){
            throw new Error(`La giornata ${operation.replacementFallbackResponsibility||'GRO/GRS'} di ${employeeName(replacement)} non è più disponibile. Ricalcola la compatibilità.`);
          }
          const remaining=replacementCurrent.filter(entry=>!replacementReleaseIds.has(entry.id));
          if(remaining.length)state.assignments[replacementKey]=remaining;else delete state.assignments[replacementKey];
        }

        const replacementItem={
          ...sourceItem,
          id:uid(),''',
    'apply chain responsibility release',
)

app=replace_once(
    app,
    '''            marker,
            `Cambio per copertura volontari: ${employeeName(cover)} → ${employeeName(replacement)}`
          ].filter(Boolean).join(' · '),''',
    '''            marker,
            `Cambio per copertura volontari: ${employeeName(cover)} → ${employeeName(replacement)}`,
            operation.replacementFallbackResponsibility
              ?`${operation.replacementFallbackResponsibility} liberato come fallback per consentire il cambio`
              :''
          ].filter(Boolean).join(' · '),''',
    'replacement fallback note',
)

# Se replacementKey è già stato introdotto sopra, elimina la vecchia dichiarazione più avanti.
old_key='''        const replacementKey=\n          assignmentKey(\n            replacement.id,\n            day\n          );\n\n        state.assignments[replacementKey]=['''
if old_key in app:
    app=app.replace(old_key,'''        state.assignments[replacementKey]=[''',1)

APP.write_text(app,encoding='utf-8')

required=[
    'replacementReleasedResponsibilityIds',
    'replacementReleasedResponsibilityHours',
    'replacementReleaseIds',
    '{allowResponsibilityFallback}',
    "VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES=new Set(['GRO','GRS'])",
]
missing=[token for token in required if token not in app]
if missing:
    raise SystemExit('Controlli finali falliti: '+', '.join(missing))

print('Fallback GRO/GRS applicato anche alle catene di cambio.')
