/**
 * D1-backed URL Redirector with Admin UI
 * redirect.ballabotond.com
 * Secured with HTTP Basic Auth
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check authentication for admin routes
    if (path === '/admin' || path === '/api/add' || path === '/api/delete' || path === '/api/edit' || path === '/api/analytics') {
      const authCheck = await checkAuth(request, env);
      if (!authCheck.authenticated) {
        return authCheck.response;
      }
    }

    // GET /admin - Admin UI
    if (path === '/admin' && request.method === 'GET') {
      return handleAdmin(env);
    }

    // POST /api/add - Add new redirect link
    if (path === '/api/add' && request.method === 'POST') {
      return handleAddLink(request, env);
    }

    // POST /api/delete - Delete a redirect link
    if (path === '/api/delete' && request.method === 'POST') {
      return handleDeleteLink(request, env);
    }

    // POST /api/edit - Edit a redirect link
    if (path === '/api/edit' && request.method === 'POST') {
      return handleEditLink(request, env);
    }

    // GET /api/analytics - Get analytics for a slug
    if (path === '/api/analytics' && request.method === 'GET') {
      return handleGetAnalytics(url, env);
    }

    // GET /favicon.ico - Serve favicon
    if (path === '/favicon.ico') {
      return handleFavicon();
    }

    // GET /:slug - Redirect to destination (public)
    if (path !== '/' && request.method === 'GET') {
      const slug = path.substring(1); // Remove leading /
      return handleRedirect(slug, env, request);
    }

    // Default response for root
    return new Response('URL Redirector - Visit /admin to manage links', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};

/**
 * Secure timing-safe string comparison to prevent timing attacks
 */
async function timingSafeEqual(a, b) {
  const aBuffer = new TextEncoder().encode(a);
  const bBuffer = new TextEncoder().encode(b);
  
  // If lengths don't match, pad the shorter one to prevent length-based timing leaks
  const maxLen = Math.max(aBuffer.length, bBuffer.length);
  const aPadded = new Uint8Array(maxLen);
  const bPadded = new Uint8Array(maxLen);
  
  aPadded.set(aBuffer);
  bPadded.set(bBuffer);
  
  return crypto.subtle.timingSafeEqual(aPadded, bPadded);
}

/**
 * Check HTTP Basic Authentication
 */
async function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return {
      authenticated: false,
      response: new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="URL Redirector Admin"`,
          'Content-Type': 'text/plain',
        },
      }),
    };
  }

  try {
    // Decode Basic Auth credentials
    const encoded = authHeader.slice(6); // Remove "Basic "
    const decoded = atob(encoded);
    const [username, password] = decoded.split(':');

    // Get credentials from environment
    const expectedUsername = env.ADMIN_USERNAME;
    const expectedPassword = env.ADMIN_PASSWORD;

    // Timing-safe comparison for both username and password
    const usernameMatch = await timingSafeEqual(username || '', expectedUsername);
    const passwordMatch = await timingSafeEqual(password || '', expectedPassword);

    if (usernameMatch && passwordMatch) {
      return { authenticated: true };
    }

    return {
      authenticated: false,
      response: new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="URL Redirector Admin"`,
          'Content-Type': 'text/plain',
        },
      }),
    };
  } catch (error) {
    return {
      authenticated: false,
      response: new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="URL Redirector Admin"`,
          'Content-Type': 'text/plain',
        },
      }),
    };
  }
}

/**
 * Generate a random 5-character slug
 */
function generateSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let slug = '';
  for (let i = 0; i < 5; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Handle GET /admin - Display admin UI
 */
async function handleAdmin(env) {
  try {
    // Fetch all links from D1
    const { results } = await env.DB.prepare(
      'SELECT slug, url, clicks FROM links ORDER BY clicks DESC'
    ).all();

    const linksRows = results
      .map(
        (link) => `
        <tr>
          <td>
            <a class="slug-link" href="/${link.slug}" target="_blank">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              ${link.slug}
            </a>
          </td>
          <td>
            <a class="url-link" href="${link.url}" target="_blank" title="${link.url}">
              ${link.url.length > 55 ? link.url.substring(0, 55) + '...' : link.url}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </td>
          <td><span class="click-badge">${link.clicks}</span></td>
          <td>
            <div class="action-buttons">
              <button type="button" class="icon-btn" title="Copy link" onclick="copyToClipboard('https://redirect.ballabotond.com/${link.slug}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button type="button" class="icon-btn" title="Download QR code" onclick="downloadQR('https://redirect.ballabotond.com/${link.slug}', '${link.slug}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="17" y="17" width="3" height="3"/><rect x="14" y="14" width="3" height="3"/></svg>
              </button>
              <button type="button" class="icon-btn" title="View analytics" onclick="showAnalytics('${link.slug}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </button>
              <button type="button" class="icon-btn" title="Edit link" onclick="showEditModal('${link.slug}', '${link.url.replace(/'/g, "\\'")}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" class="icon-btn icon-btn-danger" title="Delete link" onclick="showDeleteConfirm('${link.slug}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirector — Admin</title>
  <link rel="icon" href="/favicon.ico" type="image/svg+xml">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg:       #0c0c0e;
      --surface:  #131316;
      --surface2: #1c1c20;
      --border:   #2a2a30;
      --border2:  #3a3a42;
      --text:     #f0f0f2;
      --muted:    #7a7a8a;
      --accent:   #5b8dee;
      --accent-h: #4070d4;
      --danger:   #e85d5d;
      --danger-h: #c94040;
      --success:  #4ade80;
      --radius:   8px;
      --r-sm:     5px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ── */
    .app {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.25rem 3rem;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
      gap: 1rem;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .header-icon {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: var(--r-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .header-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }
    .header-sub {
      font-size: 0.75rem;
      color: var(--muted);
      margin-top: 1px;
    }
    .header-badge {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--muted);
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 0.2rem 0.6rem;
      letter-spacing: 0.02em;
    }

    /* ── Add form ── */
    .add-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 0.875rem;
    }
    .add-form {
      display: flex;
      gap: 0.625rem;
      align-items: stretch;
    }
    .url-input {
      flex: 1;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 0.625rem 0.875rem;
      color: var(--text);
      font-size: 0.875rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
      min-width: 0;
    }
    .url-input::placeholder { color: var(--muted); }
    .url-input:focus { border-color: var(--accent); }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--r-sm);
      padding: 0.625rem 1.125rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .btn-primary:hover { background: var(--accent-h); }
    .btn-primary:active { transform: scale(0.98); }

    /* ── Table section ── */
    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .section-title {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .count-pill {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--accent);
      background: rgba(91, 141, 238, 0.12);
      border-radius: 20px;
      padding: 0.15rem 0.5rem;
    }

    .table-wrap {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      background: var(--surface);
      padding: 0.65rem 1rem;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    tbody tr {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      transition: background 0.1s;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--surface2); }

    td {
      padding: 0.75rem 1rem;
      vertical-align: middle;
    }
    td:last-child { width: 1px; white-space: nowrap; }

    .slug-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
      font-family: 'SF Mono', 'Roboto Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      transition: color 0.15s;
    }
    .slug-link:hover { color: #fff; }

    .url-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: var(--muted);
      text-decoration: none;
      font-size: 0.8rem;
      transition: color 0.15s;
      max-width: 340px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .url-link:hover { color: var(--text); }
    .url-link svg { flex-shrink: 0; opacity: 0.5; }

    .click-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text);
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.1rem 0.45rem;
      font-variant-numeric: tabular-nums;
    }

    /* ── Icon action buttons ── */
    .action-buttons {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .icon-btn:hover {
      background: var(--border2);
      border-color: var(--border2);
      color: var(--text);
    }
    .icon-btn-danger:hover {
      background: rgba(232, 93, 93, 0.15);
      border-color: var(--danger);
      color: var(--danger);
    }

    /* ── Empty state ── */
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--muted);
      background: var(--surface);
    }
    .empty-state svg { opacity: 0.25; margin-bottom: 1rem; }
    .empty-state p { font-size: 0.875rem; }

    /* ── Toast ── */
    .toast {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%) translateY(0);
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border2);
      padding: 0.625rem 1.125rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      animation: toastIn 0.2s ease-out;
    }
    @keyframes toastIn {
      from { opacity:0; transform: translateX(-50%) translateY(8px); }
      to   { opacity:1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Modals ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 1rem;
    }
    .modal-overlay.active { display: flex; }

    .modal {
      background: var(--surface);
      border: 1px solid var(--border2);
      border-radius: 10px;
      padding: 1.5rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
      animation: modalIn 0.2s ease-out;
    }
    @keyframes modalIn {
      from { opacity:0; transform: scale(0.96) translateY(-8px); }
      to   { opacity:1; transform: scale(1) translateY(0); }
    }
    .modal-analytics {
      max-width: 820px;
      max-height: 87vh;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--border2) transparent;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .modal-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text);
    }
    .modal-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .modal-close:hover { color: var(--text); border-color: var(--border2); }

    .modal-body { color: var(--muted); font-size: 0.875rem; }
    .modal-body strong { color: var(--text); }

    .modal-label {
      display: block;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
      margin-bottom: 0.4rem;
    }
    .modal-input {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 0.6rem 0.75rem;
      color: var(--text);
      font-size: 0.875rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
      margin-bottom: 0.875rem;
    }
    .modal-input:focus { border-color: var(--accent); }

    .modal-footer {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border: none;
      border-radius: var(--r-sm);
      padding: 0.575rem 1rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    }
    .btn-ghost {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .btn-ghost:hover { color: var(--text); border-color: var(--border2); }
    .btn-confirm {
      background: var(--accent);
      color: #fff;
    }
    .btn-confirm:hover { background: var(--accent-h); }
    .btn-del {
      background: var(--danger);
      color: #fff;
    }
    .btn-del:hover { background: var(--danger-h); }

    /* ── Analytics modal content ── */
    .analytics-info-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 0.875rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: 1rem;
      font-size: 0.75rem;
      color: var(--muted);
    }
    .analytics-info-bar strong { color: var(--text); }

    .analytics-filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.875rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .filter-select {
      flex: 1;
      min-width: 130px;
      padding: 0.35rem 0.6rem;
      background: var(--surface);
      border: 1px solid var(--border2);
      border-radius: var(--r-sm);
      color: var(--text);
      font-size: 0.75rem;
      cursor: pointer;
      outline: none;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237a7a8a' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      padding-right: 1.6rem;
    }
    .filter-select:focus { border-color: var(--accent); }
    .filter-reset-btn {
      padding: 0.35rem 0.75rem;
      background: transparent;
      border: 1px solid var(--border2);
      border-radius: var(--r-sm);
      color: var(--muted);
      font-size: 0.72rem;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 0.15s, color 0.15s;
    }
    .filter-reset-btn:hover { border-color: var(--accent); color: var(--text); }

    .record-item {
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: 0.4rem;
      overflow: hidden;
    }
    .record-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.625rem 0.875rem;
      cursor: pointer;
      background: var(--surface);
      transition: background 0.1s;
      user-select: none;
    }
    .record-header:hover { background: var(--surface2); }
    .record-time {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text);
    }
    .record-meta {
      font-size: 0.7rem;
      color: var(--muted);
      margin-top: 1px;
    }
    .record-chevron {
      color: var(--muted);
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .record-body {
      display: none;
      padding: 0.875rem;
      border-top: 1px solid var(--border);
      background: var(--surface2);
    }
    .record-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .record-section h6 {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .record-section h6 svg { opacity: 0.6; }
    .record-row {
      display: flex;
      gap: 0.375rem;
      font-size: 0.75rem;
      margin-bottom: 0.25rem;
      color: var(--muted);
    }
    .record-row strong { color: var(--text); font-weight: 500; }
    .record-row.full { grid-column: 1 / -1; }
    .record-section.full { grid-column: 1 / -1; }
    .record-code {
      font-family: 'SF Mono', 'Roboto Mono', monospace;
      font-size: 0.7rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0.5rem 0.625rem;
      overflow-x: auto;
      color: var(--muted);
      margin-top: 0.4rem;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .no-data {
      text-align: center;
      padding: 2.5rem;
      color: var(--muted);
      font-size: 0.875rem;
    }
    .loading-dots {
      display: flex;
      gap: 4px;
      justify-content: center;
      padding: 2rem;
    }
    .loading-dots span {
      width: 6px; height: 6px;
      background: var(--muted);
      border-radius: 50%;
      animation: dot 1.2s ease-in-out infinite;
    }
    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dot {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
      td:nth-child(2) { display: none; }
      .record-grid { grid-template-columns: 1fr; }
      .add-form { flex-direction: column; }
      .btn-primary { width: 100%; justify-content: center; }
      .modal { padding: 1.25rem; }
    }
  </style>
</head>
<body>
<div class="app">

  <header class="header">
    <div class="header-left">
      <div class="header-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </div>
      <div>
        <div class="header-title">Redirector</div>
        <div class="header-sub">redirect.ballabotond.com</div>
      </div>
    </div>
    <span class="header-badge">${results.length} link${results.length !== 1 ? 's' : ''}</span>
  </header>

  <div class="add-card">
    <div class="card-label">New Redirect</div>
    <form class="add-form" method="POST" action="/api/add">
      <input
        class="url-input"
        type="url"
        id="url"
        name="url"
        placeholder="https://example.com/very/long/url"
        required
        autocomplete="off"
        spellcheck="false"
      >
      <button class="btn-primary" type="submit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Generate
      </button>
    </form>
  </div>

  <div class="table-header">
    <span class="section-title">Links</span>
    <span class="count-pill">${results.length} total</span>
  </div>

  <div class="table-wrap">
    ${results.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Slug</th>
          <th>Destination</th>
          <th>Clicks</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${linksRows}</tbody>
    </table>
    ` : `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <p>No redirects yet. Add one above.</p>
    </div>
    `}
  </div>

</div>

<!-- Delete Modal -->
<div id="deleteModal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">Delete link</span>
      <button class="modal-close" onclick="cancelDelete()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      This will permanently remove the short link and all its analytics data. This action cannot be undone.
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="cancelDelete()">Cancel</button>
      <button class="btn btn-del" onclick="confirmDelete()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        Delete
      </button>
    </div>
  </div>
</div>

<!-- Edit Modal -->
<div id="editModal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">Edit link</span>
      <button class="modal-close" onclick="cancelEdit()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div>
      <label class="modal-label">Slug</label>
      <input class="modal-input" type="text" id="editSlugInput" placeholder="my-link" spellcheck="false" autocomplete="off">
      <label class="modal-label">Destination URL</label>
      <input class="modal-input" type="url" id="editUrlInput" placeholder="https://example.com" spellcheck="false" autocomplete="off">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="cancelEdit()">Cancel</button>
      <button class="btn btn-confirm" onclick="confirmEdit()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Save
      </button>
    </div>
  </div>
</div>

<!-- Analytics Modal -->
<div id="analyticsModal" class="modal-overlay">
  <div class="modal modal-analytics">
    <div class="modal-header">
      <span class="modal-title">Analytics — <span id="analyticsSlugLabel" style="color:var(--accent);font-family:monospace;"></span></span>
      <button class="modal-close" onclick="closeAnalytics()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="analyticsFilters" class="analytics-filters" style="display:none;">
      <select id="countryFilter" class="filter-select" onchange="onCountryChange()">
        <option value="">All countries</option>
      </select>
      <select id="cityFilter" class="filter-select" style="display:none;" onchange="onCityChange()">
        <option value="">All cities</option>
      </select>
      <button class="filter-reset-btn" onclick="resetAnalyticsFilters()">Reset</button>
    </div>
    <div id="analyticsContent">
      <div class="loading-dots"><span></span><span></span><span></span></div>
    </div>
  </div>
</div>

<script>
    var pendingDeleteSlug = null;
    var pendingEditSlug = null;

    function showToast(msg, ok) {
      var t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = (ok === false
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e85d5d" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      ) + msg;
      document.body.appendChild(t);
      setTimeout(function() { t.remove(); }, 2500);
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Copied to clipboard');
      }).catch(function() {
        showToast('Copy failed', false);
      });
    }

    function showDeleteConfirm(slug) {
      pendingDeleteSlug = slug;
      document.getElementById('deleteModal').classList.add('active');
    }
    function confirmDelete() {
      if (!pendingDeleteSlug) return;
      var f = document.createElement('form');
      f.method = 'POST'; f.action = '/api/delete';
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = 'slug'; i.value = pendingDeleteSlug;
      f.appendChild(i); document.body.appendChild(f); f.submit();
    }
    function cancelDelete() {
      pendingDeleteSlug = null;
      document.getElementById('deleteModal').classList.remove('active');
    }

    function showEditModal(slug, url) {
      pendingEditSlug = slug;
      document.getElementById('editSlugInput').value = slug;
      document.getElementById('editUrlInput').value = url;
      document.getElementById('editModal').classList.add('active');
    }
    function confirmEdit() {
      var newSlug = document.getElementById('editSlugInput').value.trim();
      var newUrl  = document.getElementById('editUrlInput').value.trim();
      if (!newSlug || !newUrl) { showToast('Both fields are required', false); return; }
      if (!pendingEditSlug) return;
      var f = document.createElement('form');
      f.method = 'POST'; f.action = '/api/edit';
      var addHidden = function(n, v) {
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i);
      };
      addHidden('oldSlug', pendingEditSlug);
      addHidden('newSlug', newSlug);
      addHidden('url', newUrl);
      document.body.appendChild(f); f.submit();
    }
    function cancelEdit() {
      pendingEditSlug = null;
      document.getElementById('editModal').classList.remove('active');
    }

    function closeAnalytics() {
      document.getElementById('analyticsModal').classList.remove('active');
    }

    function toggleRecord(idx) {
      var body  = document.getElementById('rb-' + idx);
      var chev  = document.getElementById('rc-' + idx);
      var open  = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    var COUNTRY_NAMES = {"AF":"Afghanistan","AL":"Albania","DZ":"Algeria","AD":"Andorra","AO":"Angola","AG":"Antigua and Barbuda","AR":"Argentina","AM":"Armenia","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BR":"Brazil","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","CV":"Cape Verde","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CF":"Central African Republic","TD":"Chad","CL":"Chile","CN":"China","CO":"Colombia","KM":"Comoros","CG":"Congo","CD":"DR Congo","CR":"Costa Rica","CI":"Côte d'Ivoire","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","SZ":"Eswatini","ET":"Ethiopia","FJ":"Fiji","FI":"Finland","FR":"France","GA":"Gabon","GM":"Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GR":"Greece","GD":"Grenada","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HN":"Honduras","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran","IQ":"Iraq","IE":"Ireland","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Laos","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MR":"Mauritania","MU":"Mauritius","MX":"Mexico","FM":"Micronesia","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PL":"Poland","PT":"Portugal","QA":"Qatar","RO":"Romania","RU":"Russia","RW":"Rwanda","KN":"Saint Kitts and Nevis","LC":"Saint Lucia","VC":"Saint Vincent and the Grenadines","WS":"Samoa","SM":"San Marino","ST":"São Tomé and Príncipe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","SS":"South Sudan","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SE":"Sweden","CH":"Switzerland","SY":"Syria","TW":"Taiwan","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"};
    function countryName(code) { return (COUNTRY_NAMES[code] || code); }

    var currentAnalyticsSlug = null;

    function showAnalytics(slug) {
      currentAnalyticsSlug = slug;
      document.getElementById('analyticsModal').classList.add('active');
      document.getElementById('analyticsSlugLabel').textContent = slug;
      // Reset filters
      document.getElementById('countryFilter').value = '';
      document.getElementById('cityFilter').value = '';
      document.getElementById('cityFilter').style.display = 'none';
      document.getElementById('analyticsFilters').style.display = 'none';
      fetchAnalytics(slug, '', '');
    }

    function onCountryChange() {
      var country = document.getElementById('countryFilter').value;
      // Reset city when country changes
      document.getElementById('cityFilter').value = '';
      fetchAnalytics(currentAnalyticsSlug, country, '');
    }

    function onCityChange() {
      var country = document.getElementById('countryFilter').value;
      var city = document.getElementById('cityFilter').value;
      fetchAnalytics(currentAnalyticsSlug, country, city);
    }

    function resetAnalyticsFilters() {
      document.getElementById('countryFilter').value = '';
      document.getElementById('cityFilter').value = '';
      document.getElementById('cityFilter').style.display = 'none';
      fetchAnalytics(currentAnalyticsSlug, '', '');
    }

    function fetchAnalytics(slug, country, city) {
      document.getElementById('analyticsContent').innerHTML =
        '<div class="loading-dots"><span></span><span></span><span></span></div>';

      var apiUrl = '/api/analytics?slug=' + encodeURIComponent(slug);
      if (country) apiUrl += '&country=' + encodeURIComponent(country);
      if (city)    apiUrl += '&city='    + encodeURIComponent(city);

      fetch(apiUrl)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.error) {
            document.getElementById('analyticsContent').innerHTML =
              '<div class="no-data">Error: ' + data.error + '</div>';
            return;
          }

          // Populate country dropdown
          if (data.countries && data.countries.length) {
            var cf = document.getElementById('countryFilter');
            var currentCountry = cf.value;
            // Rebuild options preserving current selection
            var cOpts = '<option value="">All countries</option>';
            for (var ci = 0; ci < data.countries.length; ci++) {
              var c = data.countries[ci];
              cOpts += '<option value="' + c + '"' + (c === currentCountry ? ' selected' : '') + '>' + countryName(c) + '</option>';
            }
            cf.innerHTML = cOpts;
            document.getElementById('analyticsFilters').style.display = 'flex';
          }

          // Populate city dropdown
          var cityFilter = document.getElementById('cityFilter');
          var currentCity = cityFilter.value;
          if (data.cities && data.cities.length > 0) {
            var cityOpts = '<option value="">All cities</option>';
            for (var ki = 0; ki < data.cities.length; ki++) {
              var ct = data.cities[ki];
              cityOpts += '<option value="' + ct + '"' + (ct === currentCity ? ' selected' : '') + '>' + ct + '</option>';
            }
            cityFilter.innerHTML = cityOpts;
            cityFilter.style.display = 'block';
          } else {
            cityFilter.innerHTML = '<option value="">All cities</option>';
            cityFilter.style.display = 'none';
          }

          if (!data.analytics || !data.analytics.length) {
            document.getElementById('analyticsContent').innerHTML =
              '<div class="no-data">No clicks recorded.</div>';
            return;
          }

          var rows = data.analytics;
          var out = '<div class="analytics-info-bar"><strong>' + rows.length + '</strong> click' + (rows.length !== 1 ? 's' : '') + ' recorded';
          if (country && city) out += ' in ' + city + ', ' + countryName(country);
          else if (country) out += ' from ' + countryName(country);
          out += '</div>';

          rows.forEach(function(rec, idx) {
            var d = new Date(rec.timestamp);
            var dateStr = d.toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'});
            var timeStr = d.toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit'});

            out += '<div class="record-item">';
            out += '<div class="record-header" onclick="toggleRecord(' + idx + ')">';
            out += '<div><div class="record-time">' + dateStr + ' ' + timeStr + '</div>';
            if (rec.city || rec.country) {
              out += '<div class="record-meta">' + [rec.city, rec.country].filter(Boolean).join(', ') + '</div>';
            }
            out += '</div>';
            out += '<svg id="rc-' + idx + '" class="record-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            out += '</div>';

            out += '<div id="rb-' + idx + '" class="record-body" style="display:none;">';
            out += '<div class="record-grid">';

            if (rec.ip_address || rec.asn || rec.as_organization) {
              out += '<div class="record-section">';
              out += '<h6><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Network</h6>';
              if (rec.ip_address) out += '<div class="record-row"><strong>IP</strong>' + rec.ip_address + '</div>';
              if (rec.asn) out += '<div class="record-row"><strong>ASN</strong>' + rec.asn + '</div>';
              if (rec.as_organization) out += '<div class="record-row"><strong>ISP</strong>' + rec.as_organization + '</div>';
              out += '</div>';
            }

            if (rec.continent || rec.country || rec.city || rec.region) {
              out += '<div class="record-section">';
              out += '<h6><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Location</h6>';
              if (rec.country) out += '<div class="record-row"><strong>Country</strong>' + rec.country + (rec.is_eu_country ? ' (EU)' : '') + '</div>';
              if (rec.region) out += '<div class="record-row"><strong>Region</strong>' + rec.region + '</div>';
              if (rec.city) out += '<div class="record-row"><strong>City</strong>' + rec.city + '</div>';
              if (rec.timezone) out += '<div class="record-row"><strong>TZ</strong>' + rec.timezone + '</div>';
              out += '</div>';
            }

            if (rec.user_agent) {
              out += '<div class="record-section full">';
              out += '<h6><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Client</h6>';
              out += '<div class="record-row" style="flex-direction:column;gap:2px;"><strong>User Agent</strong><span style="color:var(--muted);word-break:break-all;">' + rec.user_agent + '</span></div>';
              if (rec.accept_language) out += '<div class="record-row"><strong>Language</strong>' + rec.accept_language + '</div>';
              if (rec.referer) out += '<div class="record-row"><strong>Referer</strong>' + rec.referer + '</div>';
              out += '</div>';
            }

            if (rec.tls_version || rec.cf_ray) {
              out += '<div class="record-section">';
              out += '<h6><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Security</h6>';
              if (rec.tls_version) out += '<div class="record-row"><strong>TLS</strong>' + rec.tls_version + '</div>';
              if (rec.tls_cipher) out += '<div class="record-row"><strong>Cipher</strong>' + rec.tls_cipher + '</div>';
              if (rec.cf_ray) out += '<div class="record-row"><strong>CF Ray</strong>' + rec.cf_ray + '</div>';
              if (rec.cf_colo) out += '<div class="record-row"><strong>DC</strong>' + rec.cf_colo + '</div>';
              out += '</div>';
            }

            if (rec.request_method || rec.http_protocol) {
              out += '<div class="record-section">';
              out += '<h6><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Request</h6>';
              if (rec.request_method) out += '<div class="record-row"><strong>Method</strong>' + rec.request_method + '</div>';
              if (rec.http_protocol) out += '<div class="record-row"><strong>Proto</strong>' + rec.http_protocol + '</div>';
              out += '</div>';
            }

            if (rec.all_headers) {
              out += '<div class="record-section full">';
              out += '<h6>Raw Headers</h6>';
              out += '<pre class="record-code">' + rec.all_headers + '</pre>';
              out += '</div>';
            }

            out += '</div></div></div>';
          });

          document.getElementById('analyticsContent').innerHTML = out;
        })
        .catch(function(err) {
          document.getElementById('analyticsContent').innerHTML =
            '<div class="no-data">Failed to load: ' + err.message + '</div>';
        });
    }

    function downloadQR(url, slug) {
      var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=' + encodeURIComponent(url);
      fetch(qrUrl)
        .then(function(r) { return r.blob(); })
        .then(function(blob) {
          var a = document.createElement('a');
          a.download = 'qr-' + slug + '.png';
          a.href = URL.createObjectURL(blob);
          a.click();
          URL.revokeObjectURL(a.href);
          showToast('QR downloaded');
        })
        .catch(function() { showToast('QR failed', false); });
    }

    // Close modals on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target === el) el.classList.remove('active');
      });
    });
    // Close on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(function(el) {
          el.classList.remove('active');
        });
      }
    });
</script>
</body>
</html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return new Response(`Error loading admin: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Handle POST /api/add - Add new redirect link
 */
async function handleAddLink(request, env) {
  try {
    const formData = await request.formData();
    const url = formData.get('url');

    if (!url) {
      return new Response('URL is required', { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response('Invalid URL format', { status: 400 });
    }

    // Generate a unique slug (retry if collision)
    let slug;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      slug = generateSlug();
      
      // Check if slug already exists
      const existing = await env.DB.prepare(
        'SELECT slug FROM links WHERE slug = ?'
      ).bind(slug).first();

      if (!existing) {
        break; // Unique slug found
      }
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return new Response('Failed to generate unique slug. Please try again.', {
        status: 500,
      });
    }

    // Insert new link into D1
    await env.DB.prepare(
      'INSERT INTO links (slug, url, clicks) VALUES (?, ?, 0)'
    ).bind(slug, url).run();

    // Redirect back to admin
    return Response.redirect(new URL('/admin', request.url).toString(), 302);
  } catch (error) {
    return new Response(`Error adding link: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Handle POST /api/edit - Edit a redirect link
 */
async function handleEditLink(request, env) {
  try {
    const formData = await request.formData();
    const oldSlug = formData.get('oldSlug');
    const newSlug = formData.get('newSlug');
    const url = formData.get('url');

    if (!oldSlug || !newSlug || !url) {
      return new Response('Old slug, new slug, and URL are required', { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response('Invalid URL format', { status: 400 });
    }

    // Validate slug format (alphanumeric only)
    if (!/^[a-zA-Z0-9]+$/.test(newSlug)) {
      return new Response('Slug must be alphanumeric', { status: 400 });
    }

    // If slug is changing, check if new slug already exists
    if (oldSlug !== newSlug) {
      const existing = await env.DB.prepare(
        'SELECT slug FROM links WHERE slug = ?'
      ).bind(newSlug).first();

      if (existing) {
        return new Response('Slug already exists', { status: 409 });
      }

      // Get the clicks count from the old slug
      const oldLink = await env.DB.prepare(
        'SELECT clicks FROM links WHERE slug = ?'
      ).bind(oldSlug).first();

      // Delete old slug and insert with new slug, preserving clicks
      await env.DB.prepare(
        'DELETE FROM links WHERE slug = ?'
      ).bind(oldSlug).run();

      await env.DB.prepare(
        'INSERT INTO links (slug, url, clicks) VALUES (?, ?, ?)'
      ).bind(newSlug, url, oldLink?.clicks || 0).run();
    } else {
      // Just update the URL if slug hasn't changed
      await env.DB.prepare(
        'UPDATE links SET url = ? WHERE slug = ?'
      ).bind(url, oldSlug).run();
    }

    // Redirect back to admin
    return Response.redirect(new URL('/admin', request.url).toString(), 302);
  } catch (error) {
    return new Response(`Error editing link: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Handle POST /api/delete - Delete a redirect link
 */
async function handleDeleteLink(request, env) {
  try {
    const formData = await request.formData();
    const slug = formData.get('slug');

    if (!slug) {
      return new Response('Slug is required', { status: 400 });
    }

    // Delete the link from D1 (removes all data completely)
    await env.DB.prepare(
      'DELETE FROM links WHERE slug = ?'
    ).bind(slug).run();

    // Redirect back to admin
    return Response.redirect(new URL('/admin', request.url).toString(), 302);
  } catch (error) {
    return new Response(`Error deleting link: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Handle GET /api/analytics - Get analytics data for a slug
 */
async function handleGetAnalytics(url, env) {
  try {
    const slug = url.searchParams.get('slug');
    const country = url.searchParams.get('country') || null;
    const city = url.searchParams.get('city') || null;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build filtered records query
    let recordsQuery = `
      SELECT 
        id, slug, timestamp,
        ip_address, asn, as_organization,
        continent, country, region, region_code, city, postal_code,
        latitude, longitude, timezone, metro_code,
        user_agent, referer, accept_language, accept_encoding, accept, connection,
        request_method, request_url, query_string, http_protocol,
        tls_version, tls_cipher,
        cf_ray, cf_colo, cf_ipcountry, is_eu_country,
        all_headers, cf_data_json
      FROM analytics WHERE slug = ?`;
    const recordsParams = [slug];
    if (country) { recordsQuery += ` AND country = ?`; recordsParams.push(country); }
    if (city)    { recordsQuery += ` AND city = ?`;    recordsParams.push(city); }
    recordsQuery += ` ORDER BY timestamp DESC LIMIT 200`;

    const { results } = await env.DB.prepare(recordsQuery).bind(...recordsParams).all();

    // Always return distinct countries for this slug (for populating country dropdown)
    const { results: countryRows } = await env.DB.prepare(
      `SELECT DISTINCT country FROM analytics WHERE slug = ? AND country IS NOT NULL AND country != '' ORDER BY country`
    ).bind(slug).all();
    const countries = countryRows.map(r => r.country);

    // Return distinct cities — scoped to selected country if one is active
    let citiesQuery = `SELECT DISTINCT city FROM analytics WHERE slug = ? AND city IS NOT NULL AND city != ''`;
    const citiesParams = [slug];
    if (country) { citiesQuery += ` AND country = ?`; citiesParams.push(country); }
    citiesQuery += ` ORDER BY city`;
    const { results: cityRows } = await env.DB.prepare(citiesQuery).bind(...citiesParams).all();
    const cities = cityRows.map(r => r.city);

    return new Response(JSON.stringify({ analytics: results, countries, cities }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle GET /favicon.ico - Serve SVG favicon
 */
function handleFavicon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#000"/>
    <path d="M30 50 L60 30 L60 70 Z" fill="#fff"/>
    <path d="M65 40 L70 40 L70 60 L65 60 Z" fill="#fff"/>
  </svg>`;
  
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

/**
 * Handle GET /:slug - Redirect to destination URL
 */
async function handleRedirect(slug, env, request) {
  try {
    // Find the link in D1
    const link = await env.DB.prepare(
      'SELECT url FROM links WHERE slug = ?'
    ).bind(slug).first();

    if (!link) {
      return new Response('Link not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Increment click counter
    await env.DB.prepare(
      'UPDATE links SET clicks = clicks + 1 WHERE slug = ?'
    ).bind(slug).run();

    // Capture visitor analytics
    await captureAnalytics(slug, request, env);

    // Redirect to destination
    return Response.redirect(link.url, 302);
  } catch (error) {
    return new Response(`Error processing redirect: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Capture comprehensive visitor analytics
 */
async function captureAnalytics(slug, request, env) {
  try {
    const headers = request.headers;
    const cf = request.cf || {};
    
    // Get IP address (Cloudflare provides this)
    const ipAddress = headers.get('CF-Connecting-IP') || 
                      headers.get('X-Forwarded-For') || 
                      headers.get('X-Real-IP') || 
                      'unknown';
    
    // Network Information
    const asn = cf.asn ? String(cf.asn) : null;
    const asOrganization = cf.asOrganization || null;
    
    // Geographic Location (Cloudflare provides extensive geo data)
    const continent = cf.continent || null;
    const country = cf.country || headers.get('CF-IPCountry') || null;
    const region = cf.region || null;
    const regionCode = cf.regionCode || null;
    const city = cf.city || null;
    const postalCode = cf.postalCode || null;
    const latitude = cf.latitude ? String(cf.latitude) : null;
    const longitude = cf.longitude ? String(cf.longitude) : null;
    const timezone = cf.timezone || null;
    const metroCode = cf.metroCode ? String(cf.metroCode) : null;
    
    // Browser/Client Information
    const userAgent = headers.get('User-Agent') || null;
    const referer = headers.get('Referer') || null;
    const acceptLanguage = headers.get('Accept-Language') || null;
    const acceptEncoding = headers.get('Accept-Encoding') || null;
    const accept = headers.get('Accept') || null;
    const connection = headers.get('Connection') || null;
    
    // Request Details
    const requestMethod = request.method || null;
    const requestUrl = request.url || null;
    const url = new URL(request.url);
    const queryString = url.search || null;
    const httpProtocol = cf.httpProtocol || null;
    
    // Security/TLS Information
    const tlsVersion = cf.tlsVersion || null;
    const tlsCipher = cf.tlsCipher || null;
    
    // Cloudflare Specific
    const cfRay = headers.get('CF-Ray') || null;
    const cfColo = cf.colo || null;
    const cfCountry = headers.get('CF-IPCountry') || null;
    const isEUCountry = cf.isEUCountry !== undefined ? String(cf.isEUCountry) : null;
    
    // Serialize all headers for comprehensive tracking
    const allHeaders = {};
    for (const [key, value] of headers.entries()) {
      allHeaders[key] = value;
    }
    const allHeadersJson = JSON.stringify(allHeaders);
    
    // Serialize entire CF object for future reference
    const cfDataJson = JSON.stringify(cf);
    
    // Current timestamp
    const timestamp = new Date().toISOString();
    
    // Insert analytics data with ALL available information
    await env.DB.prepare(`
      INSERT INTO analytics (
        slug, timestamp,
        ip_address, asn, as_organization,
        continent, country, region, region_code, city, postal_code,
        latitude, longitude, timezone, metro_code,
        user_agent, referer, accept_language, accept_encoding, accept, connection,
        request_method, request_url, query_string, http_protocol,
        tls_version, tls_cipher,
        cf_ray, cf_colo, cf_ipcountry, cf_connecting_ip, is_eu_country,
        all_headers, cf_data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      slug,
      timestamp,
      ipAddress,
      asn,
      asOrganization,
      continent,
      country,
      region,
      regionCode,
      city,
      postalCode,
      latitude,
      longitude,
      timezone,
      metroCode,
      userAgent,
      referer,
      acceptLanguage,
      acceptEncoding,
      accept,
      connection,
      requestMethod,
      requestUrl,
      queryString,
      httpProtocol,
      tlsVersion,
      tlsCipher,
      cfRay,
      cfColo,
      cfCountry,
      ipAddress,
      isEUCountry,
      allHeadersJson,
      cfDataJson
    ).run();
    
    // Clean up old records - keep only the last 100 for this slug
    await env.DB.prepare(`
      DELETE FROM analytics
      WHERE slug = ? AND id NOT IN (
        SELECT id FROM analytics 
        WHERE slug = ?
        ORDER BY timestamp DESC
        LIMIT 100
      )
    `).bind(slug, slug).run();
    
  } catch (error) {
    // Don't fail the redirect if analytics capture fails
    console.error('Analytics capture error:', error);
  }
}

