function timeoutController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

export function isValidAppsScriptUrl(url) {
  return /\/exec(?:\?|$)/.test(String(url || '').trim());
}

export async function postAppsScriptJson(
  url,
  payload,
  { timeoutMs = 30000, signal = null } = {}
) {
  if (!isValidAppsScriptUrl(url)) {
    throw new Error('URL Apps Script non valido. Deve terminare con /exec.');
  }

  const { controller, timer } = timeoutController(timeoutMs);
  const abortFromOutside=()=>controller.abort();
  if(signal){if(signal.aborted)controller.abort();else signal.addEventListener('abort',abortFromOutside,{once:true});}

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal
    });

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(
        'La Web App non ha restituito JSON valido. Verifica distribuzione e autorizzazioni.'
      );
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Errore HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      const cancelled=Boolean(signal&&signal.aborted);
      const out=new Error(cancelled?'Operazione annullata.':'Tempo scaduto durante la comunicazione con il server.');
      out.name=cancelled?'AbortError':'TimeoutError';
      throw out;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort',abortFromOutside);
  }
}

export function loginServer({ url, username, password }) {
  return postAppsScriptJson(
    url,
    { action: 'login', username, password },
    { timeoutMs: 20000 }
  );
}

export function verifyServerSession({ url, token }) {
  return postAppsScriptJson(
    url,
    { action: 'session', token },
    { timeoutMs: 15000 }
  );
}

export function logoutServer({ url, token }) {
  return postAppsScriptJson(
    url,
    { action: 'logout', token },
    { timeoutMs: 15000 }
  );
}

export async function loadProtectedSheets({ url, token }) {
  const data = await postAppsScriptJson(
    url,
    { action: 'loadData', token },
    { timeoutMs: 30000 }
  );

  return {
    matrixText: data.matrixCsv || '',
    databaseText: data.databaseCsv || '',
    matrixRows: Number(data.matrixRows || 0),
    databaseRows: Number(data.databaseRows || 0),
    user: data.user || null,
    securityMode: data.securityMode || '',
    sharedSettings: data.sharedSettings || null
  };
}

export function saveEmployeesToSheet({
  url,
  token,
  employees,
  updatedAt = new Date().toISOString()
}) {
  return postAppsScriptJson(url, {
    action: 'saveEmployees',
    token,
    employees,
    updatedAt
  });
}

export function saveCalendarPlanToSheet({
  url, token, month, rows, requirements, clientVersion,
  generationConfirmed = false, generationAt = '',
  updatedAt = new Date().toISOString(), signal = null
}) {
  return postAppsScriptJson(url, {
    action: 'savePlan', token, month, rows, requirements, updatedAt, clientVersion, generationConfirmed, generationAt
  }, { timeoutMs: 45000, signal });
}


export function loadSharedSettings({url,token}){
  return postAppsScriptJson(
    url,
    {
      action:'loadSettings',
      token
    },
    {
      timeoutMs:15000
    }
  );
}

export function saveSharedSettings({
  url,
  token,
  settings
}){
  return postAppsScriptJson(
    url,
    {
      action:'saveSettings',
      token,
      settings
    },
    {
      timeoutMs:20000
    }
  );
}


export function approveVolunteerProposalWithPlan({
  url,
  token,
  proposalId,
  reason='',
  month,
  rows,
  requirements,
  updatedAt,
  clientVersion,
  generationConfirmed,
  generationAt
}){
  return postAppsScriptJson(
    url,
    {
      action:'approveVolunteerProposalWithPlan',
      token,
      proposalId,
      reason,
      month,
      rows,
      requirements,
      updatedAt,
      clientVersion,
      generationConfirmed,
      generationAt
    },
    {
      timeoutMs:45000
    }
  );
}


export function loadVolunteerWorkspace({url,token}){
  return postAppsScriptJson(url,{action:'loadVolunteerWorkspace',token},{timeoutMs:30000});
}
export function analyzeVolunteerCoverage({url,token,hole}){
  return postAppsScriptJson(url,{action:'analyzeVolunteerCoverage',token,hole},{timeoutMs:45000});
}
export function submitVolunteerProposal({url,token,hole}){
  return postAppsScriptJson(
    url,
    {action:'submitVolunteerProposal',token,hole},
    {timeoutMs:30000}
  );
}
export function reviewVolunteerProposal({url,token,proposalId,decision,reason=''}){
  return postAppsScriptJson(url,{action:'reviewVolunteerProposal',token,proposalId,decision,reason},{timeoutMs:60000});
}

export function sendVolunteerProposalEmail({url,token,proposalId}){
  return postAppsScriptJson(
    url,
    {
      action:'sendVolunteerProposalEmail',
      token,
      proposalId
    },
    {timeoutMs:30000}
  );
}
