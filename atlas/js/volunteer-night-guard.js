// ATLAS 118 · Guard Buchi Volontari · esclusione notturna
// Chi ha una restrizione notte attiva non può essere proposto per coperture
// dirette, cambi/catene o riequilibri manuali che comportano lavoro notturno.

const STORAGE_KEY='atlas-118-turnazione-release-1';
const LEGACY_PREFIXES=['atlas-118-turnazione-production-','atlas-118-turnazione-release-','atlas-118-turnazione-v','aegis-118-turnazione-'];

function readSnapshot(){
  const keys=[STORAGE_KEY];
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    if(key&&key!==STORAGE_KEY&&LEGACY_PREFIXES.some(prefix=>key.startsWith(prefix)))keys.push(key);
  }
  for(const key of keys){
    try{
      const parsed=JSON.parse(localStorage.getItem(key)||'null');
      if(parsed&&Array.isArray(parsed.employees))return parsed;
    }catch{}
  }
  return null;
}

function employeeById(employeeId){
  const snapshot=readSnapshot();
  return snapshot?.employees?.find(employee=>String(employee.id)===String(employeeId))||null;
}

function dayKey(value){
  return String(value||'').slice(0,10);
}

function restrictionActive(employee,day){
  const restriction=String(employee?.nightRestriction||'NONE').toUpperCase();
  if(!employee||restriction==='NONE')return false;
  const key=dayKey(day);
  const from=dayKey(employee.nightRestrictionFrom);
  const until=dayKey(employee.nightRestrictionUntil);
  if(from&&key&&key<from)return false;
  if(until&&key&&key>until)return false;
  return true;
}

function isNightRequest(proposal){
  let hole={};
  try{hole=typeof proposal?.hole==='string'?JSON.parse(proposal.hole):proposal?.hole||{};}catch{}
  const shift=String(hole.shift||'').toUpperCase();
  if(['N','PN'].includes(shift))return true;
  const parseTime=value=>{
    const match=String(value||'').match(/^(\d{1,2}):(\d{2})/);
    return match?Number(match[1])*60+Number(match[2]):null;
  };
  const start=parseTime(hole.start),end=parseTime(hole.end);
  if(start===null||end===null)return false;
  return start>=20*60||start<6*60||end<=8*60||end<start;
}

function isNightCode(code){
  const value=String(code||'').trim().toUpperCase();
  if(!value)return false;
  return /^(?:N|PN)/.test(value)||['GN','NS'].includes(value);
}

function nightRestrictionLabel(employee){
  return String(employee?.nightRestriction||'').toUpperCase()==='ON_REQUEST'
    ?'notte consentita solo con consenso'
    :'esclusione dalle notti';
}

function operationViolation(proposal,operation){
  const holeDay=(()=>{
    try{
      const hole=typeof proposal?.hole==='string'?JSON.parse(proposal.hole):proposal?.hole||{};
      return dayKey(hole.day);
    }catch{return'';}
  })();
  if(isNightRequest(proposal)&&['direct','change','sunday-rest'].includes(operation?.mode)){
    const cover=employeeById(operation.coverEmployeeId);
    if(cover&&restrictionActive(cover,holeDay)){
      return `${operation.coverName||'Dipendente'}: ${nightRestrictionLabel(cover)}.`;
    }
  }
  if(operation?.mode==='change'&&isNightCode(operation.sourceCode)){
    const replacement=employeeById(operation.replacementEmployeeId);
    if(replacement&&restrictionActive(replacement,holeDay)){
      return `${operation.replacementName||'Dipendente'}: ${nightRestrictionLabel(replacement)} sul turno ${operation.sourceCode}.`;
    }
  }
  return'';
}

function solutionViolations(proposal,solution){
  return (solution?.operations||[])
    .map(operation=>operationViolation(proposal,operation))
    .filter(Boolean);
}

function guardedResult(proposal,result){
  if(!result||!Array.isArray(result.solutions)||!result.solutions.length)return result;
  const rejected=[];
  const solutions=result.solutions.filter(solution=>{
    const violations=solutionViolations(proposal,solution);
    if(violations.length){rejected.push(...violations);return false;}
    return true;
  });
  if(solutions.length===result.solutions.length)return result;
  const uniqueRejected=[...new Set(rejected)];
  if(!solutions.length){
    return{
      ...result,
      status:'INCOMPATIBLE',
      label:'Non compatibile',
      tone:'danger',
      summary:'Nessuna soluzione valida: chi è escluso dalle notti non può coprire direttamente né partecipare a cambi notturni.',
      roles:[],
      changes:[],
      solutions:[],
      blockers:[...(result.blockers||[]),...uniqueRejected].slice(0,8)
    };
  }
  const first=solutions[0];
  return{
    ...result,
    status:first.mode==='CHANGES'?'CHANGES':'DIRECT',
    label:first.mode==='CHANGES'?'Con cambio turno':'Compatibile',
    summary:`${solutions.length} ${solutions.length===1?'soluzione valida':'soluzioni valide'} dopo l’esclusione del personale non abilitato alle notti.`,
    roles:[...(first.operations||[])],
    changes:[...(first.changes||[])],
    solutions,
    blockers:[...(result.blockers||[]),...uniqueRejected].slice(0,8)
  };
}

function assertSolutionAllowed(proposal,solution){
  const violations=solutionViolations(proposal,solution);
  if(violations.length){
    throw new Error(`Soluzione non applicabile: ${violations.join(' ')}`);
  }
}

function install(){
  const api=globalThis.ATLAS_VOLUNTEER_ANALYZER;
  if(!api||api.__nightExclusionGuardInstalled)return false;

  const originalAnalyze=typeof api.analyzeProposal==='function'?api.analyzeProposal.bind(api):null;
  if(originalAnalyze){
    api.analyzeProposal=proposal=>guardedResult(proposal,originalAnalyze(proposal));
  }

  const allowedSolution=(proposal,signature)=>{
    if(!originalAnalyze)return null;
    const result=guardedResult(proposal,originalAnalyze(proposal));
    return (result?.solutions||[]).find(solution=>solution.signature===signature)||null;
  };

  if(typeof api.applySolution==='function'){
    const original=api.applySolution.bind(api);
    api.applySolution=(proposal,signature)=>{
      const solution=allowedSolution(proposal,signature);
      if(!solution)throw new Error('La soluzione non è più valida: contiene personale escluso dalle notti oppure il calendario è cambiato. Ricalcola la compatibilità.');
      assertSolutionAllowed(proposal,solution);
      return original(proposal,signature);
    };
  }

  if(typeof api.approveProposal==='function'){
    const original=api.approveProposal.bind(api);
    api.approveProposal=async(proposal,signature,...args)=>{
      if(signature){
        const solution=allowedSolution(proposal,signature);
        if(!solution)throw new Error('Approvazione bloccata: la soluzione usa personale escluso dalle notti oppure non è più valida. Ricalcola la compatibilità.');
        assertSolutionAllowed(proposal,solution);
      }else if(isNightRequest(proposal)&&typeof api.appliedCells==='function'){
        const day=(()=>{try{return dayKey((typeof proposal?.hole==='string'?JSON.parse(proposal.hole):proposal?.hole||{}).day);}catch{return'';}})();
        const invalid=(api.appliedCells(proposal.id)||[]).find(cell=>{
          const employee=employeeById(cell.employeeId);
          return employee&&restrictionActive(employee,day);
        });
        if(invalid)throw new Error('Approvazione bloccata: una modifica già applicata coinvolge personale escluso dalle notti. Annulla/ricalcola la soluzione.');
      }
      return original(proposal,signature,...args);
    };
  }

  if(typeof api.manualReplacementOptions==='function'){
    const original=api.manualReplacementOptions.bind(api);
    api.manualReplacementOptions=employeeId=>(original(employeeId)||[]).filter(option=>{
      if(!isNightCode(option.code))return true;
      const employee=employeeById(option.targetEmployeeId||employeeId);
      return !(employee&&restrictionActive(employee,option.day));
    });
  }

  if(typeof api.applyManualReplacement==='function'){
    const original=api.applyManualReplacement.bind(api);
    api.applyManualReplacement=selection=>{
      if(isNightCode(selection?.code)){
        const employee=employeeById(selection?.targetEmployeeId);
        if(employee&&restrictionActive(employee,selection?.day)){
          throw new Error('Sostituzione bloccata: il dipendente selezionato è escluso dalle notti e non può ricevere questo turno.');
        }
      }
      return original(selection);
    };
  }

  Object.defineProperty(api,'__nightExclusionGuardInstalled',{value:true,enumerable:false});
  console.info('[ATLAS] Guard Buchi Volontari: esclusioni notte attive.');
  return true;
}

if(!install()){
  const timer=setInterval(()=>{
    if(install())clearInterval(timer);
  },25);
  setTimeout(()=>clearInterval(timer),15000);
}
