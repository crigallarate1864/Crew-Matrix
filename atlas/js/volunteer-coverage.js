import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth.js';
import {
  loadVolunteerWorkspace,
  analyzeVolunteerCoverage,
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

const MOBILE_QUERY=window.matchMedia('(max-width:760px)');

let currentUser=null;
let permissions=new Set();
let workspace={proposals:[]};
let analysis=null;
let onApplied=null;
let activeMobileTab='create';

function has(permission){
  return permissions.has(permission);
}

function roleCode(user){
  return String(user?.roleCode||'').toUpperCase();
}

function switchToVolunteer(){
  $$('.view').forEach(view=>
    view.classList.toggle(
      'active',
      view.id==='volunteerCoverageView'
    )
  );

  $$('.nav-btn').forEach(button=>
    button.classList.toggle(
      'active',
      button.dataset.view==='volunteerCoverageView'
    )
  );
}

function formatDateIt(value){
  const text=String(value||'');
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if(!match)return text||'Data non indicata';

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatTimestamp(value){
  const text=String(value||'').trim();
  if(!text)return '';

  const date=new Date(text);
  if(Number.isNaN(date.getTime()))return text;

  return new Intl.DateTimeFormat(
    'it-IT',
    {
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    }
  ).format(date);
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

function roleClass(code){
  return `role-${String(code||'').toLowerCase()}`;
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
    APPLICATA:'Applicata',
    APPROVATA:'Approvata',
    RIFIUTATA:'Rifiutata',
    INVIATA:'Da valutare'
  })[status]||status||'Bozza';
}

function setVolunteerMobileTab(tab,{scroll=false}={}){
  activeMobileTab=tab==='list'?'list':'create';

  $$('[data-volunteer-tab]').forEach(button=>{
    const active=button.dataset.volunteerTab===activeMobileTab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });

  $$('[data-volunteer-panel]').forEach(panel=>
    panel.classList.toggle(
      'mobile-active',
      panel.dataset.volunteerPanel===activeMobileTab
    )
  );

  if(
    scroll&&
    MOBILE_QUERY.matches
  ){
    $('#volunteerCoverageView')
      ?.scrollIntoView({
        behavior:'smooth',
        block:'start'
      });
  }
}

function defaultTimes(){
  const day=$('#volunteerDay')?.value||'';
  const shift=$('#volunteerShift')?.value||'M';

  if(!day){
    updateDraftSummary();
    return;
  }

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

  updateDraftSummary();
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

function updateDraftSummary(){
  const host=$('#volunteerDraftSummary');
  if(!host)return;

  const hole=holeFromForm();

  if(!hole.day){
    host.innerHTML=`
      <span class="draft-summary-icon" aria-hidden="true">○</span>
      <div>
        <strong>Compila i dati del turno</strong>
        <small>Il riepilogo della scopertura apparirà qui.</small>
      </div>
    `;
    return;
  }

  const roles=hole.roles.length
    ?hole.roles.map(roleLabel).join(', ')
    :'nessun ruolo selezionato';

  host.innerHTML=`
    <span class="draft-summary-icon ready" aria-hidden="true">✓</span>
    <div>
      <strong>${esc(formatDateIt(hole.day))} · ${esc(shiftLabel(hole.shift))} · ${esc(hole.start)}–${esc(hole.end)}</strong>
      <small>${esc(siteLabel(hole.site))} · mezzo a ${esc(hole.machine)} · ${esc(roles)}</small>
    </div>
  `;
}

function validateHole(hole){
  if(!hole.day||!hole.start||!hole.end){
    return 'Data e orari sono obbligatori.';
  }

  if(!hole.roles.length){
    return 'Seleziona almeno un ruolo mancante.';
  }

  if(
    hole.shift==='N'&&
    hole.machine==='2'
  ){
    return 'La notte richiede un equipaggio a 3.';
  }

  if(
    ['S','SU'].includes(hole.site)&&
    hole.machine!=='3'
  ){
    return 'Somma e Sumirago richiedono un equipaggio a 3.';
  }

  return '';
}

function invalidateAnalysis(){
  if(!analysis)return;

  analysis=null;

  const host=$('#volunteerAnalysisResult');
  if(host){
    host.innerHTML=`
      <div class="notice info volunteer-inline-notice">
        <strong>Dati modificati.</strong>
        Esegui nuovamente la ricerca per aggiornare le soluzioni.
      </div>
    `;
  }

  const submit=$('#volunteerSubmitBtn');
  if(submit)submit.disabled=true;

  const hint=$('#volunteerSubmitHint');
  if(hint){
    hint.textContent=
      'I dati sono cambiati: ripeti la ricerca prima dell’invio.';
  }
}

function personCard(person){
  return `
    <div class="solution-person">
      <span class="solution-role-badge ${roleClass(person.role)}">
        ${esc(person.role)}
      </span>
      <div class="solution-person-copy">
        <strong>${esc(person.employeeName||person.employeeId||'—')}</strong>
        <small>${esc(roleLabel(person.role))}${person.group?` · Gruppo ${esc(person.group)}`:''}</small>
      </div>
    </div>
  `;
}

function changeCard(change){
  return `
    <div class="solution-change">
      <span class="change-icon" aria-hidden="true">↔</span>
      <div class="change-copy">
        <div class="change-route">
          <span>${esc(change.fromEmployeeName||change.fromEmployeeId||'—')}</span>
          <i aria-hidden="true">→</i>
          <span>${esc(change.toEmployeeName||change.toEmployeeId||'—')}</span>
        </div>
        <small>
          ${esc(formatDateIt(change.day))}
          · ${esc(change.code||'Turno')}
          · ${esc(change.start||'--:--')}–${esc(change.end||'--:--')}
        </small>
      </div>
    </div>
  `;
}

function solutionHtml(solution,index){
  const changes=solution.changes||[];
  const direct=changes.length===0;

  const crew=(solution.crew||[])
    .map(personCard)
    .join('');

  const changesHtml=changes
    .map(changeCard)
    .join('');

  const warnings=(solution.warnings||[])
    .map(warning=>`
      <div class="solution-warning">
        <span aria-hidden="true">!</span>
        <span>${esc(warning)}</span>
      </div>
    `)
    .join('');

  return `
    <label class="solution-card ${index===0?'selected':''}"
           data-solution="${esc(solution.id)}">
      <input class="solution-radio" type="radio"
             name="volunteerSolution" value="${esc(solution.id)}"
             ${index===0?'checked':''} />

      <div class="solution-card-content">
        <div class="solution-head">
          <div class="solution-heading">
            <div class="solution-title">${esc(solution.label||`Soluzione ${index+1}`)}</div>
            <div class="solution-meta">
              ${esc(solution.summary||'Copertura compatibile')}
              <span class="score-pill">Punteggio ${esc(solution.score??'—')}</span>
            </div>
          </div>
          <span class="proposal-status ${direct?'status-approved':'status-sent'}">
            ${direct?'Diretta':'Con cambi'}
          </span>
        </div>

        <div class="solution-block">
          <div class="solution-block-title">Equipaggio proposto</div>
          <div class="solution-crew">${crew||'<div class="solution-empty">Nessun nominativo disponibile.</div>'}</div>
        </div>

        ${changesHtml?`
          <div class="solution-block solution-changes">
            <div class="solution-block-title">Cambi turno necessari</div>
            <div class="solution-change-list">${changesHtml}</div>
          </div>
        `:''}

        ${warnings?`
          <div class="solution-warning-list">${warnings}</div>
        `:''}
      </div>
    </label>
  `;
}

function renderAnalysis(){
  const host=$('#volunteerAnalysisResult');
  const submit=$('#volunteerSubmitBtn');
  const hint=$('#volunteerSubmitHint');

  if(!host||!submit)return;

  const solutions=analysis?.solutions||[];
  host.setAttribute('aria-busy','false');

  if(!solutions.length){
    host.innerHTML=`
      <div class="volunteer-result-empty">
        <span aria-hidden="true">×</span>
        <div>
          <strong>Nessuna soluzione compatibile</strong>
          <p>ATLAS non ha trovato coperture dirette o cambi turno validi con i vincoli attuali.</p>
        </div>
      </div>
    `;
    submit.disabled=true;
    if(hint){
      hint.textContent=
        'Nessuna proposta selezionabile: verifica i dati o informa il RO.';
    }
    return;
  }

  host.innerHTML=`
    <div class="volunteer-result-head">
      <div>
        <strong>${solutions.length} ${solutions.length===1?'soluzione trovata':'soluzioni trovate'}</strong>
        <small>Seleziona la proposta più adatta. Nessun cambio sarà applicato senza il RO.</small>
      </div>
      <span class="result-count">${solutions.length}</span>
    </div>
    <div class="solution-list">
      ${solutions.map(solutionHtml).join('')}
    </div>
  `;

  submit.disabled=false;

  if(hint){
    hint.textContent=
      'Controlla la soluzione selezionata e inviala al Responsabile Operativo.';
  }

  $$('[data-solution]').forEach(card=>{
    card.addEventListener('click',()=>{
      $$('[data-solution]').forEach(item=>
        item.classList.remove('selected')
      );
      card.classList.add('selected');
    });
  });

  $$('input[name="volunteerSolution"]').forEach(radio=>{
    radio.addEventListener('change',()=>{
      const card=radio.closest('[data-solution]');
      $$('[data-solution]').forEach(item=>
        item.classList.toggle('selected',item===card)
      );
    });
  });
}

async function analyze(){
  const hole=holeFromForm();
  const error=validateHole(hole);

  if(error){
    alert(error);
    return;
  }

  const context=getServerAuthContext();
  const button=$('#volunteerAnalyzeBtn');
  const host=$('#volunteerAnalysisResult');

  button.disabled=true;
  host.setAttribute('aria-busy','true');
  host.innerHTML=`
    <div class="volunteer-loading-card">
      <span class="volunteer-spinner" aria-hidden="true"></span>
      <div>
        <strong>Ricerca in corso</strong>
        <small>Controllo coperture dirette, riposi e possibili cambi turno…</small>
      </div>
    </div>
  `;

  try{
    analysis=await analyzeVolunteerCoverage({
      url:ATLAS_SERVER_URL,
      token:context.token,
      hole
    });
    renderAnalysis();
  }catch(errorObject){
    analysis=null;
    host.setAttribute('aria-busy','false');
    host.innerHTML=`
      <div class="volunteer-result-empty danger">
        <span aria-hidden="true">!</span>
        <div>
          <strong>Analisi non riuscita</strong>
          <p>${esc(errorObject.message)}</p>
        </div>
      </div>
    `;
  }finally{
    button.disabled=false;
  }
}

async function submitProposal(){
  const selected=$(
    'input[name="volunteerSolution"]:checked'
  )?.value;

  if(!selected)return;

  const hole=holeFromForm();
  const context=getServerAuthContext();
  const submit=$('#volunteerSubmitBtn');

  submit.disabled=true;

  try{
    const result=await submitVolunteerProposal({
      url:ATLAS_SERVER_URL,
      token:context.token,
      hole,
      solutionId:selected
    });

    analysis=null;

    $('#volunteerAnalysisResult').innerHTML=`
      <div class="volunteer-result-empty success">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Proposta inviata al Responsabile Operativo</strong>
          <p>Da questo momento la proposta è registrata e non può più essere modificata.</p>
        </div>
      </div>
    `;

    $('#volunteerNote').value='';
    await refreshWorkspace();

    const sendMail=confirm(
      'Proposta registrata in ATLAS 118.\n\n'+
      'Vuoi inviare una mail al Responsabile Operativo '+
      'con gli inserimenti proposti?\n\n'+
      'La mail sarà solo informativa: i turni potranno '+
      'essere accettati o rifiutati esclusivamente in ATLAS.'
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
          'La proposta resta da valutare esclusivamente in ATLAS 118.'
        );
      }catch(mailError){
        alert(
          'La proposta è stata salvata correttamente, '+
          'ma la mail non è stata inviata.\n\n'+
          mailError.message
        );
      }
    }

    setVolunteerMobileTab('list',{scroll:true});
  }catch(error){
    alert(error.message);
  }finally{
    submit.disabled=!analysis?.solutions?.length;
    const hint=$('#volunteerSubmitHint');
    if(hint&&!analysis){
      hint.textContent=
        'Proposta registrata. Crea una nuova ricerca per un altro turno.';
    }
  }
}

function proposalSolution(proposal){
  try{
    return typeof proposal.solution==='string'
      ?JSON.parse(proposal.solution)
      :proposal.solution||{};
  }catch{
    return {};
  }
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

function proposalCard(proposal){
  const hole=proposalHole(proposal);
  const solution=proposalSolution(proposal);

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

  const crew=(solution.crew||[])
    .map(personCard)
    .join('');

  const changes=(solution.changes||[])
    .map(changeCard)
    .join('');

  const warnings=(solution.warnings||[])
    .map(warning=>`
      <div class="solution-warning">
        <span aria-hidden="true">!</span>
        <span>${esc(warning)}</span>
      </div>
    `)
    .join('');

  const calendarGate=
    pendingReview&&!calendarReady
      ?`
        <div class="proposal-gate locked">
          <span class="gate-icon" aria-hidden="true">⌛</span>
          <div>
            <strong>Valutazione bloccata</strong>
            <small>Il RO deve prima generare e salvare il calendario dipendenti di ${esc(calendarMonth)}.</small>
          </div>
        </div>
      `
      :pendingReview
        ?`
          <div class="proposal-gate ready">
            <span class="gate-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Calendario mensile verificato</strong>
              <small>Generato e salvato${proposal.calendarSavedAt?` il ${esc(formatTimestamp(proposal.calendarSavedAt))}`:''}.</small>
            </div>
          </div>
        `
        :'';

  const actions=pendingReview
    ?`
      <div class="proposal-actions">
        <button class="btn primary"
          ${canReview?`data-approve="${esc(proposal.id)}"`:'disabled'}
          title="${canReview?'Approva e applica':'Genera e salva prima il calendario mensile'}">
          <span aria-hidden="true">✓</span>
          <span>Approva e applica</span>
        </button>
        <button class="btn danger"
          ${canReview?`data-reject="${esc(proposal.id)}"`:'disabled'}
          title="${canReview?'Rifiuta la proposta':'Genera e salva prima il calendario mensile'}">
          <span aria-hidden="true">×</span>
          <span>Rifiuta</span>
        </button>
      </div>
    `
    :'';

  const roles=(hole.roles||[])
    .map(role=>`
      <span class="proposal-role-chip ${roleClass(role)}">
        ${esc(roleLabel(role))}
      </span>
    `)
    .join('');

  return `
    <article class="proposal-card proposal-immutable">
      <div class="proposal-head">
        <div class="proposal-date-block">
          <strong>${esc(formatDateIt(hole.day))}</strong>
          <small>${esc(shiftLabel(hole.shift))} · ${esc(hole.start||'--:--')}–${esc(hole.end||'--:--')}</small>
        </div>
        <span class="proposal-status ${statusClass(proposal.status)}">
          ${esc(statusLabel(proposal.status))}
        </span>
      </div>

      <div class="proposal-location-row">
        <span class="proposal-location-chip">
          <b aria-hidden="true">⌖</b>
          ${esc(siteLabel(hole.site))}
        </span>
        <span class="proposal-location-chip">
          <b aria-hidden="true">◫</b>
          Mezzo a ${esc(hole.machine||'—')}
        </span>
        ${proposal.emailSentAt?`
          <span class="proposal-location-chip email-sent">
            <b aria-hidden="true">✉</b>
            Email inviata
          </span>
        `:''}
      </div>

      <div class="proposal-meta-grid">
        <div>
          <span>ID proposta</span>
          <strong>${esc(proposal.id)}</strong>
        </div>
        <div>
          <span>Inserita da</span>
          <strong>${esc(proposal.createdByDisplay||proposal.createdBy||'—')}</strong>
        </div>
        <div>
          <span>Data inserimento</span>
          <strong>${esc(formatTimestamp(proposal.createdAt)||'—')}</strong>
        </div>
      </div>

      <div class="proposal-section">
        <div class="proposal-section-title">Ruoli richiesti</div>
        <div class="proposal-role-list">${roles||'—'}</div>
      </div>

      <div class="proposal-section">
        <div class="proposal-section-title">Copertura proposta</div>
        <div class="solution-crew">${crew||'<div class="solution-empty">Nessun nominativo indicato.</div>'}</div>
      </div>

      ${hole.note?`
        <div class="proposal-note">
          <span aria-hidden="true">“</span>
          <div>
            <strong>Nota del referente</strong>
            <p>${esc(hole.note)}</p>
          </div>
        </div>
      `:''}

      ${changes?`
        <div class="proposal-section solution-changes">
          <div class="proposal-section-title">Cambi turno proposti</div>
          <div class="solution-change-list">${changes}</div>
        </div>
      `:''}

      ${warnings?`
        <div class="solution-warning-list">${warnings}</div>
      `:''}

      ${proposal.reviewReason?`
        <div class="proposal-review-note">
          <strong>Esito del RO</strong>
          <p>${esc(proposal.reviewReason)}</p>
        </div>
      `:''}

      ${calendarGate}
      ${actions}
    </article>
  `;
}

function renderProposals(){
  const filter=
    $('#volunteerStatusFilter')?.value||
    'ALL';

  const all=workspace.proposals||[];
  const pending=all.filter(
    proposal=>proposal.status==='INVIATA'
  ).length;

  let list=all;
  if(filter!=='ALL'){
    list=list.filter(
      proposal=>proposal.status===filter
    );
  }

  const subtitle=$('#volunteerListSubtitle');
  if(subtitle){
    subtitle.textContent=
      `${list.length} ${list.length===1?'proposta visibile':'proposte visibili'}${pending?` · ${pending} da valutare`:''}`;
  }

  const tabCount=$('#volunteerTabCount');
  if(tabCount){
    tabCount.textContent=String(all.length);
  }

  const host=$('#volunteerProposalList');
  host.setAttribute('aria-busy','false');
  host.innerHTML=list.length
    ?list.map(proposalCard).join('')
    :`
      <div class="volunteer-empty">
        <span aria-hidden="true">□</span>
        <strong>Nessuna proposta disponibile</strong>
        <p>Le proposte inviate compariranno qui con il relativo stato.</p>
      </div>
    `;

  $$('[data-approve]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>review(
        button.dataset.approve,
        'APPROVE'
      )
    )
  );

  $$('[data-reject]').forEach(button=>
    button.addEventListener(
      'click',
      ()=>review(
        button.dataset.reject,
        'REJECT'
      )
    )
  );
}

async function review(id,decision){
  const proposal=(workspace.proposals||[])
    .find(item=>item.id===id);

  if(
    proposal&&
    proposal.calendarReady!==true
  ){
    alert(
      `Operazione bloccata.\n\n`+
      `Prima di approvare o rifiutare la proposta, `+
      `il Responsabile Operativo deve generare e salvare `+
      `il calendario dipendenti di ${proposal.calendarMonth||'quel mese'}.`
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
      ?'ATLAS verificherà nuovamente l’intera catena e applicherà tutti i cambi insieme. Confermi?'
      :'Confermi il rifiuto?'
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

    if(result.applied){
      await onApplied?.();
      alert(
        `Proposta applicata: ${result.rowsChanged} record aggiornati.`
      );
    }
  }catch(error){
    alert(error.message);
  }
}

export async function refreshWorkspace(){
  const context=getServerAuthContext();
  const host=$('#volunteerProposalList');

  if(host){
    host.setAttribute('aria-busy','true');
    host.innerHTML=`
      <div class="volunteer-loading-card list-loading">
        <span class="volunteer-spinner" aria-hidden="true"></span>
        <div>
          <strong>Caricamento proposte</strong>
          <small>Recupero dello stato aggiornato da ATLAS…</small>
        </div>
      </div>
    `;
  }

  try{
    workspace=await loadVolunteerWorkspace({
      url:ATLAS_SERVER_URL,
      token:context.token
    });
    renderProposals();
  }catch(error){
    if(host){
      host.setAttribute('aria-busy','false');
      host.innerHTML=`
        <div class="volunteer-result-empty danger">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Caricamento non riuscito</strong>
            <p>${esc(error.message)}</p>
          </div>
        </div>
      `;
    }
  }
}

export function applyAccessProfile(user){
  currentUser=user||{};
  permissions=new Set(
    currentUser.permissions||[]
  );

  document.body.classList.remove(
    'role-admin',
    'role-ro',
    'role-volunteer-scheduler'
  );

  const code=roleCode(currentUser);

  document.body.classList.add(
    code==='ADMIN'
      ?'role-admin'
      :code==='RO'
        ?'role-ro'
        :'role-volunteer-scheduler'
  );

  $('[data-access="admin"]')
    ?.toggleAttribute(
      'hidden',
      code!=='ADMIN'
    );

  $$('[data-access="admin"]').forEach(element=>
    element.classList.toggle(
      'hidden',
      code!=='ADMIN'
    )
  );

  $$('[data-access="employees"]').forEach(element=>
    element.classList.toggle(
      'hidden',
      !has('saveEmployees')
    )
  );

  const nav=$('#volunteerCoverageNav');
  if(nav){
    nav.classList.toggle(
      'hidden',
      !(
        has('volunteerProposalCreate')||
        has('volunteerProposalReview')
      )
    );
  }

  if(code==='VOLUNTEER_SCHEDULER'){
    switchToVolunteer();
    setVolunteerMobileTab('create');
  }
}

export async function initVolunteerCoverage({
  user,
  onProposalApplied
}={}){
  currentUser=user||{};
  permissions=new Set(
    currentUser.permissions||[]
  );
  onApplied=onProposalApplied;

  const roleChip=$('#volunteerRoleChip');
  if(roleChip){
    roleChip.textContent=
      currentUser.role||
      'Profilo';
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
    view.dataset.volunteerInitialized!=='true'
  ){
    view.dataset.volunteerInitialized='true';

    $('#volunteerShift')
      ?.addEventListener(
        'change',
        ()=>{
          defaultTimes();
          invalidateAnalysis();
        }
      );

    $('#volunteerDay')
      ?.addEventListener(
        'change',
        ()=>{
          defaultTimes();
          invalidateAnalysis();
        }
      );

    [
      '#volunteerStart',
      '#volunteerEnd',
      '#volunteerSite',
      '#volunteerMachine',
      '#volunteerNote',
      '#volRoleA',
      '#volRoleC',
      '#volRoleS'
    ].forEach(selector=>{
      const element=$(selector);
      if(!element)return;

      element.addEventListener(
        element.matches('textarea,input[type="text"]')
          ?'input'
          :'change',
        ()=>{
          updateDraftSummary();
          invalidateAnalysis();
        }
      );
    });

    $('#volunteerAnalyzeBtn')
      ?.addEventListener(
        'click',
        analyze
      );

    $('#volunteerSubmitBtn')
      ?.addEventListener(
        'click',
        submitProposal
      );

    $('#volunteerRefreshBtn')
      ?.addEventListener(
        'click',
        refreshWorkspace
      );

    $('#volunteerStatusFilter')
      ?.addEventListener(
        'change',
        renderProposals
      );

    $$('[data-volunteer-tab]').forEach(button=>
      button.addEventListener(
        'click',
        ()=>setVolunteerMobileTab(
          button.dataset.volunteerTab,
          {scroll:true}
        )
      )
    );

    MOBILE_QUERY.addEventListener?.(
      'change',
      ()=>{
        setVolunteerMobileTab(
          activeMobileTab
        );
      }
    );
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
  updateDraftSummary();
  setVolunteerMobileTab(
    roleCode(currentUser)==='VOLUNTEER_SCHEDULER'
      ?'create'
      :'list'
  );

  await refreshWorkspace();
}
