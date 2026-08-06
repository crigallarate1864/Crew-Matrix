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
let mode='single';
let requests=[];
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
    }[character])
  );
}

function showResult(target,type,html){
  $(target).innerHTML=`<div class="notice ${type}">${html}</div>`;
}

function monthBounds(month){
  const match=String(month||'').match(/^(\d{4})-(\d{2})$/);
  if(!match)return null;

  const year=Number(match[1]);
  const monthIndex=Number(match[2])-1;
  const lastDay=new Date(year,monthIndex+1,0).getDate();

  return{
    first:`${match[1]}-${match[2]}-01`,
    last:`${match[1]}-${match[2]}-${String(lastDay).padStart(2,'0')}`,
    year,
    monthIndex,
    lastDay
  };
}

function formatDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}-${match[2]}-${match[1]}`:String(value||'');
}

function monthLabel(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
  if(!match)return'—';

  const names=[
    'Gennaio','Febbraio','Marzo','Aprile',
    'Maggio','Giugno','Luglio','Agosto',
    'Settembre','Ottobre','Novembre','Dicembre'
  ];

  return`${names[Number(match[2])-1]} ${match[1]}`;
}

function shiftLabel(code){
  return({
    M:'Mattina',
    P:'Pomeriggio',
    N:'Notte',
    CUSTOM:'Orario personalizzato'
  })[code]||code;
}

function roleLabel(code){
  return({
    A:'Autista',
    C:'Capo equipaggio',
    S:'Soccorritore'
  })[code]||code;
}

function siteLabel(code){
  return({
    G:'Gallarate',
    S:'Somma Lombardo',
    SU:'Sumirago'
  })[code]||code;
}

function defaultTimes(day,shift){
  const dow=new Date(`${day}T00:00:00`).getDay();

  if(shift==='M'){
    return{
      start:dow===0?'08:00':'06:00',
      end:dow===0?'14:00':'13:30'
    };
  }

  if(shift==='P'){
    return{
      start:dow===0?'14:00':'13:00',
      end:(dow===0||dow===6)?'20:00':'20:30'
    };
  }

  if(shift==='N'){
    return{
      start:(dow===0||dow===6)?'20:00':'20:30',
      end:dow===6?'08:00':'06:00'
    };
  }

  return{
    start:$('#customStart').value,
    end:$('#customEnd').value
  };
}

function draftKey(){
  return`atlas-v21-volunteer-draft:${username}:${$('#month').value}`;
}

function selectedWeekdays(){
  return new Set(
    $$('[data-weekday]:checked')
      .map(input=>Number(input.dataset.weekday))
  );
}

function selectedShifts(){
  return $$('[data-shift]:checked')
    .map(input=>input.dataset.shift);
}

function selectedRoles(){
  return ['A','C','S'].filter(
    code=>$(`#role${code}`).checked
  );
}

function datesInRange(start,end,weekdays){
  const result=[];
  const cursor=new Date(`${start}T00:00:00`);
  const finish=new Date(`${end}T00:00:00`);

  while(cursor<=finish){
    if(weekdays.has(cursor.getDay())){
      result.push([
        cursor.getFullYear(),
        String(cursor.getMonth()+1).padStart(2,'0'),
        String(cursor.getDate()).padStart(2,'0')
      ].join('-'));
    }

    cursor.setDate(cursor.getDate()+1);
  }

  return result;
}

function selectedDates(){
  const month=$('#month').value;
  const bounds=monthBounds(month);
  const weekdays=selectedWeekdays();

  if(!bounds)return[];

  if(mode==='single'){
    const day=$('#singleDay').value;
    if(!day)return[];
    return weekdays.has(
      new Date(`${day}T00:00:00`).getDay()
    )?[day]:[];
  }

  if(mode==='range'){
    const start=$('#rangeStart').value;
    const end=$('#rangeEnd').value;

    if(!start||!end||start>end)return[];

    return datesInRange(start,end,weekdays);
  }

  return datesInRange(
    bounds.first,
    bounds.last,
    weekdays
  );
}

function validateBuilder(){
  const month=$('#month').value;
  const dates=selectedDates();
  const shifts=selectedShifts();
  const roles=selectedRoles();

  if(!month)return'Seleziona il mese.';
  if(!dates.length)return'Seleziona almeno una data valida.';
  if(!shifts.length)return'Seleziona almeno un turno.';
  if(!roles.length)return'Seleziona almeno un ruolo mancante.';

  if(
    shifts.includes('CUSTOM')&&
    (
      !/^\d{2}:\d{2}$/.test($('#customStart').value)||
      !/^\d{2}:\d{2}$/.test($('#customEnd').value)
    )
  ){
    return'Inserisci gli orari del turno personalizzato.';
  }

  if(
    ['S','SU'].includes($('#site').value)&&
    $('#machine').value!=='3'
  ){
    return'Somma e Sumirago richiedono un equipaggio a 3.';
  }

  return'';
}

function buildRequests(){
  const dates=selectedDates();
  const shifts=selectedShifts();
  const roles=selectedRoles();
  const site=$('#site').value;
  const note=$('#note').value.trim();
  let machine=$('#machine').value;

  const output=[];

  dates.forEach(day=>{
    shifts.forEach(shift=>{
      if(shift==='N')machine='3';

      const times=defaultTimes(day,shift);

      output.push({
        localId:uid(),
        day,
        shift,
        start:times.start,
        end:times.end,
        site,
        machine:shift==='N'?'3':$('#machine').value,
        roles:[...roles],
        note
      });
    });
  });

  return output;
}

function requestSort(left,right){
  return(
    left.day.localeCompare(right.day)||
    left.start.localeCompare(right.start)||
    left.shift.localeCompare(right.shift)
  );
}

function saveDraft({silent=false}={}){
  const payload={
    month:$('#month').value,
    requests,
    savedAt:new Date().toISOString()
  };

  localStorage.setItem(
    draftKey(),
    JSON.stringify(payload)
  );

  renderStats(payload.savedAt);

  if(!silent){
    showResult(
      '#result',
      'success',
      '<strong>Bozza salvata sul dispositivo.</strong>'
    );
  }
}

function loadDraft(){
  const raw=localStorage.getItem(draftKey());

  if(!raw){
    requests=[];
    render();
    return;
  }

  try{
    const payload=JSON.parse(raw);
    requests=Array.isArray(payload.requests)
      ?payload.requests
      :[];
    render(payload.savedAt);
  }catch{
    requests=[];
    render();
  }
}

function clearDraft(){
  if(
    requests.length&&
    !confirm('Vuoi eliminare tutte le richieste in bozza?')
  ){
    return;
  }

  localStorage.removeItem(draftKey());
  requests=[];
  editingId='';
  render();

  showResult(
    '#result',
    'info',
    'La lista è stata svuotata.'
  );
}

function renderStats(savedAt){
  const days=new Set(requests.map(item=>item.day));

  $('#requestCount').textContent=String(requests.length);
  $('#dayCount').textContent=String(days.size);
  $('#monthLabel').textContent=monthLabel($('#month').value);

  const date=savedAt?new Date(savedAt):null;

  $('#savedAt').textContent=
    date&&!Number.isNaN(date.getTime())
      ?new Intl.DateTimeFormat(
          'it-IT',
          {
            day:'2-digit',
            month:'2-digit',
            hour:'2-digit',
            minute:'2-digit'
          }
        ).format(date)
      :'Mai';

  $('#draftState').textContent=
    requests.length
      ?`${requests.length} in bozza`
      :'Bozza vuota';
}

function itemHtml(item){
  const dateParts=formatDate(item.day).split('-');
  const roles=item.roles.map(roleLabel).join(', ');

  return`
    <article class="request-item" data-id="${esc(item.localId)}">
      <div class="request-date">
        <strong>${esc(dateParts[0]||'')}</strong>
        <span>${esc(dateParts[1]||'')}</span>
      </div>

      <div class="request-copy">
        <div class="request-title">
          ${esc(shiftLabel(item.shift))}
          · ${esc(item.start)}–${esc(item.end)}
          · ${esc(siteLabel(item.site))}
        </div>

        <div class="request-meta">
          <span class="request-chip">Mezzo a ${esc(item.machine)}</span>
          <span class="request-chip">${esc(roles)}</span>
        </div>

        ${item.note?`
          <div class="request-note">${esc(item.note)}</div>
        `:''}
      </div>

      <div class="request-actions">
        <button class="icon-button" type="button"
                data-action="edit" title="Modifica">✎</button>
        <button class="icon-button" type="button"
                data-action="duplicate" title="Duplica">⧉</button>
        <button class="icon-button delete" type="button"
                data-action="delete" title="Elimina">×</button>
      </div>
    </article>
  `;
}

function render(savedAt){
  requests.sort(requestSort);

  $('#requestList').innerHTML=requests
    .map(itemHtml)
    .join('');

  $('#requestList').hidden=!requests.length;
  $('#emptyList').hidden=Boolean(requests.length);
  $('#sendButton').disabled=!requests.length;
  $('#saveDraftButton').disabled=!requests.length;
  $('#clearDraftButton').disabled=!requests.length;

  renderStats(savedAt);

  $$('[data-action]').forEach(button=>{
    button.addEventListener('click',()=>{
      const itemElement=button.closest('[data-id]');
      const id=itemElement.dataset.id;
      const action=button.dataset.action;
      const item=requests.find(entry=>entry.localId===id);

      if(!item)return;

      if(action==='delete'){
        requests=requests.filter(entry=>entry.localId!==id);
        saveDraft({silent:true});
        render();
        return;
      }

      if(action==='duplicate'){
        requests.push({
          ...item,
          localId:uid(),
          roles:[...item.roles]
        });
        saveDraft({silent:true});
        render();
        return;
      }

      editItem(item);
    });
  });
}

function editItem(item){
  editingId=item.localId;
  mode='single';

  updateModeUi();

  $('#singleDay').value=item.day;
  $('#site').value=item.site;
  $('#machine').value=item.machine;
  $('#note').value=item.note||'';

  $$('[data-shift]').forEach(input=>{
    input.checked=input.dataset.shift===item.shift;
  });

  $('#customTimes').hidden=item.shift!=='CUSTOM';
  $('#customStart').value=item.shift==='CUSTOM'?item.start:'';
  $('#customEnd').value=item.shift==='CUSTOM'?item.end:'';

  ['A','C','S'].forEach(code=>{
    $(`#role${code}`).checked=item.roles.includes(code);
  });

  $('#addButton').textContent='Aggiorna richiesta';

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });
}

function resetBuilder(){
  editingId='';
  $('#addButton').textContent='Aggiungi alla lista';
  $('#note').value='';
  $('#customStart').value='';
  $('#customEnd').value='';

  ['A','C','S'].forEach(code=>{
    $(`#role${code}`).checked=false;
  });

  $$('[data-shift]').forEach(input=>{
    input.checked=input.dataset.shift==='M';
  });

  $('#customTimes').hidden=true;
  showResult('#builderResult','info','Campi ripristinati.');
}

function addToList(){
  const error=validateBuilder();

  if(error){
    showResult('#builderResult','warning',error);
    return;
  }

  const generated=buildRequests();

  if(editingId){
    if(generated.length!==1){
      showResult(
        '#builderResult',
        'warning',
        'Durante la modifica puoi aggiornare una sola richiesta.'
      );
      return;
    }

    requests=requests.map(item=>
      item.localId===editingId
        ?{
            ...generated[0],
            localId:editingId
          }
        :item
    );

    editingId='';
    $('#addButton').textContent='Aggiungi alla lista';

    showResult(
      '#builderResult',
      'success',
      'Richiesta aggiornata.'
    );
  }else{
    requests.push(...generated);

    showResult(
      '#builderResult',
      'success',
      `<strong>${generated.length} ${
        generated.length===1?'richiesta aggiunta':'richieste aggiunte'
      }.</strong>`
    );
  }

  saveDraft({silent:true});
  render();
}

function updateModeUi(){
  $$('[data-mode]').forEach(button=>{
    button.classList.toggle(
      'active',
      button.dataset.mode===mode
    );
  });

  $$('[data-mode-panel]').forEach(panel=>{
    panel.classList.toggle(
      'active',
      panel.dataset.modePanel===mode
    );
  });
}

function updateMonthControls(){
  const month=$('#month').value;
  const bounds=monthBounds(month);

  if(!bounds)return;

  ['#singleDay','#rangeStart','#rangeEnd'].forEach(selector=>{
    $(selector).min=bounds.first;
    $(selector).max=bounds.last;
  });

  $('#singleDay').value=bounds.first;
  $('#rangeStart').value=bounds.first;
  $('#rangeEnd').value=bounds.last;
  $('#monthLabel').textContent=monthLabel(month);

  loadDraft();
}

async function sendAll(){
  if(!requests.length)return;

  if(
    !confirm(
      `Confermi il salvataggio e l’invio di ${requests.length} richieste al Responsabile Operativo?\n\n`+
      'Dopo l’invio la bozza verrà svuotata.'
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
    render();

    if(email.sent){
      showResult(
        '#result',
        'success',
        `<strong>${batch.count} richieste salvate e inviate al RO.</strong><br>`+
        `Invio: ${esc(batch.batchId)}`
      );
    }else{
      showResult(
        '#result',
        'warning',
        `<strong>${batch.count} richieste salvate correttamente.</strong><br>`+
        `La mail non è stata inviata: ${esc(email.error||'errore non specificato')}.`
      );
    }
  }catch(error){
    showResult(
      '#result',
      'danger',
      `<strong>Invio non riuscito.</strong><br>${esc(error.message)}`
    );
  }finally{
    button.disabled=!requests.length;
    button.textContent='Salva e invia tutto al RO';
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

      location.replace(
        routeForProfile(verified.user.profileType)
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

    $('#loading').hidden=true;
    $('#pageContent').hidden=false;

    const today=new Date();

    $('#month').value=[
      today.getFullYear(),
      String(today.getMonth()+1).padStart(2,'0')
    ].join('-');

    updateMonthControls();
  }catch(error){
    console.error(error);
    location.replace('index.html');
  }
}

$('#logoutButton').addEventListener('click',logout);

$$('[data-mode]').forEach(button=>{
  button.addEventListener('click',()=>{
    mode=button.dataset.mode;
    updateModeUi();
  });
});

$$('[data-shift]').forEach(input=>{
  input.addEventListener('change',()=>{
    $('#customTimes').hidden=
      !$('[data-shift="CUSTOM"]').checked;
  });
});

$('#month').addEventListener('change',()=>{
  if(
    requests.length&&
    !confirm(
      'Cambiando mese verrà caricata la bozza del nuovo mese. Continuare?'
    )
  ){
    return;
  }

  requests=[];
  editingId='';
  updateMonthControls();
});

$('#addButton').addEventListener('click',addToList);
$('#resetFormButton').addEventListener('click',resetBuilder);
$('#saveDraftButton').addEventListener('click',()=>saveDraft());
$('#clearDraftButton').addEventListener('click',clearDraft);
$('#sendButton').addEventListener('click',sendAll);

boot();
