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
let selectedDay='';
let editingId='';

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

  return{
    start:'',
    end:''
  };
}

function draftKey(){
  return(
    'atlas-v22-calendar-draft:'+
    username+':'+
    $('#month').value
  );
}

function saveDraft(){
  const payload={
    month:$('#month').value,
    requests,
    savedAt:new Date().toISOString()
  };

  localStorage.setItem(
    draftKey(),
    JSON.stringify(payload)
  );

  $('#draftStatus').textContent=
    'Salvata alle '+
    new Intl.DateTimeFormat(
      'it-IT',
      {
        hour:'2-digit',
        minute:'2-digit'
      }
    ).format(new Date());
}

function loadDraft(){
  const raw=localStorage.getItem(draftKey());

  if(!raw){
    requests=[];
    $('#draftStatus').textContent=
      'Salvata automaticamente';
    renderAll();
    return;
  }

  try{
    const payload=JSON.parse(raw);

    requests=Array.isArray(payload.requests)
      ?payload.requests
      :[];

    const saved=new Date(payload.savedAt);

    $('#draftStatus').textContent=
      Number.isNaN(saved.getTime())
        ?'Bozza caricata'
        :'Salvata alle '+
          new Intl.DateTimeFormat(
            'it-IT',
            {
              hour:'2-digit',
              minute:'2-digit'
            }
          ).format(saved);
  }catch{
    requests=[];
    $('#draftStatus').textContent=
      'Bozza non leggibile';
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

  return`
    <button class="calendar-day
                   ${weekend?'weekend':''}
                   ${day===todayValue?'today':''}
                   ${dayRequests.length?'has-requests':''}"
            type="button"
            data-day="${esc(day)}">
      <span class="day-top">
        <span class="day-number">${date.getDate()}</span>
        ${dayRequests.length
          ?`<span class="day-total">${dayRequests.length}</span>`
          :''
        }
      </span>

      <span class="day-request-preview">
        ${previews}
        ${more}
      </span>

      <span class="day-add-hint">
        ${dayRequests.length
          ?'Clicca per modificare'
          :'Clicca per aggiungere'
        }
      </span>
    </button>
  `;
}

function renderCalendar(){
  const offset=firstGridOffset();
  const spacers=Array.from(
    {length:offset},
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
  const list=$('#monthRequestList');

  list.innerHTML=[
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

  list.hidden=!requests.length;
  $('#summaryEmpty').hidden=Boolean(requests.length);

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

  $('#requestCount').textContent=
    String(requests.length);

  $('#dayCount').textContent=
    String(days.size);

  $('#summaryCount').textContent=
    String(requests.length);

  $('#summaryMonth').textContent=
    monthLabel($('#month').value);

  $('#sendButton').disabled=
    !requests.length;

  $('#clearDraftButton').disabled=
    !requests.length;
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

function resetForm(){
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

  updateTimesFromShift();
  clearFormMessage();
  renderSelectedDay();
}

function updateTimesFromShift(){
  const shift=$('#shift').value;

  if(!selectedDay)return;

  if(shift==='CUSTOM'){
    $('#start').value='';
    $('#end').value='';
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

  if(editingId){
    requests=requests.map(existing=>
      existing.localId===editingId
        ?item
        :existing
    );

    showFormMessage(
      'Richiesta aggiornata.',
      'success'
    );
  }else{
    if(requests.length>=150){
      showFormMessage(
        'Hai raggiunto il limite di 150 richieste per invio.'
      );
      return;
    }

    requests.push(item);

    showFormMessage(
      'Richiesta aggiunta. Puoi inserirne subito un’altra.',
      'success'
    );
  }

  saveDraft();
  resetForm();
  renderAll();
}

function editRequest(id){
  const item=requests.find(
    request=>request.localId===id
  );

  if(!item)return;

  editingId=id;

  $('#formTitle').textContent=
    'Modifica richiesta';

  $('#saveRequestButton').textContent=
    'Salva modifica';

  $('#shift').value=item.shift;
  $('#site').value=item.site;
  $('#machine').value=item.machine;
  $('#start').value=item.start;
  $('#end').value=item.end;
  $('#note').value=item.note||'';

  ['A','C','S'].forEach(code=>{
    $(`#role${code}`).checked=
      item.roles.includes(code);
  });

  clearFormMessage();
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

  saveDraft();
  renderAll();
}

function deleteRequest(id){
  requests=requests.filter(
    request=>request.localId!==id
  );

  if(editingId===id){
    editingId='';
  }

  saveDraft();
  resetForm();
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
          <button class="day-card-button"
                  type="button"
                  data-edit="${esc(item.localId)}"
                  title="Modifica">✎</button>

          <button class="day-card-button"
                  type="button"
                  data-duplicate="${esc(item.localId)}"
                  title="Duplica">⧉</button>

          <button class="day-card-button delete"
                  type="button"
                  data-delete="${esc(item.localId)}"
                  title="Elimina">×</button>
        </div>
      </div>

      <div class="day-card-meta">
        <span class="day-card-chip">
          Mezzo a ${esc(item.machine)}
        </span>
        <span class="day-card-chip">
          ${esc(roles)}
        </span>
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
      ?`${items.length} ${
          items.length===1
            ?'richiesta presente'
            :'richieste presenti'
        }. Puoi aggiungerne altre.`
      :'Nessuna richiesta presente. Aggiungi la prima.';

  $('#selectedDayCount').textContent=
    String(items.length);

  $('#dayRequestList').innerHTML=
    items.map(dayRequestCard).join('');

  $('#dayRequestList').hidden=
    !items.length;

  $('#dayEmpty').hidden=
    Boolean(items.length);

  $$('[data-edit]').forEach(button=>{
    button.addEventListener(
      'click',
      ()=>editRequest(button.dataset.edit)
    );
  });

  $$('[data-duplicate]').forEach(button=>{
    button.addEventListener(
      'click',
      ()=>duplicateRequest(button.dataset.duplicate)
    );
  });

  $$('[data-delete]').forEach(button=>{
    button.addEventListener(
      'click',
      ()=>deleteRequest(button.dataset.delete)
    );
  });
}

function openDay(day){
  selectedDay=day;
  editingId='';

  $('#dayModal').hidden=false;
  document.body.classList.add('modal-open');

  resetForm();
  renderSelectedDay();

  setTimeout(
    ()=>$('#shift').focus(),
    50
  );
}

function closeDay(){
  $('#dayModal').hidden=true;
  document.body.classList.remove('modal-open');
  selectedDay='';
  editingId='';
  clearFormMessage();
}

function shiftMonth(delta){
  const parts=monthParts($('#month').value);

  if(!parts)return;

  const next=new Date(
    parts.year,
    parts.monthIndex+delta,
    1
  );

  $('#month').value=[
    next.getFullYear(),
    pad(next.getMonth()+1)
  ].join('-');

  selectedDay='';
  editingId='';
  loadDraft();
}

function clearMonth(){
  if(
    !requests.length||
    !confirm(
      'Vuoi eliminare tutte le richieste in bozza del mese selezionato?'
    )
  ){
    return;
  }

  localStorage.removeItem(draftKey());
  requests=[];
  selectedDay='';
  editingId='';

  $('#draftStatus').textContent=
    'Bozza svuotata';

  renderAll();

  $('#result').innerHTML=
    '<div class="notice info">La bozza mensile è stata svuotata.</div>';
}

async function sendAll(){
  if(!requests.length)return;

  if(
    !confirm(
      `Confermi il salvataggio e l’invio di ${requests.length} richieste al Responsabile Operativo?\n\n`+
      'Dopo il salvataggio la bozza del mese verrà cancellata.'
    )
  ){
    return;
  }

  const button=$('#sendButton');
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
    renderAll();

    $('#draftStatus').textContent=
      'Invio completato';

    if(email.sent){
      $('#result').innerHTML=`
        <div class="notice success">
          <strong>${batch.count} richieste salvate e inviate al RO.</strong><br>
          Invio: ${esc(batch.batchId)}
        </div>
      `;
    }else{
      $('#result').innerHTML=`
        <div class="notice warning">
          <strong>${batch.count} richieste salvate correttamente.</strong><br>
          La mail non è stata inviata: ${esc(email.error||'errore non specificato')}.
        </div>
      `;
    }
  }catch(error){
    $('#result').innerHTML=`
      <div class="notice danger">
        <strong>Invio non riuscito.</strong><br>
        ${esc(error.message)}
      </div>
    `;
  }finally{
    button.textContent=
      'Salva e invia tutto al RO';

    button.disabled=
      !requests.length;
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

    if(
      verified.user.profileType!==
      'VOLUNTEER'
    ){
      storeSession({
        token:session.token,
        user:verified.user,
        expiresAt:verified.expiresAt
      });

      location.replace(
        routeForProfile(
          verified.user.profileType
        )
      );

      return;
    }

    token=session.token;
    username=verified.user.username;

    storeSession({
      token,
      user:verified.user,
      expiresAt:verified.expiresAt
    });

    $('#userName').textContent=
      verified.user.displayName||
      verified.user.username;

    $('#month').value=
      currentMonthValue();

    $('#loading').hidden=true;
    $('#pageContent').hidden=false;

    loadDraft();
  }catch(error){
    console.error(error);
    location.replace('index.html');
  }
}

$('#logoutButton')
  .addEventListener('click',logout);

$('#previousMonthButton')
  .addEventListener(
    'click',
    ()=>shiftMonth(-1)
  );

$('#nextMonthButton')
  .addEventListener(
    'click',
    ()=>shiftMonth(1)
  );

$('#month')
  .addEventListener(
    'change',
    ()=>{
      closeDay();
      loadDraft();
    }
  );

$('#clearDraftButton')
  .addEventListener(
    'click',
    clearMonth
  );

$('#sendButton')
  .addEventListener(
    'click',
    sendAll
  );

$('#closeModalButton')
  .addEventListener(
    'click',
    closeDay
  );

$('#finishDayButton')
  .addEventListener(
    'click',
    closeDay
  );

$('#dayModal')
  .addEventListener(
    'click',
    event=>{
      if(
        event.target===
        $('#dayModal')
      ){
        closeDay();
      }
    }
  );

document.addEventListener(
  'keydown',
  event=>{
    if(
      event.key==='Escape'&&
      !$('#dayModal').hidden
    ){
      closeDay();
    }
  }
);

$('#shift')
  .addEventListener(
    'change',
    updateTimesFromShift
  );

$('#site')
  .addEventListener(
    'change',
    ()=>{
      if(
        ['S','SU'].includes(
          $('#site').value
        )
      ){
        $('#machine').value='3';
      }
    }
  );

$('#requestForm')
  .addEventListener(
    'submit',
    saveRequest
  );

$('#resetFormButton')
  .addEventListener(
    'click',
    resetForm
  );

boot();
