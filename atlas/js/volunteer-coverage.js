// ATLAS 118 · Buchi volontari BACKGROUND + SCORE ORE 0012
import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth-protected.js';
import {
  loadVolunteerWorkspace,
  reviewVolunteerProposal
} from './google-sheet-service.js?v=1.0.0-BUCHI-UX-1005';

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
let volunteerCancelRequested=false;

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
      cls:'compat-review',
      icon:'?'
    },

    WAITING_CALENDAR:{
      label:'In attesa calendario',
      cls:'compat-waiting',
      icon:'◷'
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
    .vol-analysis-actions{display:flex;justify-content:flex-end;margin-top:15px}.vol-analysis-cancel{min-height:38px;padding:8px 14px;border:1px solid rgba(145,188,214,.2);border-radius:10px;background:rgba(255,255,255,.04);color:#e9f5fa;font-weight:850;cursor:pointer}.vol-analysis-cancel:hover{background:rgba(255,255,255,.08)}

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
    .accepted-report-btn{
      border-color:rgba(125,211,252,.24)!important;
      color:#c8effc!important;background:rgba(56,189,248,.055)!important
    }
    .vol-change-report-modal{
      position:fixed;inset:0;z-index:10080;display:none;place-items:center;
      padding:24px;background:rgba(1,9,14,.78);backdrop-filter:blur(10px)
    }
    .vol-change-report-modal.open{display:grid}
    .vol-change-report-card{
      width:min(980px,calc(100vw - 40px));max-height:min(820px,calc(100vh - 50px));
      display:grid;grid-template-rows:auto 1fr;overflow:hidden;border-radius:20px;
      border:1px solid rgba(125,211,252,.17);
      background:linear-gradient(155deg,#0a2431,#061923);
      box-shadow:0 34px 100px rgba(0,0,0,.52)
    }
    .vol-change-report-head{
      display:flex;align-items:center;justify-content:space-between;gap:18px;
      padding:18px 20px;border-bottom:1px solid rgba(125,211,252,.12)
    }
    .vol-change-report-head span{
      display:block;color:#7dd3fc;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase
    }
    .vol-change-report-head strong{display:block;margin-top:3px;font-size:19px;color:#f5fbfe}
    .vol-change-report-close{
      width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:10px;
      background:rgba(255,255,255,.035);color:#cfe3eb;font-size:20px;cursor:pointer
    }
    .vol-change-report-body{overflow:auto;padding:16px 18px 20px;display:grid;gap:12px}
    .vol-report-entry{
      border:1px solid rgba(255,255,255,.065);border-radius:14px;
      background:rgba(255,255,255,.025);overflow:hidden
    }
    .vol-report-entry-head{
      display:flex;justify-content:space-between;gap:14px;padding:12px 14px;
      border-bottom:1px solid rgba(255,255,255,.05)
    }
    .vol-report-entry-head strong{color:#f2f8fb;font-size:13px}
    .vol-report-entry-head small{color:#75909d;font-size:9px}
    .vol-report-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;padding:13px 14px}
    .vol-report-section h4{margin:0 0 8px;color:#8fdcf5;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
    .vol-report-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
    .vol-report-list li{padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.028);color:#d8e6ec;font-size:11px;line-height:1.4}
    .vol-report-hours{display:grid;gap:6px}
    .vol-report-hour{display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:8px;padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.028)}
    .vol-report-hour strong{font-size:11px;color:#edf8fc}
    .vol-report-hour span{font-size:10px;color:#9bb2bd;white-space:nowrap}
    .vol-report-empty{padding:34px;text-align:center;color:#78929e;font-size:12px}
    @media(max-width:760px){.vol-report-grid{grid-template-columns:1fr}}

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


  style.textContent+=`
    #volunteerCoverageView{--vol-bg:#081b27;--vol-panel:#0b2432;--vol-line:rgba(151,195,215,.14);--vol-text:#eaf5f8;--vol-muted:#86a2af}
    #volunteerCoverageView .view-toolbar{padding-bottom:8px;border-bottom:0}
    #volunteerCoverageView .view-title{font-size:24px;letter-spacing:-.035em}
    #volunteerCoverageView .view-sub{max-width:760px;font-size:11px;color:#86a2af}
    #volunteerCreatePanel{display:none!important}
    #volunteerCoverageView .volunteer-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 330px!important;gap:16px!important;max-width:1780px!important;align-items:start}
    #volunteerCoverageView .volunteer-list-panel{background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}
    #volunteerCoverageView .volunteer-panel-head{padding:0 2px;margin:0 0 10px}
    #volunteerCoverageView .volunteer-panel-head h3{font-size:14px;color:#dbeaf0}
    #volunteerCoverageView .volunteer-panel-head p{font-size:10px}
    .compatibility-toolbar{display:block!important;padding:0!important;margin:0 0 14px!important;border:0!important;background:transparent!important}
    .vol-ops-overview{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:9px;margin-bottom:10px}
    .vol-ops-stat{padding:12px 13px;border:1px solid var(--vol-line);border-radius:14px;background:linear-gradient(180deg,rgba(14,42,57,.94),rgba(8,29,41,.94));min-height:70px}
    .vol-ops-stat span{display:block;color:#7898a7;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
    .vol-ops-stat strong{display:block;margin-top:5px;color:#f4fbfd;font-size:22px;line-height:1}
    .vol-ops-stat.waiting strong{color:#eabf69}.vol-ops-stat.ready strong{color:#68d5aa}.vol-ops-stat.review strong{color:#f0a967}.vol-ops-stat.approved strong{color:#72c7e4}
    .vol-ops-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--vol-line);border-radius:14px;background:rgba(8,28,40,.88)}
    .compatibility-summary{display:flex!important;flex-wrap:wrap;gap:6px!important}
    .compat-filter{min-height:34px!important;border-radius:9px!important;padding:6px 9px!important}
    .compat-filter[data-compat-filter="WAITING_CALENDAR"]{border-color:rgba(234,191,105,.18)!important}
    .compat-filter[data-compat-filter="REVIEW"]{border-color:rgba(240,169,103,.18)!important}
    .compatibility-progress{display:flex!important;align-items:center!important;gap:8px!important;text-align:right!important}
    .accepted-toolbar{display:flex!important;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px;padding:9px 11px;border:1px solid rgba(151,195,215,.09);border-radius:12px;background:rgba(7,24,34,.66)}
    .volunteer-proposal-list{gap:12px!important}
    .proposal-card{border:1px solid rgba(151,195,215,.13)!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(10,34,47,.96),rgba(7,26,37,.96))!important;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.12)}
    .proposal-head{padding:14px 15px 10px!important;border-bottom:1px solid rgba(151,195,215,.08)}
    .proposal-title{font-size:12px!important;text-transform:uppercase;letter-spacing:.08em;color:#86a9b8!important}
    .proposal-meta{font-size:9px!important;color:#5f8291!important}
    .proposal-body{padding:13px 15px!important}
    .proposal-quick-grid{display:grid;grid-template-columns:1.35fr .9fr 1fr 1fr;gap:8px;margin-bottom:12px}
    .proposal-quick{padding:10px 11px;border:1px solid rgba(151,195,215,.09);border-radius:11px;background:rgba(255,255,255,.025)}
    .proposal-quick span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#6f909e;font-weight:850}
    .proposal-quick strong{display:block;margin-top:4px;color:#f0f8fb;font-size:12px}
    .proposal-actions{padding:10px 15px 13px!important;border-top:1px solid rgba(151,195,215,.07);background:rgba(0,0,0,.08)}
    .proposal-actions .primary{min-width:155px}
    .compat-waiting{background:rgba(234,191,105,.09)!important;border-color:rgba(234,191,105,.22)!important;color:#e8c67e!important}
    .compat-review{background:rgba(240,169,103,.09)!important;border-color:rgba(240,169,103,.22)!important;color:#f0b275!important}
    .compat-box.waiting{border-color:rgba(234,191,105,.18);background:rgba(234,191,105,.04)}
    .waiting-calendar-callout{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid rgba(234,191,105,.18);border-radius:12px;background:rgba(234,191,105,.05);color:#cbd9df;font-size:10px;line-height:1.5}
    .waiting-calendar-callout b{color:#f0cc82}
    .hours-score-rail{grid-column:2!important;grid-row:1!important;position:sticky!important;top:12px!important;max-height:calc(100vh - 24px)!important;overflow:auto!important;margin:0!important;border-radius:16px!important;background:linear-gradient(180deg,#0b2635,#071d29)!important}
    .hours-score-list{gap:7px!important}.hours-score-row{padding:10px!important}
    .hours-score-action{display:flex;justify-content:flex-end;margin-top:8px}
    .hours-score-replace{border:1px solid rgba(114,199,228,.22);background:rgba(114,199,228,.07);color:#a9ddee;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer}
    .hours-score-replace:hover{background:rgba(114,199,228,.13)}
    .hours-score-replace:disabled{opacity:.4;cursor:not-allowed}
    .manual-replace-overlay{position:fixed;inset:0;z-index:10050;display:none;place-items:stretch end;padding:0;background:rgba(2,10,16,.66);backdrop-filter:blur(6px)}
    .manual-replace-overlay.open{display:grid}
    .manual-replace-modal{width:min(760px,96vw);height:100vh;max-height:none;overflow:hidden;border-left:1px solid rgba(151,195,215,.18);border-radius:18px 0 0 18px;background:#09202d;box-shadow:-24px 0 80px rgba(0,0,0,.44);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}
    .manual-replace-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(151,195,215,.1)}
    .manual-replace-head span{display:block;color:#70c8e5;font-size:9px;text-transform:uppercase;letter-spacing:.1em;font-weight:900}.manual-replace-head strong{display:block;margin-top:4px;color:#fff;font-size:18px}.manual-replace-close{border:0;background:transparent;color:#9cb4bf;font-size:24px;cursor:pointer}
    .manual-replace-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 18px;border-bottom:1px solid rgba(151,195,215,.08)}
    .manual-replace-summary div{padding:10px;border-radius:10px;background:rgba(255,255,255,.025)}.manual-replace-summary span{display:block;color:#6f909e;font-size:8px;text-transform:uppercase;font-weight:850}.manual-replace-summary strong{display:block;margin-top:4px;color:#eaf5f8;font-size:13px}
    .manual-replace-list{overflow:auto;padding:12px 18px;display:grid;gap:9px}
    .manual-replace-option{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid rgba(151,195,215,.1);border-radius:12px;background:rgba(255,255,255,.025)}
    .manual-replace-option:hover{border-color:rgba(114,199,228,.25);background:rgba(114,199,228,.04)}
    .manual-replace-main strong{display:block;color:#eef8fb;font-size:12px}.manual-replace-main span{display:block;margin-top:3px;color:#7795a3;font-size:9px}
    .manual-replace-impact{font-size:9px;color:#85a1ad;line-height:1.6}.manual-replace-impact b{color:#dcebf0}
    .manual-replace-warn{margin-top:4px;color:#e6b56a;font-size:8px}
    .manual-replace-apply{border:1px solid rgba(104,213,170,.25);background:rgba(104,213,170,.09);color:#9ce2c5;border-radius:9px;padding:8px 11px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
    .manual-replace-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 18px;border-top:1px solid rgba(151,195,215,.09);color:#718f9d;font-size:9px}
    .manual-replace-empty{padding:28px 16px;text-align:center;color:#89a3af;border:1px dashed rgba(151,195,215,.14);border-radius:12px}
    @media(max-width:1180px){#volunteerCoverageView .volunteer-layout{grid-template-columns:1fr!important}.hours-score-rail{grid-column:1!important;grid-row:auto!important;position:relative!important;top:auto!important;max-height:none!important}.vol-ops-overview{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:760px){.proposal-quick-grid{grid-template-columns:1fr 1fr}.vol-ops-overview{grid-template-columns:1fr 1fr}.vol-ops-controls{grid-template-columns:1fr}.manual-replace-option{grid-template-columns:1fr}.manual-replace-summary{grid-template-columns:1fr}}
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
      <div class="vol-analysis-actions"><button class="vol-analysis-cancel" id="volAnalysisCancelBtn" type="button">Annulla</button></div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#volAnalysisCancelBtn')?.addEventListener('click',cancelVolunteerAnalysis);
  return overlay;
}

function cancelVolunteerAnalysis(){
  volunteerCancelRequested=true;
  analysisRun++;
  analysisBusy=false;
  hideVolunteerAnalysisOverlay();
  render();
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
  if(!api)return[];

  const rows=new Map();
  const overview=typeof api.hoursOverview==='function'?api.hoursOverview():[];
  overview.forEach(row=>{
    const key=String(row.employeeId||row.name||'');
    if(!key)return;
    rows.set(key,{employeeId:row.employeeId||'',name:row.name||'',plannedBefore:Number(row.plannedBefore||0),target:Number(row.target||0),delta:0,proposalCount:0,meta:row.meta||''});
  });

  (workspace.proposals||[])
    .filter(item=>item.status==='INVIATA'&&item.calendarReady===true)
    .forEach(item=>{
      const result=compatibility.get(item.id);
      if(!result||!['DIRECT','CHANGES'].includes(result.status))return;
      const solution=solutionFor(item,result);
      if(!solution)return;
      (api.hoursPreview?.(solution)||[]).forEach(row=>{
        const key=String(row.employeeId||row.name||'');
        if(!key)return;
        const current=rows.get(key)||{employeeId:row.employeeId||'',name:row.name||'',plannedBefore:Number(row.plannedBefore||0),target:Number(row.target||0),delta:0,proposalCount:0,meta:''};
        current.delta+=Number(row.delta||0);
        current.proposalCount++;
        rows.set(key,current);
      });
    });

  return[...rows.values()].map(row=>{
    const projected=row.plannedBefore+row.delta;
    return{...row,projected,balance:projected-row.target};
  }).sort((a,b)=>{
    const ac=a.balance<-.05?0:a.balance>.05?2:1;
    const bc=b.balance<-.05?0:b.balance>.05?2:1;
    return ac-bc||(a.balance-b.balance)||String(a.name).localeCompare(String(b.name),'it');
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

function currentMonthCalendarReady(){
  const month=analyzer()?.currentMonth?.()||'';
  return(workspace.proposals||[]).some(item=>item.status==='INVIATA'&&String(parseHole(item).day||'').slice(0,7)===month&&item.calendarReady===true)
    ||(workspace.proposals||[]).some(item=>item.status==='APPROVATA'&&String(parseHole(item).day||'').slice(0,7)===month&&item.calendarReady===true);
}

function ensureManualReplacementModal(){
  let overlay=$('#volunteerManualReplacementOverlay');
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.id='volunteerManualReplacementOverlay';
  overlay.className='manual-replace-overlay';
  overlay.innerHTML=`<section class="manual-replace-modal" role="dialog" aria-modal="true" aria-labelledby="manualReplaceTitle">
    <div class="manual-replace-head"><div><span>Riequilibrio manuale</span><strong id="manualReplaceTitle">Sostituzione dipendente</strong></div><button class="manual-replace-close" type="button" aria-label="Chiudi">×</button></div>
    <div class="manual-replace-summary" id="manualReplaceSummary"></div>
    <div class="manual-replace-list" id="manualReplaceList"></div>
    <div class="manual-replace-footer"><span>ATLAS mostra solo turni compatibili con qualifiche, sede, sovrapposizioni e riposo minimo.</span><button class="btn small" id="manualReplaceUndoBtn" type="button">Annulla ultima sostituzione</button></div>
  </section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.classList.remove('open');
  overlay.querySelector('.manual-replace-close')?.addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.querySelector('#manualReplaceUndoBtn')?.addEventListener('click',async()=>{
    const api=analyzer();
    const history=api?.manualReplacementHistory?.()||[];
    if(!history.length){alert('Non ci sono sostituzioni manuali da annullare in questa sessione.');return;}
    if(!confirm('Annullare l’ultima sostituzione manuale effettuata da Buchi volontari?'))return;
    api.undoLastManualReplacement?.();
    compatibility.clear();
    await runCompatibilityAnalysis({force:true,blocking:false});
    render();
    close();
  });
  return overlay;
}

function openManualReplacement(employeeId){
  const api=analyzer();
  if(typeof api?.manualReplacementOptions!=='function')return alert('Funzione sostituzioni non disponibile. Aggiorna i file ATLAS.');
  const row=aggregateHoursScore().find(item=>item.employeeId===employeeId);
  const overlay=ensureManualReplacementModal();
  const summary=overlay.querySelector('#manualReplaceSummary');
  const list=overlay.querySelector('#manualReplaceList');
  const undo=overlay.querySelector('#manualReplaceUndoBtn');
  const history=api.manualReplacementHistory?.()||[];
  if(undo)undo.disabled=!history.length;
  if(!row)return;

  summary.innerHTML=`<div><span>Dipendente</span><strong>${esc(row.name)}</strong></div><div><span>Monte ore</span><strong>${formatHoursValue(row.projected)} / ${formatHoursValue(row.target)} h</strong></div><div><span>Da recuperare</span><strong>${row.balance<0?formatHoursValue(Math.abs(row.balance))+' h':'In target'}</strong></div>`;

  if(!currentMonthCalendarReady()){
    list.innerHTML='<div class="manual-replace-empty"><strong>Calendario non ancora pubblicato.</strong><br>Le richieste restano in attesa. Le sostituzioni manuali diventano disponibili dopo il salvataggio del calendario dipendenti.</div>';
    overlay.classList.add('open');return;
  }

  let options=[];
  try{options=api.manualReplacementOptions(employeeId)||[];}catch(error){list.innerHTML=`<div class="manual-replace-empty">${esc(error.message||error)}</div>`;overlay.classList.add('open');return;}
  list.innerHTML=options.length?options.map((option,index)=>{
    const targetBalance=Number(option.targetBalance||0),donorBalance=Number(option.donorBalance||0);
    const warnings=(option.warnings||[]).map(w=>`<div class="manual-replace-warn">${esc(w)}</div>`).join('');
    return`<article class="manual-replace-option">
      <div class="manual-replace-main"><strong>${esc(dateLabel(option.day))} · ${esc(option.code)} · ${esc(option.donorName)}</strong><span>${formatHoursValue(option.hours)} h da trasferire a ${esc(option.targetName)}${option.releaseSundayRest?' · spostamento riposo domenicale':''}</span>${warnings}</div>
      <div class="manual-replace-impact"><b>${esc(option.targetName)}</b> ${formatHoursValue(option.targetBefore)} → ${formatHoursValue(option.targetAfter)} h (${targetBalance>=0?'+':''}${formatHoursValue(targetBalance)} dal target)<br><b>${esc(option.donorName)}</b> ${formatHoursValue(option.donorBefore)} → ${formatHoursValue(option.donorAfter)} h (${donorBalance>=0?'+':''}${formatHoursValue(donorBalance)} dal target)</div>
      <button class="manual-replace-apply" type="button" data-manual-option="${index}">Sostituisci</button>
    </article>`;
  }).join(''):'<div class="manual-replace-empty"><strong>Nessuna sostituzione compatibile trovata.</strong><br>ATLAS non forza qualifiche, riposi o sovrapposizioni per aumentare il monte ore.</div>';
  overlay._atlasOptions=options;
  list.querySelectorAll('[data-manual-option]').forEach(button=>button.addEventListener('click',async()=>{
    const option=overlay._atlasOptions?.[Number(button.dataset.manualOption)];if(!option)return;
    const text=`Sostituire ${option.donorName} con ${option.targetName} il ${dateLabel(option.day)} sul turno ${option.code}?\n\n${option.targetName}: ${formatHoursValue(option.targetBefore)} → ${formatHoursValue(option.targetAfter)} h\n${option.donorName}: ${formatHoursValue(option.donorBefore)} → ${formatHoursValue(option.donorAfter)} h`;
    if(!confirm(text))return;
    button.disabled=true;button.textContent='Applico…';
    try{
      api.applyManualReplacement(option);
      compatibility.clear();
      await runCompatibilityAnalysis({force:true,blocking:false});
      render();
      openManualReplacement(employeeId);
    }catch(error){alert(error.message||'Sostituzione non riuscita.');button.disabled=false;button.textContent='Sostituisci';}
  }));
  overlay.classList.add('open');
}

function renderHoursScoreRail(){
  const rail=ensureHoursScoreRail();
  if(!rail)return;
  const rows=aggregateHoursScore();
  const missing=rows.filter(row=>Number(row.balance||0)<-.05).length;
  rail.innerHTML=`
    <div class="hours-score-title"><div><span>Controllo continuo</span><strong>Monte ore dipendenti</strong></div><div class="hours-score-count">${missing}</div></div>
    <div class="hours-score-help">Tutti i dipendenti del mese. Prima → dopo include l’impatto delle soluzioni selezionate. Il pulsante <b>Trova sostituzione</b> propone turni trasferibili senza violare i vincoli.</div>
    <div class="hours-score-list">
      ${rows.length?rows.map(row=>{
        const target=Math.max(Number(row.target||0),1),before=Math.max(0,Number(row.plannedBefore||0)),projected=Math.max(0,Number(row.projected||0)),balance=Number(row.balance||0),delta=Number(row.delta||0);
        const cls=balance>8?'excess':balance<-8?'missing':'balanced';
        const pct=Math.max(3,Math.min(100,projected/target*100));
        const balanceText=balance>0.05?`Oltre ${formatHoursValue(balance)} h`:balance<-0.05?`Mancano ${formatHoursValue(Math.abs(balance))} h`:'In target';
        const deltaText=`${delta>=0?'+':''}${formatHoursValue(delta)} h`;
        return`<div class="hours-score-row ${cls}">
          <div class="hours-score-person"><strong>${esc(row.name||'')}</strong><em>${esc(deltaText)}</em></div>
          <div class="hours-score-main"><span>${formatHoursValue(before)}</span><span class="arrow">→</span><b>${formatHoursValue(projected)} h</b></div>
          <div class="hours-score-track" aria-label="${esc(balanceText)}"><i class="hours-score-fill" style="width:${pct}%"></i><i class="hours-score-target"></i></div>
          <div class="hours-score-foot"><span>Target <strong>${formatHoursValue(target)} h</strong></span><strong>${esc(balanceText)}</strong></div>
          ${balance<-.05?`<div class="hours-score-action"><button class="hours-score-replace" type="button" data-hours-replace="${esc(row.employeeId)}">Trova sostituzione</button></div>`:''}
        </div>`;
      }).join(''):'<div class="hours-score-empty">Nessun dipendente disponibile.</div>'}
    </div>`;
  rail.querySelectorAll('[data-hours-replace]').forEach(button=>button.addEventListener('click',()=>openManualReplacement(button.dataset.hoursReplace)));
}

const APPROVAL_REPORT_PREFIX='ATLAS_REPORT_V1:';

function approvalReportFromReason(reason){
  const raw=String(reason||'');
  if(!raw.startsWith(APPROVAL_REPORT_PREFIX))return null;
  try{
    return JSON.parse(raw.slice(APPROVAL_REPORT_PREFIX.length));
  }catch{
    return null;
  }
}

function buildApprovalReportReason(proposal,solution,alreadyApplied=false){
  const hole=parseHole(proposal);
  const api=analyzer();
  const operations=Array.isArray(solution?.operations)?solution.operations:[];
  const hours=(typeof api?.hoursPreview==='function'&&solution)
    ?(api.hoursPreview(solution)||[])
    :[];

  const changes=operations.map(operation=>{
    if(operation.mode==='change'){
      return{
        type:'CHANGE',
        role:String(operation.role||''),
        text:
          `${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)}; `+
          `${operation.replacementName||'Risorsa'} prende ${operation.sourceCode||'il turno liberato'}`
      };
    }
    if(operation.mode==='direct'){
      return{type:'DIRECT',role:String(operation.role||''),text:`${operation.coverName||'Risorsa'} copre direttamente ${roleLabel(operation.role)}`};
    }
    if(operation.mode==='sunday-rest'){
      return{type:'SUNDAY_REST',role:String(operation.role||''),text:`${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)} spostando il riposo domenicale${operation.recoveryDay?`; recupero previsto il ${dateLabel(operation.recoveryDay)}`:'; recupero da programmare'}`};
    }
    return{
      type:'COVERED',
      role:String(operation.role||''),
      text:`${roleLabel(operation.role)} già coperto`
    };
  });

  if(alreadyApplied&&!changes.length){
    changes.push({
      type:'CONFIRM',
      role:'',
      text:'Soluzione già applicata al calendario e confermata.'
    });
  }

  const manualRebalances=typeof api?.manualReplacementHistory==='function'
    ?(api.manualReplacementHistory()||[])
    :[];
  manualRebalances.forEach(entry=>{
    changes.push({
      type:'MANUAL_REBALANCE',
      role:'',
      text:`Riequilibrio manuale: ${entry.targetName||'Dipendente'} sostituisce ${entry.donorName||'Dipendente'} il ${dateLabel(entry.day)} su ${entry.code||'turno'} (${formatHoursValue(entry.hours)} h)${entry.recoveryDay?`; recupero riposo ${dateLabel(entry.recoveryDay)}`:''}`
    });
  });

  const report={
    version:1,
    proposalId:String(proposal?.id||''),
    day:String(hole.day||''),
    shift:String(hole.shift||''),
    site:String(hole.site||''),
    machine:String(hole.machine||''),
    roles:Array.isArray(hole.roles)?hole.roles:[],
    changes,
    hours:hours.map(row=>({
      employeeId:String(row.employeeId||''),
      name:String(row.name||''),
      before:Number(row.plannedBefore||0),
      after:Number(row.projected||0),
      delta:Number(row.delta||0),
      target:Number(row.target||0)
    }))
  };

  return APPROVAL_REPORT_PREFIX+JSON.stringify(report);
}

function ensureChangeReportModal(){
  let modal=$('#volunteerChangeReportModal');
  if(modal)return modal;

  modal=document.createElement('div');
  modal.id='volunteerChangeReportModal';
  modal.className='vol-change-report-modal';
  modal.innerHTML=`
    <section class="vol-change-report-card" role="dialog" aria-modal="true" aria-label="Report modifiche volontari">
      <header class="vol-change-report-head">
        <div><span>Storico approvazioni</span><strong>Report modifiche applicate</strong></div>
        <button class="vol-change-report-close" type="button" aria-label="Chiudi">×</button>
      </header>
      <div class="vol-change-report-body" id="volunteerChangeReportBody"></div>
    </section>`;
  document.body.appendChild(modal);

  modal.querySelector('.vol-change-report-close')?.addEventListener('click',()=>modal.classList.remove('open'));
  modal.addEventListener('click',event=>{
    if(event.target===modal)modal.classList.remove('open');
  });
  return modal;
}

function renderChangeReportEntry(item){
  const hole=parseHole(item);
  const report=approvalReportFromReason(item.reviewReason);
  const title=`${dateWithWeekdayLabel(hole.day)} · ${shiftLabel(hole.shift)} · ${siteLabel(hole.site)}`;
  const meta=[item.reviewedAt||'',item.reviewedBy?`approvata da ${item.reviewedBy}`:''].filter(Boolean).join(' · ');

  if(!report){
    return`<article class="vol-report-entry">
      <div class="vol-report-entry-head"><div><strong>${esc(title)}</strong><small>${esc(meta)}</small></div><small>${esc(item.id||'')}</small></div>
      <div class="vol-report-empty">Questa approvazione è precedente all’introduzione del report dettagliato.</div>
    </article>`;
  }

  const changes=(report.changes||[]).length
    ?`<ul class="vol-report-list">${report.changes.map(change=>`<li>${esc(change.text||'')}</li>`).join('')}</ul>`
    :'<div class="vol-report-empty">Nessun cambio intermedio: copertura già presente.</div>';

  const hours=(report.hours||[]).length
    ?`<div class="vol-report-hours">${report.hours.map(row=>{
        const delta=Number(row.delta||0);
        return`<div class="vol-report-hour"><strong>${esc(row.name||row.employeeId||'')}</strong><span>${formatHoursValue(row.before)} → ${formatHoursValue(row.after)} h · ${delta>=0?'+':''}${formatHoursValue(delta)} h</span></div>`;
      }).join('')}</div>`
    :'<div class="vol-report-empty">Nessuna variazione ore registrata.</div>';

  return`<article class="vol-report-entry">
    <div class="vol-report-entry-head"><div><strong>${esc(title)}</strong><small>${esc(meta)}</small></div><small>${esc(item.id||'')}</small></div>
    <div class="vol-report-grid">
      <section class="vol-report-section"><h4>Cambi applicati</h4>${changes}</section>
      <section class="vol-report-section"><h4>Impatto ore</h4>${hours}</section>
    </div>
  </article>`;
}

function openChangeReport(){
  const modal=ensureChangeReportModal();
  const body=modal.querySelector('#volunteerChangeReportBody');
  const approved=(workspace.proposals||[]).filter(item=>item.status==='APPROVATA');
  body.innerHTML=approved.length
    ?approved.map(renderChangeReportEntry).join('')
    :'<div class="vol-report-empty">Non ci sono ancora richieste approvate da mostrare.</div>';
  modal.classList.add('open');
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

async function deleteAcceptedRequests(ids,{skipConfirm=false}={}){
  const clean=[...new Set((ids||[]).map(String).filter(Boolean))];
  if(!clean.length)return;
  const plural=clean.length>1;

  if(!skipConfirm&&!confirm(
    plural
      ?`Eliminare definitivamente ${clean.length} richieste APPROVATE dall’archivio proposte?\n\nConferma unica: ATLAS eseguirà l’operazione in blocco. Il calendario già applicato NON viene modificato.`
      :`Eliminare definitivamente questa richiesta APPROVATA dall’archivio proposte?\n\nIl calendario già applicato NON viene modificato.`
  ))return;

  const buttons=$$('[data-delete-accepted],#deleteAcceptedSelectedBtn,#deleteAcceptedAllBtn');
  buttons.forEach(button=>button.disabled=true);

  try{
    const result=await postVolunteerAction('deleteAcceptedVolunteerProposals',{proposalIds:clean});
    const deleted=new Set(result.deletedIds||clean);

    workspace.proposals=(workspace.proposals||[]).filter(item=>!deleted.has(item.id));
    deleted.forEach(id=>{
      selectedAcceptedIds.delete(id);
      selectedSolutions.delete(id);
      compatibility.delete(id);
    });

    render();
    showDecisionPopup({
      title:plural?'Richieste eliminate':'Richiesta eliminata',
      text:`${deleted.size} ${deleted.size===1?'richiesta approvata eliminata':'richieste approvate eliminate'} dall’archivio.`,
      note:'Operazione eseguita in un unico blocco. I turni già applicati al calendario restano invariati.',
      icon:'✓'
    });
  }catch(error){
    showDecisionPopup({title:'Eliminazione non riuscita',text:error.message||'Impossibile eliminare le richieste selezionate.',icon:'!'});
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
    ?.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const ids=[...selectedAcceptedIds];
      if(!ids.length)return;
      if(!confirm(`Eliminare ${ids.length} richieste APPROVATE selezionate?\n\nATLAS eseguirà una sola operazione e non chiederà altre conferme.`))return;
      deleteAcceptedRequests(ids,{skipConfirm:true});
    });

  $('#deleteAcceptedAllBtn')
    ?.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      const ids=acceptedProposalIds();
      if(!ids.length)return;
      if(!confirm(`Eliminare TUTTE le ${ids.length} richieste APPROVATE?\n\nConferma unica: ATLAS non mostrerà un popup per ogni richiesta. Il calendario già applicato non viene modificato.`))return;
      deleteAcceptedRequests(ids,{skipConfirm:true});
    });

  $('#acceptedReportBtn')
    ?.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      openChangeReport();
    });

  updateAcceptedDeleteToolbar();
}


function ensureCompatibilityToolbar(){
  const host=$('#volunteerProposalList');
  if(!host||$('#volunteerCompatibilityToolbar'))return;
  const toolbar=document.createElement('div');
  toolbar.id='volunteerCompatibilityToolbar';toolbar.className='compatibility-toolbar';
  toolbar.innerHTML=`
    <div class="vol-ops-overview">
      <div class="vol-ops-stat"><span>Richieste totali</span><strong id="volOpsTotal">0</strong></div>
      <div class="vol-ops-stat waiting"><span>In attesa calendario</span><strong id="volOpsWaiting">0</strong></div>
      <div class="vol-ops-stat ready"><span>Soluzione pronta</span><strong id="volOpsReady">0</strong></div>
      <div class="vol-ops-stat review"><span>Da verificare</span><strong id="volOpsReview">0</strong></div>
      <div class="vol-ops-stat approved"><span>Approvate</span><strong id="volOpsApproved">0</strong></div>
    </div>
    <div class="vol-ops-controls">
      <div class="compatibility-summary">
        <button class="compat-filter active" type="button" data-compat-filter="ALL">Tutte <span class="count" data-compat-count="ALL">0</span></button>
        <button class="compat-filter" type="button" data-compat-filter="WAITING_CALENDAR">◷ Attesa calendario <span class="count" data-compat-count="WAITING_CALENDAR">0</span></button>
        <button class="compat-filter" type="button" data-compat-filter="DIRECT">✓ Dirette <span class="count" data-compat-count="DIRECT">0</span></button>
        <button class="compat-filter" type="button" data-compat-filter="CHANGES">⇄ Con cambi <span class="count" data-compat-count="CHANGES">0</span></button>
        <button class="compat-filter" type="button" data-compat-filter="REVIEW">? Da verificare <span class="count" data-compat-count="REVIEW">0</span></button>
        <button class="compat-filter" type="button" data-compat-filter="INCOMPATIBLE">× Impossibili <span class="count" data-compat-count="INCOMPATIBLE">0</span></button>
      </div>
      <div class="compatibility-progress"><span id="compatibilityProgressText">Pronto</span><button class="btn small compat-recalc" id="compatibilityRecalcBtn" type="button">Ricalcola</button></div>
    </div>
    <div class="accepted-toolbar"><span class="accepted-count">Approvate selezionate: <strong id="acceptedSelectedCount">0</strong></span><button class="btn small accepted-report-btn" id="acceptedReportBtn" type="button">Report modifiche</button><button class="btn small accepted-delete-btn" id="deleteAcceptedSelectedBtn" type="button" disabled>Elimina selezionate</button><button class="btn small accepted-delete-btn" id="deleteAcceptedAllBtn" type="button">Elimina tutte le approvate</button></div>`;
  host.parentElement?.insertBefore(toolbar,host);
  $$('[data-compat-filter]').forEach(button=>button.addEventListener('click',()=>{compatibilityFilter=button.dataset.compatFilter||'ALL';$$('[data-compat-filter]').forEach(other=>other.classList.toggle('active',other===button));render();}));
  $('#compatibilityRecalcBtn')?.addEventListener('click',()=>refreshWorkspace({force:true,blocking:true}));
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
          }else if(operation.mode==='sunday-rest'){
            text=`<strong>${esc(operation.coverName)}</strong> copre il ruolo spostando il riposo domenicale.`+(operation.recoveryDay?` Recupero previsto il <strong>${esc(dateLabel(operation.recoveryDay))}</strong>.`:' Recupero da programmare.');
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

  if(result.status==='WAITING_CALENDAR'){
    return`<div class="compat-box waiting"><div class="compat-box-title"><span>◷</span><span>In attesa del calendario dipendenti</span></div><div class="compat-box-text">La richiesta è stata registrata correttamente e rimane disponibile. Appena il calendario del mese viene generato e salvato, premi <strong>Aggiorna</strong>: ATLAS calcolerà automaticamente le soluzioni.</div></div>`;
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
      ?(item.calendarReady===true?compatibility.get(item.id):{status:'WAITING_CALENDAR',label:'In attesa calendario',summary:'Richiesta registrata prima della pubblicazione del calendario.'})
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
          <div class="proposal-title">Richiesta volontari</div>

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
        <div class="proposal-quick-grid">
          <div class="proposal-quick"><span>Data</span><strong>${esc(dateWithWeekdayLabel(hole.day))}</strong></div>
          <div class="proposal-quick"><span>Turno</span><strong>${esc(shiftLabel(hole.shift))} · ${esc(hole.start||'--:--')}–${esc(hole.end||'--:--')}</strong></div>
          <div class="proposal-quick"><span>Sede</span><strong>${esc(siteLabel(hole.site))} · mezzo ${esc(hole.machine||'—')}</strong></div>
          <div class="proposal-quick"><span>Ruoli richiesti</span><strong>${esc(roles||'—')}</strong></div>
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
              <strong>${approvalReportFromReason(item.reviewReason)?'Report modifiche disponibile':esc(item.reviewReason)}</strong>
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
          ?`<div class="waiting-calendar-callout"><span>◷</span><div><b>Richiesta conservata · in attesa calendario.</b><br>Può essere inviata prima della pubblicazione senza andare persa. Dopo il salvataggio del calendario del mese, premi Aggiorna e ATLAS avvierà l’analisi.</div></div>`
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
                      result.status==='WAITING_CALENDAR'||
                      result.status==='INCOMPATIBLE'||
                      result.status==='OTHER_MONTH'||
                      result.status==='REVIEW'
                        ?'disabled'
                        :''
                    }>
              ${
                !ready||result?.status==='WAITING_CALENDAR'
                  ?'In attesa calendario'
                  :result?.status==='ANALYZING'
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
                    data-decision="REJECT"
                    ${!ready?'disabled title="Disponibile dopo il salvataggio del calendario"':''}>
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
  const counts={ALL:0,DIRECT:0,CHANGES:0,WAITING_CALENDAR:0,REVIEW:0,INCOMPATIBLE:0};
  (workspace.proposals||[]).filter(item=>item.status==='INVIATA').forEach(item=>{
    counts.ALL++;
    const status=compatibility.get(item.id)?.status;
    if(counts[status]!==undefined)counts[status]++;
  });
  return counts;
}

function updateCompatibilityToolbar(){
  const counts=
    compatibilityCounts();

  const approved=(workspace.proposals||[]).filter(item=>item.status==='APPROVATA').length;
  const total=(workspace.proposals||[]).length;
  const ready=counts.DIRECT+counts.CHANGES;
  const setStat=(id,value)=>{const node=$(id);if(node)node.textContent=String(value);};
  setStat('#volOpsTotal',total);setStat('#volOpsWaiting',counts.WAITING_CALENDAR);setStat('#volOpsReady',ready);setStat('#volOpsReview',counts.REVIEW);setStat('#volOpsApproved',approved);

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

          const approvalReportReason=
            buildApprovalReportReason(
              proposal,
              selected,
              alreadyApplied
            );

          if(
            !confirm(
              `Confermi approvazione e applicazione al calendario?\n\n${detail}\n\nATLAS salverà il calendario e registrerà anche il report dei cambi effettuati.`
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
              approvalReportReason
            );

            proposal.status=
              'APPROVATA';

            proposal.reviewReason=
              approvalReportReason;

            proposal.reviewedAt=
              new Date().toISOString();

            proposal.reviewedBy=
              user?.displayName||
              user?.username||
              '';

            selectedSolutions.delete(
              proposalId
            );

            compatibility.delete(
              proposalId
            );

            api.clearManualReplacementHistory?.();

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
  if(blocking)volunteerCancelRequested=false;
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
    volunteerCancelRequested=false;
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
    if(item.calendarReady!==true){
      compatibility.set(item.id,{status:'WAITING_CALENDAR',label:'In attesa calendario',tone:'warning',summary:'La richiesta è registrata e verrà analizzata dopo la pubblicazione del calendario dipendenti.',roles:[],changes:[],solutions:[],blockers:[]});
    }else if(!compatibility.has(item.id)||force){
      compatibility.set(item.id,{status:'ANALYZING'});
    }
  });

  render();

  let processed=0;

  for(const item of pending){
    if(run!==analysisRun||volunteerCancelRequested){
      analysisBusy=false;
      if(blocking)hideVolunteerAnalysisOverlay();
      return;
    }

    if(item.calendarReady!==true){
      processed++;
      render();
      await idleYield();
      continue;
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

    if(volunteerCancelRequested||run!==analysisRun){
      analysisBusy=false;
      if(blocking)hideVolunteerAnalysisOverlay();
      return;
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
  blocking=true
}={}){
  if(!has('volunteerProposalView'))return;

  if(workspaceLoaded&&!force){
    render();
    runCompatibilityAnalysis({force:false,blocking:false}).catch(error=>
      console.warn('Analisi compatibilità in background non riuscita:',error)
    );
    return workspace;
  }

  if(workspaceLoading&&!force)return workspaceLoading;

  volunteerCancelRequested=false;
  if(blocking){
    showVolunteerAnalysisOverlay();
    updateVolunteerAnalysisOverlay({
      title:'Carico Buchi volontari',
      text:'Recupero le proposte ricevute dal Referente Volontari.',
      stage:'Caricamento proposte',current:0,total:0
    });
  }

  const host=$('#volunteerProposalList');
  if(host){
    host.innerHTML=`<div class="volunteer-loading"><strong>Caricamento proposte…</strong><br><span>Appena i dati arrivano la pagina viene sbloccata; l’analisi continua in background.</span></div>`;
  }

  const auth=getServerAuthContext();
  workspaceLoading=(async()=>{
    try{
      workspace=await loadVolunteerWorkspace({url:ATLAS_SERVER_URL,token:auth.token});
      workspaceLoaded=true;
      if(force)compatibility.clear();
      render();

      if(blocking){
        updateVolunteerAnalysisOverlay({
          title:'Proposte caricate',
          text:'I buchi sono disponibili. L’analisi continua in background.',
          stage:'Caricamento completato',current:1,total:1
        });
        setTimeout(hideVolunteerAnalysisOverlay,100);
      }

      runCompatibilityAnalysis({force,blocking:false}).catch(error=>
        console.warn('Analisi compatibilità in background non riuscita:',error)
      );
      return workspace;
    }finally{
      workspaceLoading=null;
      if(blocking)setTimeout(hideVolunteerAnalysisOverlay,150);
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
    true
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
