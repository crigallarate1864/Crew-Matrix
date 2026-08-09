
import {SESSION_KEY,PROFILE_ROUTES} from './config.js';
import {api} from './api.js';

export function readSession(){
  try{
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  }catch{
    return null;
  }
}

export function storeSession(session){
  sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
}

export function clearSession(){
  sessionStorage.removeItem(SESSION_KEY);
}

export function routeForProfile(profileType){
  return PROFILE_ROUTES[String(profileType||'').toUpperCase()]||'index.html';
}

export async function verifySession(){
  const session=readSession();
  if(!session?.token)throw new Error('Sessione assente.');

  const result=await api({
    action:'session',
    token:session.token
  },{timeout:15000});

  const updated={
    token:session.token,
    user:result.user,
    expiresAt:result.expiresAt
  };

  storeSession(updated);
  return updated;
}

export async function logout(){
  const session=readSession();
  try{
    if(session?.token){
      await api({action:'logout',token:session.token},{timeout:12000});
    }
  }catch(error){
    console.warn(error);
  }finally{
    clearSession();
    location.replace('index.html');
  }
}
