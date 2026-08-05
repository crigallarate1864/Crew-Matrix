import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth.js';
import {
  loadVolunteerWorkspace,
  submitVolunteerProposal,
  reviewVolunteerProposal,
  sendVolunteerProposalEmail
} from './google-sheet-service.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(
  /[&<>"']/g,
  character=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[character])
);

let currentUser=null;
let permissions=new Set();
let workspace={proposals:[]};
let onApplied=null;

function has(permission){
  return permissions.has(permission);
}

function roleCode(user){
  return String(user?.roleCode||'').toUpperCase();
}

function switchToView(id){
  $$('.view').forEach(view=>
    view.classList.toggle('active',view.id===id)
  );

  $$('.nav-btn').forEach(button=>
    button.classList.toggle('active',button.dataset.view===id)
  );
}

function roleBodyClass(code){
  if(code==='ADMIN')return'role-admin';
  if(code==='RO')return'role-ro';
  if(code==='VOLUNTEER_SCHEDULER')return'role-volunteer-scheduler';
  return'role-ro';
}

export function applyAccessProfile(user){
  currentUser=user||{};
  permissions=new Set(currentUser.permissions||[]);

  document.body.classList.remove(
    'role-admin',
    'role-ro',
    'role-volunteer-scheduler'
  );

  const code=roleCode(currentUser);
  document.body.classList.add(roleBodyClass(code));

  $$('[data-access="admin"]').forEach(element=>{
    const hidden=code!=='ADMIN';
    element.classList.toggle('hidden',hidden);
    element.toggleAttribute('hidden',hidden);
  });

  $$('[data-access="employees"]').forEach(element=>{
    const hidden=!has('saveEmployees');
    element.classList.toggle('hidden',hidden);
    element.toggleAttribute('hidden',hidden);
  });

  const volunteerNav=$('#volunteerCoverageNav');
  if(volunteerNav){
    const hidden=!has('volunteerProposalCreate')&&!has('volunteerProposalReview');
    volunteerNav.classList.toggle('hidden',hidden);
    volunteerNav.toggleAttribute('hidden',hidden);
  }

  if(code==='VOLUNTEER_SCHEDULER'){
    switchToView('volunteerCoverageView');
  }else{
    switchToView('calendarView');
  }
}

function defaultTimes(){
  const day=$('#volunteerDay')?.value||'';
  const shift=$('#volunteerShift')?.value||'M';

  if(!day)return;

  const dayOfWeek=
    new Date(`${day}T00:00:00`).getDay();

  let start='';
  let end='';

  if(shift==='M'){
    start=dayOfWeek===0?'08:00':'06:00';
    end=dayOfWeek===0?'14:00':'13:30';
  }

  if(shift==='P'){
    start=dayOfWeek===0?'14:00':'13:00';
    end=(dayOfWeek===0||dayOfWeek===6)
      ?'20:00'
      :'20:30';
  }

  if(shift==='N'){
    start=(dayOfWeek===0||dayOfWeek===6)
      ?'20:00'
      :'20:30';
    end=dayOfWeek===6?'08:00':'06:00';
  }

  if(shift!=='CUSTOM'){
    $('#volunteerStart').value=start;
    $('#volunteerEnd').value=end;
  }

  if(shift==='N'){
    $('#volunteerMachine').value='3';
  }
}

function holeFromForm(){
  const roles=['A','C','S'].filter(
    role=>$(`#volRole${role}`)?.checked
  );

  return {
    day:$('#volunteerDay')?.value||'',
    shift:$('#volunteerShift')?.value||'M',
    start:$('#volunteerStart')?.value||'',
    end:$('#volunteerEnd')?.value||'',
    site:$('#volunteerSite')?.value||'G',
    machine:$('#volunteerMachine')?.value||'3',
    roles,
    note:$('#volunteerNote')?.value.trim()||''
  };
}

function validateHole(hole){
  if(!hole.day||!hole.start||!hole.end){
    return'Data e orari sono obbligatori.';
  }

  if(!hole.roles.length){
    return'Seleziona almeno un ruolo mancante.';
  }

  if(hole.shift==='N'&&hole.machine==='2'){
    return'La notte richiede un equipaggio a 3.';
  }

  if(
    ['S','SU'].includes(hole.site)&&
    hole.machine!=='3'
  ){
    return'Somma e Sumirago richiedono un equipaggio a 3.';
  }

  return'';
}

function statusClass(status){
  return status==='APPLICATA'
    ?'status-applied'
    :status==='APPROVATA'
      ?'status-approved'
      :status==='RIFIUTATA'
        ?'status-rejected'
        :status==='INVIATA'
          ?'status-sent'
          :'status-draft';
}

function statusLabel(status){
  return ({
    INVIATA:'DA VALUTARE',
    APPROVATA:'APPROVATA',
    RIFIUTATA:'RIFIUTATA',
    APPLICATA:'APPLICATA · STORICO'
  })[status]||status||'';
}

function proposalHole(proposal){
  try{
    return typeof proposal.hole==='string'
      ?JSON.parse(proposal.hole)
      :proposal.hole||{};
  }catch{
    return {};
  }
}

function formatDateIt(value){
  const match=String(value||'').match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  return match
    ?`${match[3]}/${match[2]}/${match[1]}`
    :String(value||'');
}

function shiftLabel(code){
  return ({
    M:'Mattina',
    P:'Pomeriggio',
    N:'Notte',
    CUSTOM:'Personalizzato'
  })[String(code||'').toUpperCase()]||String(code||'');
}

function siteLabel(code){
  return ({
    G:'Gallarate',
    S:'Somma Lombardo',
    SU:'Sumirago'
  })[String(code||'').toUpperCase()]||String(code||'');
}

function roleLabel(code){
  return ({
    A:'Autista',
    C:'Capo equipaggio',
    S:'Soccorritore'
  })[String(code||'').toUpperCase()]||String(code||'');
}

async function submitProposal(){
  const hole=holeFromForm();
  const error=validateHole(hole);

  if(error){
    alert(error);
    return;
  }

  const button=$('#volunteerSubmitBtn');
  const resultHost=$('#volunteerSubmissionResult');
  const context=getServerAuthContext();

  button.disabled=true;
  resultHost.innerHTML=
    '<div class="volunteer-loading">Invio segnalazione in corso…</div>';

  try{
    const result=await submitVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:context.token,
      hole
    });

    resultHost.innerHTML=
      '<div class="notice success"><strong>Segnalazione inviata al Responsabile Operativo.</strong> Non sono stati assegnati dipendenti e non è stato modificato il calendario.</div>';

    $('#volunteerNote').value='';
    ['A','C','S'].forEach(role=>{
      const checkbox=$(`#volRole${role}`);
      if(checkbox)checkbox.checked=false;
    });

    await refreshWorkspace();

    const sendMail=confirm(
      'Segnalazione registrata in ATLAS 118.\n\n'+
      'Vuoi inviare una mail al Responsabile Operativo?\n\n'+
      'La mail sarà solo informativa: la proposta potrà essere '+
      'approvata o rifiutata esclusivamente in ATLAS.'
    );

    if(sendMail){
      try{
        await sendVolunteerProposalEmail({
          url:ATLAS_SERVER_URL,
          token:context.token,
          proposalId:result.proposal.id
        });

        alert(
          'Email inviata al Responsabile Operativo.\n\n'+
          'La decisione resta possibile esclusivamente in ATLAS 118.'
        );
      }catch(mailError){
        alert(
          'La segnalazione è stata salvata, ma la mail non è stata inviata.\n\n'+
          mailError.message
        );
      }
    }
  }catch(errorObject){
    resultHost.innerHTML=`
      <div class="notice danger">
        <strong>Invio non riuscito.</strong>
        ${esc(errorObject.message)}
      </div>
    `;
  }finally{
    button.disabled=false;
  }
}

function proposalCard(proposal){
  const hole=proposalHole(proposal);

  const pendingReview=
    has('volunteerProposalReview')&&
    proposal.status==='INVIATA';

  const calendarReady=
    proposal.calendarReady===true;

  const canReview=
    pendingReview&&calendarReady;

  const calendarMonth=
    proposal.calendarMonth||
    String(hole.day||'').slice(0,7);

  const roles=(hole.roles||[])
    .map(roleLabel)
    .join(', ');

  const calendarGate=
    pendingReview&&!calendarReady
      ?`
        <div class="notice warning proposal-calendar-gate">
          <strong>Valutazione bloccata.</strong>
          Prima di approvare o rifiutare, il RO deve generare e salvare
          il calendario dipendenti di <strong>${esc(calendarMonth)}</strong>.
        </div>
      `
      :pendingReview
        ?`
          <div class="notice success proposal-calendar-gate">
            <strong>Calendario mensile verificato.</strong>
            La proposta può essere valutata.
          </div>
        `
        :'';

  const actions=pendingReview
    ?`
      <div class="proposal-actions">
        <button
          class="btn small primary"
          ${canReview?`data-approve="${esc(proposal.id)}"`:'disabled'}
          title="${canReview?'Approva la segnalazione':'Genera e salva prima il calendario mensile'}"
        >
          Approva
        </button>

        <button
          class="btn small danger"
          ${canReview?`data-reject="${esc(proposal.id)}"`:'disabled'}
          title="${canReview?'Rifiuta la segnalazione':'Genera e salva prima il calendario mensile'}"
        >
          Rifiuta
        </button>
      </div>
    `
    :'';

  return `
    <article class="proposal-card proposal-immutable">
      <div class="proposal-head">
        <div>
          <div class="proposal-title">
            ${esc(formatDateIt(hole.day))}
            · ${esc(shiftLabel(hole.shift))}
            · ${esc(siteLabel(hole.site))}
            ${hole.machine?` · mezzo a ${esc(hole.machine)}`:''}
          </div>

          <div class="proposal-meta">
            ${esc(proposal.id)}
            · ${esc(proposal.createdByDisplay||proposal.createdBy||'')}
            · ${esc(proposal.createdAt||'')}
            ${proposal.emailSentAt?' · email RO inviata':''}
          </div>
        </div>

        <span class="proposal-status ${statusClass(proposal.status)}">
          ${esc(statusLabel(proposal.status))}
        </span>
      </div>

      <div class="proposal-body">
        <div class="proposal-line">
          Orario:
          <strong>${esc(hole.start||'--:--')}–${esc(hole.end||'--:--')}</strong>
        </div>

        <div class="proposal-line">
          Ruoli mancanti:
          <strong>${esc(roles||'—')}</strong>
        </div>

        ${hole.note?`
          <div class="proposal-line">
            Nota del Referente:
            <strong>${esc(hole.note)}</strong>
          </div>
        `:''}

        ${proposal.reviewReason?`
          <div class="proposal-line">
            Esito del RO:
            <strong>${esc(proposal.reviewReason)}</strong>
          </div>
        `:''}

        ${calendarGate}
      </div>

      ${actions}
    </article>
  `;
}

function renderProposals(){
  const filter=
    $('#volunteerStatusFilter')?.value||
    'ALL';

  let proposals=workspace.proposals||[];

  if(filter!=='ALL'){
    proposals=proposals.filter(
      proposal=>proposal.status===filter
    );
  }

  const subtitle=$('#volunteerListSubtitle');
  if(subtitle){
    subtitle.textContent=
      `${proposals.length} ${proposals.length===1?'proposta visibile':'proposte visibili'}`;
  }

  const host=$('#volunteerProposalList');
  if(!host)return;

  host.innerHTML=proposals.length
    ?proposals.map(proposalCard).join('')
    :'<div class="volunteer-empty">Nessuna proposta disponibile.</div>';

  $$('[data-approve]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>reviewProposal(
        button.dataset.approve,
        'APPROVE'
      )
    )
  );

  $$('[data-reject]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>reviewProposal(
        button.dataset.reject,
        'REJECT'
      )
    )
  );
}

async function reviewProposal(id,decision){
  const proposal=(workspace.proposals||[])
    .find(item=>item.id===id);

  if(
    proposal&&
    proposal.calendarReady!==true
  ){
    alert(
      `Operazione bloccata.\n\n`+
      `Prima di approvare o rifiutare, il Responsabile Operativo deve `+
      `generare e salvare il calendario dipendenti di `+
      `${proposal.calendarMonth||'quel mese'}.`
    );
    return;
  }

  const reason=
    decision==='REJECT'
      ?prompt('Motivo del rifiuto:','')||''
      :prompt('Nota di approvazione facoltativa:','')||'';

  if(decision==='REJECT'&&!reason)return;

  const confirmed=confirm(
    decision==='APPROVE'
      ?'Confermi l’approvazione della segnalazione? Nessun turno verrà inserito automaticamente.'
      :'Confermi il rifiuto della segnalazione?'
  );

  if(!confirmed)return;

  const context=getServerAuthContext();

  try{
    const result=await reviewVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:context.token,
      proposalId:id,
      decision,
      reason
    });

    await refreshWorkspace();

    alert(
      result.status==='APPROVATA'
        ?'Segnalazione approvata. Il calendario non è stato modificato.'
        :'Segnalazione rifiutata.'
    );

    if(result.applied){
      await onApplied?.();
    }
  }catch(error){
    alert(error.message);
  }
}

export async function refreshWorkspace(){
  const context=getServerAuthContext();
  const host=$('#volunteerProposalList');

  if(host){
    host.innerHTML=
      '<div class="volunteer-loading">Caricamento proposte…</div>';
  }

  try{
    workspace=await loadVolunteerWorkspace({
      url:ATLAS_SERVER_URL,
      token:context.token
    });

    renderProposals();
  }catch(error){
    if(host){
      host.innerHTML=`
        <div class="notice danger">
          <strong>Caricamento non riuscito.</strong>
          ${esc(error.message)}
        </div>
      `;
    }
  }
}

export async function initVolunteerCoverage({
  user,
  onProposalApplied
}={}){
  currentUser=user||{};
  permissions=new Set(currentUser.permissions||[]);
  onApplied=onProposalApplied;

  const roleChip=$('#volunteerRoleChip');
  if(roleChip){
    roleChip.textContent=currentUser.role||'Profilo';
  }

  const createPanel=$('#volunteerCreatePanel');
  if(createPanel){
    createPanel.classList.toggle(
      'hidden',
      !has('volunteerProposalCreate')
    );
  }

  const view=$('#volunteerCoverageView');

  if(
    view&&
    view.dataset.simpleVolunteerInitialized!=='true'
  ){
    view.dataset.simpleVolunteerInitialized='true';

    $('#volunteerShift')
      ?.addEventListener('change',defaultTimes);

    $('#volunteerDay')
      ?.addEventListener('change',defaultTimes);

    $('#volunteerSubmitBtn')
      ?.addEventListener('click',submitProposal);

    $('#volunteerRefreshBtn')
      ?.addEventListener('click',refreshWorkspace);

    $('#volunteerStatusFilter')
      ?.addEventListener('change',renderProposals);
  }

  const today=new Date();
  const dayField=$('#volunteerDay');

  if(dayField&&!dayField.value){
    dayField.value=
      `${today.getFullYear()}-`+
      `${String(today.getMonth()+1).padStart(2,'0')}-`+
      `${String(today.getDate()).padStart(2,'0')}`;
  }

  defaultTimes();
  await refreshWorkspace();
}
