import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth-protected.js';
import {
  loadVolunteerWorkspace,
  reviewVolunteerProposal
} from './google-sheet-service.js?v=1.0.0-20260809d';

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
const selectedAcceptedIds=new Set();

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
    },

    REVIEW:{
      label:'Da verificare',
      cls:'compat-changes',
      icon:'?'
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



    .vol-analysis-overlay{
      position:fixed;inset:0;z-index:120000;display:none;place-items:center;
      padding:24px;background:rgba(2,12,20,.84);backdrop-filter:blur(12px)
    }
    .vol-analysis-overlay.open{display:grid}
    .vol-analysis-card{
      width:min(520px,calc(100vw - 36px));padding:24px;border-radius:20px;
      border:1px solid rgba(125,211,252,.18);
      background:linear-gradient(145deg,rgba(8,31,46,.99),rgba(5,22,34,.99));
      box-shadow:0 30px 90px rgba(0,0,0,.48)
    }
    .vol-analysis-kicker{font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc}
    .vol-analysis-title{margin-top:6px;font-size:20px;font-weight:900;color:#f4fbff}
    .vol-analysis-text{margin-top:7px;color:#91a9b7;font-size:12px;line-height:1.55}
    .vol-analysis-line{height:6px;margin-top:18px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07)}
    .vol-analysis-line i{display:block;width:5%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22d3ee,#3b82f6);transition:width .18s ease}
    .vol-analysis-count{display:flex;justify-content:space-between;margin-top:9px;color:#7693a1;font-size:10px}

    .hours-safe-panel{
      margin-top:13px;padding:13px;border:1px solid rgba(125,211,252,.14);
      border-radius:13px;background:rgba(4,18,28,.52)
    }
    .hours-safe-head{display:flex;justify-content:space-between;gap:10px;align-items:end;margin-bottom:9px}
    .hours-safe-head strong{font-size:13px;color:#f2f9fc}
    .hours-safe-head span{font-size:9px;font-weight:900;letter-spacing:.1em;color:#7dd3fc;text-transform:uppercase}
    .hours-safe-list{display:grid;gap:8px}
    .hours-safe-row{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:8px 14px;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.025)}
    .hours-safe-person strong{display:block;font-size:12px;color:#eef8fb}
    .hours-safe-person small{display:block;margin-top:2px;color:#75909d;font-size:9px}
    .hours-safe-values{text-align:right;white-space:nowrap;font-size:11px;color:#9db2bc}
    .hours-safe-values b{font-size:14px;color:#fff}
    .hours-safe-values em{margin-left:7px;font-style:normal;font-weight:900;color:#7dd3ae}
    .hours-safe-row.excess .hours-safe-values em{color:#e9b85d}
    .hours-safe-row.missing .hours-safe-values em{color:#72c7e4}
    .hours-safe-balance{grid-column:1/-1;display:flex;justify-content:space-between;gap:8px;color:#8099a5;font-size:9px}


    /* ---------------------------------------------------------
       Pannello ore continuo — vista ampia e leggibile
       --------------------------------------------------------- */
    .role-ro .volunteer-layout{
      grid-template-columns:minmax(0,1fr) 360px!important;
      max-width:none!important;
      width:100%!important;
      align-items:start
    }
    .role-admin .volunteer-layout{
      grid-template-columns:minmax(260px,320px) minmax(0,1fr) 360px!important;
      max-width:none!important;
      width:100%!important;
      align-items:start
    }
    .hours-score-rail{
      position:sticky;
      top:84px;
      align-self:start;
      min-width:0;
      max-height:calc(100vh - 110px);
      overflow:auto;
      padding:16px;
      border:1px solid rgba(125,211,252,.16);
      border-radius:16px;
      background:linear-gradient(160deg,rgba(7,28,41,.98),rgba(4,20,30,.98));
      box-shadow:0 18px 42px rgba(0,0,0,.22)
    }
    .hours-score-title{
      display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
      padding-bottom:12px;border-bottom:1px solid rgba(125,211,252,.10)
    }
    .hours-score-title span{
      display:block;color:#7dd3fc;font-size:9px;font-weight:900;
      letter-spacing:.13em;text-transform:uppercase
    }
    .hours-score-title strong{
      display:block;margin-top:3px;color:#f3f9fc;font-size:17px;letter-spacing:-.02em
    }
    .hours-score-count{
      flex:0 0 auto;padding:6px 8px;border-radius:999px;
      background:rgba(125,211,252,.08);color:#a9e8fb;font-size:10px;font-weight:900
    }
    .hours-score-help{
      margin:10px 0 13px;color:#7894a2;font-size:10px;line-height:1.45
    }
    .hours-score-list{display:grid;gap:9px}
    .hours-score-empty{
      padding:22px 10px;text-align:center;color:#6f8996;font-size:11px;line-height:1.55
    }
    .hours-score-row{
      padding:11px;border:1px solid rgba(255,255,255,.055);
      border-radius:12px;background:rgba(255,255,255,.022)
    }
    .hours-score-row.missing{border-color:rgba(56,189,248,.12)}
    .hours-score-row.balanced{border-color:rgba(52,211,153,.14)}
    .hours-score-row.excess{border-color:rgba(251,191,36,.15)}
    .hours-score-person{
      display:flex;justify-content:space-between;gap:10px;align-items:baseline
    }
    .hours-score-person strong{
      min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      color:#eef8fb;font-size:12px
    }
    .hours-score-person em{
      flex:0 0 auto;font-style:normal;font-size:10px;font-weight:900;color:#9bdcf2
    }
    .hours-score-main{
      display:flex;align-items:baseline;gap:5px;margin-top:7px;color:#8da5b1;font-size:10px
    }
    .hours-score-main b{color:#fff;font-size:17px;letter-spacing:-.025em}
    .hours-score-main .arrow{color:#5f7d8a;font-weight:900}
    .hours-score-track{
      position:relative;height:8px;margin-top:9px;border-radius:999px;
      background:rgba(255,255,255,.065);overflow:hidden
    }
    .hours-score-fill{
      position:absolute;inset:0 auto 0 0;width:0;border-radius:inherit;
      background:linear-gradient(90deg,#2b83a3,#51c6e7)
    }
    .hours-score-row.balanced .hours-score-fill{
      background:linear-gradient(90deg,#269b78,#55d6a5)
    }
    .hours-score-row.excess .hours-score-fill{
      background:linear-gradient(90deg,#b78931,#e1b85e)
    }
    .hours-score-target{
      position:absolute;top:-2px;bottom:-2px;right:0;width:2px;background:#f3f7f8;opacity:.8
    }
    .hours-score-foot{
      display:flex;justify-content:space-between;gap:8px;margin-top:6px;
      color:#718c98;font-size:9px
    }
    .hours-score-foot strong{color:#c8d8df}
    .accepted-toolbar{
      grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;
      flex-wrap:wrap;gap:7px;padding-top:9px;margin-top:9px;border-top:1px solid rgba(255,255,255,.05)
    }
    .accepted-toolbar .accepted-count{
      margin-right:auto;color:#7f9aa7;font-size:10px
    }
    .accepted-select{
      display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;
      background:rgba(52,211,153,.055);color:#a9e8cb;font-size:9px;font-weight:850
    }
    .accepted-select input{accent-color:#36c78f}
    .accepted-delete-btn{
      border-color:rgba(248,113,113,.28)!important;
      color:#ffc2ca!important;background:rgba(248,113,113,.06)!important
    }
    .accepted-delete-btn:disabled{opacity:.4!important;cursor:not-allowed!important}

    @media(max-width:1250px){
      .role-ro .volunteer-layout,
      .role-admin .volunteer-layout{
        grid-template-columns:minmax(0,1fr) 310px!important
      }
      .role-admin #volunteerCreatePanel{display:none!important}
    }
    @media(max-width:920px){
      .role-ro .volunteer-layout,
      .role-admin .volunteer-layout{
        grid-template-columns:1fr!important
      }
      .hours-score-rail{position:relative;top:auto;max-height:none}
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

function ensureVolunteerAnalysisOverlay(){
  let overlay=$('#volunteerAnalysisOverlay');
  if(overlay)return overlay;

  overlay=document.createElement('div');
  overlay.id='volunteerAnalysisOverlay';
  overlay.className='vol-analysis-overlay';
  overlay.innerHTML=`
    <section class="vol-analysis-card" role="status" aria-live="polite" aria-busy="true">
      <div class="vol-analysis-kicker">ATLAS 118 · Buchi volontari</div>
      <div class="vol-analysis-title" id="volAnalysisTitle">Preparo l’analisi…</div>
      <div class="vol-analysis-text" id="volAnalysisText">Carico le proposte e controllo il calendario.</div>
      <div class="vol-analysis-line"><i id="volAnalysisBar"></i></div>
      <div class="vol-analysis-count"><span id="volAnalysisStage">Caricamento</span><strong id="volAnalysisCount">0/0</strong></div>
    </section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function showVolunteerAnalysisOverlay(){
  ensureVolunteerAnalysisOverlay().classList.add('open');
}
function hideVolunteerAnalysisOverlay(){
  $('#volunteerAnalysisOverlay')?.classList.remove('open');
}
function updateVolunteerAnalysisOverlay({title,text,stage,current=0,total=0}={}){
  const overlay=ensureVolunteerAnalysisOverlay();
  const pct=total>0?Math.max(5,Math.min(100,current/total*100)):8;
  const set=(sel,value)=>{const el=overlay.querySelector(sel);if(el&&value!==undefined)el.textContent=value;};
  set('#volAnalysisTitle',title||'Analisi in corso');
  set('#volAnalysisText',text||'Controllo il calendario.');
  set('#volAnalysisStage',stage||'Analisi');
  set('#volAnalysisCount',`${current}/${total}`);
  const bar=overlay.querySelector('#volAnalysisBar');if(bar)bar.style.width=`${pct}%`;
}

function renderHoursSafe(item,solution){
  const rows=analyzer()?.hoursPreview?.(solution)||[];
  if(!rows.length)return'';

  return`<aside class="hours-safe-panel">
    <div class="hours-safe-head"><div><span>Monte ore</span><strong>Prima → Dopo</strong></div><span>Target mensile</span></div>
    <div class="hours-safe-list">
      ${rows.map(row=>{
        const balance=Number(row.balance||0);
        const cls=balance>8?'excess':balance<-8?'missing':'balanced';
        const balanceText=balance>0?`+${balance.toLocaleString('it-IT',{maximumFractionDigits:1})} h`:balance<0?`${balance.toLocaleString('it-IT',{maximumFractionDigits:1})} h`:'In target';
        const delta=Number(row.delta||0);
        const deltaText=`${delta>=0?'+':''}${delta.toLocaleString('it-IT',{maximumFractionDigits:1})} h`;
        return`<div class="hours-safe-row ${cls}">
          <div class="hours-safe-person"><strong>${esc(row.name||'')}</strong><small>${esc((row.notes||[]).join(' · '))}</small></div>
          <div class="hours-safe-values">${Number(row.plannedBefore||0).toLocaleString('it-IT',{maximumFractionDigits:1})} → <b>${Number(row.projected||0).toLocaleString('it-IT',{maximumFractionDigits:1})} h</b><em>${esc(deltaText)}</em></div>
          <div class="hours-safe-balance"><span>Target ${Number(row.target||0).toLocaleString('it-IT',{maximumFractionDigits:1})} h</span><strong>${esc(balanceText)}</strong></div>
        </div>`;
      }).join('')}
    </div>
  </aside>`;
}

function formatHoursValue(value){
  return Number(value||0).toLocaleString(
    'it-IT',
    {maximumFractionDigits:1}
  );
}

function aggregateHoursScore(){
  const api=analyzer();
  if(typeof api?.hoursPreview!=='function')return[];

  const rows=new Map();

  (workspace.proposals||[])
    .filter(item=>item.status==='INVIATA')
    .forEach(item=>{
      const result=compatibility.get(item.id);
      if(!result||!['DIRECT','CHANGES'].includes(result.status))return;

      const solution=solutionFor(item,result);
      if(!solution)return;

      (api.hoursPreview(solution)||[]).forEach(row=>{
        const key=String(row.employeeId||row.name||'');
        if(!key)return;

        const current=rows.get(key)||{
          employeeId:row.employeeId||'',
          name:row.name||'',
          plannedBefore:Number(row.plannedBefore||0),
          target:Number(row.target||0),
          delta:0,
          proposalCount:0
        };

        current.delta+=Number(row.delta||0);
        current.proposalCount++;
        rows.set(key,current);
      });
    });

  return[...rows.values()]
    .map(row=>{
      const projected=row.plannedBefore+row.delta;
      return{
        ...row,
        projected,
        balance:projected-row.target
      };
    })
    .sort((a,b)=>{
      const ar=Math.abs(a.balance);
      const br=Math.abs(b.balance);
      return br-ar||String(a.name).localeCompare(String(b.name),'it');
    });
}

function ensureHoursScoreRail(){
  const layout=document.querySelector('.volunteer-layout');
  if(!layout)return null;

  let rail=$('#volunteerHoursScoreRail');
  if(rail)return rail;

  rail=document.createElement('aside');
  rail.id='volunteerHoursScoreRail';
  rail.className='hours-score-rail';
  layout.appendChild(rail);
  return rail;
}

function renderHoursScoreRail(){
  const rail=ensureHoursScoreRail();
  if(!rail)return;

  const rows=aggregateHoursScore();

  rail.innerHTML=`
    <div class="hours-score-title">
      <div>
        <span>Proiezione continua</span>
        <strong>Monte ore</strong>
      </div>
      <div class="hours-score-count">${rows.length}</div>
    </div>
    <div class="hours-score-help">
      Proiezione sulle soluzioni attualmente selezionate.
      Il target rappresenta il monte ore mensile individuale.
    </div>
    <div class="hours-score-list">
      ${rows.length?rows.map(row=>{
        const target=Math.max(Number(row.target||0),1);
        const before=Math.max(0,Number(row.plannedBefore||0));
        const projected=Math.max(0,Number(row.projected||0));
        const balance=Number(row.balance||0);
        const delta=Number(row.delta||0);

        const cls=
          balance>8
            ?'excess'
            :balance<-8
              ?'missing'
              :'balanced';

        const pct=Math.max(
          3,
          Math.min(
            100,
            projected/target*100
          )
        );

        const balanceText=
          balance>0.05
            ?`Oltre ${formatHoursValue(balance)} h`
            :balance<-0.05
              ?`Mancano ${formatHoursValue(Math.abs(balance))} h`
              :'In target';

        const deltaText=
          `${delta>=0?'+':''}${formatHoursValue(delta)} h`;

        return`
          <div class="hours-score-row ${cls}">
            <div class="hours-score-person">
              <strong>${esc(row.name||'')}</strong>
              <em>${esc(deltaText)}</em>
            </div>
            <div class="hours-score-main">
              <span>${formatHoursValue(before)}</span>
              <span class="arrow">→</span>
              <b>${formatHoursValue(projected)} h</b>
            </div>
            <div class="hours-score-track" aria-label="${esc(balanceText)}">
              <i class="hours-score-fill" style="width:${pct}%"></i>
              <i class="hours-score-target"></i>
            </div>
            <div class="hours-score-foot">
              <span>Target <strong>${formatHoursValue(target)} h</strong></span>
              <strong>${esc(balanceText)}</strong>
            </div>
          </div>`;
      }).join(''):'<div class="hours-score-empty">Nessun impatto ore da mostrare. Seleziona o calcola una soluzione compatibile.</div>'}
    </div>`;
}

async function postVolunteerAction(action,payload={}){
  const auth=getServerAuthContext();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);

  try{
    const response=await fetch(
      ATLAS_SERVER_URL,
      {
        method:'POST',
        headers:{
          'Content-Type':'text/plain;charset=utf-8'
        },
        body:JSON.stringify({
          action,
          token:auth.token,
          ...payload
        }),
        redirect:'follow',
        signal:controller.signal
      }
    );

    const text=await response.text();
    let data;

    try{
      data=JSON.parse(text);
    }catch{
      throw new Error('Risposta server non valida.');
    }

    if(!response.ok||data.ok!==true){
      throw new Error(
        data.error||
        data.message||
        'Operazione non completata.'
      );
    }

    return data;
  }finally{
    clearTimeout(timer);
  }
}

function acceptedProposalIds(){
  return(workspace.proposals||[])
    .filter(item=>item.status==='APPROVATA')
    .map(item=>item.id);
}

function updateAcceptedDeleteToolbar(){
  const selected=
    [...selectedAcceptedIds]
      .filter(id=>acceptedProposalIds().includes(id));

  selectedAcceptedIds.clear();
  selected.forEach(id=>selectedAcceptedIds.add(id));

  const count=$('#acceptedSelectedCount');
  if(count)count.textContent=String(selectedAcceptedIds.size);

  const selectedBtn=$('#deleteAcceptedSelectedBtn');
  if(selectedBtn)selectedBtn.disabled=!selectedAcceptedIds.size;

  const allBtn=$('#deleteAcceptedAllBtn');
  if(allBtn)allBtn.disabled=!acceptedProposalIds().length;
}

async function deleteAcceptedRequests(ids){
  const clean=[
    ...new Set(
      (ids||[]).map(String).filter(Boolean)
    )
  ];

  if(!clean.length)return;

  const plural=clean.length>1;

  if(!confirm(
    plural
      ?`Eliminare definitivamente ${clean.length} richieste APPROVATE dall’archivio proposte?\\n\\nIl calendario già applicato NON viene modificato.`
      :`Eliminare definitivamente questa richiesta APPROVATA dall’archivio proposte?\\n\\nIl calendario già applicato NON viene modificato.`
  )){
    return;
  }

  const buttons=$$(
    '[data-delete-accepted],#deleteAcceptedSelectedBtn,#deleteAcceptedAllBtn'
  );
  buttons.forEach(button=>button.disabled=true);

  try{
    const result=await postVolunteerAction(
      'deleteAcceptedVolunteerProposals',
      {proposalIds:clean}
    );

    const deleted=new Set(
      result.deletedIds||clean
    );

    workspace.proposals=
      (workspace.proposals||[])
        .filter(item=>!deleted.has(item.id));

    deleted.forEach(id=>{
      selectedAcceptedIds.delete(id);
      selectedSolutions.delete(id);
      compatibility.delete(id);
    });

    render();

    showDecisionPopup({
      title:plural?'Richieste eliminate':'Richiesta eliminata',
      text:
        `${deleted.size} ${
          deleted.size===1?'richiesta approvata eliminata':'richieste approvate eliminate'
        } dall’archivio.`,
      note:
        'I turni già applicati al calendario restano invariati. Usa Reset cambi se vuoi annullare anche le modifiche di calendario.',
      icon:'✓'
    });
  }catch(error){
    showDecisionPopup({
      title:'Eliminazione non riuscita',
      text:error.message||'Impossibile eliminare le richieste selezionate.',
      icon:'!'
    });
  }finally{
    updateAcceptedDeleteToolbar();
  }
}

function bindAcceptedDeleteControls(){
  $$('[data-accepted-select]')
    .forEach(box=>
      box.addEventListener(
        'change',
        ()=>{
          const id=box.dataset.acceptedSelect;
          if(box.checked)selectedAcceptedIds.add(id);
          else selectedAcceptedIds.delete(id);
          updateAcceptedDeleteToolbar();
        }
      )
    );

  $$('[data-delete-accepted]')
    .forEach(button=>
      button.addEventListener(
        'click',
        ()=>deleteAcceptedRequests([
          button.dataset.deleteAccepted
        ])
      )
    );

  $('#deleteAcceptedSelectedBtn')
    ?.addEventListener(
      'click',
      ()=>deleteAcceptedRequests(
        [...selectedAcceptedIds]
      )
    );

  $('#deleteAcceptedAllBtn')
    ?.addEventListener(
      'click',
      ()=>deleteAcceptedRequests(
        acceptedProposalIds()
      )
    );

  updateAcceptedDeleteToolbar();
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
              data-compat-filter="INCOMPATIBLE">
        × Non compatibili
        <span class="count"
              data-compat-count="INCOMPATIBLE">0</span>
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

    <div class="accepted-toolbar">
      <span class="accepted-count">
        Approvate selezionate:
        <strong id="acceptedSelectedCount">0</strong>
      </span>

      <button class="btn small accepted-delete-btn"
              id="deleteAcceptedSelectedBtn"
              type="button"
              disabled>
        Elimina selezionate
      </button>

      <button class="btn small accepted-delete-btn"
              id="deleteAcceptedAllBtn"
              type="button">
        Elimina tutte le approvate
      </button>
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
          force:true,
          blocking:true
        });
      }
    );
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
          }else if(operation.mode==='change'){
            text=
              `<strong>${esc(operation.coverName)}</strong> `+
              `passa sulla richiesta volontari. `+
              `<span class="compat-change-arrow">⇄</span> `+
              `<strong>${esc(operation.replacementName)}</strong> `+
              `prende il suo turno `+
              `<strong>${esc(operation.sourceCode)}</strong>.`;
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
    const cells=
      typeof api.appliedCells==='function'
        ?api.appliedCells(item.id)
        :[];

    return`
      <div class="solution-workflow applied">
        <div class="applied-banner">
          <div class="applied-icon">✓</div>

          <div>
            <div class="applied-title">
              Soluzione pronta nel calendario
            </div>

            <div class="applied-text">
              ${cells.length||'Le'} ${
                cells.length===1
                  ?'cella coinvolta è evidenziata'
                  :'celle coinvolte sono evidenziate'
              } in giallo.
              Puoi ancora cambiare soluzione prima dell’approvazione definitiva.
            </div>
          </div>
        </div>

        <div class="workflow-next">
          <span class="workflow-next-label">
            Passaggi consigliati:
            controlla il calendario → salva → approva la richiesta.
          </span>

          <button class="btn small"
                  type="button"
                  data-go-calendar="${esc(item.id)}">
            Vai al calendario
          </button>

          <button class="btn small save-calendar"
                  type="button"
                  data-save-calendar="${esc(item.id)}">
            Salva calendario
          </button>
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

  return`
    <div class="solution-workflow">
      <div class="solution-step">
        <span class="solution-step-number">1</span>

        <strong>
          Scegli la soluzione da applicare
        </strong>
      </div>

      <label class="solution-label"
             for="solution-${esc(item.id)}">
        ${solutions.length} ${
          solutions.length===1
            ?'soluzione disponibile'
            :'soluzioni disponibili'
        }
        · ordinate dalla meno invasiva
      </label>

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
              ${index+1}. ${esc(solution.label)}
            </option>
          `)
          .join('')
        }
      </select>

      ${renderSolutionPreview(selected)}

      <div class="solution-help">
        La soluzione selezionata verrà applicata e salvata direttamente con
        <strong>Approva e applica</strong>. Non serve un passaggio separato.
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
            Questa è la soluzione proposta come prima scelta.
            Apri la tendina sotto per vedere anche le alternative disponibili.
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
          ${item.status==='APPROVATA'
            ?`<label class="accepted-select" title="Seleziona richiesta approvata">
                <input type="checkbox"
                       data-accepted-select="${esc(item.id)}"
                       ${selectedAcceptedIds.has(item.id)?'checked':''}>
                Seleziona
              </label>`
            :''
          }
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
                Calendario non ancora registrato come generato e salvato.
              </strong>
              Puoi comunque analizzare e preparare la soluzione;
              l’approvazione non modifica automaticamente il calendario.
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
                      !result||
                      result.status==='ANALYZING'||
                      result.status==='INCOMPATIBLE'||
                      result.status==='OTHER_MONTH'||
                      result.status==='REVIEW'
                        ?'disabled'
                        :''
                    }>
              ${
                result?.status==='ANALYZING'
                  ?'Analisi in corso…'
                  :result?.status==='INCOMPATIBLE'
                    ?'Nessuna soluzione'
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

      ${item.status==='APPROVATA'&&has('volunteerProposalReview')
        ?`
          <div class="proposal-actions">
            <button class="btn small accepted-delete-btn"
                    type="button"
                    data-delete-accepted="${esc(item.id)}">
              Elimina richiesta
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
          ?'Compatibilità aggiornata sul calendario aperto'
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

  $$('[data-apply-solution]')
    .forEach(button=>
      button.addEventListener(
        'click',
        async()=>{
          const proposalId=
            button.dataset.applySolution;

          const proposal=
            proposalById(proposalId);

          const result=
            compatibility.get(
              proposalId
            );

          const solution=
            solutionFor(
              proposal,
              result
            );

          const api=
            analyzer();

          if(
            !proposal||
            !solution||
            typeof api?.applySolution!=='function'
          ){
            alert(
              'Soluzione non disponibile. Ricalcola la compatibilità.'
            );
            return;
          }

          const changes=
            solution.operations
              .filter(operation=>
                operation.mode==='change'
              );

          const direct=
            solution.operations
              .filter(operation=>
                operation.mode==='direct'
              );

          const description=[
            ...direct.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} copertura diretta`
            ),
            ...changes.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} sulla richiesta; ${operation.replacementName} sul turno ${operation.sourceCode}`
            )
          ].join('\n');

          if(
            !confirm(
              `Applicare questa soluzione al calendario?\n\n${description}\n\nLe celle modificate saranno evidenziate in giallo. Il calendario NON verrà ancora salvato su Google Sheet.`
            )
          ){
            return;
          }

          button.disabled=true;
          button.textContent=
            'Applicazione…';

          try{
            api.applySolution(
              proposal,
              solution.signature
            );

            // Ogni modifica può cambiare la compatibilità delle altre proposte.
            compatibility.clear();

            await runCompatibilityAnalysis({
              force:true
            });

            render();

            goToAppliedCalendar(
              proposalId
            );
          }catch(error){
            alert(
              error.message||
              'Impossibile applicare la soluzione.'
            );
          }finally{
            button.disabled=false;
            button.textContent=
              'Applica al calendario';
          }
        }
      )
    );

  $$('[data-go-calendar]')
    .forEach(button=>
      button.addEventListener(
        'click',
        ()=>{
          goToAppliedCalendar(
            button.dataset.goCalendar
          );
        }
      )
    );

  $$('[data-save-calendar]')
    .forEach(button=>
      button.addEventListener(
        'click',
        ()=>{
          $('#syncBtn')?.click();
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
                    operation.mode==='change'
                  ){
                    return(
                      `${roleLabel(operation.role)}: `+
                      `${operation.coverName} copre il buco; `+
                      `${operation.replacementName} prende ${operation.sourceCode}`
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
              `Confermi approvazione e applicazione al calendario?\n\n${detail}\n\nATLAS salverà il calendario e registrerà la proposta come APPROVATA.`
            )
          ){
            return;
          }

          button.disabled=true;
          button.textContent=
            'Approvo e applico…';

          try{
            await api.approveProposal(
              proposal,
              selected?.signature||'',
              ''
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

            showDecisionPopup({
              title:'Risorsa approvata',
              text:
                'La richiesta è stata approvata e il turno è stato inserito e salvato nel calendario.',
              note:
                'Nel calendario il turno volontari coperto da un dipendente è evidenziato in viola. Gli eventuali turni spostati per rendere possibile la copertura restano evidenziati in giallo.',
              icon:'✓',
              calendarProposalId:
                proposalId
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
  renderHoursScoreRail();
  bindSolutionControls();
  bindReviewButtons();
  bindAcceptedDeleteControls();
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
  force=false,
  blocking=false
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
    render();
    return;
  }

  const run=
    ++analysisRun;

  const started=performance.now();
  const watchdogMs=5200;

  if(blocking){
    showVolunteerAnalysisOverlay();
    updateVolunteerAnalysisOverlay({
      title:'Analizzo le richieste volontari',
      text:'Controllo disponibilità, riposi, qualifiche e possibili cambi.',
      stage:'Analisi calendario',
      current:0,
      total:pending.length
    });
  }

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
      if(blocking)hideVolunteerAnalysisOverlay();
      return;
    }

    if(performance.now()-started>watchdogMs){
      pending.slice(processed).forEach(left=>{
        if(!compatibility.has(left.id)||compatibility.get(left.id)?.status==='ANALYZING'){
          compatibility.set(left.id,{
            status:'REVIEW',
            label:'Da verificare',
            tone:'warning',
            summary:'Il controllo automatico ha raggiunto il limite di sicurezza. La richiesta non viene dichiarata impossibile.',
            roles:[],changes:[],solutions:[],blockers:[]
          });
        }
      });
      break;
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
            'ATLAS non è riuscito a completare il controllo locale.',
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

    render();
    if(blocking){
      updateVolunteerAnalysisOverlay({
        title:'Analisi in corso',
        text:'ATLAS valuta una richiesta alla volta senza bloccare l’interfaccia.',
        stage:'Compatibilità',
        current:processed,
        total:pending.length
      });
    }
    await idleYield();
  }

  if(run!==analysisRun){
    return;
  }

  analysisBusy=false;
  render();
  if(blocking){
    updateVolunteerAnalysisOverlay({title:'Analisi completata',text:'Le proposte sono pronte per la valutazione.',stage:'Completato',current:pending.length,total:pending.length});
    setTimeout(hideVolunteerAnalysisOverlay,180);
  }
}

export async function refreshWorkspace({
  force=false,
  blocking=false
}={}){
  if(!has('volunteerProposalView')){
    return;
  }

  if(blocking){
    showVolunteerAnalysisOverlay();
    updateVolunteerAnalysisOverlay({
      title:'Carico Buchi volontari',
      text:'Leggo le proposte e preparo il calendario per l’analisi.',
      stage:'Caricamento proposte',
      current:0,
      total:0
    });
  }

  if(
    workspaceLoaded&&
    !force
  ){
    render();
    await runCompatibilityAnalysis({blocking});

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

      await runCompatibilityAnalysis({
        force,
        blocking
      });

      return workspace;
    }finally{
      workspaceLoading=null;
      if(blocking&&!analysisBusy){
        hideVolunteerAnalysisOverlay();
      }
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
        force:true,
        blocking:true
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

        refreshWorkspace({blocking:true})
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
