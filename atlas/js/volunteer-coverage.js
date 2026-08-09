import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth-protected.js';
import {
  loadVolunteerWorkspace,
  reviewVolunteerProposal
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

let user=null;
let permissions=new Set();
let workspace={proposals:[]};
let workspaceLoaded=false;
let workspaceLoading=null;
let compatibility=new Map();
let compatibilityFilter='ALL';
let analysisRun=0;
let analysisBusy=false;

function has(permission){
  return permissions.has(permission);
}

function setHidden(element,hidden){
  if(!element)return;
  element.classList.toggle('hidden',hidden);
  element.toggleAttribute('hidden',hidden);
}

export function isVolunteerOnlyProfile(){
  return false;
}

export function applyAccessProfile(currentUser){
  user=currentUser||{};
  permissions=new Set(user.permissions||[]);
  const admin=user.profileType==='ADMIN';

  document.body.classList.toggle('role-admin',admin);
  document.body.classList.toggle('role-ro',!admin);

  $$('[data-access="admin"]').forEach(element=>
    setHidden(element,!admin)
  );

  $$('[data-access="employees"]').forEach(element=>
    setHidden(element,!has('saveEmployees'))
  );

  setHidden(
    $('#volunteerCoverageNav'),
    !has('volunteerProposalView')
  );
}

function parseHole(item){
  try{
    return typeof item.hole==='string'
      ?JSON.parse(item.hole)
      :item.hole||{};
  }catch{
    return{};
  }
}

function dateLabel(value){
  const match=String(value||'').match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  return match
    ?`${match[3]}/${match[2]}/${match[1]}`
    :String(value||'');
}

function shiftLabel(code){
  return({
    M:'Mattina',
    P:'Pomeriggio',
    N:'Notte',
    CUSTOM:'Personalizzato'
  })[code]||code;
}

function siteLabel(code){
  return({
    G:'Gallarate',
    S:'Somma Lombardo',
    SU:'Sumirago'
  })[code]||code;
}

function roleLabel(code){
  return({
    A:'Autista',
    C:'Capo equipaggio',
    S:'Soccorritore'
  })[code]||code;
}

function statusClass(status){
  return status==='APPROVATA'
    ?'status-approved'
    :status==='RIFIUTATA'
      ?'status-rejected'
      :'status-sent';
}

function compatibilityMeta(status){
  return({
    DIRECT:{
      label:'Compatibile',
      cls:'compat-direct',
      icon:'✓'
    },
    CHANGES:{
      label:'Con cambio turno',
      cls:'compat-changes',
      icon:'⇄'
    },
    INCOMPATIBLE:{
      label:'Non compatibile',
      cls:'compat-incompatible',
      icon:'×'
    },
    OTHER_MONTH:{
      label:'Altro mese',
      cls:'compat-neutral',
      icon:'○'
    },
    ANALYZING:{
      label:'Analisi…',
      cls:'compat-analyzing',
      icon:'…'
    }
  })[status]||{
    label:'Da analizzare',
    cls:'compat-neutral',
    icon:'○'
  };
}

function analyzer(){
  return globalThis.ATLAS_VOLUNTEER_ANALYZER||null;
}

function ensureCompatibilityStyles(){
  if($('#atlasVolunteerCompatibilityStyles')){
    return;
  }

  const style=document.createElement('style');
  style.id='atlasVolunteerCompatibilityStyles';
  style.textContent=`
    .role-ro .volunteer-layout{
      grid-template-columns:minmax(0,1fr)!important
    }
    .role-ro .volunteer-list-panel{
      width:100%
    }
    .compatibility-toolbar{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:12px;
      align-items:center;
      margin:0 0 13px;
      padding:11px 12px;
      border:1px solid var(--border);
      border-radius:13px;
      background:rgba(255,255,255,.022)
    }
    .compatibility-summary{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:7px
    }
    .compat-filter{
      display:inline-flex;
      align-items:center;
      gap:6px;
      min-height:31px;
      padding:6px 9px;
      border:1px solid var(--border);
      border-radius:999px;
      background:rgba(255,255,255,.025);
      color:var(--muted);
      font-size:9px;
      font-weight:850;
      cursor:pointer
    }
    .compat-filter.active{
      color:var(--text);
      border-color:rgba(57,199,234,.38);
      background:rgba(57,199,234,.08)
    }
    .compat-filter .count{
      display:grid;
      place-items:center;
      min-width:19px;
      height:19px;
      padding:0 5px;
      border-radius:999px;
      background:rgba(255,255,255,.055);
      color:inherit;
      font-size:8px
    }
    .compatibility-progress{
      min-width:150px;
      color:var(--muted);
      font-size:9px;
      text-align:right
    }
    .compat-recalc{
      margin-left:7px
    }
    .proposal-badges{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:6px;
      flex:0 0 auto
    }
    .compat-badge{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:5px 8px;
      border:1px solid transparent;
      border-radius:999px;
      font-size:9px;
      font-weight:950;
      white-space:nowrap
    }
    .compat-direct{
      color:#8ef0c4;
      border-color:rgba(52,211,153,.20);
      background:rgba(52,211,153,.08)
    }
    .compat-changes{
      color:#ffd978;
      border-color:rgba(251,191,36,.22);
      background:rgba(251,191,36,.08)
    }
    .compat-incompatible{
      color:#ffb0bd;
      border-color:rgba(251,113,133,.23);
      background:rgba(251,113,133,.08)
    }
    .compat-neutral,
    .compat-analyzing{
      color:#b4c6cf;
      border-color:rgba(148,163,184,.18);
      background:rgba(148,163,184,.07)
    }
    .compat-box{
      margin-top:4px;
      padding:11px 12px;
      border:1px solid var(--border);
      border-radius:12px;
      background:rgba(255,255,255,.018)
    }
    .compat-box.direct{
      border-color:rgba(52,211,153,.17);
      background:rgba(52,211,153,.035)
    }
    .compat-box.changes{
      border-color:rgba(251,191,36,.18);
      background:rgba(251,191,36,.035)
    }
    .compat-box.incompatible{
      border-color:rgba(251,113,133,.18);
      background:rgba(251,113,133,.035)
    }
    .compat-box-title{
      display:flex;
      align-items:center;
      gap:7px;
      font-size:10px;
      font-weight:900
    }
    .compat-box-text{
      margin-top:5px;
      color:var(--muted);
      font-size:9px;
      line-height:1.5
    }
    .compat-role-list{
      display:grid;
      gap:6px;
      margin-top:9px
    }
    .compat-role{
      display:grid;
      grid-template-columns:120px minmax(0,1fr);
      gap:8px;
      align-items:start;
      padding:7px 8px;
      border-radius:9px;
      background:rgba(255,255,255,.025)
    }
    .compat-role-label{
      color:#b9ccd6;
      font-size:8px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.04em
    }
    .compat-role-detail{
      color:#dbeaf0;
      font-size:9px;
      line-height:1.45
    }
    .compat-change-arrow{
      color:#fbbf24;
      font-weight:900
    }
    .compat-blockers{
      display:grid;
      gap:5px;
      margin-top:9px
    }
    .compat-blocker{
      padding:6px 8px;
      border-radius:8px;
      background:rgba(251,113,133,.055);
      color:#ffc4ce;
      font-size:8px;
      line-height:1.45
    }
    .compat-note{
      margin-top:8px;
      color:#718e9c;
      font-size:8px;
      line-height:1.45
    }
    @media(max-width:760px){
      .compatibility-toolbar{
        grid-template-columns:1fr
      }
      .compatibility-progress{
        text-align:left
      }
      .proposal-head{
        align-items:flex-start
      }
      .proposal-badges{
        align-items:flex-start
      }
      .compat-role{
        grid-template-columns:1fr
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureCompatibilityToolbar(){
  const host=$('#volunteerProposalList');
  if(!host||$('#volunteerCompatibilityToolbar')){
    return;
  }

  const toolbar=document.createElement('div');
  toolbar.id='volunteerCompatibilityToolbar';
  toolbar.className='compatibility-toolbar';
  toolbar.innerHTML=`
    <div class="compatibility-summary">
      <button class="compat-filter active"
              type="button"
              data-compat-filter="ALL">
        Tutte
        <span class="count" data-compat-count="ALL">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="DIRECT">
        ✓ Compatibili
        <span class="count" data-compat-count="DIRECT">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="CHANGES">
        ⇄ Con cambi
        <span class="count" data-compat-count="CHANGES">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="INCOMPATIBLE">
        × Non compatibili
        <span class="count" data-compat-count="INCOMPATIBLE">0</span>
      </button>
    </div>

    <div class="compatibility-progress">
      <span id="compatibilityProgressText">
        Analisi sul calendario aperto
      </span>
      <button class="btn small compat-recalc"
              id="compatibilityRecalcBtn"
              type="button">
        Ricalcola
      </button>
    </div>
  `;

  host.parentElement?.insertBefore(toolbar,host);

  $$('[data-compat-filter]').forEach(button=>
    button.addEventListener('click',()=>{
      compatibilityFilter=button.dataset.compatFilter||'ALL';

      $$('[data-compat-filter]').forEach(other=>
        other.classList.toggle(
          'active',
          other===button
        )
      );

      render();
    })
  );

  $('#compatibilityRecalcBtn')
    ?.addEventListener('click',()=>{
      runCompatibilityAnalysis({
        force:true
      });
    });
}

function renderCompatibilityDetail(result){
  if(!result){
    return`
      <div class="compat-box">
        <div class="compat-box-title">
          <span>○</span>
          <span>Compatibilità da analizzare</span>
        </div>
      </div>
    `;
  }

  if(result.status==='ANALYZING'){
    return`
      <div class="compat-box">
        <div class="compat-box-title">
          <span>…</span>
          <span>Analisi del calendario in corso</span>
        </div>
        <div class="compat-box-text">
          Controllo ruoli, assenze, riposi, sovrapposizioni,
          sedi, part-time e monte ore.
        </div>
      </div>
    `;
  }

  if(result.status==='OTHER_MONTH'){
    return`
      <div class="compat-box">
        <div class="compat-box-title">
          <span>○</span>
          <span>${esc(result.label)}</span>
        </div>
        <div class="compat-box-text">
          ${esc(result.summary)}
        </div>
      </div>
    `;
  }

  const boxClass=
    result.status==='DIRECT'
      ?'direct'
      :result.status==='CHANGES'
        ?'changes'
        :'incompatible';

  const icon=
    result.status==='DIRECT'
      ?'✓'
      :result.status==='CHANGES'
        ?'⇄'
        :'×';

  const roleRows=(result.roles||[])
    .map(detail=>{
      if(detail.mode==='covered'){
        return`
          <div class="compat-role">
            <span class="compat-role-label">
              ${esc(roleLabel(detail.role))}
            </span>
            <span class="compat-role-detail">
              ${esc(detail.text)}
            </span>
          </div>
        `;
      }

      if(detail.mode==='change'){
        return`
          <div class="compat-role">
            <span class="compat-role-label">
              ${esc(roleLabel(detail.role))}
            </span>
            <span class="compat-role-detail">
              <strong>${esc(detail.coverName)}</strong>
              può coprire la richiesta.
              <br>
              <span class="compat-change-arrow">⇄</span>
              Sul suo turno
              <strong>${esc(detail.sourceCode)}</strong>
              può subentrare
              <strong>${esc(detail.replacementName)}</strong>.
            </span>
          </div>
        `;
      }

      return`
        <div class="compat-role">
          <span class="compat-role-label">
            ${esc(roleLabel(detail.role))}
          </span>
          <span class="compat-role-detail">
            <strong>${esc(detail.coverName)}</strong>
            disponibile direttamente.
          </span>
        </div>
      `;
    })
    .join('');

  const blockers=(result.blockers||[])
    .map(text=>`
      <div class="compat-blocker">
        ${esc(text)}
      </div>
    `)
    .join('');

  return`
    <div class="compat-box ${boxClass}">
      <div class="compat-box-title">
        <span>${icon}</span>
        <span>${esc(result.label)}</span>
      </div>

      <div class="compat-box-text">
        ${esc(result.summary)}
      </div>

      ${roleRows
        ?`<div class="compat-role-list">${roleRows}</div>`
        :''
      }

      ${blockers
        ?`<div class="compat-blockers">${blockers}</div>`
        :''
      }

      ${result.status==='CHANGES'
        ?`
          <div class="compat-note">
            I cambi sono soltanto suggeriti. ATLAS non modifica
            automaticamente il calendario quando approvi la proposta.
          </div>
        `
        :''
      }
    </div>
  `;
}

function card(item){
  const hole=parseHole(item);
  const roles=(hole.roles||[])
    .map(roleLabel)
    .join(', ');

  const pending=item.status==='INVIATA';
  const canReview=
    pending&&
    has('volunteerProposalReview');

  const ready=item.calendarReady===true;
  const result=pending
    ?compatibility.get(item.id)
    :null;

  const meta=pending
    ?compatibilityMeta(
        result?.status||
        (
          analysisBusy
            ?'ANALYZING'
            :''
        )
      )
    :null;

  return`
    <article class="proposal-card proposal-immutable"
             data-proposal-card="${esc(item.id)}">

      <div class="proposal-head">
        <div>
          <div class="proposal-title">
            ${esc(dateLabel(hole.day))}
            · ${esc(shiftLabel(hole.shift))}
            · ${esc(siteLabel(hole.site))}
            · mezzo a ${esc(hole.machine||'—')}
          </div>

          <div class="proposal-meta">
            ${esc(item.id)}
            · ${esc(item.createdByDisplay||item.createdBy||'')}
            · ${esc(item.createdAt||'')}
          </div>
        </div>

        <div class="proposal-badges">
          <span class="proposal-status ${statusClass(item.status)}">
            ${esc(item.status==='INVIATA'?'DA VALUTARE':item.status)}
          </span>

          ${pending
            ?`
              <span class="compat-badge ${meta.cls}">
                <span>${meta.icon}</span>
                ${esc(meta.label)}
              </span>
            `
            :''
          }
        </div>
      </div>

      <div class="proposal-body">
        <div class="proposal-line">
          Orario:
          <strong>
            ${esc(hole.start||'--:--')}–${esc(hole.end||'--:--')}
          </strong>
        </div>

        <div class="proposal-line">
          Ruoli richiesti:
          <strong>${esc(roles||'—')}</strong>
        </div>

        ${hole.note
          ?`
            <div class="proposal-line">
              Nota:
              <strong>${esc(hole.note)}</strong>
            </div>
          `
          :''
        }

        ${item.reviewReason
          ?`
            <div class="proposal-line">
              Esito:
              <strong>${esc(item.reviewReason)}</strong>
            </div>
          `
          :''
        }

        ${pending
          ?renderCompatibilityDetail(
              result||
              (
                analysisBusy
                  ?{
                      status:'ANALYZING'
                    }
                  :null
              )
            )
          :''
        }

        ${canReview&&!ready
          ?`
            <div class="notice warning">
              <strong>
                Calendario non ancora registrato come generato e salvato.
              </strong>
              La proposta può comunque essere valutata:
              l'approvazione non modifica automaticamente il calendario.
            </div>
          `
          :''
        }
      </div>

      ${canReview
        ?`
          <div class="proposal-actions">
            <button class="btn small primary"
                    data-review="${esc(item.id)}"
                    data-decision="APPROVE">
              Approva
            </button>

            <button class="btn small danger"
                    data-review="${esc(item.id)}"
                    data-decision="REJECT">
              Rigetta
            </button>
          </div>
        `
        :''
      }
    </article>
  `;
}

function compatibilityCounts(){
  const counts={
    ALL:0,
    DIRECT:0,
    CHANGES:0,
    INCOMPATIBLE:0
  };

  (workspace.proposals||[])
    .filter(item=>item.status==='INVIATA')
    .forEach(item=>{
      counts.ALL++;

      const status=
        compatibility.get(item.id)?.status;

      if(counts[status]!==undefined){
        counts[status]++;
      }
    });

  return counts;
}

function updateCompatibilityToolbar(){
  const counts=compatibilityCounts();

  Object.entries(counts)
    .forEach(([key,value])=>{
      const node=
        document.querySelector(
          `[data-compat-count="${key}"]`
        );

      if(node){
        node.textContent=String(value);
      }
    });

  const progress=$('#compatibilityProgressText');

  if(progress){
    if(analysisBusy){
      const done=[
        ...compatibility.values()
      ].filter(result=>
        result?.status&&
        result.status!=='ANALYZING'
      ).length;

      progress.textContent=
        `Analisi compatibilità ${done}/${counts.ALL}`;
    }else{
      progress.textContent=
        counts.ALL
          ?'Compatibilità aggiornata sul calendario aperto'
          :'Nessuna proposta da valutare';
    }
  }
}

function filteredItems(){
  const statusFilter=
    $('#volunteerStatusFilter')?.value||
    'ALL';

  let items=workspace.proposals||[];

  if(statusFilter!=='ALL'){
    items=items.filter(
      item=>item.status===statusFilter
    );
  }

  if(compatibilityFilter!=='ALL'){
    items=items.filter(
      item=>
        item.status==='INVIATA'&&
        compatibility.get(item.id)?.status===
          compatibilityFilter
    );
  }

  return items;
}

function bindReviewButtons(){
  $$('[data-review]').forEach(button=>
    button.addEventListener(
      'click',
      async()=>{
        const proposalId=
          button.dataset.review;

        const decision=
          button.dataset.decision;

        const result=
          compatibility.get(proposalId);

        const reason=
          decision==='REJECT'
            ?prompt(
                'Motivo del rigetto:',
                ''
              )||''
            :prompt(
                'Nota di approvazione facoltativa:',
                ''
              )||'';

        if(
          decision==='REJECT'&&
          !reason
        ){
          return;
        }

        let confirmation=
          decision==='APPROVE'
            ?'Confermi l’approvazione? Il calendario non sarà modificato automaticamente.'
            :'Confermi il rigetto?';

        if(
          decision==='APPROVE'&&
          result?.status==='CHANGES'
        ){
          confirmation=
            'ATLAS ha individuato uno o più cambi turno necessari. '+
            'L’approvazione NON li applicherà automaticamente. '+
            'Confermi comunque l’approvazione della richiesta?';
        }

        if(
          decision==='APPROVE'&&
          result?.status==='INCOMPATIBLE'
        ){
          confirmation=
            'ATLAS non trova una soluzione compatibile con il calendario attuale. '+
            'Confermi comunque l’approvazione della richiesta?';
        }

        if(!confirm(confirmation)){
          return;
        }

        const auth=
          getServerAuthContext();

        try{
          await reviewVolunteerProposal({
            url:ATLAS_SERVER_URL,
            token:auth.token,
            proposalId,
            decision,
            reason
          });

          await refreshWorkspace({
            force:true
          });
        }catch(error){
          alert(error.message);
        }
      }
    )
  );
}

function render(){
  const host=$('#volunteerProposalList');

  if(!host){
    return;
  }

  ensureCompatibilityStyles();
  ensureCompatibilityToolbar();

  const items=filteredItems();

  const subtitle=
    $('#volunteerListSubtitle');

  if(subtitle){
    const pending=(workspace.proposals||[])
      .filter(item=>item.status==='INVIATA')
      .length;

    subtitle.textContent=
      `${items.length} ${
        items.length===1
          ?'proposta visualizzata'
          :'proposte visualizzate'
      } · ${pending} da valutare`;
  }

  host.innerHTML=
    items.length
      ?items.map(card).join('')
      :'<div class="volunteer-empty">Nessuna proposta disponibile con i filtri selezionati.</div>';

  updateCompatibilityToolbar();
  bindReviewButtons();
}

async function idleYield(){
  await new Promise(resolve=>{
    if('requestIdleCallback' in globalThis){
      requestIdleCallback(
        ()=>resolve(),
        {
          timeout:80
        }
      );
    }else{
      setTimeout(resolve,0);
    }
  });
}

async function runCompatibilityAnalysis({
  force=false
}={}){
  const analyze=
    analyzer()?.analyzeProposal;

  if(typeof analyze!=='function'){
    return;
  }

  const pending=(workspace.proposals||[])
    .filter(item=>item.status==='INVIATA');

  if(
    !force&&
    pending.length&&
    pending.every(item=>
      compatibility.has(item.id)
    )
  ){
    render();
    return;
  }

  const run=++analysisRun;
  analysisBusy=true;

  if(force){
    compatibility.clear();
  }

  pending.forEach(item=>{
    if(!compatibility.has(item.id)){
      compatibility.set(
        item.id,
        {
          status:'ANALYZING'
        }
      );
    }
  });

  render();

  let processed=0;

  for(const item of pending){
    if(run!==analysisRun){
      return;
    }

    if(
      !force&&
      compatibility.get(item.id)?.status!=='ANALYZING'
    ){
      processed++;
      continue;
    }

    try{
      compatibility.set(
        item.id,
        analyze(item)
      );
    }catch(error){
      compatibility.set(
        item.id,
        {
          status:'INCOMPATIBLE',
          label:'Analisi non completata',
          tone:'danger',
          summary:'ATLAS non è riuscito a completare il controllo locale.',
          roles:[],
          changes:[],
          blockers:[
            String(
              error?.message||
              error||
              'Errore non specificato.'
            )
          ]
        }
      );
    }

    processed++;

    if(
      processed%3===0||
      processed===pending.length
    ){
      render();
      await idleYield();
    }
  }

  if(run!==analysisRun){
    return;
  }

  analysisBusy=false;
  render();
}

export async function refreshWorkspace({
  force=false
}={}){
  if(!has('volunteerProposalView')){
    return;
  }

  if(
    workspaceLoaded&&
    !force
  ){
    render();
    runCompatibilityAnalysis();
    return workspace;
  }

  if(
    workspaceLoading&&
    !force
  ){
    return workspaceLoading;
  }

  const host=$('#volunteerProposalList');

  if(host){
    host.innerHTML=`
      <div class="volunteer-loading">
        <strong>Caricamento proposte…</strong><br>
        <span>
          Leggo le richieste volontari.
          L’analisi di compatibilità viene eseguita localmente sul calendario.
        </span>
      </div>
    `;
  }

  const auth=getServerAuthContext();

  workspaceLoading=(async()=>{
    try{
      workspace=await loadVolunteerWorkspace({
        url:ATLAS_SERVER_URL,
        token:auth.token
      });

      workspaceLoaded=true;

      if(force){
        compatibility.clear();
      }

      render();
      runCompatibilityAnalysis({
        force
      });

      return workspace;
    }finally{
      workspaceLoading=null;
    }
  })();

  return workspaceLoading;
}

export async function initVolunteerCoverage({
  user:currentUser
}={}){
  user=currentUser||{};
  permissions=new Set(
    user.permissions||[]
  );

  ensureCompatibilityStyles();

  setHidden(
    $('#volunteerCreatePanel'),
    !has('volunteerProposalCreate')
  );

  setHidden(
    document.querySelector(
      '.volunteer-list-panel'
    ),
    !has('volunteerProposalView')
  );

  setHidden(
    $('#volunteerRefreshBtn'),
    !has('volunteerProposalView')
  );

  $('#volunteerRefreshBtn')
    ?.addEventListener(
      'click',
      ()=>refreshWorkspace({
        force:true
      })
    );

  $('#volunteerStatusFilter')
    ?.addEventListener(
      'change',
      render
    );

  $('#volunteerCoverageNav')
    ?.addEventListener(
      'click',
      ()=>{
        if(!has('volunteerProposalView')){
          return;
        }

        refreshWorkspace()
          .catch(error=>{
            const host=
              $('#volunteerProposalList');

            if(host){
              host.innerHTML=`
                <div class="notice warning">
                  <strong>Proposte non caricate.</strong><br>
                  ${esc(
                    error.message||
                    'Errore di caricamento.'
                  )}
                </div>
              `;
            }
          });
      }
    );
}
