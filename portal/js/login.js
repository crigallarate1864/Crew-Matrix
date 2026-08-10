
import {api} from './api.js';
import {
  readSession,storeSession,clearSession,
  verifySession,routeForProfile
} from './session.js';

const form=document.querySelector('#loginForm');
const username=document.querySelector('#username');
const password=document.querySelector('#password');
const button=document.querySelector('#loginButton');
const errorBox=document.querySelector('#loginError');
const status=document.querySelector('#loginStatus');

function showError(message){
  errorBox.textContent=message;
  errorBox.classList.add('visible');
}

function setBusy(active){
  button.disabled=active;
  button.textContent=active?'Verifica credenziali…':'Accedi';
}

async function routeExistingSession(){
  if(!readSession())return;
  status.textContent='Verifica sessione in corso…';

  try{
    const session=await verifySession();
    location.replace(routeForProfile(session.user.profileType));
  }catch{
    clearSession();
    status.textContent='';
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  errorBox.classList.remove('visible');

  const user=username.value.trim();
  const pass=password.value;

  if(!user||!pass){
    showError('Compila nome utente e password.');
    return;
  }

  setBusy(true);

  try{
    const result=await api({
      action:'login',
      username:user,
      password:pass
    },{timeout:20000});

    storeSession({
      token:result.token,
      user:result.user,
      expiresAt:result.expiresAt
    });

    password.value='';
    location.replace(routeForProfile(result.user.profileType));
  }catch(error){
    password.value='';
    password.focus();
    showError(error.message||'Accesso non riuscito.');
  }finally{
    setBusy(false);
  }
});

routeExistingSession();
