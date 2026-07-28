import { LEGACY_STORAGE_KEYS, PROTECTED_STORAGE_KEY, STORAGE_KEY } from './config.js';

function parseJson(raw, fallback=null){
  if(!raw)return fallback;
  try{return JSON.parse(raw);}
  catch(error){console.warn('Dati locali non leggibili',error);return fallback;}
}

export function loadApplicationSnapshot(){
  const current=localStorage.getItem(STORAGE_KEY);
  if(current)return parseJson(current);
  for(const key of LEGACY_STORAGE_KEYS){
    const raw=localStorage.getItem(key);
    if(raw)return parseJson(raw);
  }
  return null;
}

export function saveApplicationSnapshot(snapshot){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
}

export function readProtectedRecords(){
  return parseJson(localStorage.getItem(PROTECTED_STORAGE_KEY),{})||{};
}

export function writeProtectedRecords(store){
  localStorage.setItem(PROTECTED_STORAGE_KEY,JSON.stringify(store||{}));
}

export function clearApplicationStorage(){
  localStorage.removeItem(STORAGE_KEY);
  for(const key of LEGACY_STORAGE_KEYS)localStorage.removeItem(key);
}

export function clearProtectedStorage(){
  localStorage.removeItem(PROTECTED_STORAGE_KEY);
}
