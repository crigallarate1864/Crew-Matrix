
import {ATLAS_SERVER_URL} from './config.js';

export async function api(payload,{timeout=30000,signal=null}={}){
  const controller=new AbortController();
  const abortFromOutside=()=>controller.abort();
  if(signal){if(signal.aborted)controller.abort();else signal.addEventListener('abort',abortFromOutside,{once:true});}
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
      const cancelled=Boolean(signal&&signal.aborted);
      const out=new Error(cancelled?'Operazione annullata.':'Tempo scaduto durante la comunicazione con ATLAS.');
      out.name=cancelled?'AbortError':'TimeoutError';throw out;
    }
    throw error;
  }finally{
    clearTimeout(timer);signal?.removeEventListener?.('abort',abortFromOutside);
  }
}
