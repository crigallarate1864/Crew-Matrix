
import {api} from './api.js';
import {readSession,storeSession,routeForProfile,logout} from './session.js';

const $=selector=>document.querySelector(selector);
let token='';

function showResult(type,html){
  $('#result').innerHTML=`<div class="notice ${type}">${html}</div>`;
}

function setDefaultTimes(){
  const day=$('#day').value;
  const shift=$('#shift').value;
  if(!day)return;

  const dow=new Date(`${day}T00:00:00`).getDay();
  let start='',end='';

  if(shift==='M'){
    start=dow===0?'08:00':'06:00';
    end=dow===0?'14:00':'13:30';
  }else if(shift==='P'){
    start=dow===0?'14:00':'13:00';
    end=(dow===0||dow===6)?'20:00':'20:30';
  }else if(shift==='N'){
    start=(dow===0||dow===6)?'20:00':'20:30';
    end=dow===6?'08:00':'06:00';
    $('#machine').value='3';
  }

  if(shift!=='CUSTOM'){
    $('#start').value=start;
    $('#end').value=end;
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
    storeSession({
      token,
      user:verified.user,
      expiresAt:verified.expiresAt
    });

    $('#userName').textContent=verified.user.displayName||verified.user.username;
    $('#loading').hidden=true;
    $('#pageContent').hidden=false;

    const today=new Date();
    $('#day').value=[
      today.getFullYear(),
      String(today.getMonth()+1).padStart(2,'0'),
      String(today.getDate()).padStart(2,'0')
    ].join('-');

    setDefaultTimes();
  }catch(error){
    console.error(error);
    location.replace('index.html');
  }
}

$('#logoutButton').addEventListener('click',logout);
$('#day').addEventListener('change',setDefaultTimes);
$('#shift').addEventListener('change',setDefaultTimes);

$('#proposalForm').addEventListener('submit',async event=>{
  event.preventDefault();

  const roles=['A','C','S'].filter(code=>
    $(`#role${code}`).checked
  );

  if(!roles.length){
    showResult('warning','Seleziona almeno un ruolo mancante.');
    return;
  }

  const hole={
    day:$('#day').value,
    shift:$('#shift').value,
    start:$('#start').value,
    end:$('#end').value,
    site:$('#site').value,
    machine:$('#machine').value,
    roles,
    note:$('#note').value.trim()
  };

  if(!hole.day||!hole.start||!hole.end){
    showResult('warning','Data e orari sono obbligatori.');
    return;
  }

  if(hole.shift==='N'&&hole.machine==='2'){
    showResult('warning','La notte richiede un equipaggio a 3.');
    return;
  }

  const button=$('#submitButton');
  button.disabled=true;
  button.textContent='Invio in corso…';

  try{
    const result=await api({
      action:'submitVolunteerProposal',
      token,
      hole
    });

    showResult(
      'success',
      `<strong>Proposta ${result.proposal.id} inviata.</strong><br>`+
      `Nessun dipendente è stato assegnato e il calendario non è stato modificato.`
    );

    $('#note').value='';
    ['A','C','S'].forEach(code=>{
      $(`#role${code}`).checked=false;
    });

    if(confirm(
      'Proposta registrata in ATLAS.\n\n'+
      'Vuoi inviare una mail informativa al Responsabile Operativo?'
    )){
      try{
        await api({
          action:'sendVolunteerProposalEmail',
          token,
          proposalId:result.proposal.id
        });
        alert('Email inviata.');
      }catch(error){
        alert(
          'La proposta è stata registrata, ma la mail non è stata inviata.\n\n'+
          error.message
        );
      }
    }
  }catch(error){
    showResult(
      'danger',
      `<strong>Invio non riuscito.</strong><br>${error.message}`
    );
  }finally{
    button.disabled=false;
    button.textContent='Invia proposta';
  }
});

boot();
