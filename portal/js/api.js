
import {ATLAS_SERVER_URL} from './config.js';

export async function api(payload,{timeout=30000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);

  try{
    const response=await fetch(ATLAS_SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),
      redirect:'follow',
      signal:controller.signal
    });

    const text=await response.text();
    let data;

    try{
      data=JSON.parse(text);
    }catch{
      throw new Error('Il server non ha restituito JSON valido.');
    }

    if(!response.ok||!data.ok){
      throw new Error(data.error||`Errore HTTP ${response.status}`);
    }

    return data;
  }catch(error){
    if(error.name==='AbortError'){
      throw new Error('Tempo scaduto durante la comunicazione con ATLAS.');
    }
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
