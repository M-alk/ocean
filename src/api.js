async function call(method, url, body, raw) {
  const res = await fetch(url, {
    method,
    headers: { 'x-leaf': '1', ...(body && !raw ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const q = (o) => new URLSearchParams(o).toString();

export const api = {
  info: () => call('GET', '/api/info'),
  tree: () => call('GET', '/api/tree'),
  page: (path) => call('GET', `/api/page?${q({ path })}`),
  save: (path, data) => call('PUT', `/api/page?${q({ path })}`, data),
  create: (parent, title = 'Untitled', icon = '', link = false) => call('POST', '/api/page', { parent, title, icon, link }),
  folder: (parent, name) => call('POST', '/api/folder', { parent, name }),
  rename: (path, title) => call('POST', '/api/rename', { path, title }),
  move: (path, parent, before) => call('POST', '/api/move', { path, parent, before }),
  duplicate: (path) => call('POST', '/api/duplicate', { path }),
  trash: (path) => call('POST', '/api/trash', { path }),
  upload: (page, file) => call('POST', `/api/upload?${q({ page, name: file.name || 'image.png' })}`, file, true),
  slides: (page, file) => call('POST', `/api/slides?${q({ page, name: file.name })}`, file, true),
  slideList: (page) => call('GET', `/api/slides?${q({ page })}`),
  slideSource: (page, file) => call('POST', `/api/slides/source?${q({ page, name: file.name })}`, file, true),
  slideImage: (page, name, blob) => call('PUT', `/api/slides/image?${q({ page, name })}`, blob, true),
  slidesDone: (page, data) => call('POST', `/api/slides/finish?${q({ page })}`, data),
  activity: () => call('GET', '/api/activity'),
  logActivity: (data) => call('POST', '/api/activity', data),
  graph: () => call('GET', '/api/graph'),
  search: (s) => call('GET', `/api/search?${q({ q: s })}`),
};

/** Turn a link written in a page (relative to that page's file) into a URL the browser can load. */
export function vaultUrl(pagePath, url) {
  if (!url || /^(https?:|data:|blob:|\/)/i.test(url)) return url;
  let target = url;
  try { target = decodeURI(url); } catch { /* keep as is */ }
  const parts = pagePath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return '/vault/' + parts.map(encodeURIComponent).join('/');
}

/** URL of a page's interactive HTML file, served sandboxed. */
export const embedUrl = (pagePath, link) => vaultUrl(pagePath, link).replace(/^\/vault\//, '/embed/');

/** Resolve a relative link from one page to another page path in the vault. */
export function resolveLink(pagePath, href) {
  return decodeURIComponent(vaultUrl(pagePath, href).replace(/^\/vault\//, ''));
}
