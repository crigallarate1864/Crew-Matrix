function timeoutController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

export function isValidAppsScriptUrl(url) {
  return /\/exec(?:\?|$)/.test(String(url || '').trim());
}

export async function fetchCsvText(url, { timeoutMs = 8000 } = {}) {
  const { controller, timer } = timeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('timeout collegamento');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadPublishedSheets({
  matrixUrl,
  databaseUrl,
  timeoutMs = 8000
}) {
  const [matrixText, databaseText] = await Promise.all([
    fetchCsvText(matrixUrl, { timeoutMs }),
    fetchCsvText(databaseUrl, { timeoutMs })
  ]);

  return { matrixText, databaseText };
}

export async function postAppsScriptJson(
  url,
  payload,
  { timeoutMs = 30000 } = {}
) {
  const { controller, timer } = timeoutController(timeoutMs);

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
  } finally {
    clearTimeout(timer);
  }
}

export function saveEmployeesToSheet({
  url,
  employees,
  updatedAt = new Date().toISOString()
}) {
  return postAppsScriptJson(url, {
    action: 'saveEmployees',
    employees,
    updatedAt
  });
}

export function saveCalendarPlanToSheet({
  url,
  month,
  rows,
  requirements,
  clientVersion,
  updatedAt = new Date().toISOString()
}) {
  return postAppsScriptJson(url, {
    action: 'savePlan',
    month,
    rows,
    requirements,
    updatedAt,
    clientVersion
  });
}
