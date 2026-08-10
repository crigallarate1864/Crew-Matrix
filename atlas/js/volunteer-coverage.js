import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth-protected.js';
import {
  loadVolunteerWorkspace,
  reviewVolunteerProposal
} from './google-sheet-service.js?v=1.0.0-smart-volunteer-20260810';

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

let workspace={
  proposals:[]
};

let workspaceLoaded=false;
let workspaceLoading=null;

let compatibility=new Map();
let compatibilityFilter='ALL';
let analysisRun=0;
let analysisBusy=false;

const selectedSolutions=new Map();

let globalPlanStats={
  total:0,
  covered:0,
  impossible:0,
  review:0
};

function has(permission){
  return permissions.has(permission);
}

function setHidden(element,hidden){
  if(!element)return;

  element.classList.toggle(
    'hidden',
    hidden
  );

  element.toggleAttribute(
    'hidden',
    hidden
  );
}

export function isVolunteerOnlyProfile(){
  return false;
}

export function applyAccessProfile(currentUser){
  user=currentUser||{};

  permissions=new Set(
    user.permissions||[]
  );

  const admin=
    user.profileType==='ADMIN';

  document.body.classList.toggle(
    'role-admin',
    admin
  );

  document.body.classList.toggle(
    'role-ro',
    !admin
  );

  $$('[data-access="admin"]')
    .forEach(element=>
      setHidden(
        element,
        !admin
      )
    );

  $$('[data-access="employees"]')
    .forEach(element=>
      setHidden(
        element,
        !has('saveEmployees')
      )
    );

  setHidden(
    $('#volunteerCoverageNav'),
    !has('volunteerProposalView')
  );
}

function analyzer(){
  return(
    globalThis.ATLAS_VOLUNTEER_ANALYZER||
    null
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
  const match=String(value||'')
    .match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  return match
    ?`${match[3]}/${match[2]}/${match[1]}`
    :String(value||'');
}


function dateWithWeekdayLabel(value){
  const match=String(value||'')
    .match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if(!match){
    return String(value||'');
  }

  const date=
    new Date(
      Number(match[1]),
      Number(match[2])-1,
      Number(match[3])
    );

  const weekday=
    new Intl.DateTimeFormat(
      'it-IT',
      {
        weekday:'long'
      }
    ).format(date);

  const capitalized=
    weekday.charAt(0)
      .toUpperCase()+
    weekday.slice(1);

  return(
    `${capitalized} `+
    `${match[3]}/${match[2]}/${match[1]}`
  );
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


function formatHours(value){
  const number=
    Number(value||0);

  return new Intl.NumberFormat(
    'it-IT',
    {
      minimumFractionDigits:
        Number.isInteger(number)
          ?0
          :1,
      maximumFractionDigits:1
    }
  ).format(number);
}

function hourBalanceClass(snapshot){
  if(!snapshot){
    return'hours-balanced';
  }

  if(snapshot.status==='missing'){
    return'hours-missing';
  }

  if(snapshot.status==='excess'){
    return'hours-excess';
  }

  return'hours-balanced';
}


function solutionHoursOptionLabel(){
  return'';
}

function renderHoursScore(solution){
  if(!solution){
    return'';
  }

  const rows=solution.hoursImpacts||[];

  if(!rows.length){
    return`
      <aside class="hours-smart-panel">
        <div class="hours-smart-header">
          <div>
            <span class="hours-smart-kicker">MONTE ORE</span>
            <strong>Nessuna variazione</strong>
          </div>
        </div>
        <div class="hours-smart-empty">
          La soluzione non cambia le ore mensili.
        </div>
      </aside>
    `;
  }

  return`
    <aside class="hours-smart-panel">
      <div class="hours-smart-header">
        <div>
          <span class="hours-smart-kicker">MONTE ORE</span>
          <strong>Prima → Dopo</strong>
        </div>
        <span class="hours-smart-caption">Target mensile</span>
      </div>

      <div class="hours-smart-list">
        ${rows.map(row=>{
          const target=Math.max(0,Number(row.target||0));
          const before=Number(row.plannedBefore||0);
          const after=Number(row.projected||0);
          const adjustment=Number(row.adjustment||0);
          const maxScale=Math.max(target,after,before,1)*1.08;
          const beforePct=Math.max(0,Math.min(100,before/maxScale*100));
          const afterPct=Math.max(0,Math.min(100,after/maxScale*100));
          const targetPct=Math.max(0,Math.min(100,target/maxScale*100));
          const context=(row.contexts||[]).slice(0,1).join('');
          const adjustmentText=
            `${adjustment>0?'+':''}${formatHours(adjustment)} h`;

          return`
            <div class="hours-smart-row ${hourBalanceClass(row)}">
              <div class="hours-smart-person">
                <strong>${esc(row.name)}</strong>
                <span>${esc(context||'Risorsa coinvolta')}</span>
              </div>

              <div class="hours-smart-numbers">
                <span class="hours-before">${formatHours(before)}</span>
                <span class="hours-arrow">→</span>
                <strong class="hours-after">${formatHours(after)} h</strong>
                <span class="hours-adjustment">${esc(adjustmentText)}</span>
              </div>

              <div class="hours-smart-target">
                <span>Target ${formatHours(target)} h</span>
                <strong>${esc(row.label)}</strong>
              </div>

              <div class="hours-smart-bar" aria-hidden="true">
                <i class="hours-before-bar" style="width:${beforePct.toFixed(1)}%"></i>
                <i class="hours-after-bar" style="width:${afterPct.toFixed(1)}%"></i>
                <b style="left:${targetPct.toFixed(1)}%"></b>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </aside>
  `;
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
      label:'Impossibile',
      cls:'compat-incompatible',
      icon:'×'
    },

    REVIEW:{
      label:'Da verificare',
      cls:'compat-review',
      icon:'△'
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

function ensureCompatibilityStyles(){
  if($('#atlasVolunteerCompatibilityStyles')){
    return;
  }

  const style=document.createElement('style');
  style.id='atlasVolunteerCompatibilityStyles';

  style.textContent=`
    .role-ro .volunteer-layout,
    .role-admin .volunteer-layout{
      grid-template-columns:minmax(0,1fr)!important;
      max-width:1600px;
      margin:auto
    }

    .volunteer-list-panel{
      width:100%
    }

    .volunteer-panel{
      padding:20px!important
    }

    .volunteer-panel-head h3{
      font-size:20px!important
    }

    .volunteer-panel-head p{
      font-size:13px!important;
      line-height:1.55!important
    }

    .compatibility-toolbar{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:14px;
      align-items:center;
      margin:0 0 15px;
      padding:13px 14px;
      border:1px solid var(--border);
      border-radius:14px;
      background:rgba(255,255,255,.025)
    }

    .compatibility-summary{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:8px
    }

    .compat-filter{
      display:inline-flex;
      align-items:center;
      gap:7px;
      min-height:36px;
      padding:7px 11px;
      border:1px solid var(--border);
      border-radius:999px;
      background:rgba(255,255,255,.025);
      color:var(--muted);
      font-size:12px;
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
      min-width:22px;
      height:22px;
      padding:0 6px;
      border-radius:999px;
      background:rgba(255,255,255,.055);
      color:inherit;
      font-size:10px
    }

    .compatibility-progress{
      min-width:210px;
      color:var(--muted);
      font-size:12px;
      text-align:right
    }

    .compat-recalc{
      margin-left:8px
    }

    .proposal-card{
      padding:18px!important
    }

    .proposal-title{
      font-size:15px!important
    }

    .proposal-meta{
      font-size:11px!important
    }

    .proposal-line{
      font-size:13px!important;
      line-height:1.5!important
    }

    .proposal-status{
      font-size:11px!important
    }

    .proposal-badges{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:7px;
      flex:0 0 auto
    }

    .compat-badge{
      display:inline-flex;
      align-items:center;
      gap:7px;
      padding:6px 9px;
      border:1px solid transparent;
      border-radius:999px;
      font-size:11px;
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
      margin-top:6px;
      padding:13px 14px;
      border:1px solid var(--border);
      border-radius:13px;
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

    .compat-box.review{
      border-color:rgba(251,191,36,.20);
      background:rgba(251,191,36,.035)
    }

    .compat-badge.compat-review{
      color:#ffd77a;
      border-color:rgba(251,191,36,.22);
      background:rgba(251,191,36,.08)
    }

    .compat-box-title{
      display:flex;
      align-items:center;
      gap:8px;
      font-size:13px;
      font-weight:900
    }

    .compat-box-text{
      margin-top:6px;
      color:var(--muted);
      font-size:12px;
      line-height:1.55
    }

    .compat-role-list{
      display:grid;
      gap:7px;
      margin-top:10px
    }

    .compat-role{
      display:grid;
      grid-template-columns:145px minmax(0,1fr);
      gap:10px;
      align-items:start;
      padding:9px 10px;
      border-radius:10px;
      background:rgba(255,255,255,.025)
    }

    .compat-role-label{
      color:#b9ccd6;
      font-size:11px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.04em
    }

    .compat-role-detail{
      color:#dbeaf0;
      font-size:12px;
      line-height:1.5
    }

    .compat-change-arrow{
      color:#fbbf24;
      font-weight:900
    }

    .compat-blockers{
      display:grid;
      gap:6px;
      margin-top:10px
    }

    .compat-blocker{
      padding:8px 10px;
      border-radius:9px;
      background:rgba(251,113,133,.055);
      color:#ffc4ce;
      font-size:11px;
      line-height:1.5
    }

    .compat-note{
      margin-top:9px;
      color:#819dab;
      font-size:11px;
      line-height:1.5
    }

    .solution-workflow{
      margin-top:13px;
      padding:15px;
      border:1px solid rgba(56,189,248,.20);
      border-radius:14px;
      background:
        linear-gradient(
          145deg,
          rgba(56,189,248,.055),
          rgba(255,255,255,.015)
        )
    }

    .solution-workflow.applied{
      border-color:rgba(251,191,36,.27);
      background:rgba(251,191,36,.055)
    }

    .solution-step{
      display:flex;
      align-items:center;
      gap:9px;
      margin-bottom:10px
    }

    .solution-step-number{
      display:grid;
      place-items:center;
      width:25px;
      height:25px;
      border-radius:8px;
      background:rgba(56,189,248,.12);
      color:#9fe8ff;
      font-size:11px;
      font-weight:950
    }

    .solution-step strong{
      font-size:13px
    }

    .solution-label{
      display:block;
      margin-bottom:6px;
      color:#b9ccd6;
      font-size:11px;
      font-weight:850
    }

    .solution-select{
      width:100%;
      min-height:44px;
      border:1px solid rgba(145,188,214,.22);
      border-radius:11px;
      padding:9px 11px;
      background:#081925;
      color:#edf7ff;
      font-size:13px;
      outline:none
    }

    .solution-select:focus{
      border-color:rgba(56,189,248,.55);
      box-shadow:0 0 0 3px rgba(56,189,248,.08)
    }

    .solution-preview{
      display:grid;
      gap:7px;
      margin-top:11px
    }

    .solution-preview-row{
      display:grid;
      grid-template-columns:145px minmax(0,1fr);
      gap:10px;
      padding:9px 10px;
      border-radius:10px;
      background:rgba(255,255,255,.025)
    }

    .solution-preview-role{
      color:#9cb4c0;
      font-size:11px;
      font-weight:900;
      text-transform:uppercase
    }

    .solution-preview-text{
      color:#dcecf2;
      font-size:12px;
      line-height:1.5
    }

    .solution-actions{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:8px;
      margin-top:12px
    }

    .solution-apply{
      min-height:40px
    }

    .solution-help{
      margin-top:9px;
      color:#7894a1;
      font-size:11px;
      line-height:1.5
    }

    .solution-help.single-action{
      padding:10px 11px;
      border:1px solid rgba(56,189,248,.12);
      border-radius:10px;
      background:rgba(56,189,248,.035);
      color:#8eabb8
    }

    .global-plan-note{
      margin-top:9px;
      padding:9px 10px;
      border:1px solid rgba(148,163,184,.12);
      border-radius:10px;
      background:rgba(148,163,184,.035);
      color:#8da5b0;
      font-size:10px;
      line-height:1.45
    }

    .global-plan-note.good{
      border-color:rgba(52,211,153,.14);
      background:rgba(52,211,153,.035);
      color:#9bdcc1
    }

    .global-plan-note.warn{
      border-color:rgba(251,191,36,.16);
      background:rgba(251,191,36,.035);
      color:#d8bc7d
    }

    .chain-step-list{
      display:grid;
      gap:4px;
      margin-top:7px
    }

    .chain-step-line{
      display:block;
      color:#91aab5;
      font-size:10px;
      line-height:1.45
    }

    .applied-banner{
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      gap:10px;
      align-items:start
    }

    .applied-icon{
      display:grid;
      place-items:center;
      width:34px;
      height:34px;
      border-radius:10px;
      background:rgba(251,191,36,.12);
      color:#ffd978;
      font-size:17px;
      font-weight:950
    }

    .applied-title{
      color:#ffe2a0;
      font-size:14px;
      font-weight:900
    }

    .applied-text{
      margin-top:4px;
      color:#aabec7;
      font-size:12px;
      line-height:1.5
    }

    .workflow-next{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:8px;
      margin-top:12px
    }

    .workflow-next-label{
      width:100%;
      color:#879eaa;
      font-size:11px
    }


    .proposal-card.proposal-approved-now{
      border-color:rgba(139,92,246,.35)!important;
      box-shadow:
        0 0 0 1px rgba(139,92,246,.08),
        0 15px 38px rgba(0,0,0,.12)
    }

    .approve-insert-btn{
      min-height:42px;
      padding-left:15px!important;
      padding-right:15px!important
    }

    .approve-insert-btn:disabled{
      opacity:.48;
      cursor:not-allowed
    }

    .atlas-decision-popup-backdrop{
      position:fixed;
      inset:0;
      z-index:2500;
      display:grid;
      place-items:center;
      padding:24px;
      background:rgba(1,8,13,.68);
      backdrop-filter:blur(7px)
    }

    .atlas-decision-popup{
      width:min(520px,100%);
      border:1px solid rgba(139,92,246,.32);
      border-radius:20px;
      padding:22px;
      background:
        radial-gradient(
          circle at 10% 0%,
          rgba(139,92,246,.15),
          transparent 18rem
        ),
        #081923;
      box-shadow:
        0 28px 85px rgba(0,0,0,.48),
        inset 0 1px 0 rgba(255,255,255,.035)
    }

    .atlas-decision-popup-icon{
      display:grid;
      place-items:center;
      width:48px;
      height:48px;
      border-radius:15px;
      margin-bottom:15px;
      background:rgba(139,92,246,.14);
      color:#c4b5fd;
      font-size:23px;
      font-weight:950
    }

    .atlas-decision-popup h3{
      margin:0;
      color:#f4efff;
      font-size:20px;
      letter-spacing:-.015em
    }

    .atlas-decision-popup p{
      margin:8px 0 0;
      color:#aebec7;
      font-size:13px;
      line-height:1.6
    }

    .atlas-decision-popup-note{
      margin-top:13px;
      padding:10px 11px;
      border-radius:10px;
      background:rgba(139,92,246,.065);
      color:#d9ceff;
      font-size:12px;
      line-height:1.5
    }

    .atlas-decision-popup-actions{
      display:flex;
      justify-content:flex-end;
      flex-wrap:wrap;
      gap:8px;
      margin-top:18px
    }


    /* La pagina Buchi volontari occupa correttamente l'altezza disponibile
       e l'ultima proposta resta interamente raggiungibile. */
    #volunteerCoverageView.active{
      grid-template-rows:auto minmax(0,1fr);
      gap:12px;
      overflow:hidden
    }

    #volunteerCoverageView .volunteer-layout{
      min-height:0;
      height:100%;
      overflow:hidden;
      padding-bottom:10px!important
    }

    #volunteerCoverageView .volunteer-list-panel{
      min-height:0;
      display:grid;
      grid-template-rows:auto minmax(0,1fr);
      overflow:hidden
    }

    #volunteerCoverageView .volunteer-proposal-list{
      min-height:0;
      max-height:none!important;
      height:100%;
      overflow-y:auto!important;
      overflow-x:hidden;
      padding-right:8px!important;
      padding-bottom:110px!important;
      scroll-padding-bottom:110px;
      overscroll-behavior:contain
    }

    .solution-decision-grid{
      display:grid;
      grid-template-columns:minmax(0,1fr) minmax(270px,330px);
      gap:14px;
      align-items:start;
      margin-top:11px
    }

    .solution-choice-column{
      min-width:0
    }

    .hours-score-panel{
      position:sticky;
      top:0;
      min-width:0;
      padding:13px;
      border:1px solid rgba(56,189,248,.17);
      border-radius:13px;
      background:
        linear-gradient(
          155deg,
          rgba(7,27,39,.94),
          rgba(4,18,28,.94)
        )
    }

    .hours-score-head{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px
    }

    .hours-score-kicker{
      color:#6f93a3;
      font-size:10px;
      font-weight:850;
      letter-spacing:.08em;
      text-transform:uppercase
    }

    .hours-score-title{
      margin-top:2px;
      color:#e6f5fb;
      font-size:14px;
      font-weight:900
    }

    .hours-total-badge{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      min-height:27px;
      padding:5px 8px;
      border-radius:999px;
      font-size:10px;
      font-weight:900
    }

    .hours-score-explain{
      margin-top:8px;
      color:#7f9ca9;
      font-size:10px;
      line-height:1.45
    }

    .hours-score-list{
      display:grid;
      gap:7px;
      margin-top:11px
    }

    .hours-score-row{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:9px;
      align-items:center;
      padding:9px 10px;
      border:1px solid rgba(148,180,220,.09);
      border-radius:10px;
      background:rgba(255,255,255,.024)
    }

    .hours-score-row.primary-resource{
      border-color:rgba(56,189,248,.14);
      background:rgba(56,189,248,.035)
    }

    .hours-score-row.replacement-resource{
      border-color:rgba(251,191,36,.12);
      background:rgba(251,191,36,.025)
    }

    .hours-score-person{
      min-width:0
    }

    .hours-score-person strong{
      display:block;
      overflow:hidden;
      color:#e8f5fa;
      font-size:12px;
      text-overflow:ellipsis;
      white-space:nowrap
    }

    .hours-score-person span{
      display:block;
      margin-top:3px;
      overflow:hidden;
      color:#809aa7;
      font-size:9px;
      text-overflow:ellipsis;
      white-space:nowrap
    }

    .hours-score-values{
      display:grid;
      justify-items:end;
      gap:3px
    }

    .hours-delta{
      font-size:13px;
      font-weight:950;
      letter-spacing:-.01em
    }

    .hours-score-values small{
      color:#718b98;
      font-size:9px
    }

    .hours-progress{
      width:100%;
      height:4px;
      margin-top:7px;
      overflow:hidden;
      border-radius:999px;
      background:rgba(148,163,184,.10)
    }

    .hours-progress i{
      display:block;
      height:100%;
      border-radius:inherit;
      background:linear-gradient(
        90deg,
        rgba(56,189,248,.68),
        rgba(52,211,153,.82)
      )
    }

    .hours-missing{
      color:#7ee7bb!important;
      border-color:rgba(52,211,153,.17)!important;
      background:rgba(52,211,153,.07)!important
    }

    .hours-balanced{
      color:#b7cbd5!important;
      border-color:rgba(148,163,184,.16)!important;
      background:rgba(148,163,184,.06)!important
    }

    .hours-excess{
      color:#ffd16f!important;
      border-color:rgba(251,191,36,.18)!important;
      background:rgba(251,191,36,.07)!important
    }

    .hours-score-legend{
      display:flex;
      flex-wrap:wrap;
      gap:7px 10px;
      margin-top:10px;
      padding-top:9px;
      border-top:1px solid rgba(148,180,220,.08);
      color:#708b98;
      font-size:8px
    }

    .hours-score-legend span{
      display:inline-flex;
      align-items:center;
      gap:5px
    }

    .score-dot{
      width:6px;
      height:6px;
      border-radius:50%
    }

    .score-dot.missing{
      background:#34d399
    }

    .score-dot.balanced{
      background:#94a3b8
    }

    .score-dot.excess{
      background:#fbbf24
    }

    .hours-score-empty{
      margin-top:8px;
      color:#819aa7;
      font-size:11px
    }

    /* --- Monte ore: lettura immediata, niente score astratto --- */
    .hours-smart-panel{
      border:1px solid rgba(127,166,184,.16);
      border-radius:16px;
      background:linear-gradient(180deg,rgba(7,24,34,.72),rgba(5,18,26,.58));
      padding:14px;
      min-width:0
    }
    .hours-smart-header{
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:12px;
      padding-bottom:11px;
      border-bottom:1px solid rgba(127,166,184,.12)
    }
    .hours-smart-header>div{
      display:grid;
      gap:3px
    }
    .hours-smart-kicker{
      color:#7997a6;
      font-size:9px;
      font-weight:850;
      letter-spacing:.14em
    }
    .hours-smart-header strong{
      color:#eef8fc;
      font-size:14px
    }
    .hours-smart-caption{
      color:#7997a6;
      font-size:10px
    }
    .hours-smart-list{
      display:grid;
      gap:9px;
      margin-top:10px
    }
    .hours-smart-row{
      display:grid;
      grid-template-columns:minmax(120px,1.2fr) auto minmax(105px,.85fr);
      gap:10px 14px;
      align-items:center;
      padding:11px 12px;
      border:1px solid rgba(127,166,184,.12);
      border-radius:12px;
      background:rgba(255,255,255,.024)
    }
    .hours-smart-person{
      min-width:0;
      display:grid;
      gap:2px
    }
    .hours-smart-person strong{
      color:#f4fbff;
      font-size:12px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis
    }
    .hours-smart-person span{
      color:#7893a0;
      font-size:9px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis
    }
    .hours-smart-numbers{
      display:flex;
      align-items:baseline;
      gap:6px;
      white-space:nowrap
    }
    .hours-before{
      color:#839aa6;
      font-size:12px;
      font-weight:750
    }
    .hours-arrow{
      color:#4e6977;
      font-size:12px
    }
    .hours-after{
      color:#f7fbfd;
      font-size:15px;
      letter-spacing:-.02em
    }
    .hours-adjustment{
      padding:3px 6px;
      border-radius:999px;
      background:rgba(126,155,170,.10);
      color:#a9bdc7;
      font-size:9px;
      font-weight:800
    }
    .hours-smart-target{
      display:grid;
      justify-items:end;
      gap:2px;
      text-align:right
    }
    .hours-smart-target span{
      color:#7f98a5;
      font-size:9px
    }
    .hours-smart-target strong{
      color:#dce8ed;
      font-size:10px
    }
    .hours-smart-row.hours-missing .hours-smart-target strong{color:#8ad8ef}
    .hours-smart-row.hours-excess .hours-smart-target strong{color:#f0c36a}
    .hours-smart-row.hours-balanced .hours-smart-target strong{color:#7ed7ae}
    .hours-smart-bar{
      position:relative;
      grid-column:1/-1;
      height:5px;
      border-radius:999px;
      background:rgba(117,146,160,.12);
      overflow:visible
    }
    .hours-smart-bar i{
      position:absolute;
      inset:0 auto 0 0;
      border-radius:999px
    }
    .hours-before-bar{
      background:rgba(134,159,171,.18)
    }
    .hours-after-bar{
      background:#4aa6c5;
      height:5px
    }
    .hours-smart-row.hours-balanced .hours-after-bar{background:#4ab985}
    .hours-smart-row.hours-excess .hours-after-bar{background:#c99a42}
    .hours-smart-bar b{
      position:absolute;
      top:-3px;
      width:2px;
      height:11px;
      border-radius:2px;
      background:#e7f1f5;
      opacity:.72
    }
    .hours-smart-empty{
      margin-top:10px;
      color:#819aa7;
      font-size:11px
    }

    /* --- Registro modifiche e reset --- */
    .compatibility-actions{
      display:flex;
      align-items:center;
      gap:7px;
      justify-content:flex-end;
      flex-wrap:wrap
    }
    .change-log-btn,.reset-changes-btn{
      min-height:34px;
      border-radius:10px;
      border:1px solid rgba(127,166,184,.18);
      background:rgba(255,255,255,.035);
      color:#dce9ef;
      padding:0 11px;
      font:inherit;
      font-size:10px;
      font-weight:800;
      cursor:pointer
    }
    .change-log-btn:hover{border-color:rgba(75,181,216,.42)}
    .reset-changes-btn{
      border-color:rgba(218,92,105,.26);
      color:#efb1b8;
      background:rgba(169,45,60,.065)
    }
    .reset-changes-btn:disabled,
    .change-log-btn:disabled{
      opacity:.42;
      cursor:default
    }
    .change-log-count{
      display:inline-grid;
      place-items:center;
      min-width:18px;
      height:18px;
      margin-left:5px;
      padding:0 5px;
      border-radius:999px;
      background:rgba(75,181,216,.14);
      color:#8ed6ed;
      font-size:9px
    }
    .vol-change-drawer{
      position:fixed;
      inset:0;
      z-index:6500;
      display:grid;
      grid-template-columns:1fr minmax(360px,520px);
      background:rgba(1,8,12,.62);
      backdrop-filter:blur(4px)
    }
    .vol-change-drawer.hidden{display:none!important}
    .vol-change-sheet{
      grid-column:2;
      height:100%;
      overflow:auto;
      background:#071720;
      border-left:1px solid rgba(127,166,184,.17);
      box-shadow:-24px 0 70px rgba(0,0,0,.38);
      padding:20px
    }
    .vol-change-sheet-head{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:12px;
      padding-bottom:14px;
      border-bottom:1px solid rgba(127,166,184,.12)
    }
    .vol-change-sheet-head h3{
      margin:0;
      color:#f3f9fc;
      font-size:18px
    }
    .vol-change-sheet-head p{
      margin:4px 0 0;
      color:#7893a0;
      font-size:10px
    }
    .vol-change-close{
      width:34px;height:34px;border-radius:10px;
      border:1px solid rgba(127,166,184,.16);
      background:rgba(255,255,255,.035);
      color:#dbe9ef;
      cursor:pointer
    }
    .vol-change-list{display:grid;gap:10px;margin-top:14px}
    .vol-change-entry{
      border:1px solid rgba(127,166,184,.13);
      border-radius:13px;
      background:rgba(255,255,255,.025);
      padding:12px
    }
    .vol-change-entry-head{
      display:flex;justify-content:space-between;gap:10px;align-items:flex-start
    }
    .vol-change-entry-head strong{color:#edf7fa;font-size:12px}
    .vol-change-entry-head span{color:#7893a0;font-size:9px;white-space:nowrap}
    .vol-change-lines{display:grid;gap:6px;margin-top:9px}
    .vol-change-line{
      padding-left:9px;
      border-left:2px solid rgba(75,181,216,.32);
      color:#aebfc8;
      font-size:10px;
      line-height:1.45
    }
    .vol-change-hours{
      display:flex;
      flex-wrap:wrap;
      gap:6px;
      margin-top:10px
    }
    .vol-change-hours span{
      padding:4px 7px;
      border-radius:999px;
      background:rgba(75,181,216,.07);
      color:#89a7b5;
      font-size:9px
    }
    .vol-change-hours strong{color:#cfe0e7}
    .vol-change-empty{
      margin-top:18px;
      padding:20px;
      border:1px dashed rgba(127,166,184,.16);
      border-radius:13px;
      color:#7893a0;
      text-align:center;
      font-size:11px
    }
    @media(max-width:1180px){
      .solution-decision-grid{
        grid-template-columns:1fr
      }

      .hours-score-panel{
        position:static
      }
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

      .compat-role,
      .solution-preview-row{
        grid-template-columns:1fr
      }
    }
  `;

  document.head.appendChild(style);
}

function currentChangeHistory(){
  const api=analyzer();

  if(typeof api?.changeHistory!=='function'){
    return{count:0,entries:[]};
  }

  try{
    return api.changeHistory()||{count:0,entries:[]};
  }catch{
    return{count:0,entries:[]};
  }
}

function ensureChangeDrawer(){
  if($('#volunteerChangeDrawer')){
    return;
  }

  const drawer=document.createElement('div');
  drawer.id='volunteerChangeDrawer';
  drawer.className='vol-change-drawer hidden';
  drawer.innerHTML=`
    <section class="vol-change-sheet" role="dialog" aria-modal="true" aria-label="Riepilogo cambi volontari">
      <div class="vol-change-sheet-head">
        <div>
          <h3>Riepilogo cambi</h3>
          <p>Modifiche applicate dal flusso Buchi volontari nel mese aperto.</p>
        </div>
        <button class="vol-change-close" type="button" aria-label="Chiudi">×</button>
      </div>
      <div class="vol-change-list" id="volunteerChangeList"></div>
    </section>
  `;

  document.body.appendChild(drawer);

  drawer.addEventListener('click',event=>{
    if(
      event.target===drawer||
      event.target.closest('.vol-change-close')
    ){
      drawer.classList.add('hidden');
    }
  });
}

function renderChangeDrawer(){
  ensureChangeDrawer();

  const history=currentChangeHistory();
  const list=$('#volunteerChangeList');

  if(!list){
    return;
  }

  if(!history.entries?.length){
    list.innerHTML=`
      <div class="vol-change-empty">
        Nessun cambio applicato nel mese aperto.
      </div>
    `;
    return;
  }

  list.innerHTML=history.entries
    .slice()
    .reverse()
    .map(entry=>{
      const hole=entry.hole||{};
      const when=entry.approvedAt
        ?new Date(entry.approvedAt).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})
        :'';

      return`
        <article class="vol-change-entry">
          <div class="vol-change-entry-head">
            <strong>
              ${esc(dateLabel(hole.day||''))} · ${esc(shiftLabel(hole.shift||''))} · ${esc(siteLabel(hole.site||''))}
            </strong>
            <span>${esc(when)}</span>
          </div>

          <div class="vol-change-lines">
            ${(entry.changes||[]).length
              ?(entry.changes||[]).map(change=>
                `<div class="vol-change-line">${esc(change.text||'')}</div>`
              ).join('')
              :'<div class="vol-change-line">Copertura applicata senza spostamenti.</div>'
            }
          </div>

          ${(entry.hoursImpacts||[]).length
            ?`<div class="vol-change-hours">${(entry.hoursImpacts||[]).map(row=>
                `<span><strong>${esc(row.name||'')}</strong> ${formatHours(row.plannedBefore)} → ${formatHours(row.projected)} h</span>`
              ).join('')}</div>`
            :''
          }
        </article>
      `;
    }).join('');
}

function updateChangeToolbar(){
  const history=currentChangeHistory();
  const count=Number(history.count||history.entries?.length||0);
  const counter=$('#volunteerChangeCount');
  const reset=$('#volunteerResetChangesBtn');
  const log=$('#volunteerChangeLogBtn');

  if(counter)counter.textContent=String(count);
  if(reset)reset.disabled=count===0;
  if(log)log.disabled=count===0;
}

async function resetAllVolunteerChanges(){
  const api=analyzer();
  const history=currentChangeHistory();
  const count=Number(history.count||history.entries?.length||0);

  if(!count||typeof api?.resetChanges!=='function'){
    return;
  }

  if(!confirm(
    `Reset di tutti i cambi volontari?\n\nVerranno ripristinate le caselle modificate da ${count} ${count===1?'approvazione':'approvazioni'} del mese aperto e le relative proposte torneranno da valutare.`
  )){
    return;
  }

  const button=$('#volunteerResetChangesBtn');
  if(button){
    button.disabled=true;
    button.textContent='Ripristino…';
  }

  try{
    const result=await api.resetChanges();
    const resetIds=new Set(
      (history.entries||[])
        .map(entry=>entry.proposalId)
        .filter(Boolean)
    );

    (workspace.proposals||[]).forEach(proposal=>{
      if(resetIds.has(proposal.id)){
        proposal.status='INVIATA';
        proposal.reviewReason='';
        proposal.reviewedAt='';
      }
    });

    selectedSolutions.clear();
    compatibility.clear();
    render();
    updateChangeToolbar();

    showDecisionPopup({
      title:'Cambi ripristinati',
      text:`Ripristinate ${result.count||count} ${count===1?'approvazione':'approvazioni'} e relativo calendario.`,
      note:'ATLAS ricalcola ora le proposte sul calendario ripristinato.',
      icon:'↺'
    });

    runCompatibilityAnalysis({force:true})
      .catch(error=>console.warn('Ricalcolo dopo reset:',error));
  }catch(error){
    showDecisionPopup({
      title:'Reset non completato',
      text:error.message||'Non è stato possibile ripristinare i cambi.',
      icon:'!'
    });
  }finally{
    if(button){
      button.textContent='Reset cambi';
      updateChangeToolbar();
    }
  }
}

function ensureCompatibilityToolbar(){
  const host=$('#volunteerProposalList');

  if(
    !host||
    $('#volunteerCompatibilityToolbar')
  ){
    return;
  }

  const toolbar=
    document.createElement('div');

  toolbar.id=
    'volunteerCompatibilityToolbar';

  toolbar.className=
    'compatibility-toolbar';

  toolbar.innerHTML=`
    <div class="compatibility-summary">
      <button class="compat-filter active"
              type="button"
              data-compat-filter="ALL">
        Tutte
        <span class="count"
              data-compat-count="ALL">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="DIRECT">
        ✓ Compatibili
        <span class="count"
              data-compat-count="DIRECT">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="CHANGES">
        ⇄ Con cambi
        <span class="count"
              data-compat-count="CHANGES">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="REVIEW">
        △ Da verificare
        <span class="count"
              data-compat-count="REVIEW">0</span>
      </button>

      <button class="compat-filter"
              type="button"
              data-compat-filter="INCOMPATIBLE">
        × Impossibili
        <span class="count"
              data-compat-count="INCOMPATIBLE">0</span>
      </button>
    </div>

    <div class="compatibility-progress">
      <span id="compatibilityProgressText">
        Analisi sul calendario aperto
      </span>

      <div class="compatibility-actions">
        <button class="change-log-btn"
                id="volunteerChangeLogBtn"
                type="button">
          Riepilogo cambi
          <span class="change-log-count" id="volunteerChangeCount">0</span>
        </button>

        <button class="reset-changes-btn"
                id="volunteerResetChangesBtn"
                type="button">
          Reset cambi
        </button>

        <button class="btn small compat-recalc"
                id="compatibilityRecalcBtn"
                type="button">
          Ricalcola
        </button>
      </div>
    </div>
  `;

  host.parentElement?.insertBefore(
    toolbar,
    host
  );

  $$('[data-compat-filter]')
    .forEach(button=>
      button.addEventListener(
        'click',
        ()=>{
          compatibilityFilter=
            button.dataset.compatFilter||
            'ALL';

          $$('[data-compat-filter]')
            .forEach(other=>
              other.classList.toggle(
                'active',
                other===button
              )
            );

          render();
        }
      )
    );

  $('#compatibilityRecalcBtn')
    ?.addEventListener(
      'click',
      ()=>{
        runCompatibilityAnalysis({
          force:true
        });
      }
    );

  $('#volunteerChangeLogBtn')
    ?.addEventListener('click',()=>{
      renderChangeDrawer();
      $('#volunteerChangeDrawer')?.classList.remove('hidden');
    });

  $('#volunteerResetChangesBtn')
    ?.addEventListener('click',resetAllVolunteerChanges);

  updateChangeToolbar();
}

function solutionFor(item,result){
  const solutions=
    result?.solutions||[];

  if(!solutions.length){
    return null;
  }

  let signature=
    selectedSolutions.get(item.id);

  let selected=
    solutions.find(
      solution=>
        solution.signature===signature
    );

  if(!selected){
    selected=solutions[0];

    selectedSolutions.set(
      item.id,
      selected.signature
    );
  }

  return selected;
}


function proposalSolutionFootprint(item,solution){
  const hole=parseHole(item);
  const holeDay=String(hole.day||'').slice(0,10);
  const keys=new Set();

  (solution.operations||[])
    .forEach(operation=>{
      if(operation.mode==='covered'){
        return;
      }

      if(
        operation.coverEmployeeId&&
        holeDay
      ){
        keys.add(
          `cell:${operation.coverEmployeeId}|${holeDay}`
        );
      }

      keys.add(
        `slot:${holeDay}|${hole.shift||''}|${hole.site||''}|${hole.machine||''}|${operation.role||''}`
      );

      if(operation.sourceItemId){
        keys.add(
          `source:${operation.sourceItemId}`
        );
      }

      if(
        operation.sourceDay&&
        operation.coverEmployeeId
      ){
        keys.add(
          `cell:${operation.coverEmployeeId}|${operation.sourceDay}`
        );
      }

      (operation.chainSteps||[])
        .forEach(step=>{
          keys.add(
            `source:${step.sourceItemId}`
          );

          keys.add(
            `cell:${step.fromEmployeeId}|${step.sourceDay}`
          );

          keys.add(
            `cell:${step.toEmployeeId}|${step.sourceDay}`
          );
        });

      (operation.droppedResponsibilities||[])
        .forEach(drop=>{
          keys.add(
            `source:${drop.sourceItemId}`
          );

          keys.add(
            `cell:${drop.employeeId}|${drop.day}`
          );
        });
    });

  return keys;
}

function optimizeGlobalProposalPlan(pending){
  const eligible=(pending||[])
    .map(item=>({
      item,
      result:compatibility.get(item.id)
    }))
    .filter(entry=>
      ['DIRECT','CHANGES'].includes(
        entry.result?.status
      )&&
      (entry.result?.solutions||[]).length
    )
    .map(entry=>({
      ...entry,
      solutions:
        (entry.result.solutions||[])
          .slice(0,7)
          .map(solution=>({
            solution,
            footprint:
              proposalSolutionFootprint(
                entry.item,
                solution
              ),
            quality:
              Number(solution.cost||0)*100000+
              Number(solution.warningCount||0)*10000+
              Number(solution.score||0)
          }))
    }))
    .sort((left,right)=>
      left.solutions.length-right.solutions.length||
      left.item.id.localeCompare(
        right.item.id,
        'it'
      )
    );

  let nodes=0;
  const maxNodes=45000;
  let best={
    count:-1,
    quality:Number.POSITIVE_INFINITY,
    selected:new Map()
  };

  const used=new Set();
  const selected=new Map();

  function better(count,quality){
    return(
      count>best.count||
      (
        count===best.count&&
        quality<best.quality
      )
    );
  }

  function walk(index,count,quality){
    nodes++;

    if(nodes>maxNodes){
      return;
    }

    if(
      count+
      (eligible.length-index)<
      best.count
    ){
      return;
    }

    if(index>=eligible.length){
      if(better(count,quality)){
        best={
          count,
          quality,
          selected:new Map(selected)
        };
      }

      return;
    }

    const entry=eligible[index];

    for(const candidate of entry.solutions){
      const conflict=[
        ...candidate.footprint
      ].some(key=>
        used.has(key)
      );

      if(conflict){
        continue;
      }

      candidate.footprint
        .forEach(key=>
          used.add(key)
        );

      selected.set(
        entry.item.id,
        candidate.solution.signature
      );

      walk(
        index+1,
        count+1,
        quality+candidate.quality
      );

      selected.delete(
        entry.item.id
      );

      candidate.footprint
        .forEach(key=>
          used.delete(key)
        );
    }

    // Lascia fuori una proposta solo se questo consente
    // di coprirne un numero maggiore fra le successive.
    walk(
      index+1,
      count,
      quality
    );
  }

  walk(0,0,0);

  const selectedMap=
    best.selected||new Map();

  eligible.forEach(entry=>{
    const signature=
      selectedMap.get(
        entry.item.id
      );

    entry.result.globalRecommendedSignature=
      signature||'';

    entry.result.globalPlanSelected=
      Boolean(signature);

    entry.result.globalConflict=
      !signature;

    if(signature){
      selectedSolutions.set(
        entry.item.id,
        signature
      );
    }else{
      selectedSolutions.delete(
        entry.item.id
      );
    }
  });

  const impossible=
    (pending||[]).filter(item=>
      compatibility.get(item.id)?.status===
      'INCOMPATIBLE'
    ).length;

  const review=
    (pending||[]).filter(item=>
      compatibility.get(item.id)?.status===
      'REVIEW'
    ).length;

  globalPlanStats={
    total:(pending||[]).length,
    covered:Math.max(0,best.count),
    impossible,
    review,
    conflict:
      Math.max(
        0,
        eligible.length-
        Math.max(0,best.count)
      ),
    truncated:
      nodes>maxNodes
  };

  (pending||[])
    .forEach(item=>{
      const result=
        compatibility.get(item.id);

      if(!result){
        return;
      }

      result.globalPlanStats={
        ...globalPlanStats
      };
    });
}


function renderSolutionPreview(solution){
  if(!solution){
    return'';
  }

  return`
    <div class="solution-preview">
      ${(solution.operations||[])
        .map(operation=>{
          let text='';

          if(operation.mode==='covered'){
            text=
              operation.text||
              'Ruolo già coperto.';
          }else if(operation.mode==='responsibility'){
            text=
              `<strong>${esc(operation.coverName)}</strong> `+
              `passa da <strong>${esc(operation.sourceCode)}</strong> `+
              `al turno 118 richiesto. La giornata di responsabilità viene convertita nel servizio operativo.`;
          }else if(
            operation.mode==='change'||
            operation.mode==='chain'
          ){
            const steps=
              (operation.chainSteps||[])
                .map((step,index)=>
                  `<span class="chain-step-line">`+
                  `<b>${index+1}.</b> `+
                  `<strong>${esc(step.toEmployeeName)}</strong> `+
                  `prende <strong>${esc(step.sourceCode)}</strong> `+
                  `da ${esc(step.fromEmployeeName)} `+
                  `il ${esc(dateLabel(step.sourceDay))}.`+
                  `</span>`
                )
                .join('');

            const drops=
              (operation.droppedResponsibilities||[])
                .map(drop=>
                  `<span class="chain-step-line">`+
                  `<b>•</b> ${esc(drop.sourceCode)} di `+
                  `<strong>${esc(drop.employeeName)}</strong> `+
                  `viene convertito in attività operativa.`+
                  `</span>`
                )
                .join('');

            text=
              `<strong>${esc(operation.coverName)}</strong> `+
              `copre il ruolo volontari.`+
              (
                steps||drops
                  ?`<span class="chain-step-list">${steps}${drops}</span>`
                  :''
              );
          }else{
            text=
              `<strong>${esc(operation.coverName)}</strong> `+
              `copre direttamente il ruolo senza spostare altri turni.`;
          }

          return`
            <div class="solution-preview-row">
              <span class="solution-preview-role">
                ${esc(roleLabel(operation.role))}
              </span>

              <span class="solution-preview-text">
                ${text}
              </span>
            </div>
          `;
        })
        .join('')
      }
    </div>
  `;
}

function renderSolutionWorkflow(
  item,
  result
){
  const api=analyzer();

  if(
    !api||
    !result||
    !['DIRECT','CHANGES'].includes(
      result.status
    )
  ){
    return'';
  }

  const applied=
    typeof api.isApplied==='function'&&
    api.isApplied(item.id);

  if(applied){
    return`
      <div class="solution-workflow applied">
        <div class="applied-banner">
          <div class="applied-icon">✓</div>

          <div>
            <div class="applied-title">
              Piano già predisposto
            </div>

            <div class="applied-text">
              Le modifiche sono già presenti localmente.
              Usa il solo pulsante <strong>Approva e applica</strong>
              per confermare la proposta e salvare il calendario.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const solutions=
    result.solutions||[];

  if(!solutions.length){
    return'';
  }

  const selected=
    solutionFor(
      item,
      result
    );

  const recommended=
    result.globalConflict
      ?''
      :(
          result.globalRecommendedSignature||
          solutions[0]?.signature||
          ''
        );

  const selectedIsRecommended=
    Boolean(recommended)&&
    selected?.signature===recommended;

  const planStats=
    result.globalPlanStats||
    globalPlanStats;

  return`
    <div class="solution-workflow">
      <div class="solution-step">
        <span class="solution-step-number">1</span>

        <strong>
          Soluzione proposta da ATLAS
        </strong>
      </div>

      <label class="solution-label"
             for="solution-${esc(item.id)}">
        ${solutions.length} ${
          solutions.length===1
            ?'soluzione valida'
            :'soluzioni valide'
        }
        · ordinate per minore invasività, riposi, ore e continuità del servizio
      </label>

      <div class="solution-decision-grid">
        <div class="solution-choice-column">
          <select class="solution-select"
                  id="solution-${esc(item.id)}"
                  data-solution-select="${esc(item.id)}">
            ${solutions
              .map((solution,index)=>`
                <option value="${esc(solution.signature)}"
                        ${
                          solution.signature===selected?.signature
                            ?'selected'
                            :''
                        }>
                  ${
                    solution.signature===recommended
                      ?'★ Consigliata · '
                      :`${index+1}. `
                  }${esc(solution.label)}
                </option>
              `)
              .join('')
            }
          </select>

          ${selectedIsRecommended
            ?`
              <div class="global-plan-note good">
                <strong>Scelta consigliata nel piano globale.</strong>
                ATLAS sta cercando di massimizzare le richieste copribili:
                ${esc(planStats.covered||0)}/${esc(planStats.total||0)} nel piano corrente.
              </div>
            `
            :`
              <div class="global-plan-note">
                Hai selezionato un'alternativa alla soluzione consigliata.
                ATLAS controllerà nuovamente tutto il calendario al momento dell'approvazione.
              </div>
            `
          }

          ${result.globalConflict
            ?`
              <div class="global-plan-note warn">
                Questa proposta è copribile singolarmente, ma nel piano globale
                entra in conflitto con risorse necessarie ad altre richieste.
                Puoi comunque scegliere una soluzione manualmente.
              </div>
            `
            :''
          }

          ${renderSolutionPreview(selected)}

          <div class="solution-help single-action">
            <strong>Nessun doppio passaggio.</strong>
            Il pulsante <strong>Approva e applica</strong> in fondo alla scheda
            esegue i cambi, inserisce la copertura, salva il calendario
            e registra l'approvazione.
          </div>
        </div>

        ${renderHoursScore(selected)}
      </div>
    </div>
  `;
}


function renderCompatibilityDetail(
  item,
  result
){
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
          <span>Analisi dell'intero calendario in corso</span>
        </div>

        <div class="compat-box-text">
          ATLAS sta provando coperture dirette, cambi turno,
          catene di sostituzione, riposi, qualifiche e monte ore.
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
        :result.status==='REVIEW'
          ?'review'
          :'incompatible';

  const icon=
    result.status==='DIRECT'
      ?'✓'
      :result.status==='CHANGES'
        ?'⇄'
        :result.status==='REVIEW'
          ?'△'
          :'×';

  const roleRows=(['DIRECT','CHANGES'].includes(result.status)
    ?(result.roles||[])
    :[])
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

      if(detail.mode==='responsibility'){
        return`
          <div class="compat-role">
            <span class="compat-role-label">
              ${esc(roleLabel(detail.role))}
            </span>

            <span class="compat-role-detail">
              <strong>${esc(detail.coverName)}</strong>
              può coprire la richiesta trasformando
              <strong>${esc(detail.sourceCode)}</strong>
              in servizio operativo 118.
            </span>
          </div>
        `;
      }

      if(
        detail.mode==='change'||
        detail.mode==='chain'
      ){
        const chain=
          (detail.chainSteps||[])
            .map(step=>
              `${step.toEmployeeName} prende ${step.sourceCode} da ${step.fromEmployeeName}`
            )
            .join(' → ');

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
              ${esc(chain||detail.text||'Cambio turno compatibile')}
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
            ATLAS ha già selezionato la soluzione più logica nel piano globale.
            Puoi aprire la tendina sotto solo se vuoi valutarne un'altra.
          </div>
        `
        :result.status==='REVIEW'
          ?`
            <div class="compat-note">
              Questa richiesta non viene dichiarata impossibile:
              richiede una verifica manuale perché restano vincoli potenzialmente riorganizzabili.
            </div>
          `
          :''
      }
    </div>

    ${renderSolutionWorkflow(
      item,
      result
    )}
  `;
}

function card(item){
  const hole=parseHole(item);

  const roles=(hole.roles||[])
    .map(roleLabel)
    .join(', ');

  const pending=
    item.status==='INVIATA';

  const canReview=
    pending&&
    has('volunteerProposalReview');

  const ready=
    item.calendarReady===true;

  const result=
    pending
      ?compatibility.get(item.id)
      :null;

  const meta=
    pending
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
            ${esc(dateWithWeekdayLabel(hole.day))}
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
            ${esc(
              item.status==='INVIATA'
                ?'DA VALUTARE'
                :item.status
            )}
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
              item,
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
                Approvazione bloccata: prima genera e salva il calendario del mese.
              </strong>
              L'analisi automatica resta disponibile, ma
              <strong>Approva e applica</strong> si abilita solo dopo il salvataggio del calendario.
            </div>
          `
          :''
        }
      </div>

      ${canReview
        ?`
          <div class="proposal-actions">
            <button class="btn small primary approve-insert-btn"
                    data-review="${esc(item.id)}"
                    data-decision="APPROVE"
                    ${
                      !ready||
                      !result||
                      result.status==='ANALYZING'||
                      result.status==='INCOMPATIBLE'||
                      result.status==='REVIEW'||
                      result.status==='OTHER_MONTH'
                        ?'disabled'
                        :''
                    }>
              ${
                !ready
                  ?'Calendario da salvare'
                  :result?.status==='ANALYZING'
                    ?'Analisi in corso…'
                    :result?.status==='INCOMPATIBLE'
                      ?'Impossibile'
                      :result?.status==='REVIEW'
                        ?'Da verificare'
                        :'Approva e applica'
              }
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
    REVIEW:0,
    INCOMPATIBLE:0
  };

  (workspace.proposals||[])
    .filter(item=>
      item.status==='INVIATA'
    )
    .forEach(item=>{
      counts.ALL++;

      const status=
        compatibility.get(
          item.id
        )?.status;

      if(counts[status]!==undefined){
        counts[status]++;
      }
    });

  return counts;
}

function updateCompatibilityToolbar(){
  const counts=
    compatibilityCounts();

  Object.entries(counts)
    .forEach(([key,value])=>{
      const node=
        document.querySelector(
          `[data-compat-count="${key}"]`
        );

      if(node){
        node.textContent=
          String(value);
      }
    });

  const progress=
    $('#compatibilityProgressText');

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
          ?(
              `Piano globale: ${globalPlanStats.covered||0}/${counts.ALL} richieste incluse`+
              (
                globalPlanStats.impossible
                  ?` · ${globalPlanStats.impossible} impossibili`
                  :''
              )+
              (
                globalPlanStats.review
                  ?` · ${globalPlanStats.review} da verificare`
                  :''
              )
            )
          :'Nessuna proposta da valutare';
    }
  }
}

function filteredItems(){
  const statusFilter=
    $('#volunteerStatusFilter')?.value||
    'ALL';

  let items=
    workspace.proposals||[];

  if(statusFilter!=='ALL'){
    items=items.filter(
      item=>
        item.status===statusFilter
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

function proposalById(id){
  return(
    workspace.proposals||[]
  ).find(
    item=>item.id===id
  )||null;
}

function goToAppliedCalendar(
  proposalId
){
  const api=analyzer();

  const cells=
    typeof api?.appliedCells==='function'
      ?api.appliedCells(proposalId)
      :[];

  const calendarNav=
    document.querySelector(
      '.nav-btn[data-view="calendarView"]'
    );

  calendarNav?.click();

  const first=
    cells[0];

  if(!first){
    return;
  }

  setTimeout(()=>{
    const target=
      document.querySelector(
        `.cell-button[data-employee="${CSS.escape(first.employeeId)}"][data-day="${CSS.escape(first.day)}"]`
      );

    if(!target){
      return;
    }

    target.scrollIntoView({
      behavior:'smooth',
      block:'center',
      inline:'center'
    });

    target.classList.add(
      'volunteer-focus-pulse'
    );

    setTimeout(
      ()=>target.classList.remove(
        'volunteer-focus-pulse'
      ),
      2600
    );
  },120);
}


function keepRoOnVolunteerCoverageView(){
  const profile=String(
    document.body?.dataset?.requiredProfile||''
  ).trim().toUpperCase();

  if(profile!=='RO'){
    return;
  }

  const volunteerView=
    document.getElementById('volunteerCoverageView');

  const volunteerNav=
    document.getElementById('volunteerCoverageNav')||
    document.querySelector(
      '.nav-btn[data-view="volunteerCoverageView"]'
    );

  if(!volunteerView||!volunteerNav){
    return;
  }

  document.querySelectorAll('.view')
    .forEach(view=>
      view.classList.toggle(
        'active',
        view===volunteerView
      )
    );

  document.querySelectorAll('.nav-btn')
    .forEach(button=>
      button.classList.toggle(
        'active',
        button===volunteerNav
      )
    );
}

function closeDecisionPopup(){
  $('#atlasDecisionPopupBackdrop')
    ?.remove();
}

function showDecisionPopup({
  title,
  text,
  note='',
  icon='✓',
  calendarProposalId=''
}){
  closeDecisionPopup();

  const backdrop=
    document.createElement('div');

  backdrop.id=
    'atlasDecisionPopupBackdrop';

  backdrop.className=
    'atlas-decision-popup-backdrop';

  backdrop.innerHTML=`
    <div class="atlas-decision-popup"
         role="dialog"
         aria-modal="true"
         aria-labelledby="atlasDecisionPopupTitle">
      <div class="atlas-decision-popup-icon">
        ${esc(icon)}
      </div>

      <h3 id="atlasDecisionPopupTitle">
        ${esc(title)}
      </h3>

      <p>
        ${esc(text)}
      </p>

      ${note
        ?`
          <div class="atlas-decision-popup-note">
            ${esc(note)}
          </div>
        `
        :''
      }

      <div class="atlas-decision-popup-actions">
        ${calendarProposalId
          ?`
            <button class="btn"
                    type="button"
                    id="popupGoCalendarBtn">
              Apri calendario
            </button>
          `
          :''
        }

        <button class="btn primary"
                type="button"
                id="popupCloseBtn">
          Chiudi
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(
    backdrop
  );

  $('#popupCloseBtn')
    ?.addEventListener(
      'click',
      closeDecisionPopup
    );

  $('#popupGoCalendarBtn')
    ?.addEventListener(
      'click',
      ()=>{
        closeDecisionPopup();
        goToAppliedCalendar(
          calendarProposalId
        );
      }
    );

  backdrop.addEventListener(
    'click',
    event=>{
      if(event.target===backdrop){
        closeDecisionPopup();
      }
    }
  );
}

function renderPreservingPosition(
  proposalId=''
){
  const scrollY=
    window.scrollY;

  const card=
    proposalId
      ?document.querySelector(
          `[data-proposal-card="${CSS.escape(proposalId)}"]`
        )
      :null;

  const offset=
    card
      ?card.getBoundingClientRect().top
      :null;

  render();

  requestAnimationFrame(()=>{
    if(
      proposalId&&
      offset!==null
    ){
      const nextCard=
        document.querySelector(
          `[data-proposal-card="${CSS.escape(proposalId)}"]`
        );

      if(nextCard){
        const nextOffset=
          nextCard.getBoundingClientRect().top;

        window.scrollBy(
          0,
          nextOffset-offset
        );

        return;
      }
    }

    window.scrollTo(
      0,
      scrollY
    );
  });
}


function bindSolutionControls(){
  $$('[data-solution-select]')
    .forEach(select=>
      select.addEventListener(
        'change',
        ()=>{
          selectedSolutions.set(
            select.dataset.solutionSelect,
            select.value
          );

          render();
        }
      )
    );
}

function bindReviewButtons(){
  $$('[data-review]')
    .forEach(button=>
      button.addEventListener(
        'click',
        async()=>{
          const proposalId=
            button.dataset.review;

          const decision=
            button.dataset.decision;

          const proposal=
            proposalById(
              proposalId
            );

          if(!proposal){
            return;
          }

          if(decision==='REJECT'){
            const reason=
              prompt(
                'Motivo del rigetto:',
                ''
              )||'';

            if(!reason){
              return;
            }

            if(
              !confirm(
                'Confermi il rigetto della richiesta?'
              )
            ){
              return;
            }

            const auth=
              getServerAuthContext();

            button.disabled=true;
            button.textContent=
              'Rigetto…';

            try{
              await reviewVolunteerProposal({
                url:ATLAS_SERVER_URL,
                token:auth.token,
                proposalId,
                decision:'REJECT',
                reason
              });

              proposal.status=
                'RIFIUTATA';

              proposal.reviewReason=
                reason;

              proposal.reviewedAt=
                new Date().toISOString();

              renderPreservingPosition(
                proposalId
              );

              // Il RO resta sulla pagina Buchi volontari.
              keepRoOnVolunteerCoverageView();

              showDecisionPopup({
                title:'Richiesta rigettata',
                text:
                  'La richiesta è stata registrata come non approvata. Il calendario non è stato modificato.',
                icon:'×'
              });
            }catch(error){
              alert(
                error.message||
                'Rigetto non riuscito.'
              );
            }finally{
              button.disabled=false;
              button.textContent=
                'Rigetta';
            }

            return;
          }

          if(proposal.calendarReady!==true){
            showDecisionPopup({
              title:'Calendario non ancora pronto',
              text:
                'Prima genera e salva il calendario del mese. Solo dopo ATLAS può approvare e applicare la proposta volontari.',
              icon:'!'
            });
            return;
          }

          const result=
            compatibility.get(
              proposalId
            );

          if(
            !result||
            !['DIRECT','CHANGES'].includes(
              result.status
            )
          ){
            showDecisionPopup({
              title:'Richiesta non approvabile',
              text:
                'ATLAS non dispone di una soluzione compatibile da inserire nel calendario.',
              note:
                result?.summary||
                'Ricalcola la compatibilità e controlla il mese aperto.',
              icon:'!'
            });
            return;
          }

          const api=
            analyzer();

          if(
            typeof api?.approveProposal!=='function'
          ){
            alert(
              'Funzione di approvazione non disponibile. Aggiorna i file ATLAS.'
            );
            return;
          }

          const alreadyApplied=
            typeof api.isApplied==='function'&&
            api.isApplied(
              proposalId
            );

          const selected=
            alreadyApplied
              ?null
              :solutionFor(
                  proposal,
                  result
                );

          if(
            !alreadyApplied&&
            !selected
          ){
            alert(
              'Seleziona una soluzione prima di approvare.'
            );
            return;
          }

          const detail=
            alreadyApplied
              ?'La soluzione già applicata verrà confermata e salvata.'
              :(selected.operations||[])
                .map(operation=>{
                  if(
                    operation.mode==='responsibility'
                  ){
                    return(
                      `${roleLabel(operation.role)}: `+
                      `${operation.coverName} passa da ${operation.sourceCode} al turno 118`
                    );
                  }

                  if(
                    operation.mode==='change'||
                    operation.mode==='chain'
                  ){
                    const chain=
                      (operation.chainSteps||[])
                        .map(step=>
                          `${step.toEmployeeName} prende ${step.sourceCode} da ${step.fromEmployeeName} (${dateLabel(step.sourceDay)})`
                        )
                        .join(' → ');

                    return(
                      `${roleLabel(operation.role)}: `+
                      `${operation.coverName} copre il buco; `+
                      `${chain||'catena di cambi applicata'}`
                    );
                  }

                  if(
                    operation.mode==='direct'
                  ){
                    return(
                      `${roleLabel(operation.role)}: `+
                      `${operation.coverName} copertura diretta`
                    );
                  }

                  return(
                    `${roleLabel(operation.role)} già coperto`
                  );
                })
                .join('\n');

          if(
            !confirm(
              `Confermi?\n\n${detail}\n\nCon un solo comando ATLAS applicherà i cambi, inserirà la copertura, salverà il calendario e registrerà la proposta come APPROVATA.`
            )
          ){
            return;
          }

          button.disabled=true;
          button.textContent=
            'Approvo e salvo…';

          try{
            await api.approveProposal(
              proposal,
              selected?.signature||'',
              '',
              selected||null
            );

            proposal.status=
              'APPROVATA';

            proposal.reviewReason=
              '';

            proposal.reviewedAt=
              new Date().toISOString();

            selectedSolutions.delete(
              proposalId
            );

            compatibility.delete(
              proposalId
            );

            const cardBefore=
              document.querySelector(
                `[data-proposal-card="${CSS.escape(proposalId)}"]`
              );

            cardBefore?.classList.add(
              'proposal-approved-now'
            );

            renderPreservingPosition(
              proposalId
            );

            // L'approvazione aggiorna e salva il calendario, ma il RO
            // continua a lavorare nella pagina Buchi volontari.
            keepRoOnVolunteerCoverageView();

            showDecisionPopup({
              title:'Richiesta approvata',
              text:
                'ATLAS ha applicato il piano, inserito la copertura e salvato il calendario.',
              note:
                'Resti nella pagina Buchi volontari. Le altre richieste vengono ricalcolate automaticamente sul nuovo calendario.',
              icon:'✓'
            });

            // Ricalcola soltanto localmente le altre proposte:
            // nessun reload dell'elenco dal server.
            runCompatibilityAnalysis({
              force:true
            }).catch(error=>
              console.warn(
                'Ricalcolo compatibilità non riuscito:',
                error
              )
            );
          }catch(error){
            showDecisionPopup({
              title:'Approvazione non completata',
              text:
                error.message||
                'Non è stato possibile completare approvazione e salvataggio del calendario.',
              note:
                'La pagina non è stata ricaricata. Controlla la connessione e riprova.',
              icon:'!'
            });
          }finally{
            button.disabled=false;
            button.textContent=
              'Approva e applica';
          }
        }
      )
    );
}

function render(){
  const host=
    $('#volunteerProposalList');

  if(!host){
    return;
  }

  ensureCompatibilityStyles();
  ensureCompatibilityToolbar();
  updateChangeToolbar();

  const items=
    filteredItems();

  const subtitle=
    $('#volunteerListSubtitle');

  if(subtitle){
    const pending=
      (workspace.proposals||[])
        .filter(item=>
          item.status==='INVIATA'
        )
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
      :`
        <div class="volunteer-empty">
          Nessuna proposta disponibile con i filtri selezionati.
        </div>
      `;

  updateCompatibilityToolbar();
  bindSolutionControls();
  bindReviewButtons();
}

async function idleYield(){
  await new Promise(resolve=>{
    if(
      'requestIdleCallback' in globalThis
    ){
      requestIdleCallback(
        ()=>resolve(),
        {
          timeout:80
        }
      );
    }else{
      setTimeout(
        resolve,
        0
      );
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

  const pending=
    (workspace.proposals||[])
      .filter(item=>
        item.status==='INVIATA'
      );

  if(
    !force&&
    pending.length&&
    pending.every(item=>
      compatibility.has(item.id)
    )
  ){
    optimizeGlobalProposalPlan(
      pending
    );
    render();
    return;
  }

  const run=
    ++analysisRun;

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
          status:'REVIEW',
          label:'Da verificare',
          tone:'warning',
          summary:
            'ATLAS non è riuscito a completare il controllo automatico. La richiesta non viene classificata come impossibile.',
          roles:[],
          changes:[],
          solutions:[],
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

  optimizeGlobalProposalPlan(
    pending
  );

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

  const host=
    $('#volunteerProposalList');

  if(host){
    host.innerHTML=`
      <div class="volunteer-loading">
        <strong>Caricamento proposte…</strong><br>
        <span>
          Leggo le richieste volontari.
          L’analisi di compatibilità viene eseguita sul calendario già aperto.
        </span>
      </div>
    `;
  }

  const auth=
    getServerAuthContext();

  workspaceLoading=(async()=>{
    try{
      workspace=
        await loadVolunteerWorkspace({
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

  permissions=
    new Set(
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
        if(
          !has('volunteerProposalView')
        ){
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
