
import {ATLAS_SERVER_URL} from './config.js';
import {getServerAuthContext} from './auth-protected.js';
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
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[character])
);

let user=null;
let permissions=new Set();
let workspace={proposals:[]};
let workspaceLoaded=false;
let workspaceLoading=null;

function has(permission){return permissions.has(permission)}
function setHidden(element,hidden){
  if(!element)return;
  element.classList.toggle('hidden',hidden);
  element.toggleAttribute('hidden',hidden);
}

export function isVolunteerOnlyProfile(){return false}

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
  }catch{return{}}
}

function dateLabel(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:String(value||'');
}

function shiftLabel(code){
  return({M:'Mattina',P:'Pomeriggio',N:'Notte',CUSTOM:'Personalizzato'})[code]||code;
}

function siteLabel(code){
  return({G:'Gallarate',S:'Somma Lombardo',SU:'Sumirago'})[code]||code;
}

function roleLabel(code){
  return({A:'Autista',C:'Capo equipaggio',S:'Soccorritore'})[code]||code;
}

function statusClass(status){
  return status==='APPROVATA'
    ?'status-approved'
    :status==='RIFIUTATA'
      ?'status-rejected'
      :'status-sent';
}

function card(item){
  const hole=parseHole(item);
  const roles=(hole.roles||[]).map(roleLabel).join(', ');
  const pending=item.status==='INVIATA';
  const canReview=pending&&has('volunteerProposalReview');
  const ready=item.calendarReady===true;
  const month=item.calendarMonth||String(hole.day||'').slice(0,7);

  return `
    <article class="proposal-card proposal-immutable">
      <div class="proposal-head">
        <div>
          <div class="proposal-title">
            ${esc(dateLabel(hole.day))} · ${esc(shiftLabel(hole.shift))}
            · ${esc(siteLabel(hole.site))} · mezzo a ${esc(hole.machine||'—')}
          </div>
          <div class="proposal-meta">
            ${esc(item.id)} · ${esc(item.createdByDisplay||item.createdBy||'')}
            · ${esc(item.createdAt||'')}
          </div>
        </div>
        <span class="proposal-status ${statusClass(item.status)}">
          ${esc(item.status==='INVIATA'?'DA VALUTARE':item.status)}
        </span>
      </div>

      <div class="proposal-body">
        <div class="proposal-line">Orario:
          <strong>${esc(hole.start||'--:--')}–${esc(hole.end||'--:--')}</strong>
        </div>
        <div class="proposal-line">Ruoli richiesti:
          <strong>${esc(roles||'—')}</strong>
        </div>
        ${hole.note?`
          <div class="proposal-line">Nota:
            <strong>${esc(hole.note)}</strong>
          </div>`:''}
        ${item.reviewReason?`
          <div class="proposal-line">Esito:
            <strong>${esc(item.reviewReason)}</strong>
          </div>`:''}

        ${canReview&&!ready?`
          <div class="notice warning">
            <strong>Calendario non ancora registrato come generato e salvato.</strong>
            La proposta può comunque essere valutata: l'approvazione non modifica automaticamente il calendario.
          </div>`:''}

        ${canReview&&ready?`
          <div class="notice success">
            <strong>Calendario mensile verificato.</strong>
          </div>`:''}
      </div>

      ${canReview?`
        <div class="proposal-actions">
          <button class="btn small primary"
                  data-review="${esc(item.id)}" data-decision="APPROVE">
            Approva
          </button>
          <button class="btn small danger"
                  data-review="${esc(item.id)}" data-decision="REJECT">
            Rigetta
          </button>
        </div>`:''}
    </article>
  `;
}

function render(){
  const host=$('#volunteerProposalList');
  if(!host)return;

  const filter=$('#volunteerStatusFilter')?.value||'ALL';
  let items=workspace.proposals||[];

  if(filter!=='ALL'){
    items=items.filter(item=>item.status===filter);
  }

  const subtitle=$('#volunteerListSubtitle');
  if(subtitle){
    subtitle.textContent=
      `${items.length} ${items.length===1?'proposta':'proposte'}`;
  }

  host.innerHTML=items.length
    ?items.map(card).join('')
    :'<div class="volunteer-empty">Nessuna proposta disponibile.</div>';

  $$('[data-review]').forEach(button=>
    button.addEventListener('click',async()=>{
      const decision=button.dataset.decision;
      const reason=decision==='REJECT'
        ?prompt('Motivo del rigetto:','')||''
        :prompt('Nota di approvazione facoltativa:','')||'';

      if(decision==='REJECT'&&!reason)return;
      if(!confirm(decision==='APPROVE'
        ?'Confermi l’approvazione? Il calendario non sarà modificato automaticamente.'
        :'Confermi il rigetto?'
      ))return;

      const auth=getServerAuthContext();

      try{
        await reviewVolunteerProposal({
          url:ATLAS_SERVER_URL,
          token:auth.token,
          proposalId:button.dataset.review,
          decision,
          reason
        });
        await refreshWorkspace({force:true});
      }catch(error){
        alert(error.message);
      }
    })
  );
}

export async function refreshWorkspace({force=false}={}){
  if(!has('volunteerProposalView'))return;

  if(workspaceLoaded&&!force){
    render();
    return workspace;
  }

  if(workspaceLoading&&!force){
    return workspaceLoading;
  }

  const host=$('#volunteerProposalList');
  if(host){
    host.innerHTML=
      '<div class="volunteer-loading">'+
      '<strong>Caricamento proposte…</strong><br>'+
      '<span>Leggo le richieste volontari e lo stato del calendario.</span>'+
      '</div>';
  }

  const auth=getServerAuthContext();

  workspaceLoading=(async()=>{
    try{
      workspace=await loadVolunteerWorkspace({
        url:ATLAS_SERVER_URL,
        token:auth.token
      });

      workspaceLoaded=true;
      render();
      return workspace;
    }finally{
      workspaceLoading=null;
    }
  })();

  return workspaceLoading;
}

export async function initVolunteerCoverage({user:currentUser}={}){
  user=currentUser||{};
  permissions=new Set(user.permissions||[]);

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

  $('#volunteerRefreshBtn')
    ?.addEventListener('click',()=>refreshWorkspace({force:true}));

  $('#volunteerStatusFilter')
    ?.addEventListener('change',render);

  // Lazy load: l'avvio di ATLAS non attende più le proposte volontari.
  // Le richieste vengono lette al primo clic su "Buchi volontari".
  $('#volunteerCoverageNav')
    ?.addEventListener('click',()=>{
      if(has('volunteerProposalView')){
        refreshWorkspace().catch(error=>{
          const host=$('#volunteerProposalList');
          if(host){
            host.innerHTML=
              '<div class="notice warning">'+
              '<strong>Proposte non caricate.</strong><br>'+
              esc(error.message||'Errore di caricamento.')+
              '</div>';
          }
        });
      }
    });
}
