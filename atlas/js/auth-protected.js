
import {SESSION_KEY} from '../../portal/js/config.js';
import {api} from '../../portal/js/api.js';
import {
  readSession,storeSession,clearSession,
  routeForProfile,logout
} from '../../portal/js/session.js';

let currentUser=null;
let currentToken='';

function requiredProfile(){
  return String(document.body.dataset.requiredProfile||'').toUpperCase();
}

function redirectLogin(){
  clearSession();
  location.replace('index.html');
}

function renderUser(user){
  const avatar=document.querySelector('#operatorAvatar');
  const name=document.querySelector('#operatorName');
  const role=document.querySelector('#operatorRole');

  if(avatar)avatar.textContent=user.initials||'UT';
  if(name)name.textContent=user.displayName||user.username||'Utente';
  if(role)role.textContent=user.role||user.profileType||'';
}

function unlock(){
  document.body.classList.remove('auth-locked');
  document.body.classList.add('authenticated');
  const app=document.querySelector('#atlasApp');
  if(app)app.inert=false;
}

export async function bootAuthentication({beforeBoot,onAuthenticated}={}){
  beforeBoot?.();

  document.querySelector('#logoutBtn')
    ?.addEventListener('click',logout);

  const session=readSession();
  if(!session?.token){
    redirectLogin();
    return;
  }

  try{
    const result=await api({
      action:'session',
      token:session.token
    },{timeout:15000});

    const user=result.user;
    const required=requiredProfile();
    const actual=String(user.profileType||'').toUpperCase();

    if(actual!==required){
      storeSession({
        token:session.token,
        user,
        expiresAt:result.expiresAt
      });
      location.replace(routeForProfile(actual));
      return;
    }

    currentUser=user;
    currentToken=session.token;

    storeSession({
      token:currentToken,
      user,
      expiresAt:result.expiresAt
    });

    renderUser(user);
    unlock();
    await onAuthenticated?.(user);
  }catch(error){
    console.error(error);
    redirectLogin();
  }
}

export function getServerAuthContext(){
  const session=readSession();
  return{
    token:session?.token||currentToken,
    user:session?.user||currentUser,
    serverUrl:''
  };
}

export function rememberServerUrl(){
  return true;
}
