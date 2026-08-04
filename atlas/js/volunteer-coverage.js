import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth.js';
import {
  loadVolunteerWorkspace,
  analyzeVolunteerCoverage,
  submitVolunteerProposal,
  reviewVolunteerProposal,
  sendVolunteerProposalEmail
} from './google-sheet-service.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let currentUser=null,permissions=new Set(),workspace={proposals:[]},analysis=null,onApplied=null;

function has(p){return permissions.has(p)}
function roleCode(user){return String(user?.roleCode||'').toUpperCase()}
function switchToVolunteer(){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id==='volunteerCoverageView'));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view==='volunteerCoverageView'));
}
export function applyAccessProfile(user){
  currentUser=user||{};permissions=new Set(currentUser.permissions||[]);
  document.body.classList.remove('role-admin','role-ro','role-volunteer-scheduler');
  const code=roleCode(currentUser);
  document.body.classList.add(code==='ADMIN'?'role-admin':code==='RO'?'role-ro':'role-volunteer-scheduler');
  $('[data-access="admin"]')?.toggleAttribute('hidden',code!=='ADMIN');
  $$('[data-access="admin"]').forEach(el=>el.classList.toggle('hidden',code!=='ADMIN'));
  $$('[data-access="employees"]').forEach(el=>el.classList.toggle('hidden',!has('saveEmployees')));
  const nav=$('#volunteerCoverageNav'); if(nav)nav.classList.toggle('hidden',!(has('volunteerProposalCreate')||has('volunteerProposalReview')));
  if(code==='VOLUNTEER_SCHEDULER')switchToVolunteer();
}
function defaultTimes(){
  const day=$('#volunteerDay')?.value||'',shift=$('#volunteerShift')?.value||'M';
  if(!day)return; const dow=new Date(`${day}T00:00:00`).getDay();
  let start='',end='';
  if(shift==='M'){start=dow===0?'08:00':'06:00';end=dow===0?'14:00':'13:30'}
  if(shift==='P'){start=dow===0?'14:00':'13:00';end=(dow===0||dow===6)?'20:00':'20:30'}
  if(shift==='N'){start=(dow===0||dow===6)?'20:00':'20:30';end=dow===6?'08:00':'06:00'}
  if(shift!=='CUSTOM'){ $('#volunteerStart').value=start;$('#volunteerEnd').value=end; }
  $('#volunteerMachine').value=shift==='N'?'3':$('#volunteerMachine').value;
}
function holeFromForm(){
  const roles=['A','C','S'].filter(r=>$(`#volRole${r}`).checked);
  return{day:$('#volunteerDay').value,shift:$('#volunteerShift').value,start:$('#volunteerStart').value,end:$('#volunteerEnd').value,site:$('#volunteerSite').value,machine:$('#volunteerMachine').value,roles,note:$('#volunteerNote').value.trim()};
}
function validateHole(h){
  if(!h.day||!h.start||!h.end)return'Data e orari sono obbligatori.';
  if(!h.roles.length)return'Seleziona almeno un ruolo mancante.';
  if(h.shift==='N'&&h.machine==='2')return'La notte richiede un equipaggio a 3.';
  if(['S','SU'].includes(h.site)&&h.machine!=='3')return'Somma e Sumirago richiedono un equipaggio a 3.';
  return'';
}
function statusClass(s){return s==='APPLICATA'?'status-applied':s==='APPROVATA'?'status-approved':s==='RIFIUTATA'?'status-rejected':s==='INVIATA'?'status-sent':'status-draft'}
function solutionHtml(sol,index){
  const crew=(sol.crew||[]).map(x=>`<div class="solution-person"><span><strong>${esc(x.role)}</strong> · ${esc(x.employeeName)}</span><span>${esc(x.group||'')}</span></div>`).join('');
  const changes=(sol.changes||[]).map(x=>`<div class="solution-change">↔ ${esc(x.fromEmployeeName)} → ${esc(x.toEmployeeName)} · ${esc(x.code)} · ${esc(x.day)} ${esc(x.start)}–${esc(x.end)}</div>`).join('');
  const warns=(sol.warnings||[]).map(w=>`<div class="solution-warning">⚠ ${esc(w)}</div>`).join('');
  return `<label class="solution-card ${index===0?'selected':''}" data-solution="${esc(sol.id)}"><div class="solution-head"><div><div class="solution-title"><input type="radio" name="volunteerSolution" value="${esc(sol.id)}" ${index===0?'checked':''}/> ${esc(sol.label)}</div><div class="solution-meta">${esc(sol.summary)} · punteggio ${esc(sol.score)}</div></div><span class="proposal-status ${sol.changes?.length?'status-sent':'status-approved'}">${sol.changes?.length?'CAMBI TURNO':'DIRETTA'}</span></div><div class="solution-crew">${crew}</div>${changes?`<div class="solution-changes"><strong>Cambi proposti</strong>${changes}</div>`:''}${warns}</label>`;
}
function renderAnalysis(){
  const host=$('#volunteerAnalysisResult'),submit=$('#volunteerSubmitBtn'); if(!host)return;
  const solutions=analysis?.solutions||[];
  if(!solutions.length){host.innerHTML='<div class="notice danger"><strong>Nessuna soluzione compatibile.</strong> Il RO dovrà intervenire manualmente.</div>';submit.disabled=true;return}
  host.innerHTML=`<div class="notice info"><strong>${solutions.length} proposte trovate.</strong> Nessun cambio sarà applicato prima dell’approvazione del RO.</div>${solutions.map(solutionHtml).join('')}`;
  submit.disabled=false;
  $$('[data-solution]').forEach(card=>card.addEventListener('click',()=>{$$('[data-solution]').forEach(x=>x.classList.remove('selected'));card.classList.add('selected')}));
}
async function analyze(){
  const hole=holeFromForm(),error=validateHole(hole);if(error)return alert(error);
  const ctx=getServerAuthContext();$('#volunteerAnalyzeBtn').disabled=true;$('#volunteerAnalysisResult').innerHTML='<div class="volunteer-loading">Ricerca coperture e cambi turno…</div>';
  try{analysis=await analyzeVolunteerCoverage({url:ATLAS_SERVER_URL,token:ctx.token,hole});renderAnalysis()}catch(e){analysis=null;$('#volunteerAnalysisResult').innerHTML=`<div class="notice danger"><strong>Analisi non riuscita.</strong> ${esc(e.message)}</div>`}finally{$('#volunteerAnalyzeBtn').disabled=false}
}
async function submitProposal(){
  const selected=$(
    'input[name="volunteerSolution"]:checked'
  )?.value;

  if(!selected)return;

  const hole=holeFromForm(),
    ctx=getServerAuthContext();

  $('#volunteerSubmitBtn').disabled=true;

  try{
    const result=await submitVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:ctx.token,
      hole,
      solutionId:selected
    });

    analysis=null;
    $('#volunteerAnalysisResult').innerHTML=
      '<div class="notice success"><strong>Proposta inviata al Responsabile Operativo.</strong> Da questo momento non è modificabile.</div>';
    $('#volunteerNote').value='';

    await refreshWorkspace();

    const sendMail=confirm(
      'Proposta registrata in ATLAS 118.\n\n' +
      'Vuoi inviare una mail al Responsabile Operativo ' +
      'con gli inserimenti proposti?\n\n' +
      'La mail sarà solo informativa: i turni potranno ' +
      'essere accettati o rifiutati esclusivamente in ATLAS.'
    );

    if(sendMail){
      try{
        await sendVolunteerProposalEmail({
          url:ATLAS_SERVER_URL,
          token:ctx.token,
          proposalId:result.proposal.id
        });

        alert(
          'Email inviata al Responsabile Operativo.\n\n' +
          'La proposta resta da valutare esclusivamente in ATLAS 118.'
        );
      }catch(mailError){
        alert(
          'La proposta è stata salvata correttamente, ' +
          'ma la mail non è stata inviata.\n\n' +
          mailError.message
        );
      }
    }
  }catch(e){
    alert(e.message);
  }finally{
    $('#volunteerSubmitBtn').disabled=false;
  }
}
function proposalSolution(p){try{return typeof p.solution==='string'?JSON.parse(p.solution):p.solution||{}}catch{return{}}}
function proposalHole(p){try{return typeof p.hole==='string'?JSON.parse(p.hole):p.hole||{}}catch{return{}}}
function proposalCard(p){
  const h=proposalHole(p),sol=proposalSolution(p),canReview=has('volunteerProposalReview')&&p.status==='INVIATA';
  const crew=(sol.crew||[]).map(x=>`${esc(x.role)}: <strong>${esc(x.employeeName)}</strong>`).join(' · ');
  const changes=(sol.changes||[]).map(x=>`<div class="solution-change">↔ ${esc(x.fromEmployeeName)} → ${esc(x.toEmployeeName)} · ${esc(x.code)} ${esc(x.day)} ${esc(x.start)}–${esc(x.end)}</div>`).join('');
  return `<article class="proposal-card proposal-immutable"><div class="proposal-head"><div><div class="proposal-title">${esc(h.day)} · ${esc(h.shift)} · ${esc(h.site)}${h.machine?` · mezzo ${esc(h.machine)}`:''}</div><div class="proposal-meta">Proposta ${esc(p.id)} · ${esc(p.createdByDisplay||p.createdBy)} · ${esc(p.createdAt)}${p.emailSentAt?` · email RO inviata ${esc(p.emailSentAt)}`:''}</div></div><span class="proposal-status ${statusClass(p.status)}">${esc(p.status)}</span></div><div class="proposal-body"><div class="proposal-line">Ruoli richiesti: <strong>${esc((h.roles||[]).join(', '))}</strong></div><div class="proposal-line">Copertura proposta: ${crew||'—'}</div>${h.note?`<div class="proposal-line">Nota referente: <strong>${esc(h.note)}</strong></div>`:''}${changes?`<div class="solution-changes"><strong>Cambi turno proposti</strong>${changes}</div>`:''}${p.reviewReason?`<div class="proposal-line">Esito RO: <strong>${esc(p.reviewReason)}</strong></div>`:''}</div>${canReview?`<div class="proposal-actions"><button class="btn small primary" data-approve="${esc(p.id)}">Approva e applica</button><button class="btn small danger" data-reject="${esc(p.id)}">Rifiuta</button></div>`:''}</article>`;
}
function renderProposals(){
  const filter=$('#volunteerStatusFilter')?.value||'ALL';let list=workspace.proposals||[];if(filter!=='ALL')list=list.filter(p=>p.status===filter);
  $('#volunteerListSubtitle').textContent=`${list.length} proposte visibili`;
  $('#volunteerProposalList').innerHTML=list.length?list.map(proposalCard).join(''):'<div class="volunteer-empty">Nessuna proposta disponibile.</div>';
  $$('[data-approve]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.approve,'APPROVE')));$$('[data-reject]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.reject,'REJECT')));
}
async function review(id,decision){
  const reason=decision==='REJECT'?prompt('Motivo del rifiuto:','')||'':prompt('Nota di approvazione facoltativa:','')||'';
  if(decision==='REJECT'&&!reason)return;
  if(!confirm(decision==='APPROVE'?'ATLAS verificherà nuovamente l’intera catena e applicherà tutti i cambi insieme. Confermi?':'Confermi il rifiuto?'))return;
  const ctx=getServerAuthContext();
  try{const result=await reviewVolunteerProposal({url:ATLAS_SERVER_URL,token:ctx.token,proposalId:id,decision,reason});await refreshWorkspace();if(result.applied){await onApplied?.();alert(`Proposta applicata: ${result.rowsChanged} record aggiornati.`)}}catch(e){alert(e.message)}
}
export async function refreshWorkspace(){
  const ctx=getServerAuthContext();$('#volunteerProposalList').innerHTML='<div class="volunteer-loading">Caricamento proposte…</div>';
  try{workspace=await loadVolunteerWorkspace({url:ATLAS_SERVER_URL,token:ctx.token});renderProposals()}catch(e){$('#volunteerProposalList').innerHTML=`<div class="notice danger"><strong>Caricamento non riuscito.</strong> ${esc(e.message)}</div>`}
}
export async function initVolunteerCoverage({user,onProposalApplied}={}){
  currentUser=user||{};permissions=new Set(currentUser.permissions||[]);onApplied=onProposalApplied;
  $('#volunteerRoleChip').textContent=currentUser.role||'Profilo';
  $('#volunteerCreatePanel').classList.toggle('hidden',!has('volunteerProposalCreate'));
  $('#volunteerShift').addEventListener('change',defaultTimes);$('#volunteerDay').addEventListener('change',defaultTimes);$('#volunteerAnalyzeBtn').addEventListener('click',analyze);$('#volunteerSubmitBtn').addEventListener('click',submitProposal);$('#volunteerRefreshBtn').addEventListener('click',refreshWorkspace);$('#volunteerStatusFilter').addEventListener('change',renderProposals);
  const today=new Date();$('#volunteerDay').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;defaultTimes();await refreshWorkspace();
}
