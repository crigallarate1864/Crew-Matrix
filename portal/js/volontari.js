import {api} from './api.js';
import {
  readSession,
  storeSession,
  routeForProfile,
  logout
} from './session.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];

let token='';
let username='';
let requests=[];
let formDrafts={};
let selectedDay='';
let editingId='';
let autosaveTimer=null;

function uid(){
  return(
    'LOCAL-'+
    Date.now().toString(36)+'-'+
    Math.random().toString(36).slice(2,8)
  );
}

function esc(value){
  return String(value??'').replace(
    /[&<>"']/g,
    character=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[character]
  ));
}

function pad(value){
  return String(value).padStart(2,'0');
}

function currentMonthValue(){
  const now=new Date();

  return[
    now.getFullYear(),
    pad(now.getMonth()+1)
  ].join('-');
}

function monthParts(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})$/);

  if(!match)return null;

  return{
    year:Number(match[1]),
    month:Number(match[2]),
    monthIndex:Number(match[2])-1
  };
}

function monthLabel(value){
  const parts=monthParts(value);

  if(!parts)return'Mese';

  const names=[
    'Gennaio','Febbraio','Marzo','Aprile',
    'Maggio','Giugno','Luglio','Agosto',
    'Settembre','Ottobre','Novembre','Dicembre'
  ];

  return`${names[parts.monthIndex]} ${parts.year}`;
}

function formatDate(value){
  const match=String(value||'').match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  return match
    ?`${match[3]}-${match[2]}-${match[1]}`
    :String(value||'');
}

function longDate(value){
  const date=new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat(
    'it-IT',
    {
      weekday:'long',
      day:'2-digit',
      month:'long',
      year:'numeric'
    }
  ).format(date);
}

function shiftLabel(code){
  return({
    M:'Mattina',
    P:'Pomeriggio',
    N:'Notte',
    CUSTOM:'Orario personalizzato'
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

function defaultTimes(day,shift){
  const dayOfWeek=
    new Date(`${day}T00:00:00`).getDay();

  if(shift==='M'){
    return{
      start:dayOfWeek===0?'08:00':'06:00',
      end:dayOfWeek===0?'14:00':'13:30'
    };
  }

  if(shift==='P'){
    return{
      start:dayOfWeek===0?'14:00':'13:00',
      end:(dayOfWeek===0||dayOfWeek===6)
        ?'20:00'
        :'20:30'
    };
  }

  if(shift==='N'){
    return{
      start:(dayOfWeek===0||dayOfWeek===6)
        ?'20:00'
        :'20:30',
      end:dayOfWeek===6?'08:00':'06:00'
    };
  }

  return{start:'',end:''};
}

function draftKey(){
  return(
    'atlas-v23-calendar-workspace:'+
    username+':'+
    $('#month').value
  );
}

function blankForm(day){
  const times=defaultTimes(day,'M');

  return{
    editingId:'',
    shift:'M',
    site:'G',
    start:times.start,
    end:times.end,
    machine:'3',
    roles:[],
    note:''
  };
}

function formSnapshot(){
  return{
    editingId:editingId||'',
    shift:$('#shift').value,
    site:$('#site').value,
    start:$('#start').value,
    end:$('#end').value,
    machine:$('#machine').value,
    roles:['A','C','S'].filter(
      code=>$(`#role${code}`).checked
    ),
    note:$('#note').value.trim(),
    savedAt:new Date().toISOString()
  };
}

function snapshotHasContent(snapshot,day){
  if(!snapshot)return false;

  const blank=blankForm(day);

  return Boolean(
    snapshot.editingId||
    snapshot.shift!==blank.shift||
    snapshot.site!==blank.site||
    snapshot.start!==blank.start||
    snapshot.end!==blank.end||
    snapshot.machine!==blank.machine||
    (snapshot.roles||[]).length||
    snapshot.note
  );
}

function pendingDraftEntries(){
  return Object.entries(formDrafts)
    .filter(([day,snapshot])=>
      snapshotHasContent(snapshot,day)
    )
    .sort(([left],[right])=>
      left.localeCompare(right)
    );
}

function persistWorkspace({showStatus=true}={}){
  const payload={
    month:$('#month').value,
    requests,
    formDrafts,
    savedAt:new Date().toISOString()
  };

  localStorage.setItem(
    draftKey(),
    JSON.stringify(payload)
  );

  if(showStatus){
    const time=
      new Intl.DateTimeFormat(
        'it-IT',
        {
          hour:'2-digit',
          minute:'2-digit',
          second:'2-digit'
        }
      ).format(new Date());

    $('#draftStatus').textContent=
      `Salvato alle ${time}`;

    $('#formAutosaveState').textContent=
      `Salvato alle ${time}`;
  }
}

function saveActiveFormDraft(){
  if(!selectedDay)return;

  const snapshot=formSnapshot();

  if(snapshotHasContent(snapshot,selectedDay)){
    formDrafts[selectedDay]=snapshot;
  }else{
    delete formDrafts[selectedDay];
  }
}

function scheduleAutosave(){
  clearTimeout(autosaveTimer);

  autosaveTimer=setTimeout(
    ()=>{
      saveActiveFormDraft();
      persistWorkspace();
      renderStats();
      renderCalendar();
    },
    120
  );
}

function loadWorkspace(){
  const raw=localStorage.getItem(draftKey());

  requests=[];
  formDrafts={};
  selectedDay='';
  editingId='';

  if(raw){
    try{
      const payload=JSON.parse(raw);

      requests=Array.isArray(payload.requests)
        ?payload.requests
        :[];

      formDrafts=
        payload.formDrafts&&
        typeof payload.formDrafts==='object'
          ?payload.formDrafts
          :{};

      const saved=new Date(payload.savedAt);

      $('#draftStatus').textContent=
        Number.isNaN(saved.getTime())
          ?'Bozza caricata'
          :'Ultimo salvataggio '+
            new Intl.DateTimeFormat(
              'it-IT',
              {
                day:'2-digit',
                month:'2-digit',
                hour:'2-digit',
                minute:'2-digit'
              }
            ).format(saved);
    }catch{
      requests=[];
      formDrafts={};
      $('#draftStatus').textContent=
        'Bozza non leggibile';
    }
  }else{
    $('#draftStatus').textContent=
      'Salvataggio automatico attivo';
  }

  renderAll();
}

function requestsForDay(day){
  return requests
    .filter(item=>item.day===day)
    .sort(requestSort);
}

function requestSort(left,right){
  return(
    left.day.localeCompare(right.day)||
    left.start.localeCompare(right.start)||
    left.shift.localeCompare(right.shift)
  );
}

function monthDays(){
  const parts=monthParts($('#month').value);

  if(!parts)return[];

  const total=
    new Date(
      parts.year,
      parts.monthIndex+1,
      0
    ).getDate();

  return Array.from(
    {length:total},
    (_,index)=>[
      parts.year,
      pad(parts.month),
      pad(index+1)
    ].join('-')
  );
}

function firstGridOffset(){
  const parts=monthParts($('#month').value);

  if(!parts)return 0;

  const nativeDay=
    new Date(
      parts.year,
      parts.monthIndex,
      1
    ).getDay();

  return nativeDay===0?6:nativeDay-1;
}

function previewText(item){
  return(
    shiftLabel(item.shift)+
    ' · '+
    item.start+
    ' · '+
    item.roles.map(roleLabel).join('/')
  );
}

function dayHtml(day){
  const date=new Date(`${day}T00:00:00`);
  const dayRequests=requestsForDay(day);
  const hasPending=
    snapshotHasContent(formDrafts[day],day);

  const today=new Date();
  const todayValue=[
    today.getFullYear(),
    pad(today.getMonth()+1),
    pad(today.getDate())
  ].join('-');

  const weekend=
    date.getDay()===0||
    date.getDay()===6;

  const previews=dayRequests
    .slice(0,3)
    .map(item=>
      `<span class="day-preview-line">${esc(previewText(item))}</span>`
    )
    .join('');

  const more=dayRequests.length>3
    ?`<span class="day-preview-more">+${dayRequests.length-3} altre</span>`
    :'';

  const pending=hasPending
    ?'<span class="day-preview-pending">Modulo in compilazione</span>'
    :'';

  return`
    <button class="calendar-day
                   ${weekend?'weekend':''}
                   ${day===todayValue?'today':''}
                   ${dayRequests.length?'has-requests':''}
                   ${hasPending?'has-pending-draft':''}"
            type="button"
            data-day="${esc(day)}">

      <span class="day-top">
        <span class="day-number">${date.getDate()}</span>

        <span class="day-badges">
          ${dayRequests.length
            ?`<span class="day-total">${dayRequests.length}</span>`
            :''
          }
          ${hasPending
            ?'<span class="day-pending">!</span>'
            :''
          }
        </span>
      </span>

      <span class="day-request-preview">
        ${previews}
        ${more}
        ${pending}
      </span>

      <span class="day-add-hint">
        ${dayRequests.length||hasPending
          ?'Clicca per continuare'
          :'Clicca per aggiungere'
        }
      </span>
    </button>
  `;
}

function renderCalendar(){
  const spacers=Array.from(
    {length:firstGridOffset()},
    ()=>'<div class="calendar-spacer"></div>'
  ).join('');

  $('#monthGrid').innerHTML=
    spacers+
    monthDays().map(dayHtml).join('');

  $$('[data-day]').forEach(button=>{
    button.addEventListener(
      'click',
      ()=>openDay(button.dataset.day)
    );
  });
}

function groupedRequests(){
  const groups=new Map();

  [...requests]
    .sort(requestSort)
    .forEach(item=>{
      if(!groups.has(item.day)){
        groups.set(item.day,[]);
      }

      groups.get(item.day).push(item);
    });

  return groups;
}

function renderSummary(){
  const groups=groupedRequests();

  $('#monthRequestList').innerHTML=[
    ...groups.entries()
  ].map(([day,items])=>`
    <section class="summary-day-group">
      <header class="summary-day-header">
        <strong>${esc(formatDate(day))}</strong>
        <span>${items.length}</span>
      </header>

      ${items.map(item=>`
        <button class="summary-request-line"
                type="button"
                data-summary-day="${esc(day)}">
          ${esc(
            shiftLabel(item.shift)+
            ' · '+
            item.start+'–'+item.end+
            ' · '+
            siteLabel(item.site)
          )}
        </button>
      `).join('')}
    </section>
  `).join('');

  $('#monthRequestList').hidden=
    !requests.length;

  $('#summaryEmpty').hidden=
    Boolean(requests.length);

  $$('[data-summary-day]').forEach(button=>{
    button.addEventListener(
      'click',
      ()=>openDay(button.dataset.summaryDay)
    );
  });
}

function renderStats(){
  const days=new Set(
    requests.map(item=>item.day)
  );

  const pendingCount=
    pendingDraftEntries().length;

  $('#requestCount').textContent=
    String(requests.length);

  $('#dayCount').textContent=
    String(days.size);

  $('#pendingDraftCount').textContent=
    String(pendingCount);

  $('#summaryCount').textContent=
    String(requests.length);

  $('#summaryMonth').textContent=
    monthLabel($('#month').value);

  $('#openReviewButton').disabled=
    !requests.length&&!pendingCount;

  $('#clearDraftButton').disabled=
    !requests.length&&!pendingCount;
}

function renderAll(){
  requests.sort(requestSort);
  renderCalendar();
  renderSummary();
  renderStats();

  if(selectedDay){
    renderSelectedDay();
  }
}

function showFormMessage(message,type='warning'){
  const host=$('#formMessage');
  host.textContent=message;
  host.dataset.type=type;
}

function clearFormMessage(){
  showFormMessage('','');
}

function resetFormValues(){
  editingId='';

  $('#formTitle').textContent=
    'Nuova richiesta';

  $('#saveRequestButton').textContent=
    'Aggiungi richiesta';

  $('#shift').value='M';
  $('#site').value='G';
  $('#machine').value='3';
  $('#note').value='';

  ['A','C','S'].forEach(code=>{
    $(`#role${code}`).checked=false;
  });

  const times=defaultTimes(selectedDay,'M');
  $('#start').value=times.start;
  $('#end').value=times.end;
  clearFormMessage();
}

function clearSelectedDayDraft(){
  if(!selectedDay)return;

  delete formDrafts[selectedDay];
  persistWorkspace();
  resetFormValues();
  renderAll();
}

function restoreFormDraft(day){
  const snapshot=formDrafts[day];

  if(!snapshot){
    resetFormValues();
    return;
  }

  editingId=snapshot.editingId||'';

  $('#formTitle').textContent=
    editingId
      ?'Modifica richiesta'
      :'Nuova richiesta';

  $('#saveRequestButton').textContent=
    editingId
      ?'Salva modifica'
      :'Aggiungi richiesta';

  $('#shift').value=snapshot.shift||'M';
  $('#site').value=snapshot.site||'G';
  $('#machine').value=snapshot.machine||'3';
  $('#start').value=snapshot.start||'';
  $('#end').value=snapshot.end||'';
  $('#note').value=snapshot.note||'';

  ['A','C','S'].forEach(code=>{
    $(`#role${code}`).checked=
      (snapshot.roles||[]).includes(code);
  });

  clearFormMessage();
}

function updateTimesFromShift(){
  const shift=$('#shift').value;

  if(!selectedDay)return;

  if(shift==='CUSTOM'){
    $('#start').value='';
    $('#end').value='';
    scheduleAutosave();
    return;
  }

  const times=defaultTimes(
    selectedDay,
    shift
  );

  $('#start').value=times.start;
  $('#end').value=times.end;

  if(shift==='N'){
    $('#machine').value='3';
  }

  scheduleAutosave();
}

function selectedRoles(){
  return ['A','C','S'].filter(
    code=>$(`#role${code}`).checked
  );
}

function validateForm(){
  const roles=selectedRoles();
  const shift=$('#shift').value;
  const site=$('#site').value;
  const machine=$('#machine').value;
  const start=$('#start').value;
  const end=$('#end').value;

  if(!roles.length){
    return'Seleziona almeno un ruolo mancante.';
  }

  if(
    !/^\d{2}:\d{2}$/.test(start)||
    !/^\d{2}:\d{2}$/.test(end)
  ){
    return'Inserisci un orario valido.';
  }

  if(shift==='N'&&machine!=='3'){
    return'La notte richiede un equipaggio a 3.';
  }

  if(
    ['S','SU'].includes(site)&&
    machine!=='3'
  ){
    return'Somma e Sumirago richiedono un equipaggio a 3.';
  }

  return'';
}

function formRequest(){
  return{
    localId:editingId||uid(),
    day:selectedDay,
    shift:$('#shift').value,
    start:$('#start').value,
    end:$('#end').value,
    site:$('#site').value,
    machine:$('#shift').value==='N'
      ?'3'
      :$('#machine').value,
    roles:selectedRoles(),
    note:$('#note').value.trim()
  };
}

function saveRequest(event){
  event.preventDefault();

  const error=validateForm();

  if(error){
    showFormMessage(error);
    return;
  }

  const item=formRequest();
  const wasEditing=Boolean(editingId);

  if(wasEditing){
    requests=requests.map(existing=>
      existing.localId===editingId
        ?item
        :existing
    );
  }else{
    if(requests.length>=150){
      showFormMessage(
        'Hai raggiunto il limite di 150 richieste per invio.'
      );
      return;
    }

    requests.push(item);
  }

  delete formDrafts[selectedDay];
  persistWorkspace();
  resetFormValues();

  showFormMessage(
    wasEditing
      ?'Richiesta aggiornata.'
      :'Richiesta aggiunta. Puoi inserirne subito un’altra.',
    'success'
  );

  renderAll();
}

function editRequest(id){
  const item=requests.find(
    request=>request.localId===id
  );

  if(!item)return;

  editingId=id;

  formDrafts[item.day]={
    editingId:id,
    shift:item.shift,
    site:item.site,
    start:item.start,
    end:item.end,
    machine:item.machine,
    roles:[...item.roles],
    note:item.note||'',
    savedAt:new Date().toISOString()
  };

  persistWorkspace({showStatus:false});
  restoreFormDraft(item.day);
  renderSelectedDay();

  $('.request-form-section')
    ?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
}

function duplicateRequest(id){
  const item=requests.find(
    request=>request.localId===id
  );

  if(!item||requests.length>=150)return;

  requests.push({
    ...item,
    localId:uid(),
    roles:[...item.roles]
  });

  persistWorkspace();
  renderAll();
}

function deleteRequest(id){
  requests=requests.filter(
    request=>request.localId!==id
  );

  if(editingId===id){
    editingId='';
    delete formDrafts[selectedDay];
  }

  persistWorkspace();
  resetFormValues();
  renderAll();
}

function dayRequestCard(item){
  const roles=item.roles
    .map(roleLabel)
    .join(', ');

  return`
    <article class="day-request-card
                    ${editingId===item.localId?'active-edit':''}">
      <div class="day-card-top">
        <div class="day-card-title">
          ${esc(shiftLabel(item.shift))}
          · ${esc(item.start)}–${esc(item.end)}
          · ${esc(siteLabel(item.site))}
        </div>

        <div class="day-card-actions">
          <button class="day-card-button" type="button"
                  data-edit="${esc(item.localId)}" title="Modifica">✎</button>
          <button class="day-card-button" type="button"
                  data-duplicate="${esc(item.localId)}" title="Duplica">⧉</button>
          <button class="day-card-button delete" type="button"
                  data-delete="${esc(item.localId)}" title="Elimina">×</button>
        </div>
      </div>

      <div class="day-card-meta">
        <span class="day-card-chip">Mezzo a ${esc(item.machine)}</span>
        <span class="day-card-chip">${esc(roles)}</span>
      </div>

      ${item.note
        ?`<div class="day-card-note">${esc(item.note)}</div>`
        :''
      }
    </article>
  `;
}

function renderSelectedDay(){
  if(!selectedDay)return;

  const items=requestsForDay(selectedDay);

  $('#dayModalTitle').textContent=
    longDate(selectedDay);

  $('#dayModalSubtitle').textContent=
    items.length
      ?`${items.length} ${items.length===1?'richiesta presente':'richieste presenti'}. Puoi aggiungerne altre.`
      :'Nessuna richiesta presente. Aggiungi la prima.';

  $('#selectedDayCount').textContent=
    String(items.length);

  $('#dayRequestList').innerHTML=
    items.map(dayRequestCard).join('');

  $('#dayRequestList').hidden=!items.length;
  $('#dayEmpty').hidden=Boolean(items.length);

  $$('[data-edit]').forEach(button=>{
    button.addEventListener('click',()=>editRequest(button.dataset.edit));
  });
  $$('[data-duplicate]').forEach(button=>{
    button.addEventListener('click',()=>duplicateRequest(button.dataset.duplicate));
  });
  $$('[data-delete]').forEach(button=>{
    button.addEventListener('click',()=>deleteRequest(button.dataset.delete));
  });
}

function openDay(day){
  selectedDay=day;
  editingId='';

  $('#dayModal').hidden=false;
  document.body.classList.add('modal-open');

  restoreFormDraft(day);
  renderSelectedDay();

  setTimeout(()=>$('#shift').focus(),50);
}

function closeDay(){
  if(selectedDay){
    saveActiveFormDraft();
    persistWorkspace();
  }

  $('#dayModal').hidden=true;
  document.body.classList.remove('modal-open');
  selectedDay='';
  editingId='';
  clearFormMessage();
  renderAll();
}

function shiftMonth(delta){
  const parts=monthParts($('#month').value);

  if(!parts)return;

  const next=new Date(
    parts.year,
    parts.monthIndex+delta,
    1
  );

  if(selectedDay)closeDay();

  $('#month').value=[
    next.getFullYear(),
    pad(next.getMonth()+1)
  ].join('-');

  loadWorkspace();
}

function clearMonth(){
  if(!requests.length&&!pendingDraftEntries().length)return;

  if(!confirm('Vuoi eliminare tutte le richieste e tutti i moduli in sospeso del mese selezionato?')){
    return;
  }

  localStorage.removeItem(draftKey());
  requests=[];
  formDrafts={};
  selectedDay='';
  editingId='';

  $('#draftStatus').textContent='Bozza svuotata';
  renderAll();
  $('#result').innerHTML='<div class="notice info">La bozza mensile è stata svuotata.</div>';
}

function reviewRequestHtml(item){
  const roles=item.roles.map(roleLabel).join(', ');

  return`
    <article class="review-request">
      <div>
        <div class="review-request-title">
          ${esc(shiftLabel(item.shift))} · ${esc(item.start)}–${esc(item.end)} · ${esc(siteLabel(item.site))}
        </div>
        <div class="review-request-meta">
          <span class="review-request-chip">Mezzo a ${esc(item.machine)}</span>
          <span class="review-request-chip">${esc(roles)}</span>
        </div>
        ${item.note?`<div class="review-request-note">${esc(item.note)}</div>`:''}
      </div>
      <div class="review-request-actions">
        <button class="review-action" type="button" data-review-edit="${esc(item.localId)}">Modifica</button>
        <button class="review-action" type="button" data-review-duplicate="${esc(item.localId)}">Duplica</button>
        <button class="review-action delete" type="button" data-review-delete="${esc(item.localId)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderReview(){
  const groups=groupedRequests();
  const pending=pendingDraftEntries();
  const days=new Set(requests.map(item=>item.day));

  $('#reviewMonth').textContent=monthLabel($('#month').value);
  $('#reviewRequestCount').textContent=String(requests.length);
  $('#reviewDayCount').textContent=String(days.size);
  $('#reviewPendingCount').textContent=String(pending.length);

  $('#reviewList').innerHTML=[...groups.entries()].map(([day,items])=>`
    <section class="review-day-group">
      <header class="review-day-header">
        <strong>${esc(longDate(day))}</strong>
        <span>${items.length} ${items.length===1?'richiesta':'richieste'}</span>
      </header>
      ${items.map(reviewRequestHtml).join('')}
    </section>
  `).join('');

  $('#reviewList').hidden=!requests.length;
  $('#reviewEmpty').hidden=Boolean(requests.length);
  $('#pendingDraftWarning').hidden=!pending.length;

  $('#pendingDraftList').innerHTML=pending.map(([day])=>`
    <button class="pending-draft-button" type="button" data-open-pending="${esc(day)}">
      Completa ${esc(formatDate(day))}
    </button>
  `).join('');

  $('#finalSendButton').disabled=!requests.length||Boolean(pending.length);

  $$('[data-review-edit]').forEach(button=>{
    button.addEventListener('click',()=>{
      const item=requests.find(entry=>entry.localId===button.dataset.reviewEdit);
      if(!item)return;
      closeReview();
      openDay(item.day);
      editRequest(item.localId);
    });
  });

  $$('[data-review-duplicate]').forEach(button=>{
    button.addEventListener('click',()=>{
      duplicateRequest(button.dataset.reviewDuplicate);
      renderReview();
    });
  });

  $$('[data-review-delete]').forEach(button=>{
    button.addEventListener('click',()=>{
      deleteRequest(button.dataset.reviewDelete);
      renderReview();
    });
  });

  $$('[data-open-pending]').forEach(button=>{
    button.addEventListener('click',()=>{
      closeReview();
      openDay(button.dataset.openPending);
    });
  });
}

function openReview(){
  if(!requests.length&&!pendingDraftEntries().length)return;

  if(selectedDay)closeDay();

  $('#reviewModal').hidden=false;
  document.body.classList.add('modal-open');
  $('#reviewResult').innerHTML='';
  renderReview();
}

function closeReview(){
  $('#reviewModal').hidden=true;
  document.body.classList.remove('modal-open');
}

async function sendAll(){
  const pending=pendingDraftEntries();

  if(pending.length){
    $('#reviewResult').innerHTML=`
      <div class="notice warning">
        Completa o elimina i ${pending.length} moduli ancora in compilazione prima dell’invio definitivo.
      </div>
    `;
    return;
  }

  if(!requests.length)return;

  if(!confirm(
    `Confermi l’invio definitivo di ${requests.length} richieste al Responsabile Operativo?\n\n`+
    'Le richieste verranno salvate nel foglio e verrà inviata una sola mail riepilogativa.'
  ))return;

  const button=$('#finalSendButton');
  button.disabled=true;
  button.textContent='Salvataggio e invio…';

  try{
    const result=await api({
      action:'submitVolunteerProposalBatch',
      token,
      proposals:requests.map(item=>({
        day:item.day,
        shift:item.shift,
        start:item.start,
        end:item.end,
        site:item.site,
        machine:item.machine,
        roles:item.roles,
        note:item.note
      })),
      sendEmail:true
    },{timeout:60000});

    const batch=result.batch;
    const email=batch.email||{};

    localStorage.removeItem(draftKey());
    requests=[];
    formDrafts={};
    renderAll();
    $('#draftStatus').textContent='Invio completato';

    if(email.sent){
      $('#reviewResult').innerHTML=`
        <div class="notice success">
          <strong>${batch.count} richieste salvate e inviate definitivamente al RO.</strong><br>
          Invio: ${esc(batch.batchId)}
        </div>
      `;
    }else{
      $('#reviewResult').innerHTML=`
        <div class="notice warning">
          <strong>${batch.count} richieste salvate correttamente.</strong><br>
          La mail non è stata inviata: ${esc(email.error||'errore non specificato')}.
        </div>
      `;
    }

    $('#finalSendButton').disabled=true;
  }catch(error){
    $('#reviewResult').innerHTML=`
      <div class="notice danger">
        <strong>Invio non riuscito.</strong><br>${esc(error.message)}
      </div>
    `;
    button.disabled=false;
  }finally{
    button.textContent='Invia definitivamente al RO';
  }
}

async function boot(){
  const session=readSession();

  if(!session?.token){
    location.replace('index.html');
    return;
  }

  try{
    const verified=await api({
      action:'session',
      token:session.token
    },{timeout:15000});

    if(verified.user.profileType!=='VOLUNTEER'){
      storeSession({
        token:session.token,
        user:verified.user,
        expiresAt:verified.expiresAt
      });
      location.replace(routeForProfile(verified.user.profileType));
      return;
    }

    token=session.token;
    username=verified.user.username;

    storeSession({
      token,
      user:verified.user,
      expiresAt:verified.expiresAt
    });

    $('#userName').textContent=verified.user.displayName||verified.user.username;
    $('#month').value=currentMonthValue();
    $('#loading').hidden=true;
    $('#pageContent').hidden=false;
    loadWorkspace();
  }catch(error){
    console.error(error);
    location.replace('index.html');
  }
}

$('#logoutButton').addEventListener('click',logout);
$('#previousMonthButton').addEventListener('click',()=>shiftMonth(-1));
$('#nextMonthButton').addEventListener('click',()=>shiftMonth(1));
$('#month').addEventListener('change',()=>{
  if(selectedDay)closeDay();
  closeReview();
  loadWorkspace();
});
$('#clearDraftButton').addEventListener('click',clearMonth);
$('#openReviewButton').addEventListener('click',openReview);
$('#closeModalButton').addEventListener('click',closeDay);
$('#finishDayButton').addEventListener('click',closeDay);
$('#dayModal').addEventListener('click',event=>{
  if(event.target===$('#dayModal'))closeDay();
});
$('#closeReviewButton').addEventListener('click',closeReview);
$('#backToCalendarButton').addEventListener('click',closeReview);
$('#reviewModal').addEventListener('click',event=>{
  if(event.target===$('#reviewModal'))closeReview();
});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!$('#reviewModal').hidden){closeReview();return;}
  if(!$('#dayModal').hidden)closeDay();
});

$('#shift').addEventListener('change',updateTimesFromShift);
$('#site').addEventListener('change',()=>{
  if(['S','SU'].includes($('#site').value)){
    $('#machine').value='3';
  }
  scheduleAutosave();
});

[
  '#start','#end','#machine','#note','#roleA','#roleC','#roleS'
].forEach(selector=>{
  $(selector).addEventListener('input',scheduleAutosave);
  $(selector).addEventListener('change',scheduleAutosave);
});

$('#requestForm').addEventListener('submit',saveRequest);
$('#resetFormButton').addEventListener('click',()=>{
  resetFormValues();
  scheduleAutosave();
});
$('#discardFormDraftButton').addEventListener('click',clearSelectedDayDraft);
$('#finalSendButton').addEventListener('click',sendAll);

window.addEventListener('beforeunload',()=>{
  saveActiveFormDraft();
  persistWorkspace({showStatus:false});
});

boot();
