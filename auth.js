/* ATLAS 118 · Modulo Copertura Volontari · Release 1.5.5 */

.volunteer-coverage-view{
  min-width:0;
  overflow:hidden;
}

.volunteer-toolbar{
  gap:14px;
  background:
    linear-gradient(135deg,rgba(14,165,233,.08),transparent 45%),
    rgba(6,18,28,.84);
}

.volunteer-toolbar-copy{
  min-width:0;
}

.volunteer-toolbar-controls{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  min-width:0;
}

.volunteer-role-chip{
  max-width:250px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.volunteer-refresh-btn span:last-child{
  display:inline;
}

.volunteer-mobile-tabs{
  display:none;
}

.volunteer-layout{
  display:grid;
  grid-template-columns:minmax(330px,.82fr) minmax(0,1.18fr);
  gap:14px;
  padding:14px;
  min-width:0;
  min-height:0;
  align-items:start;
  overflow:auto;
}

.role-ro .volunteer-layout{
  grid-template-columns:minmax(0,1fr);
  width:min(1180px,100%);
  margin-inline:auto;
}

.role-ro .volunteer-list-panel{
  grid-column:1;
}

.volunteer-panel{
  position:relative;
  min-width:0;
  overflow:hidden;
  padding:18px;
  border:1px solid rgba(129,176,208,.14);
  border-radius:20px;
  background:
    radial-gradient(circle at 100% 0,rgba(14,165,233,.10),transparent 30%),
    linear-gradient(160deg,rgba(13,34,48,.97),rgba(6,21,31,.99));
  box-shadow:
    0 18px 55px rgba(0,0,0,.23),
    inset 0 1px 0 rgba(255,255,255,.025);
}

.volunteer-panel::before{
  content:"";
  position:absolute;
  inset:0 auto 0 0;
  width:3px;
  background:linear-gradient(180deg,#22d3ee,#2563eb);
  opacity:.75;
}

.volunteer-list-panel::before{
  background:linear-gradient(180deg,#a78bfa,#22d3ee);
}

.volunteer-panel-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:14px;
  min-width:0;
  margin:0 0 16px;
}

.volunteer-panel-title-wrap{
  display:flex;
  align-items:flex-start;
  gap:11px;
  min-width:0;
}

.volunteer-panel-title-wrap > div{
  min-width:0;
}

.volunteer-panel-icon{
  display:grid;
  place-items:center;
  flex:0 0 38px;
  width:38px;
  height:38px;
  border:1px solid rgba(34,211,238,.24);
  border-radius:12px;
  color:#8cecff;
  background:rgba(34,211,238,.08);
  font-size:20px;
  font-weight:800;
}

.volunteer-panel-icon.list-icon{
  border-color:rgba(167,139,250,.26);
  color:#c4b5fd;
  background:rgba(167,139,250,.08);
}

.volunteer-panel-head h3{
  margin:0;
  color:var(--text);
  font-size:17px;
  line-height:1.2;
}

.volunteer-panel-head p{
  margin:5px 0 0;
  max-width:680px;
  color:var(--muted);
  font-size:11px;
  line-height:1.5;
  overflow-wrap:anywhere;
}

.volunteer-draft-summary{
  display:flex;
  align-items:center;
  gap:11px;
  min-width:0;
  margin-bottom:14px;
  padding:11px 12px;
  border:1px solid rgba(56,189,248,.15);
  border-radius:13px;
  background:rgba(14,165,233,.055);
}

.draft-summary-icon{
  display:grid;
  place-items:center;
  flex:0 0 28px;
  width:28px;
  height:28px;
  border-radius:9px;
  color:#7dd3fc;
  background:rgba(56,189,248,.12);
  font-weight:900;
}

.draft-summary-icon.ready{
  color:#6ee7b7;
  background:rgba(52,211,153,.12);
}

.volunteer-draft-summary > div{
  min-width:0;
}

.volunteer-draft-summary strong,
.volunteer-draft-summary small{
  display:block;
  overflow-wrap:anywhere;
}

.volunteer-draft-summary strong{
  color:#dff7ff;
  font-size:11px;
}

.volunteer-draft-summary small{
  margin-top:3px;
  color:var(--muted);
  font-size:9px;
  line-height:1.35;
}

.volunteer-form-section{
  min-width:0;
  margin-top:13px;
  padding:14px;
  border:1px solid rgba(148,180,220,.10);
  border-radius:15px;
  background:rgba(255,255,255,.018);
}

.volunteer-section-heading{
  display:flex;
  align-items:flex-start;
  gap:10px;
  margin-bottom:13px;
}

.volunteer-section-heading > span{
  display:grid;
  place-items:center;
  flex:0 0 25px;
  width:25px;
  height:25px;
  border-radius:8px;
  color:#dff8ff;
  background:linear-gradient(135deg,#0891b2,#2563eb);
  font-size:10px;
  font-weight:900;
  box-shadow:0 7px 18px rgba(14,165,233,.18);
}

.volunteer-section-heading > div{
  min-width:0;
}

.volunteer-section-heading strong,
.volunteer-section-heading small{
  display:block;
}

.volunteer-section-heading strong{
  color:var(--text);
  font-size:12px;
}

.volunteer-section-heading small{
  margin-top:3px;
  color:var(--muted);
  font-size:9px;
  line-height:1.35;
}

.volunteer-form-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:11px;
  min-width:0;
}

.volunteer-form-grid .full{
  grid-column:1/-1;
}

.volunteer-field{
  min-width:0;
}

.volunteer-field .input{
  min-width:0;
  height:43px;
  border-radius:11px;
  background:rgba(2,11,18,.62);
}

.volunteer-field textarea.input{
  height:auto;
  min-height:84px;
  resize:vertical;
}

.volunteer-role-field{
  min-width:0;
  margin:0;
  padding:0;
  border:0;
}

.volunteer-role-field legend{
  display:block;
  width:100%;
  margin:0 0 6px 2px;
  color:var(--muted);
  font-size:10px;
  font-weight:750;
  letter-spacing:.07em;
  text-transform:uppercase;
}

.volunteer-role-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:8px;
  min-width:0;
}

.volunteer-role-option{
  position:relative;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  min-width:0;
  min-height:62px;
  padding:9px;
  border:1px solid rgba(148,180,220,.13);
  border-radius:12px;
  background:rgba(2,13,21,.46);
  cursor:pointer;
  transition:border-color .16s ease,background .16s ease,transform .16s ease;
}

.volunteer-role-option:hover{
  transform:translateY(-1px);
  border-color:rgba(56,189,248,.32);
  background:rgba(14,165,233,.055);
}

.volunteer-role-option input{
  position:absolute;
  opacity:0;
  pointer-events:none;
}

.role-option-code{
  display:grid;
  place-items:center;
  width:31px;
  height:31px;
  border-radius:9px;
  font-size:11px;
  font-weight:950;
}

.role-option-code.role-a,
.solution-role-badge.role-a,
.proposal-role-chip.role-a{
  color:#7dd3fc;
  background:rgba(56,189,248,.12);
  border-color:rgba(56,189,248,.22);
}

.role-option-code.role-c,
.solution-role-badge.role-c,
.proposal-role-chip.role-c{
  color:#c4b5fd;
  background:rgba(167,139,250,.12);
  border-color:rgba(167,139,250,.22);
}

.role-option-code.role-s,
.solution-role-badge.role-s,
.proposal-role-chip.role-s{
  color:#6ee7b7;
  background:rgba(52,211,153,.12);
  border-color:rgba(52,211,153,.22);
}

.role-option-copy{
  min-width:0;
}

.role-option-copy strong,
.role-option-copy small{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
}

.role-option-copy strong{
  color:var(--text);
  font-size:10px;
  white-space:normal;
  line-height:1.2;
}

.role-option-copy small{
  margin-top:3px;
  color:var(--muted);
  font-size:8px;
  white-space:nowrap;
}

.role-option-check{
  display:grid;
  place-items:center;
  width:20px;
  height:20px;
  border:1px solid rgba(148,180,220,.18);
  border-radius:7px;
  color:transparent;
  background:rgba(255,255,255,.025);
  font-size:10px;
  font-weight:900;
}

.volunteer-role-option:has(input:checked){
  border-color:rgba(34,211,238,.48);
  background:rgba(14,165,233,.08);
  box-shadow:inset 0 0 0 1px rgba(34,211,238,.08);
}

.volunteer-role-option:has(input:checked) .role-option-check{
  border-color:transparent;
  color:#032b36;
  background:#67e8f9;
}

.volunteer-search-actions{
  display:grid;
  grid-template-columns:minmax(0,1fr);
  gap:7px;
  margin-top:14px;
}

.volunteer-analyze-btn{
  min-height:46px;
  font-size:12px;
}

.volunteer-search-actions p{
  margin:0;
  color:var(--muted);
  font-size:9px;
  line-height:1.45;
  text-align:center;
}

.volunteer-analysis{
  display:grid;
  gap:10px;
  min-width:0;
  margin-top:14px;
}

.volunteer-result-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  min-width:0;
  padding:11px 12px;
  border:1px solid rgba(34,211,238,.16);
  border-radius:13px;
  background:rgba(34,211,238,.05);
}

.volunteer-result-head > div{
  min-width:0;
}

.volunteer-result-head strong,
.volunteer-result-head small{
  display:block;
}

.volunteer-result-head strong{
  color:#dffbff;
  font-size:11px;
}

.volunteer-result-head small{
  margin-top:3px;
  color:var(--muted);
  font-size:9px;
  line-height:1.35;
}

.result-count{
  display:grid;
  place-items:center;
  flex:0 0 30px;
  width:30px;
  height:30px;
  border-radius:10px;
  color:#061b24;
  background:#67e8f9;
  font-size:11px;
  font-weight:950;
}

.solution-list{
  display:grid;
  gap:10px;
  min-width:0;
}

.solution-card{
  position:relative;
  display:block;
  min-width:0;
  padding:0;
  overflow:hidden;
  border:1px solid rgba(148,180,220,.13);
  border-radius:15px;
  background:rgba(2,13,21,.48);
  cursor:pointer;
  transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease;
}

.solution-card:hover{
  transform:translateY(-1px);
  border-color:rgba(56,189,248,.28);
}

.solution-card.selected{
  border-color:rgba(34,211,238,.66);
  box-shadow:
    0 0 0 1px rgba(34,211,238,.15),
    0 12px 30px rgba(0,0,0,.18);
}

.solution-radio{
  position:absolute;
  top:14px;
  left:14px;
  z-index:2;
  width:18px;
  height:18px;
  margin:0;
  accent-color:#22d3ee;
}

.solution-card-content{
  min-width:0;
  padding:13px 13px 13px 43px;
}

.solution-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
  min-width:0;
}

.solution-heading{
  min-width:0;
}

.solution-title{
  color:var(--text);
  font-size:12px;
  font-weight:900;
  line-height:1.3;
  overflow-wrap:anywhere;
}

.solution-meta{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:6px;
  margin-top:5px;
  color:var(--muted);
  font-size:9px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.score-pill{
  display:inline-flex;
  padding:3px 6px;
  border:1px solid rgba(148,180,220,.12);
  border-radius:999px;
  color:#b9cad6;
  background:rgba(255,255,255,.025);
  white-space:nowrap;
}

.proposal-status{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  max-width:100%;
  padding:5px 8px;
  border-radius:999px;
  font-size:8px;
  font-weight:950;
  letter-spacing:.065em;
  line-height:1.15;
  text-transform:uppercase;
  white-space:nowrap;
}

.solution-block{
  min-width:0;
  margin-top:12px;
}

.solution-block-title,
.proposal-section-title{
  margin-bottom:7px;
  color:#a8bdca;
  font-size:8px;
  font-weight:900;
  letter-spacing:.08em;
  text-transform:uppercase;
}

.solution-crew{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
  min-width:0;
}

.solution-person{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-width:0;
  padding:8px;
  border:1px solid rgba(148,180,220,.08);
  border-radius:10px;
  background:rgba(255,255,255,.025);
}

.solution-role-badge{
  display:grid;
  place-items:center;
  width:28px;
  height:28px;
  border:1px solid transparent;
  border-radius:9px;
  font-size:9px;
  font-weight:950;
}

.solution-person-copy{
  min-width:0;
}

.solution-person-copy strong,
.solution-person-copy small{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
}

.solution-person-copy strong{
  color:#e9f4f8;
  font-size:10px;
  line-height:1.25;
  white-space:normal;
  overflow-wrap:anywhere;
}

.solution-person-copy small{
  margin-top:2px;
  color:var(--muted);
  font-size:8px;
  white-space:nowrap;
}

.solution-changes{
  padding-top:11px;
  border-top:1px solid rgba(148,180,220,.10);
}

.solution-change-list{
  display:grid;
  gap:7px;
  min-width:0;
}

.solution-change{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:start;
  gap:8px;
  min-width:0;
  padding:8px;
  border:1px solid rgba(251,191,36,.11);
  border-radius:10px;
  background:rgba(251,191,36,.035);
}

.change-icon{
  display:grid;
  place-items:center;
  width:26px;
  height:26px;
  border-radius:8px;
  color:#fbbf24;
  background:rgba(251,191,36,.11);
  font-size:12px;
}

.change-copy{
  min-width:0;
}

.change-route{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:5px;
  min-width:0;
  color:#f0f5f7;
  font-size:9px;
  font-weight:800;
  line-height:1.35;
}

.change-route span{
  overflow-wrap:anywhere;
}

.change-route i{
  color:#fbbf24;
  font-style:normal;
}

.change-copy small{
  display:block;
  margin-top:4px;
  color:var(--muted);
  font-size:8px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.solution-warning-list{
  display:grid;
  gap:6px;
  margin-top:10px;
}

.solution-warning{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:start;
  gap:7px;
  min-width:0;
  padding:7px 8px;
  border:1px solid rgba(251,191,36,.12);
  border-radius:9px;
  color:#f4d17a;
  background:rgba(251,191,36,.045);
  font-size:8px;
  line-height:1.4;
}

.solution-warning > span:first-child{
  display:grid;
  place-items:center;
  width:17px;
  height:17px;
  border-radius:6px;
  color:#3e2a00;
  background:#fbbf24;
  font-size:9px;
  font-weight:950;
}

.solution-empty{
  grid-column:1/-1;
  padding:11px;
  border:1px dashed rgba(148,180,220,.12);
  border-radius:10px;
  color:var(--muted);
  font-size:9px;
  text-align:center;
}

.volunteer-submit-bar{
  position:sticky;
  bottom:8px;
  z-index:12;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:12px;
  min-width:0;
  margin-top:14px;
  padding:11px;
  border:1px solid rgba(52,211,153,.19);
  border-radius:14px;
  background:rgba(5,25,28,.94);
  box-shadow:0 14px 35px rgba(0,0,0,.28);
  backdrop-filter:blur(16px);
}

.volunteer-submit-copy{
  min-width:0;
}

.volunteer-submit-copy strong,
.volunteer-submit-copy small{
  display:block;
}

.volunteer-submit-copy strong{
  color:#dffcf0;
  font-size:10px;
}

.volunteer-submit-copy small{
  margin-top:3px;
  color:#8fb4a6;
  font-size:8px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.volunteer-submit-bar .btn{
  min-height:42px;
  white-space:nowrap;
}

.volunteer-submit-bar .btn:disabled{
  opacity:.45;
  cursor:not-allowed;
  filter:saturate(.45);
}

.volunteer-list-head{
  align-items:center;
}

.volunteer-filter-wrap{
  display:grid;
  gap:4px;
  flex:0 0 auto;
}

.volunteer-filter-wrap label{
  color:var(--muted);
  font-size:8px;
  font-weight:800;
  letter-spacing:.07em;
  text-transform:uppercase;
}

.volunteer-filter-wrap .input.compact{
  width:154px;
  min-height:38px;
  border-radius:10px;
}

.volunteer-proposal-list{
  display:grid;
  gap:11px;
  min-width:0;
  max-height:calc(100vh - 242px);
  padding-right:4px;
  overflow:auto;
  scrollbar-gutter:stable;
  overscroll-behavior:contain;
}

.proposal-card{
  min-width:0;
  padding:14px;
  overflow:hidden;
  border:1px solid rgba(148,180,220,.13);
  border-left:3px solid #fbbf24;
  border-radius:15px;
  background:
    linear-gradient(145deg,rgba(255,255,255,.022),transparent 35%),
    rgba(2,13,21,.48);
}

.proposal-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
  min-width:0;
}

.proposal-date-block{
  min-width:0;
}

.proposal-date-block strong,
.proposal-date-block small{
  display:block;
}

.proposal-date-block strong{
  color:#f2f9fb;
  font-size:14px;
  line-height:1.15;
}

.proposal-date-block small{
  margin-top:4px;
  color:#b3c5cf;
  font-size:9px;
  line-height:1.35;
}

.proposal-location-row{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-top:10px;
}

.proposal-location-chip{
  display:inline-flex;
  align-items:center;
  gap:5px;
  max-width:100%;
  padding:5px 7px;
  border:1px solid rgba(148,180,220,.10);
  border-radius:999px;
  color:#bed0da;
  background:rgba(255,255,255,.025);
  font-size:8px;
  line-height:1.2;
  overflow-wrap:anywhere;
}

.proposal-location-chip b{
  color:#67e8f9;
  font-weight:900;
}

.proposal-location-chip.email-sent{
  color:#98f2c9;
  border-color:rgba(52,211,153,.14);
  background:rgba(52,211,153,.055);
}

.proposal-meta-grid{
  display:grid;
  grid-template-columns:1fr 1.2fr 1fr;
  gap:7px;
  min-width:0;
  margin-top:11px;
}

.proposal-meta-grid > div{
  min-width:0;
  padding:8px;
  border:1px solid rgba(148,180,220,.075);
  border-radius:9px;
  background:rgba(255,255,255,.018);
}

.proposal-meta-grid span,
.proposal-meta-grid strong{
  display:block;
}

.proposal-meta-grid span{
  color:var(--muted);
  font-size:7px;
  font-weight:800;
  letter-spacing:.06em;
  text-transform:uppercase;
}

.proposal-meta-grid strong{
  margin-top:3px;
  color:#d9e7ed;
  font-size:8px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

.proposal-section{
  min-width:0;
  margin-top:12px;
}

.proposal-role-list{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}

.proposal-role-chip{
  display:inline-flex;
  align-items:center;
  padding:5px 8px;
  border:1px solid transparent;
  border-radius:999px;
  font-size:8px;
  font-weight:850;
}

.proposal-note,
.proposal-review-note{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  gap:9px;
  min-width:0;
  margin-top:12px;
  padding:9px 10px;
  border:1px solid rgba(56,189,248,.11);
  border-radius:10px;
  background:rgba(56,189,248,.035);
}

.proposal-note > span{
  color:#67e8f9;
  font-size:22px;
  line-height:1;
}

.proposal-note strong,
.proposal-note p,
.proposal-review-note strong,
.proposal-review-note p{
  margin:0;
}

.proposal-note strong,
.proposal-review-note strong{
  color:#dff8ff;
  font-size:8px;
  text-transform:uppercase;
  letter-spacing:.07em;
}

.proposal-note p,
.proposal-review-note p{
  margin-top:4px;
  color:#b8cad3;
  font-size:9px;
  line-height:1.45;
  overflow-wrap:anywhere;
}

.proposal-review-note{
  display:block;
  border-color:rgba(167,139,250,.12);
  background:rgba(167,139,250,.04);
}

.proposal-gate{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:start;
  gap:9px;
  min-width:0;
  margin-top:12px;
  padding:9px 10px;
  border-radius:10px;
}

.proposal-gate.locked{
  border:1px solid rgba(251,191,36,.16);
  background:rgba(251,191,36,.05);
}

.proposal-gate.ready{
  border:1px solid rgba(52,211,153,.16);
  background:rgba(52,211,153,.05);
}

.gate-icon{
  display:grid;
  place-items:center;
  width:25px;
  height:25px;
  border-radius:8px;
  font-size:11px;
  font-weight:900;
}

.proposal-gate.locked .gate-icon{
  color:#3f2b00;
  background:#fbbf24;
}

.proposal-gate.ready .gate-icon{
  color:#052c20;
  background:#6ee7b7;
}

.proposal-gate strong,
.proposal-gate small{
  display:block;
}

.proposal-gate strong{
  color:#edf6f9;
  font-size:9px;
}

.proposal-gate small{
  margin-top:3px;
  color:var(--muted);
  font-size:8px;
  line-height:1.4;
  overflow-wrap:anywhere;
}

.proposal-actions{
  display:grid;
  grid-template-columns:1fr auto;
  gap:8px;
  min-width:0;
  margin-top:12px;
}

.proposal-actions .btn{
  min-height:40px;
  min-width:0;
}

.proposal-actions .btn:disabled{
  opacity:.38;
  cursor:not-allowed;
  filter:saturate(.4);
}

.volunteer-empty{
  display:grid;
  place-items:center;
  min-height:210px;
  padding:28px 16px;
  color:var(--muted);
  text-align:center;
}

.volunteer-empty > span{
  display:grid;
  place-items:center;
  width:46px;
  height:46px;
  margin-bottom:10px;
  border:1px solid rgba(148,180,220,.12);
  border-radius:14px;
  color:#8da5b3;
  background:rgba(255,255,255,.025);
  font-size:20px;
}

.volunteer-empty strong{
  color:#d8e6eb;
  font-size:11px;
}

.volunteer-empty p{
  max-width:320px;
  margin:5px 0 0;
  font-size:9px;
  line-height:1.45;
}

.volunteer-loading-card,
.volunteer-result-empty{
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:11px;
  min-width:0;
  padding:13px;
  border:1px solid rgba(56,189,248,.13);
  border-radius:13px;
  background:rgba(56,189,248,.04);
}

.volunteer-result-empty > span{
  display:grid;
  place-items:center;
  width:32px;
  height:32px;
  border-radius:10px;
  color:#061f2a;
  background:#67e8f9;
  font-weight:950;
}

.volunteer-result-empty.danger{
  border-color:rgba(251,113,133,.15);
  background:rgba(251,113,133,.04);
}

.volunteer-result-empty.danger > span{
  color:#3a0710;
  background:#fb7185;
}

.volunteer-result-empty.success{
  border-color:rgba(52,211,153,.16);
  background:rgba(52,211,153,.045);
}

.volunteer-result-empty.success > span{
  color:#052c20;
  background:#6ee7b7;
}

.volunteer-loading-card > div,
.volunteer-result-empty > div{
  min-width:0;
}

.volunteer-loading-card strong,
.volunteer-loading-card small,
.volunteer-result-empty strong,
.volunteer-result-empty p{
  display:block;
}

.volunteer-loading-card strong,
.volunteer-result-empty strong{
  color:#e1f3f8;
  font-size:10px;
}

.volunteer-loading-card small,
.volunteer-result-empty p{
  margin:3px 0 0;
  color:var(--muted);
  font-size:8px;
  line-height:1.4;
  overflow-wrap:anywhere;
}

.volunteer-spinner{
  width:26px;
  height:26px;
  border:3px solid rgba(103,232,249,.16);
  border-top-color:#67e8f9;
  border-radius:50%;
  animation:volunteerSpin .75s linear infinite;
}

@keyframes volunteerSpin{
  to{transform:rotate(360deg)}
}

.volunteer-inline-notice{
  margin:0;
}

.role-volunteer-scheduler .action-group:not(.action-system),
.role-volunteer-scheduler #settingsBtn,
.role-volunteer-scheduler .sidebar .card,
.role-volunteer-scheduler .nav-btn:not([data-view="volunteerCoverageView"]),
.role-volunteer-scheduler .view:not(#volunteerCoverageView),
.role-volunteer-scheduler #sidebarPinBtn{
  display:none!important;
}

.role-volunteer-scheduler #volunteerCoverageView{
  display:block;
}

.role-volunteer-scheduler #volunteerCreatePanel{
  display:block;
}

.role-ro #volunteerCreatePanel{
  display:none!important;
}

.role-ro [data-access="admin"],
.role-volunteer-scheduler [data-access="admin"],
.role-volunteer-scheduler [data-access="employees"]{
  display:none!important;
}

@media(max-width:1120px){
  .volunteer-layout{
    grid-template-columns:minmax(300px,.9fr) minmax(0,1.1fr);
  }

  .volunteer-role-grid{
    grid-template-columns:1fr;
  }

  .proposal-meta-grid{
    grid-template-columns:1fr 1fr;
  }
}

@media(max-width:960px){
  .volunteer-layout{
    grid-template-columns:1fr;
    overflow:visible;
  }

  .volunteer-proposal-list{
    max-height:none;
  }

  .volunteer-role-grid{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media(max-width:760px){
  body.role-volunteer-scheduler{
    padding-bottom:0!important;
    overflow-x:hidden;
  }

  .role-volunteer-scheduler .app{
    min-height:100dvh;
  }

  .role-volunteer-scheduler .topbar{
    position:sticky;
    top:0;
    z-index:70;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto auto;
    align-items:center;
    gap:7px;
    padding:8px 9px;
  }

  .role-volunteer-scheduler .brand{
    grid-column:auto;
    min-width:0;
    gap:7px;
  }

  .role-volunteer-scheduler .brand-logo-wrap{
    width:78px;
    height:32px;
    flex-basis:78px;
  }

  .role-volunteer-scheduler .brand-title{
    font-size:12px;
  }

  .role-volunteer-scheduler .brand-sub,
  .role-volunteer-scheduler .brand-credit,
  .role-volunteer-scheduler .sidebar,
  .role-volunteer-scheduler .sidebar-backdrop,
  .role-volunteer-scheduler .sidebar-menu-btn,
  .role-volunteer-scheduler .month-control,
  .role-volunteer-scheduler .sync-pill,
  .role-volunteer-scheduler .top-spacer{
    display:none!important;
  }

  .role-volunteer-scheduler .operator-pill{
    justify-self:end;
    max-width:112px;
    padding:3px 6px 3px 3px;
  }

  .role-volunteer-scheduler .operator-avatar{
    width:27px;
    height:27px;
  }

  .role-volunteer-scheduler .operator-name{
    max-width:70px;
    font-size:8px;
  }

  .role-volunteer-scheduler .operator-role{
    display:none;
  }

  .role-volunteer-scheduler .top-actions{
    position:static;
    z-index:auto;
    display:block;
    justify-self:end;
    padding:0;
    overflow:visible;
    border:0;
    background:none;
    box-shadow:none;
    backdrop-filter:none;
  }

  .role-volunteer-scheduler .top-actions .action-group,
  .role-volunteer-scheduler .top-actions .action-buttons{
    display:block;
  }

  .role-volunteer-scheduler .top-actions .action-group-label{
    display:none;
  }

  .role-volunteer-scheduler .top-actions #logoutBtn{
    width:40px;
    min-width:40px;
    height:40px;
    min-height:40px;
    padding:0;
    border-radius:11px;
    font-size:17px;
  }

  .role-volunteer-scheduler .top-actions #logoutBtn span{
    display:none!important;
  }

  .role-volunteer-scheduler .shell{
    display:block;
  }

  .role-volunteer-scheduler .content{
    min-height:0;
    padding:0 9px 14px;
  }

  .volunteer-coverage-view{
    overflow:visible;
  }

  .volunteer-toolbar{
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    align-items:center;
    gap:8px;
    margin-top:8px;
    padding:11px;
    border-radius:14px;
  }

  .volunteer-toolbar-copy{
    min-width:0;
  }

  .volunteer-toolbar .view-title{
    font-size:13px;
  }

  .volunteer-toolbar .view-sub{
    display:none;
  }

  .volunteer-toolbar-controls{
    gap:6px;
  }

  .volunteer-role-chip{
    display:none!important;
  }

  .volunteer-refresh-btn{
    width:40px;
    min-width:40px;
    height:40px;
    padding:0;
    border-radius:11px;
    font-size:17px;
  }

  .volunteer-refresh-btn span:last-child{
    display:none;
  }

  .volunteer-mobile-tabs{
    position:sticky;
    top:57px;
    z-index:45;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:5px;
    margin:8px 0;
    padding:5px;
    border:1px solid rgba(148,180,220,.12);
    border-radius:13px;
    background:rgba(7,20,30,.94);
    box-shadow:0 10px 25px rgba(0,0,0,.22);
    backdrop-filter:blur(16px);
  }

  .volunteer-mobile-tab{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    min-width:0;
    min-height:40px;
    padding:7px 8px;
    border:0;
    border-radius:9px;
    color:#91a9b7;
    background:transparent;
    font-size:9px;
    font-weight:800;
    cursor:pointer;
  }

  .volunteer-mobile-tab.active{
    color:#e9fbff;
    background:linear-gradient(135deg,rgba(8,145,178,.36),rgba(37,99,235,.28));
    box-shadow:inset 0 0 0 1px rgba(103,232,249,.13);
  }

  .tab-number{
    display:grid;
    place-items:center;
    width:20px;
    height:20px;
    border-radius:7px;
    color:inherit;
    background:rgba(255,255,255,.07);
    font-size:8px;
  }

  .tab-count{
    display:grid;
    place-items:center;
    min-width:20px;
    height:20px;
    padding:0 5px;
    border-radius:999px;
    color:#08212b;
    background:#67e8f9;
    font-size:8px;
    font-weight:950;
  }

  .volunteer-layout{
    display:block;
    padding:0;
    overflow:visible;
  }

  .role-volunteer-scheduler .volunteer-panel[data-volunteer-panel]{
    display:none;
  }

  .role-volunteer-scheduler .volunteer-panel[data-volunteer-panel].mobile-active{
    display:block;
  }

  .volunteer-panel{
    padding:13px;
    border-radius:16px;
  }

  .volunteer-panel-head{
    align-items:center;
    margin-bottom:13px;
  }

  .volunteer-panel-icon{
    width:34px;
    height:34px;
    flex-basis:34px;
    border-radius:11px;
  }

  .volunteer-panel-head h3{
    font-size:14px;
  }

  .volunteer-panel-head p{
    font-size:9px;
    line-height:1.4;
  }

  .volunteer-draft-summary{
    margin-bottom:11px;
    padding:10px;
  }

  .volunteer-form-section{
    margin-top:10px;
    padding:11px;
    border-radius:13px;
  }

  .volunteer-section-heading{
    margin-bottom:11px;
  }

  .volunteer-form-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:9px;
  }

  .volunteer-field .input{
    min-height:46px;
    height:46px;
    font-size:16px;
  }

  .volunteer-field textarea.input{
    min-height:92px;
    height:auto;
  }

  .volunteer-role-grid{
    grid-template-columns:1fr;
    gap:7px;
  }

  .volunteer-role-option{
    min-height:58px;
  }

  .role-option-copy strong{
    font-size:11px;
  }

  .role-option-copy small{
    font-size:9px;
  }

  .volunteer-analyze-btn{
    min-height:48px;
    width:100%;
  }

  .solution-card-content{
    padding:12px 11px 12px 40px;
  }

  .solution-head{
    display:grid;
    grid-template-columns:minmax(0,1fr);
    gap:7px;
  }

  .solution-head .proposal-status{
    justify-self:start;
  }

  .solution-crew{
    grid-template-columns:1fr;
  }

  .proposal-meta-grid{
    grid-template-columns:1fr 1fr;
  }

  .proposal-meta-grid > div:last-child{
    grid-column:1/-1;
  }

  .proposal-actions{
    grid-template-columns:1fr 1fr;
  }

  .proposal-actions .btn{
    min-height:44px;
    padding:8px;
    font-size:9px;
  }

  .volunteer-submit-bar{
    bottom:7px;
    grid-template-columns:1fr;
    gap:9px;
    padding:10px;
  }

  .volunteer-submit-bar .btn{
    width:100%;
    min-height:46px;
  }

  .volunteer-list-head{
    display:grid;
    grid-template-columns:minmax(0,1fr);
    gap:11px;
    align-items:start;
  }

  .volunteer-filter-wrap{
    width:100%;
  }

  .volunteer-filter-wrap .input.compact{
    width:100%;
    min-height:44px;
    font-size:16px;
  }

  .volunteer-proposal-list{
    max-height:none;
    padding-right:0;
    overflow:visible;
  }

  .proposal-card{
    padding:12px;
    border-radius:13px;
  }

  .proposal-head{
    align-items:flex-start;
  }

  .proposal-date-block strong{
    font-size:13px;
  }

  .proposal-status{
    max-width:42%;
    white-space:normal;
    text-align:center;
  }

  .volunteer-loading-card.list-loading{
    min-height:120px;
  }
}

@media(max-width:420px){
  .role-volunteer-scheduler .brand-logo-wrap{
    width:67px;
    flex-basis:67px;
  }

  .role-volunteer-scheduler .operator-name{
    display:none;
  }

  .role-volunteer-scheduler .operator-pill{
    width:34px;
    padding:3px;
  }

  .volunteer-form-grid{
    grid-template-columns:1fr;
  }

  .volunteer-form-grid .full{
    grid-column:auto;
  }

  .proposal-meta-grid{
    grid-template-columns:1fr;
  }

  .proposal-meta-grid > div:last-child{
    grid-column:auto;
  }

  .proposal-actions{
    grid-template-columns:1fr;
  }

  .volunteer-mobile-tab{
    padding-inline:5px;
  }

  .volunteer-mobile-tab > span:nth-child(2){
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
}
