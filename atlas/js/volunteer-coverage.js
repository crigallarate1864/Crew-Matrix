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

function resolveAccessProfile(user){
  const userPermissions=new Set(user?.permissions||[]);
  const username=String(user?.username||'')
    .trim()
    .toLowerCase();
  const roleCodeValue=String(user?.roleCode||'')
    .trim()
    .toUpperCase();
  const roleLabelValue=String(user?.role||'')
    .trim()
    .toLowerCase();
  const serverProfile=String(user?.profileType||'')
    .trim()
    .toUpperCase();

  /*
   * Admin ha la precedenza assoluta.
   */
  if(
    serverProfile==='ADMIN'||
    roleCodeValue==='ADMIN'||
    username==='admin'||
    userPermissions.has('admin')
  ){
    return'ADMIN';
  }

  /*
   * Identificazione blindata del Referente Volontari.
   * Comprende anche i vecchi username per proteggere le installazioni
   * che non hanno ancora completato il reset credenziali.
   */
  const volunteerIdentity=
    serverProfile==='VOLUNTEER_ONLY'||
    roleCodeValue==='VOLUNTEER_SCHEDULER'||
    username==='referente.volontari'||
    username==='turnazione.volontari'||
    roleLabelValue.includes('referente volontari')||
    roleLabelValue.includes('responsabile volontari')||
    (
      userPermissions.has('volunteerProposalCreate')&&
      !userPermissions.has('read')&&
      !userPermissions.has('savePlan')&&
      !userPermissions.has('saveEmployees')
    );

  if(volunteerIdentity){
    return'VOLUNTEER_ONLY';
  }

  if(
    serverProfile==='RO'||
    roleCodeValue==='RO'||
    username==='responsabile.operativo'||
    roleLabelValue.includes('responsabile operativo')||
    (
      userPermissions.has('read')&&
      userPermissions.has('savePlan')&&
      userPermissions.has('saveEmployees')
    )
  ){
    return'RO';
  }

  return'DENIED';
}

function isVolunteerOnlyProfile(user){
  return resolveAccessProfile(user)==='VOLUNTEER_ONLY';
}

function setHidden(element,hidden){
  if(!element)return;
  element.classList.toggle('hidden',hidden);
  element.toggleAttribute('hidden',hidden);
}

function switchToView(id){
  $$('.view').forEach(view=>
    view.classList.toggle('active',view.id===id)
  );

  $$('.nav-btn').forEach(button=>
    button.classList.toggle('active',button.dataset.view===id)
  );
}

function restrictVolunteerInterface(){
  /*
   * Il Referente Volontari deve vedere una sola pagina e un solo modulo.
   * Nascondiamo anche gli elementi già presenti nel DOM, non soltanto il menu.
   */
  $$('.nav-btn').forEach(button=>
    setHidden(
      button,
      button.dataset.view!=='volunteerCoverageView'
    )
  );

  $$('.view').forEach(view=>
    setHidden(
      view,
      view.id!=='volunteerCoverageView'
    )
  );

  $$('.top-actions .action-group').forEach(group=>{
    const containsLogout=group.querySelector('#logoutBtn');
    setHidden(group,!containsLogout);
  });

  setHidden($('#settingsBtn'),true);
  setHidden($('#sidebarMenuBtn'),true);
  setHidden($('#sidebarPinBtn'),true);
}

export function applyAccessProfile(user){
  currentUser=user||{};
  permissions=new Set(currentUser.permissions||[]);

  document.body.classList.remove(
    'role-admin',
    'role-ro',
    'role-volunteer-scheduler'
  );

  const profile=resolveAccessProfile(currentUser);

  document.body.dataset.atlasProfile=profile;

  document.body.classList.add(
    profile==='ADMIN'
      ?'role-admin'
      :profile==='RO'
        ?'role-ro'
        :'role-volunteer-scheduler'
  );

  $$('[data-access="admin"]').forEach(element=>
    setHidden(element,profile!=='ADMIN')
  );

  $$('[data-access="employees"]').forEach(element=>
    setHidden(element,!has('saveEmployees'))
  );

  setHidden(
    $('#volunteerCoverageNav'),
    !(
      has('volunteerProposalCreate')||
      has('volunteerProposalView')
    )
  );

  if(profile==='VOLUNTEER_ONLY'){
    restrictVolunteerInterface();
    switchToView('volunteerCoverageView');
  }else if(
    profile==='ADMIN'||
    profile==='RO'
  ){
    switchToView('calendarView');
  }else{
    restrictVolunteerInterface();
    alert(
      'Profilo utente non riconosciuto. '+
      'Contatta l’amministratore ATLAS.'
    );
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

function proposalFromForm(){
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

function validateProposal(proposal){
  if(!proposal.day||!proposal.start||!proposal.end){
    return'Data e orari sono obbligatori.';
  }

  if(!proposal.roles.length){
    return'Seleziona almeno un ruolo mancante.';
  }

  if(proposal.shift==='N'&&proposal.machine==='2'){
    return'La notte richiede un equipaggio a 3.';
  }

  if(
    ['S','SU'].includes(proposal.site)&&
    proposal.machine!=='3'
  ){
    return'Somma e Sumirago richiedono un equipaggio a 3.';
  }

  return'';
}

function proposalData(item){
  try{
    return typeof item.hole==='string'
      ?JSON.parse(item.hole)
      :item.hole||{};
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

function statusClass(status){
  return status==='APPROVATA'
    ?'status-approved'
    :status==='RIFIUTATA'
      ?'status-rejected'
      :'status-sent';
}

function statusLabel(status){
  return ({
    INVIATA:'DA VALUTARE',
    APPROVATA:'APPROVATA',
    RIFIUTATA:'RIGETTATA'
  })[status]||status||'';
}

async function submitProposal(){
  if(!has('volunteerProposalCreate')){
    alert('Il tuo profilo non può inviare proposte.');
    return;
  }

  const proposal=proposalFromForm();
  const error=validateProposal(proposal);

  if(error){
    alert(error);
    return;
  }

  const button=$('#volunteerSubmitBtn');
  const host=$('#volunteerSubmissionResult');
  const context=getServerAuthContext();

  button.disabled=true;
  host.innerHTML=
    '<div class="volunteer-loading">Invio proposta in corso…</div>';

  try{
    const result=await submitVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:context.token,
      hole:proposal
    });

    host.innerHTML=
      '<div class="notice success"><strong>Proposta inviata al Responsabile Operativo.</strong> Nessun dipendente è stato selezionato e il calendario non è stato modificato.</div>';

    $('#volunteerNote').value='';

    ['A','C','S'].forEach(role=>{
      const checkbox=$(`#volRole${role}`);
      if(checkbox)checkbox.checked=false;
    });

    const sendMail=confirm(
      'Proposta registrata in ATLAS 118.\n\n'+
      'Vuoi inviare una mail al Responsabile Operativo?\n\n'+
      'La mail è informativa: la proposta può essere approvata o rigettata '+
      'esclusivamente in ATLAS.'
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
          'La proposta è stata salvata, ma la mail non è stata inviata.\n\n'+
          mailError.message
        );
      }
    }

    if(has('volunteerProposalView')){
      await refreshWorkspace();
    }
  }catch(errorObject){
    host.innerHTML=`
      <div class="notice danger">
        <strong>Invio non riuscito.</strong>
        ${esc(errorObject.message)}
      </div>
    `;
  }finally{
    button.disabled=false;
  }
}

function proposalCard(item){
  const proposal=proposalData(item);
  const pending=item.status==='INVIATA';

  const canApprove=
    pending&&
    has('volunteerProposalApprove');

  const canReject=
    pending&&
    has('volunteerProposalReject');

  const calendarReady=item.calendarReady===true;
  const calendarMonth=
    item.calendarMonth||
    String(proposal.day||'').slice(0,7);

  const roles=(proposal.roles||[])
    .map(roleLabel)
    .join(', ');

  const gate=
    (canApprove||canReject)&&!calendarReady
      ?`
        <div class="notice warning proposal-calendar-gate">
          <strong>Valutazione bloccata.</strong>
          Prima di approvare o rigettare è necessario generare e salvare
          il calendario dipendenti di <strong>${esc(calendarMonth)}</strong>.
        </div>
      `
      :(canApprove||canReject)
        ?`
          <div class="notice success proposal-calendar-gate">
            <strong>Calendario mensile verificato.</strong>
            La proposta può essere valutata.
          </div>
        `
        :'';

  const actions=(canApprove||canReject)
    ?`
      <div class="proposal-actions">
        ${canApprove?`
          <button
            class="btn small primary"
            ${calendarReady?`data-approve="${esc(item.id)}"`:'disabled'}
          >
            Approva
          </button>
        `:''}

        ${canReject?`
          <button
            class="btn small danger"
            ${calendarReady?`data-reject="${esc(item.id)}"`:'disabled'}
          >
            Rigetta
          </button>
        `:''}
      </div>
    `
    :'';

  return `
    <article class="proposal-card proposal-immutable">
      <div class="proposal-head">
        <div>
          <div class="proposal-title">
            ${esc(formatDateIt(proposal.day))}
            · ${esc(shiftLabel(proposal.shift))}
            · ${esc(siteLabel(proposal.site))}
            ${proposal.machine?` · mezzo a ${esc(proposal.machine)}`:''}
          </div>

          <div class="proposal-meta">
            ${esc(item.id)}
            · ${esc(item.createdByDisplay||item.createdBy||'')}
            · ${esc(item.createdAt||'')}
            ${item.emailSentAt?' · email RO inviata':''}
          </div>
        </div>

        <span class="proposal-status ${statusClass(item.status)}">
          ${esc(statusLabel(item.status))}
        </span>
      </div>

      <div class="proposal-body">
        <div class="proposal-line">
          Orario:
          <strong>${esc(proposal.start||'--:--')}–${esc(proposal.end||'--:--')}</strong>
        </div>

        <div class="proposal-line">
          Ruoli richiesti:
          <strong>${esc(roles||'—')}</strong>
        </div>

        ${proposal.note?`
          <div class="proposal-line">
            Nota del Referente Volontari:
            <strong>${esc(proposal.note)}</strong>
          </div>
        `:''}

        ${item.reviewReason?`
          <div class="proposal-line">
            Esito:
            <strong>${esc(item.reviewReason)}</strong>
          </div>
        `:''}

        ${gate}
      </div>

      ${actions}
    </article>
  `;
}

function renderProposals(){
  if(!has('volunteerProposalView'))return;

  const filter=
    $('#volunteerStatusFilter')?.value||
    'ALL';

  let proposals=workspace.proposals||[];

  if(filter!=='ALL'){
    proposals=proposals.filter(
      item=>item.status===filter
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
      ()=>reviewProposal(button.dataset.approve,'APPROVE')
    )
  );

  $$('[data-reject]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>reviewProposal(button.dataset.reject,'REJECT')
    )
  );
}

async function reviewProposal(id,decision){
  const permission=
    decision==='REJECT'
      ?'volunteerProposalReject'
      :'volunteerProposalApprove';

  if(!has(permission)){
    alert('Il tuo profilo non può eseguire questa operazione.');
    return;
  }

  const item=(workspace.proposals||[])
    .find(proposal=>proposal.id===id);

  if(item&&item.calendarReady!==true){
    alert(
      `Operazione bloccata.\n\n`+
      `Prima di valutare la proposta devi generare e salvare `+
      `il calendario dipendenti di ${item.calendarMonth||'quel mese'}.`
    );
    return;
  }

  const reason=
    decision==='REJECT'
      ?prompt('Motivo del rigetto:','')||''
      :prompt('Nota di approvazione facoltativa:','')||'';

  if(decision==='REJECT'&&!reason)return;

  const confirmed=confirm(
    decision==='APPROVE'
      ?'Confermi l’approvazione? Nessun dipendente verrà assegnato automaticamente.'
      :'Confermi il rigetto della proposta?'
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
        ?'Proposta approvata. Il calendario non è stato modificato.'
        :'Proposta rigettata.'
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

export async function initVolunteerCoverage({user}={}){
  currentUser=user||{};
  permissions=new Set(currentUser.permissions||[]);

  const profile=resolveAccessProfile(currentUser);

  const roleChip=$('#volunteerRoleChip');
  if(roleChip){
    roleChip.textContent=currentUser.role||'Profilo';
  }

  /*
   * Admin: modulo + lista.
   * RO: soltanto lista, con Approva e Rigetta.
   * Referente Volontari: soltanto modulo.
   */
  setHidden(
    $('#volunteerCreatePanel'),
    !has('volunteerProposalCreate')
  );

  setHidden(
    document.querySelector('.volunteer-list-panel'),
    !has('volunteerProposalView')
  );

  setHidden(
    $('#volunteerRefreshBtn'),
    !has('volunteerProposalView')
  );

  const view=$('#volunteerCoverageView');

  if(
    view&&
    view.dataset.release158Initialized!=='true'
  ){
    view.dataset.release158Initialized='true';

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

  if(profile==='VOLUNTEER_ONLY'){
    restrictVolunteerInterface();
    switchToView('volunteerCoverageView');
  }
}

export {
  resolveAccessProfile,
  isVolunteerOnlyProfile
};
