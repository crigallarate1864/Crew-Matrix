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

function setElementHidden(element,hidden){
  if(!element)return;
  element.classList.toggle('hidden',hidden);
  element.toggleAttribute('hidden',hidden);
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

  $$('[data-access="admin"]').forEach(element=>
    setElementHidden(element,code!=='ADMIN')
  );

  $$('[data-access="employees"]').forEach(element=>
    setElementHidden(element,!has('saveEmployees'))
  );

  const volunteerNav=$('#volunteerCoverageNav');
  setElementHidden(
    volunteerNav,
    !(
      has('volunteerProposalCreate')||
      has('volunteerProposalView')
    )
  );

  /*
   * Schermata iniziale:
   * - Admin e RO: Calendario dipendenti.
   * - Responsabile Volontari: solo modulo richieste.
   */
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

function requestFromForm(){
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

function validateRequest(request){
  if(!request.day||!request.start||!request.end){
    return'Data e orari sono obbligatori.';
  }

  if(!request.roles.length){
    return'Seleziona almeno un ruolo mancante.';
  }

  if(request.shift==='N'&&request.machine==='2'){
    return'La notte richiede un equipaggio a 3.';
  }

  if(
    ['S','SU'].includes(request.site)&&
    request.machine!=='3'
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
    INVIATA:'DA ACCETTARE',
    APPROVATA:'ACCETTATA',
    RIFIUTATA:'RIFIUTATA DALL’ADMIN',
    APPLICATA:'APPLICATA · STORICO'
  })[status]||status||'';
}

function proposalRequest(proposal){
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

async function submitRequest(){
  if(!has('volunteerProposalCreate')){
    alert('Il tuo profilo non può inoltrare richieste volontari.');
    return;
  }

  const request=requestFromForm();
  const error=validateRequest(request);

  if(error){
    alert(error);
    return;
  }

  const button=$('#volunteerSubmitBtn');
  const resultHost=$('#volunteerSubmissionResult');
  const context=getServerAuthContext();

  button.disabled=true;
  resultHost.innerHTML=
    '<div class="volunteer-loading">Invio richiesta in corso…</div>';

  try{
    const result=await submitVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:context.token,
      hole:request
    });

    resultHost.innerHTML=
      '<div class="notice success"><strong>Richiesta inoltrata al Responsabile Operativo.</strong> Nessun dipendente è stato scelto e il calendario non è stato modificato.</div>';

    $('#volunteerNote').value='';

    ['A','C','S'].forEach(role=>{
      const checkbox=$(`#volRole${role}`);
      if(checkbox)checkbox.checked=false;
    });

    const sendMail=confirm(
      'Richiesta registrata in ATLAS 118.\n\n'+
      'Vuoi inviare una mail al Responsabile Operativo?\n\n'+
      'La mail sarà solo informativa: la richiesta potrà essere '+
      'accettata esclusivamente in ATLAS.'
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
          'La richiesta resta da accettare esclusivamente in ATLAS 118.'
        );
      }catch(mailError){
        alert(
          'La richiesta è stata salvata, ma la mail non è stata inviata.\n\n'+
          mailError.message
        );
      }
    }

    /*
     * Il Responsabile Volontari può solo inoltrare.
     * Admin può vedere subito la nuova richiesta nel pannello a destra.
     */
    if(has('volunteerProposalView')){
      await refreshWorkspace();
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
  const request=proposalRequest(proposal);

  const canApprove=
    has('volunteerProposalApprove')&&
    proposal.status==='INVIATA';

  const canReject=
    has('volunteerProposalReject')&&
    proposal.status==='INVIATA';

  const pendingAction=canApprove||canReject;
  const calendarReady=proposal.calendarReady===true;

  const calendarMonth=
    proposal.calendarMonth||
    String(request.day||'').slice(0,7);

  const roles=(request.roles||[])
    .map(roleLabel)
    .join(', ');

  const calendarGate=
    pendingAction&&!calendarReady
      ?`
        <div class="notice warning proposal-calendar-gate">
          <strong>Accettazione bloccata.</strong>
          Prima di gestire questa richiesta è necessario generare e salvare
          il calendario dipendenti di <strong>${esc(calendarMonth)}</strong>.
        </div>
      `
      :pendingAction
        ?`
          <div class="notice success proposal-calendar-gate">
            <strong>Calendario mensile verificato.</strong>
            La richiesta può essere gestita.
          </div>
        `
        :'';

  const approveButton=canApprove
    ?`
      <button
        class="btn small primary"
        ${calendarReady?`data-approve="${esc(proposal.id)}"`:'disabled'}
        title="${calendarReady?'Accetta la richiesta':'Genera e salva prima il calendario mensile'}"
      >
        Accetta richiesta
      </button>
    `
    :'';

  const rejectButton=canReject
    ?`
      <button
        class="btn small danger"
        ${calendarReady?`data-reject="${esc(proposal.id)}"`:'disabled'}
        title="${calendarReady?'Rifiuta la richiesta come Admin':'Genera e salva prima il calendario mensile'}"
      >
        Rifiuta · Admin
      </button>
    `
    :'';

  const actions=(approveButton||rejectButton)
    ?`
      <div class="proposal-actions">
        ${approveButton}
        ${rejectButton}
      </div>
    `
    :'';

  return `
    <article class="proposal-card proposal-immutable">
      <div class="proposal-head">
        <div>
          <div class="proposal-title">
            ${esc(formatDateIt(request.day))}
            · ${esc(shiftLabel(request.shift))}
            · ${esc(siteLabel(request.site))}
            ${request.machine?` · mezzo a ${esc(request.machine)}`:''}
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
          <strong>${esc(request.start||'--:--')}–${esc(request.end||'--:--')}</strong>
        </div>

        <div class="proposal-line">
          Dipendenti richiesti per i ruoli:
          <strong>${esc(roles||'—')}</strong>
        </div>

        ${request.note?`
          <div class="proposal-line">
            Nota del Responsabile Volontari:
            <strong>${esc(request.note)}</strong>
          </div>
        `:''}

        ${proposal.reviewReason?`
          <div class="proposal-line">
            Nota di gestione:
            <strong>${esc(proposal.reviewReason)}</strong>
          </div>
        `:''}

        ${calendarGate}
      </div>

      ${actions}
    </article>
  `;
}

function renderRequests(){
  if(!has('volunteerProposalView'))return;

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
      `${proposals.length} ${proposals.length===1?'richiesta visibile':'richieste visibili'}`;
  }

  const host=$('#volunteerProposalList');
  if(!host)return;

  host.innerHTML=proposals.length
    ?proposals.map(proposalCard).join('')
    :'<div class="volunteer-empty">Nessuna richiesta disponibile.</div>';

  $$('[data-approve]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>reviewRequest(
        button.dataset.approve,
        'APPROVE'
      )
    )
  );

  $$('[data-reject]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>reviewRequest(
        button.dataset.reject,
        'REJECT'
      )
    )
  );
}

async function reviewRequest(id,decision){
  const requiredPermission=
    decision==='REJECT'
      ?'volunteerProposalReject'
      :'volunteerProposalApprove';

  if(!has(requiredPermission)){
    alert('Il tuo profilo non può eseguire questa operazione.');
    return;
  }

  const proposal=(workspace.proposals||[])
    .find(item=>item.id===id);

  if(
    proposal&&
    proposal.calendarReady!==true
  ){
    alert(
      `Operazione bloccata.\n\n`+
      `Prima di gestire la richiesta è necessario generare e salvare `+
      `il calendario dipendenti di `+
      `${proposal.calendarMonth||'quel mese'}.`
    );
    return;
  }

  const reason=
    decision==='REJECT'
      ?prompt('Motivo del rifiuto da parte dell’Admin:','')||''
      :prompt('Nota di accettazione facoltativa:','')||'';

  if(decision==='REJECT'&&!reason)return;

  const confirmed=confirm(
    decision==='APPROVE'
      ?'Confermi l’accettazione della richiesta? Nessun dipendente verrà assegnato automaticamente.'
      :'Confermi il rifiuto della richiesta come Admin?'
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
        ?'Richiesta accettata. Il calendario non è stato modificato.'
        :'Richiesta rifiutata dall’Admin.'
    );
  }catch(error){
    alert(error.message);
  }
}

export async function refreshWorkspace(){
  if(!has('volunteerProposalView'))return;

  const context=getServerAuthContext();
  const host=$('#volunteerProposalList');

  if(host){
    host.innerHTML=
      '<div class="volunteer-loading">Caricamento richieste…</div>';
  }

  try{
    workspace=await loadVolunteerWorkspace({
      url:ATLAS_SERVER_URL,
      token:context.token
    });

    renderRequests();
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
  user
}={}){
  currentUser=user||{};
  permissions=new Set(currentUser.permissions||[]);

  const code=roleCode(currentUser);

  const roleChip=$('#volunteerRoleChip');
  if(roleChip){
    roleChip.textContent=currentUser.role||'Profilo';
  }

  /*
   * Admin: inserimento + visione + gestione.
   * RO: sola visione e accettazione.
   * Responsabile Volontari: solo inserimento.
   */
  setElementHidden(
    $('#volunteerCreatePanel'),
    !has('volunteerProposalCreate')
  );

  setElementHidden(
    document.querySelector('.volunteer-list-panel'),
    !has('volunteerProposalView')
  );

  setElementHidden(
    $('#volunteerRefreshBtn'),
    !has('volunteerProposalView')
  );

  const view=$('#volunteerCoverageView');

  if(
    view&&
    view.dataset.finalRolesInitialized!=='true'
  ){
    view.dataset.finalRolesInitialized='true';

    $('#volunteerShift')
      ?.addEventListener('change',defaultTimes);

    $('#volunteerDay')
      ?.addEventListener('change',defaultTimes);

    $('#volunteerSubmitBtn')
      ?.addEventListener('click',submitRequest);

    $('#volunteerRefreshBtn')
      ?.addEventListener('click',refreshWorkspace);

    $('#volunteerStatusFilter')
      ?.addEventListener('change',renderRequests);
  }

  if(has('volunteerProposalCreate')){
    const today=new Date();
    const dayField=$('#volunteerDay');

    if(dayField&&!dayField.value){
      dayField.value=
        `${today.getFullYear()}-`+
        `${String(today.getMonth()+1).padStart(2,'0')}-`+
        `${String(today.getDate()).padStart(2,'0')}`;
    }

    defaultTimes();
  }

  if(has('volunteerProposalView')){
    await refreshWorkspace();
  }

  if(code==='VOLUNTEER_SCHEDULER'){
    switchToView('volunteerCoverageView');
  }
}
