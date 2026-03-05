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
    if (path === '/admin' || path === '/dashboard' || path === '/api/add' || path === '/api/delete' || path === '/api/edit' || path === '/api/analytics' || path === '/api/dashboard') {
      const authCheck = await checkAuth(request, env);
      if (!authCheck.authenticated) {
        return authCheck.response;
      }
    }

    // GET /admin - Admin UI
    if (path === '/admin' && request.method === 'GET') {
      return handleAdmin(env);
    }

    // GET /dashboard - Live analytics dashboard
    if (path === '/dashboard' && request.method === 'GET') {
      return handleDashboard(env);
    }

    // GET /api/dashboard - Dashboard data API
    if (path === '/api/dashboard' && request.method === 'GET') {
      return handleGetDashboard(url, env);
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
    const totalClicks = results.reduce(function(s, r) { return s + (r.clicks || 0); }, 0);

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

    /* ── Interpreted summary card ── */
    .rec-summary {
      background: rgba(91,141,238,0.05);
      border: 1px solid rgba(91,141,238,0.18);
      border-radius: var(--r-sm);
      padding: 0.75rem 1rem;
      margin-bottom: 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .rec-summary-title {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      margin-bottom: 0.15rem;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .sum-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.78rem;
    }
    .sum-icon { color: var(--accent); flex-shrink: 0; opacity: 0.75; margin-top: 1px; }
    .sum-label {
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      flex-shrink: 0;
      min-width: 60px;
      padding-top: 1px;
    }
    .sum-val { color: var(--text); line-height: 1.45; }
    .sum-tag {
      display: inline-block;
      font-size: 0.63rem;
      font-weight: 600;
      background: rgba(91,141,238,0.15);
      color: var(--accent);
      border-radius: 3px;
      padding: 0.05rem 0.3rem;
      margin-left: 0.35rem;
      vertical-align: middle;
      letter-spacing: 0.02em;
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

    /* ── Search bar ── */
    .search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-icon {
      position: absolute;
      left: 0.6rem;
      color: var(--muted);
      pointer-events: none;
    }
    .search-input {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 0.35rem 0.75rem 0.35rem 2rem;
      color: var(--text);
      font-size: 0.78rem;
      font-family: inherit;
      outline: none;
      width: 200px;
      transition: border-color 0.15s, width 0.2s;
    }
    .search-input::placeholder { color: var(--muted); }
    .search-input:focus { border-color: var(--accent); width: 260px; }

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
    <div style="display:flex;gap:0.5rem;align-items:center;">
      <span class="header-badge">${results.length} link${results.length !== 1 ? 's' : ''}</span>
      <span class="header-badge" style="color:var(--accent);border-color:rgba(91,141,238,0.3);background:rgba(91,141,238,0.08);">${totalClicks} click${totalClicks !== 1 ? 's' : ''}</span>
      <a href="/dashboard" style="display:inline-flex;align-items:center;gap:0.35rem;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);color:var(--muted);font-size:0.72rem;font-weight:600;padding:0.25rem 0.65rem;text-decoration:none;transition:all 0.15s;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--muted)'">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Live Analytics
      </a>
    </div>
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
      <input
        class="url-input slug-custom-input"
        type="text"
        id="customSlug"
        name="customSlug"
        placeholder="custom-slug (optional)"
        autocomplete="off"
        spellcheck="false"
        pattern="[a-zA-Z0-9_-]+"
        title="Letters, numbers, hyphens and underscores only"
        style="flex:0 0 180px;"
      >
      <button class="btn-primary" type="submit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add
      </button>
    </form>
  </div>

  <div class="table-header">
    <span class="section-title">Links</span>
    <div style="display:flex;align-items:center;gap:0.625rem;">
      <div class="search-wrap">
        <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="text" id="linkSearch" placeholder="Search slug or URL..." oninput="filterLinks(this.value)" autocomplete="off" spellcheck="false">
      </div>
      <span class="count-pill" id="countPill">${results.length} total</span>
    </div>
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

    // Close any modal on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      cancelDelete(); cancelEdit(); closeAnalytics();
    });
    // Close modals on backdrop click
    document.getElementById('deleteModal').addEventListener('click', function(e) {
      if (e.target === this) cancelDelete();
    });
    document.getElementById('editModal').addEventListener('click', function(e) {
      if (e.target === this) cancelEdit();
    });
    document.getElementById('analyticsModal').addEventListener('click', function(e) {
      if (e.target === this) closeAnalytics();
    });

    // Live search filter
    var allRows = null;
    function filterLinks(q) {
      if (!allRows) allRows = Array.prototype.slice.call(document.querySelectorAll('tbody tr'));
      q = q.toLowerCase().trim();
      var shown = 0;
      allRows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var match = !q || text.indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      var pill = document.getElementById('countPill');
      if (pill) pill.textContent = (q ? shown + ' of ' + allRows.length : allRows.length + ' total');
    }

    function toggleRecord(idx) {
      var body  = document.getElementById('rb-' + idx);
      var chev  = document.getElementById('rc-' + idx);
      var open  = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    var IPHONE_MODELS = {'10,1':'iPhone 8','10,2':'iPhone 8 Plus','10,3':'iPhone X','10,6':'iPhone X','11,2':'iPhone XS','11,4':'iPhone XS Max','11,6':'iPhone XS Max','11,8':'iPhone XR','12,1':'iPhone 11','12,3':'iPhone 11 Pro','12,5':'iPhone 11 Pro Max','13,1':'iPhone 12 mini','13,2':'iPhone 12','13,3':'iPhone 12 Pro','13,4':'iPhone 12 Pro Max','14,2':'iPhone 13 Pro','14,3':'iPhone 13 Pro Max','14,4':'iPhone 13 mini','14,5':'iPhone 13','14,6':'iPhone SE 3','14,7':'iPhone 14','14,8':'iPhone 14 Plus','15,2':'iPhone 14 Pro','15,3':'iPhone 14 Pro Max','15,4':'iPhone 15','15,5':'iPhone 15 Plus','16,1':'iPhone 15 Pro','16,2':'iPhone 15 Pro Max','17,1':'iPhone 16 Pro','17,2':'iPhone 16 Pro Max','17,3':'iPhone 16','17,4':'iPhone 16 Plus'};

    function parseUA(ua) {
      if (!ua) return {app:'Unknown', os:'Unknown', device:'Unknown', appTag:''};
      var app = 'Browser', os = 'Unknown', device = 'Unknown', appTag = '';
      if (ua.indexOf('FBAN') !== -1 || ua.indexOf('FBIOS') !== -1 || ua.indexOf('FBAV') !== -1 || ua.indexOf('FB_IAB') !== -1) {
        app = 'Facebook App'; appTag = 'in-app';
      } else if (ua.indexOf('Instagram') !== -1) {
        app = 'Instagram'; appTag = 'in-app';
      } else if (ua.indexOf('Twitter') !== -1 || ua.indexOf('TweetbotForiOS') !== -1) {
        app = 'Twitter / X'; appTag = 'in-app';
      } else if (ua.indexOf('LinkedInApp') !== -1) {
        app = 'LinkedIn'; appTag = 'in-app';
      } else if (ua.indexOf('Snapchat') !== -1) {
        app = 'Snapchat'; appTag = 'in-app';
      } else if (ua.indexOf('TikTok') !== -1 || ua.indexOf('musical_ly') !== -1) {
        app = 'TikTok'; appTag = 'in-app';
      } else if (ua.indexOf('WhatsApp') !== -1) {
        app = 'WhatsApp'; appTag = 'in-app';
      } else if (ua.indexOf('Telegram') !== -1) {
        app = 'Telegram'; appTag = 'in-app';
      } else if (ua.indexOf('EdgA/') !== -1 || ua.indexOf('EdgiOS/') !== -1 || ua.indexOf('Edg/') !== -1) {
        app = 'Microsoft Edge';
      } else if (ua.indexOf('OPR/') !== -1 || ua.indexOf('OPiOS') !== -1) {
        app = 'Opera';
      } else if (ua.indexOf('CriOS/') !== -1) {
        app = 'Chrome (iOS)';
      } else if (ua.indexOf('FxiOS/') !== -1) {
        app = 'Firefox (iOS)';
      } else if (ua.indexOf('Chrome/') !== -1) {
        app = 'Chrome';
      } else if (ua.indexOf('Firefox/') !== -1) {
        app = 'Firefox';
      } else if (ua.indexOf('Safari/') !== -1) {
        app = 'Safari';
      } else if (ua.indexOf('Googlebot') !== -1) {
        app = 'Googlebot'; appTag = 'bot';
      } else if (ua.indexOf('curl') !== -1) {
        app = 'curl'; appTag = 'cli';
      }

      // iOS
      var iosKey = ua.indexOf('CPU iPhone OS ') !== -1 ? 'CPU iPhone OS ' : (ua.indexOf('CPU OS ') !== -1 ? 'CPU OS ' : '');
      if (iosKey) {
        var iosRaw = ua.split(iosKey)[1] || '';
        var iosVer = iosRaw.split(' ')[0].split(')')[0].split('_').join('.');
        os = 'iOS ' + iosVer;
        device = ua.indexOf('iPad') !== -1 ? 'iPad' : 'iPhone';
        var hwIdx = ua.indexOf('iPhone');
        if (hwIdx !== -1) {
          var hwRaw = ua.substring(hwIdx + 7).split(' ')[0].split(')')[0];
          if (hwRaw.indexOf(',') !== -1) {
            var m = IPHONE_MODELS[hwRaw];
            if (m) device = m;
          }
        }
      } else if (ua.indexOf('Android') !== -1) {
        var andRaw = ua.split('Android ')[1] || '';
        os = 'Android ' + (andRaw.split(';')[0].split(')')[0].split(' ')[0] || '');
        device = ua.indexOf('Tablet') !== -1 ? 'Tablet' : 'Android Phone';
        var buildIdx = ua.indexOf('; ');
        if (buildIdx !== -1) {
          var afterSemi = ua.substring(buildIdx + 2);
          var buildTag = afterSemi.indexOf(' Build/');
          if (buildTag !== -1) {
            var candidate = afterSemi.substring(0, buildTag).trim();
            if (candidate.length > 1 && candidate.length < 50) device = candidate;
          }
        }
      } else if (ua.indexOf('Windows NT') !== -1) {
        var winVer = {'10.0':'10 / 11','6.3':'8.1','6.2':'8','6.1':'7','6.0':'Vista','5.1':'XP'};
        var winRaw = ua.split('Windows NT ')[1] || '';
        var winNum = winRaw.split(';')[0].split(')')[0].trim();
        os = 'Windows ' + (winVer[winNum] || winNum);
        device = 'Desktop';
      } else if (ua.indexOf('Mac OS X') !== -1) {
        var macRaw = ua.split('Mac OS X ')[1] || '';
        var macVer = macRaw.split(')')[0].split(' ')[0].split('_').join('.');
        os = 'macOS ' + macVer;
        device = 'Mac';
      } else if (ua.indexOf('Linux') !== -1) {
        os = 'Linux'; device = 'Desktop';
      }
      return {app:app, os:os, device:device, appTag:appTag};
    }

    function buildSummary(rec) {
      var ua = parseUA(rec.user_agent || '');
      var out = '<div class="rec-summary">';
      out += '<div class="rec-summary-title"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Summary</div>';

      // Device
      var dp = [];
      if (ua.device && ua.device !== 'Unknown') dp.push(ua.device);
      if (ua.os && ua.os !== 'Unknown') dp.push(ua.os);
      if (dp.length) {
        out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
        out += '<span class="sum-label">Device</span><span class="sum-val">' + dp.join(', ') + '</span></div>';
      }

      // App
      if (ua.app && ua.app !== 'Unknown' && ua.app !== 'Browser') {
        out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
        out += '<span class="sum-label">App</span><span class="sum-val">' + ua.app;
        if (ua.appTag) out += '<span class="sum-tag">' + ua.appTag + '</span>';
        out += '</span></div>';
      }

      // Source / referral
      var ref = rec.referer || '';
      var qs = rec.query_string || '';
      var src = '';
      if (ref.indexOf('facebook.com') !== -1 || qs.indexOf('fbclid') !== -1 || ua.app === 'Facebook App') {
        src = 'Facebook';
      } else if (ref.indexOf('instagram.com') !== -1 || ua.app === 'Instagram') {
        src = 'Instagram';
      } else if (ref.indexOf('twitter.com') !== -1 || ref.indexOf('t.co/') !== -1) {
        src = 'Twitter / X';
      } else if (ref.indexOf('linkedin.com') !== -1) {
        src = 'LinkedIn';
      } else if (ref.indexOf('reddit.com') !== -1) {
        src = 'Reddit';
      } else if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) {
        src = 'YouTube';
      } else if (ref.indexOf('whatsapp.com') !== -1) {
        src = 'WhatsApp';
      } else if (ref && ref.length > 0) {
        try { src = new URL(ref).hostname.replace('www.', ''); } catch(e) { src = ref.substring(0, 60); }
      } else {
        src = 'Direct / unknown';
      }
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      out += '<span class="sum-label">Source</span><span class="sum-val">' + src + '</span></div>';

      // Location
      var locParts = [rec.city, rec.region, rec.country].filter(Boolean);
      if (locParts.length) {
        var locStr = locParts.join(', ');
        if (rec.latitude && rec.longitude) locStr += '  \u00b7  ' + rec.latitude + ', ' + rec.longitude;
        out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
        out += '<span class="sum-label">Location</span><span class="sum-val">' + locStr;
        if (rec.is_eu_country) out += '<span class="sum-tag">EU</span>';
        out += '</span></div>';
      }

      // Network
      var netParts = [];
      if (rec.as_organization) netParts.push(rec.as_organization);
      if (rec.http_protocol && rec.tls_version) netParts.push(rec.http_protocol + ' \u00b7 ' + rec.tls_version);
      else if (rec.http_protocol) netParts.push(rec.http_protocol);
      if (netParts.length) {
        var modern = (rec.http_protocol === 'HTTP/3' || rec.http_protocol === 'HTTP/2') && rec.tls_version === 'TLSv1.3';
        out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
        out += '<span class="sum-label">Network</span><span class="sum-val">' + netParts.join('  \u00b7  ');
        if (modern) out += '<span class="sum-tag">modern + secure</span>';
        out += '</span></div>';
      }

      // Language
      if (rec.accept_language) {
        var lang = rec.accept_language.split(',')[0].trim().split(';')[0].trim();
        out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>';
        out += '<span class="sum-label">Language</span><span class="sum-val">' + lang + '</span></div>';
      }

      out += '</div>';
      return out;
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
            out += buildSummary(rec);
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
    const customSlug = (formData.get('customSlug') || '').trim();

    if (!url) {
      return new Response('URL is required', { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response('Invalid URL format', { status: 400 });
    }

    let slug;

    if (customSlug) {
      // Validate custom slug format
      if (!/^[a-zA-Z0-9_-]+$/.test(customSlug)) {
        return new Response('Slug may only contain letters, numbers, hyphens and underscores', { status: 400 });
      }
      // Check uniqueness
      const existing = await env.DB.prepare(
        'SELECT slug FROM links WHERE slug = ?'
      ).bind(customSlug).first();
      if (existing) {
        return new Response('Slug already in use', { status: 409 });
      }
      slug = customSlug;
    } else {
      // Generate a unique slug (retry if collision)
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        slug = generateSlug();
        const existing = await env.DB.prepare(
          'SELECT slug FROM links WHERE slug = ?'
        ).bind(slug).first();
        if (!existing) break;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        return new Response('Failed to generate unique slug. Please try again.', {
          status: 500,
        });
      }
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
 * Handle GET /api/dashboard - Aggregate analytics data for the dashboard
 */
async function handleGetDashboard(url, env) {
  const period = url.searchParams.get('period') || '24h';
  let wc;
  if (period === '24h')  wc = "timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-1 day'))";
  else if (period === '7d')  wc = "timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-7 days'))";
  else if (period === '30d') wc = "timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', '-30 days'))";
  else wc = '1=1';
  const tg = (period === '24h') ? "strftime('%Y-%m-%dT%H', timestamp)" : "strftime('%Y-%m-%d', timestamp)";
  try {
    const [ov, bySlug, byCo, byCity, byTime, bySrc, byDev, recent, uips, byProto, byTLS, byISP, byHour, byContinent] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as total_clicks, COUNT(DISTINCT country) as unique_countries, COUNT(DISTINCT city) as unique_cities, COUNT(DISTINCT slug) as active_slugs FROM analytics WHERE ' + wc).first(),
      env.DB.prepare('SELECT a.slug, l.url, COUNT(*) as count FROM analytics a LEFT JOIN links l ON a.slug = l.slug WHERE ' + wc + ' GROUP BY a.slug ORDER BY count DESC LIMIT 15').all(),
      env.DB.prepare("SELECT country, COUNT(*) as count FROM analytics WHERE country IS NOT NULL AND country != '' AND " + wc + ' GROUP BY country ORDER BY count DESC LIMIT 20').all(),
      env.DB.prepare("SELECT city, country, COUNT(*) as count FROM analytics WHERE city IS NOT NULL AND city != '' AND " + wc + ' GROUP BY city, country ORDER BY count DESC LIMIT 15').all(),
      env.DB.prepare('SELECT ' + tg + ' as t, COUNT(*) as count FROM analytics WHERE ' + wc + ' GROUP BY t ORDER BY t').all(),
      env.DB.prepare("SELECT CASE WHEN user_agent LIKE '%FBAN%' OR user_agent LIKE '%FBIOS%' OR user_agent LIKE '%FBAV%' THEN 'Facebook' WHEN user_agent LIKE '%Instagram%' THEN 'Instagram' WHEN user_agent LIKE '%Twitter%' THEN 'Twitter/X' WHEN user_agent LIKE '%WhatsApp%' THEN 'WhatsApp' WHEN user_agent LIKE '%Telegram%' THEN 'Telegram' WHEN referer LIKE '%linkedin.com%' THEN 'LinkedIn' WHEN referer LIKE '%reddit.com%' THEN 'Reddit' WHEN referer LIKE '%youtube.com%' THEN 'YouTube' WHEN referer LIKE '%twitter.com%' THEN 'Twitter/X' WHEN referer IS NULL OR referer = '' THEN 'Direct' ELSE 'Web Referral' END as source, COUNT(*) as count FROM analytics WHERE " + wc + ' GROUP BY source ORDER BY count DESC').all(),
      env.DB.prepare("SELECT CASE WHEN user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%' THEN 'iOS' WHEN user_agent LIKE '%Android%' THEN 'Android' WHEN user_agent LIKE '%Windows NT%' THEN 'Windows' WHEN user_agent LIKE '%Mac OS X%' THEN 'macOS' WHEN user_agent LIKE '%Linux%' THEN 'Linux' ELSE 'Unknown' END as os, COUNT(*) as count FROM analytics WHERE " + wc + ' GROUP BY os ORDER BY count DESC').all(),
      env.DB.prepare('SELECT id, slug, timestamp, city, country, region, latitude, longitude, user_agent, referer, http_protocol, tls_version, query_string, as_organization, ip_address, accept_language, is_eu_country FROM analytics WHERE ' + wc + ' ORDER BY timestamp DESC LIMIT 100').all(),
      env.DB.prepare('SELECT COUNT(DISTINCT ip_address) as unique_ips FROM analytics WHERE ' + wc).first(),
      env.DB.prepare("SELECT http_protocol as proto, COUNT(*) as count FROM analytics WHERE http_protocol IS NOT NULL AND http_protocol != '' AND " + wc + " GROUP BY http_protocol ORDER BY count DESC").all(),
      env.DB.prepare("SELECT tls_version as tls, COUNT(*) as count FROM analytics WHERE tls_version IS NOT NULL AND tls_version != '' AND " + wc + " GROUP BY tls_version ORDER BY count DESC").all(),
      env.DB.prepare("SELECT as_organization as isp, COUNT(*) as count FROM analytics WHERE as_organization IS NOT NULL AND as_organization != '' AND " + wc + " GROUP BY as_organization ORDER BY count DESC LIMIT 10").all(),
      env.DB.prepare("SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count FROM analytics WHERE " + wc + " GROUP BY hour ORDER BY hour").all(),
      env.DB.prepare("SELECT continent, COUNT(*) as count FROM analytics WHERE continent IS NOT NULL AND continent != '' AND " + wc + " GROUP BY continent ORDER BY count DESC").all(),
    ]);
    return new Response(JSON.stringify({
      overview: ov,
      bySlugs: bySlug.results,
      byCountry: byCo.results,
      byCity: byCity.results,
      byTime: byTime.results,
      bySource: bySrc.results,
      byDevice: byDev.results,
      recent: recent.results,
      uniqueIPs: uips ? uips.unique_ips : 0,
      byProtocol: byProto.results,
      byTLS: byTLS.results,
      byISP: byISP.results,
      byHour: byHour.results,
      byContinent: byContinent.results,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Handle GET /dashboard - Live analytics dashboard page
 */
async function handleDashboard(env) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Analytics \u2014 Redirector</title>
  <link rel="icon" href="/favicon.ico" type="image/svg+xml">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0c0c0e; --surface: #131316; --surface2: #1c1c20;
      --border: #2a2a30; --border2: #3a3a42;
      --text: #f0f0f2; --muted: #7a7a8a;
      --accent: #5b8dee; --danger: #e85d5d; --success: #4ade80;
      --radius: 8px; --r-sm: 5px;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    .app { max-width: 1400px; margin: 0 auto; padding: 0 1.25rem 3rem; }
    /* Header */
    .dh { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem; }
    .dh-left { display: flex; align-items: center; gap: 0.75rem; }
    .dh-icon { width: 30px; height: 30px; background: var(--accent); border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .dh-right { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .period-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--muted); font-size: 0.75rem; font-weight: 600; padding: 0.3rem 0.7rem; cursor: pointer; transition: all 0.15s; font-family: inherit; }
    .period-btn:hover { color: var(--text); border-color: var(--border2); }
    .period-btn.act { background: var(--accent); border-color: var(--accent); color: #fff; }
    .live-badge { display: flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; color: var(--muted); padding: 0 0.25rem; }
    .live-dot { width: 7px; height: 7px; background: var(--success); border-radius: 50%; animation: blink 2s ease-in-out infinite; }
    @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
    .back-link { display: inline-flex; align-items: center; gap: 0.35rem; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--muted); font-size: 0.75rem; font-weight: 500; padding: 0.3rem 0.7rem; text-decoration: none; transition: all 0.15s; }
    .back-link:hover { color: var(--text); border-color: var(--border2); }
    /* Cards */
    .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.875rem 1rem; }
    .card-lbl { font-size: 0.63rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin-bottom: 0.3rem; }
    .card-val { font-size: 1.7rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
    .card-sub { font-size: 0.68rem; color: var(--muted); margin-top: 0.25rem; }
    .ca .card-val { color: var(--accent); }
    /* Chart layout */
    .chart-full { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; margin-bottom: 0.75rem; }
    .chart-row { display: grid; gap: 0.75rem; margin-bottom: 0.75rem; }
    .g2 { grid-template-columns: 1fr 1fr; }
    .g3 { grid-template-columns: repeat(3, 1fr); }
    .chart-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; }
    .chart-lbl { font-size: 0.63rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin-bottom: 0.75rem; }
    .cw { position: relative; height: 240px; }
    .cw-lg { position: relative; height: 280px; }
    .cw-sm { position: relative; height: 200px; }
    /* Feed */
    .feed-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .feed-hdr { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); }
    .feed-hdr-lbl { font-size: 0.63rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); }
    .feed-overflow { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: var(--surface2); padding: 0.45rem 0.75rem; text-align: left; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
    tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; cursor: pointer; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--surface2); }
    td { padding: 0.45rem 0.75rem; font-size: 0.75rem; vertical-align: middle; }
    .fnew { animation: rowfade 1.5s ease-out; }
    @keyframes rowfade { from { background: rgba(91,141,238,0.13); } to { background: transparent; } }
    .fslug { font-family: 'SF Mono','Roboto Mono',monospace; font-size: 0.7rem; color: var(--accent); font-weight: 600; }
    .no-data { text-align: center; padding: 2.5rem; color: var(--muted); font-size: 0.875rem; }
    @media(max-width:1000px){ .g3{grid-template-columns:1fr 1fr;} }
    @media(max-width:1100px){ .cards{grid-template-columns:repeat(3,1fr);} }
    @media(max-width:720px){ .cards{grid-template-columns:repeat(3,1fr);} .g2,.g3{grid-template-columns:1fr;} }
    @media(max-width:480px){ .cards{grid-template-columns:repeat(2,1fr);} }
    /* Detail Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 10000; padding: 1rem; }
    .modal-overlay.active { display: flex; }
    .modal-detail { background: var(--surface); border: 1px solid var(--border2); border-radius: 10px; padding: 1.5rem; width: 100%; max-width: 550px; max-height: 87vh; overflow-y: auto; box-shadow: 0 16px 48px rgba(0,0,0,0.5); animation: modalIn 0.2s ease-out; scrollbar-width: thin; scrollbar-color: var(--border2) transparent; }
    @keyframes modalIn { from { opacity:0; transform: scale(0.96) translateY(-8px); } to { opacity:1; transform: scale(1) translateY(0); } }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; padding-bottom: 0.9rem; border-bottom: 1px solid var(--border); }
    .modal-title { font-size: 0.95rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .close-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0.25rem; border-radius: var(--r-sm); transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
    .close-btn:hover { background: var(--surface2); color: var(--text); }
    .detail-meta { display: grid; gap: 0.5rem; font-size: 0.75rem; margin-bottom: 1rem; }
    .meta-row { display: flex; align-items: flex-start; gap: 0.5rem; }
    .meta-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); min-width: 70px; flex-shrink: 0; padding-top: 1px; }
    .meta-val { color: var(--text); word-break: break-word; font-family: monospace; font-size: 0.7rem; }
    .rec-summary { background: rgba(91,141,238,0.05); border: 1px solid rgba(91,141,238,0.18); border-radius: var(--r-sm); padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.45rem; }
    .rec-summary-title { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin-bottom: 0.15rem; display: flex; align-items: center; gap: 0.3rem; }
    .sum-row { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.78rem; }
    .sum-icon { color: var(--accent); flex-shrink: 0; opacity: 0.75; margin-top: 1px; }
    .sum-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); flex-shrink: 0; min-width: 60px; padding-top: 1px; }
    .sum-val { color: var(--text); line-height: 1.45; }
    .sum-tag { display: inline-block; font-size: 0.63rem; font-weight: 600; background: rgba(91,141,238,0.15); color: var(--accent); border-radius: 3px; padding: 0.12rem 0.35rem; margin-left: 0.35rem; }
  </style>
</head>
<body>
<div class="app">
  <header class="dh">
    <div class="dh-left">
      <div class="dh-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </div>
      <div>
        <div style="font-size:0.95rem;font-weight:600;">Live Analytics</div>
        <div style="font-size:0.7rem;color:var(--muted);margin-top:1px;">redirect.ballabotond.com</div>
      </div>
    </div>
    <div class="dh-right">
      <div class="live-badge"><div class="live-dot"></div><span id="lastUp">loading...</span></div>
      <button class="period-btn act" data-p="24h">24h</button>
      <button class="period-btn" data-p="7d">7d</button>
      <button class="period-btn" data-p="30d">30d</button>
      <button class="period-btn" data-p="all">All</button>
      <a class="back-link" href="/admin">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Admin
      </a>
    </div>
  </header>

  <div class="cards">
    <div class="card ca"><div class="card-lbl">Total Clicks</div><div class="card-val" id="cTotal">—</div><div class="card-sub" id="cPer">...</div></div>
    <div class="card"><div class="card-lbl">Active Slugs</div><div class="card-val" id="cSlugs">—</div><div class="card-sub">with traffic</div></div>
    <div class="card"><div class="card-lbl">Countries</div><div class="card-val" id="cCo">—</div><div class="card-sub">unique</div></div>
    <div class="card"><div class="card-lbl">Cities</div><div class="card-val" id="cCi">—</div><div class="card-sub">unique</div></div>
    <div class="card ca"><div class="card-lbl">Top Slug</div><div class="card-val" id="cTop" style="font-size:1.05rem;font-family:monospace;">—</div><div class="card-sub" id="cTopN">—</div></div>
    <div class="card"><div class="card-lbl">Unique IPs</div><div class="card-val" id="cIPs">—</div><div class="card-sub">approx. visitors</div></div>
  </div>

  <div class="chart-full">
    <div class="chart-lbl">Traffic Over Time</div>
    <div class="cw-lg"><canvas id="chartTime"></canvas></div>
  </div>

  <div class="chart-row g2">
    <div class="chart-box"><div class="chart-lbl">Clicks by Slug</div><div class="cw-lg"><canvas id="chartSlug"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">Traffic by Country</div><div class="cw-lg"><canvas id="chartCountry"></canvas></div></div>
  </div>

  <div class="chart-row g3">
    <div class="chart-box"><div class="chart-lbl">Traffic Source</div><div class="cw-sm"><canvas id="chartSource"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">OS / Device</div><div class="cw-sm"><canvas id="chartDevice"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">Top Cities</div><div class="cw-sm"><canvas id="chartCity"></canvas></div></div>
  </div>

  <div class="chart-row g3">
    <div class="chart-box"><div class="chart-lbl">Hour of Day (UTC)</div><div class="cw-sm"><canvas id="chartHour"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">HTTP Protocol</div><div class="cw-sm"><canvas id="chartProto"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">Continent</div><div class="cw-sm"><canvas id="chartContinent"></canvas></div></div>
  </div>

  <div class="chart-row g2">
    <div class="chart-box"><div class="chart-lbl">Top ISPs / Networks</div><div class="cw-lg"><canvas id="chartISP"></canvas></div></div>
    <div class="chart-box"><div class="chart-lbl">TLS Version</div><div class="cw-lg"><canvas id="chartTLS"></canvas></div></div>
  </div>

  <div class="feed-wrap">
    <div class="feed-hdr">
      <span class="feed-hdr-lbl">Live Click Feed</span>
      <div class="live-badge"><div class="live-dot"></div><span>updates every second</span></div>
    </div>
    <div id="feedCont"><div class="no-data">Loading...</div></div>
  </div>
</div>

<div class="modal-overlay" id="detailModal">
  <div class="modal-detail">
    <div class="modal-header">
      <div class="modal-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Click Detail
      </div>
      <button class="close-btn" onclick="closeDetail()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div id="detailContent"></div>
  </div>
</div>

<script>
  var cur = '24h';
  var ch = {};
  var prevIds = {};
  var isFirst = true;
  var COLS = ['#5b8dee','#4ade80','#f59e0b','#e85d5d','#a855f7','#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6'];
  var CN = {"AF":"Afghanistan","AL":"Albania","DZ":"Algeria","AD":"Andorra","AO":"Angola","AG":"Antigua & Barbuda","AR":"Argentina","AM":"Armenia","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia & Herzegovina","BW":"Botswana","BR":"Brazil","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","CV":"Cape Verde","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CF":"C. African Rep.","TD":"Chad","CL":"Chile","CN":"China","CO":"Colombia","KM":"Comoros","CG":"Congo","CD":"DR Congo","CR":"Costa Rica","CI":"Ivory Coast","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Rep.","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","SZ":"Eswatini","ET":"Ethiopia","FJ":"Fiji","FI":"Finland","FR":"France","GA":"Gabon","GM":"Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GR":"Greece","GD":"Grenada","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HN":"Honduras","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Iran","IQ":"Iraq","IE":"Ireland","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Laos","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MR":"Mauritania","MU":"Mauritius","MX":"Mexico","FM":"Micronesia","MD":"Moldova","MC":"Monaco","MN":"Mongolia","ME":"Montenegro","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PL":"Poland","PT":"Portugal","QA":"Qatar","RO":"Romania","RU":"Russia","RW":"Rwanda","KN":"Saint Kitts & Nevis","LC":"Saint Lucia","VC":"Saint Vincent","WS":"Samoa","SM":"San Marino","ST":"Sao Tome & Principe","SA":"Saudi Arabia","SN":"Senegal","RS":"Serbia","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","SS":"South Sudan","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SE":"Sweden","CH":"Switzerland","SY":"Syria","TW":"Taiwan","TJ":"Tajikistan","TZ":"Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TO":"Tonga","TT":"Trinidad & Tobago","TN":"Tunisia","TR":"Turkey","TM":"Turkmenistan","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"UAE","GB":"United Kingdom","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"};
  var IPHONE_MODELS = {'10,1':'iPhone 8','10,2':'iPhone 8 Plus','10,3':'iPhone X','10,6':'iPhone X','11,2':'iPhone XS','11,4':'iPhone XS Max','11,6':'iPhone XS Max','11,8':'iPhone XR','12,1':'iPhone 11','12,3':'iPhone 11 Pro','12,5':'iPhone 11 Pro Max','13,1':'iPhone 12 mini','13,2':'iPhone 12','13,3':'iPhone 12 Pro','13,4':'iPhone 12 Pro Max','14,2':'iPhone 13 Pro','14,3':'iPhone 13 Pro Max','14,4':'iPhone 13 mini','14,5':'iPhone 13','14,6':'iPhone SE 3','14,7':'iPhone 14','14,8':'iPhone 14 Plus','15,2':'iPhone 14 Pro','15,3':'iPhone 14 Pro Max','15,4':'iPhone 15','15,5':'iPhone 15 Plus','16,1':'iPhone 15 Pro','16,2':'iPhone 15 Pro Max','17,1':'iPhone 16 Pro','17,2':'iPhone 16 Pro Max','17,3':'iPhone 16','17,4':'iPhone 16 Plus'};
  var recentData = [];
  function cn(c) { return CN[c] || c; }

  function parseUA(ua) {
    if (!ua) return {app:'Unknown', os:'Unknown', device:'Unknown', appTag:''};
    var app = 'Browser', os = 'Unknown', device = 'Unknown', appTag = '';
    if (ua.indexOf('FBAN') !== -1 || ua.indexOf('FBIOS') !== -1 || ua.indexOf('FBAV') !== -1 || ua.indexOf('FB_IAB') !== -1) {
      app = 'Facebook App'; appTag = 'in-app';
    } else if (ua.indexOf('Instagram') !== -1) {
      app = 'Instagram'; appTag = 'in-app';
    } else if (ua.indexOf('Twitter') !== -1 || ua.indexOf('TweetbotForiOS') !== -1) {
      app = 'Twitter / X'; appTag = 'in-app';
    } else if (ua.indexOf('LinkedInApp') !== -1) {
      app = 'LinkedIn'; appTag = 'in-app';
    } else if (ua.indexOf('Snapchat') !== -1) {
      app = 'Snapchat'; appTag = 'in-app';
    } else if (ua.indexOf('TikTok') !== -1 || ua.indexOf('musical_ly') !== -1) {
      app = 'TikTok'; appTag = 'in-app';
    } else if (ua.indexOf('WhatsApp') !== -1) {
      app = 'WhatsApp'; appTag = 'in-app';
    } else if (ua.indexOf('Telegram') !== -1) {
      app = 'Telegram'; appTag = 'in-app';
    } else if (ua.indexOf('EdgA/') !== -1 || ua.indexOf('EdgiOS/') !== -1 || ua.indexOf('Edg/') !== -1) {
      app = 'Microsoft Edge';
    } else if (ua.indexOf('OPR/') !== -1 || ua.indexOf('OPiOS') !== -1) {
      app = 'Opera';
    } else if (ua.indexOf('CriOS/') !== -1) {
      app = 'Chrome (iOS)';
    } else if (ua.indexOf('FxiOS/') !== -1) {
      app = 'Firefox (iOS)';
    } else if (ua.indexOf('Chrome/') !== -1) {
      app = 'Chrome';
    } else if (ua.indexOf('Firefox/') !== -1) {
      app = 'Firefox';
    } else if (ua.indexOf('Safari/') !== -1) {
      app = 'Safari';
    } else if (ua.indexOf('Googlebot') !== -1) {
      app = 'Googlebot'; appTag = 'bot';
    } else if (ua.indexOf('curl') !== -1) {
      app = 'curl'; appTag = 'cli';
    }
    var iosKey = ua.indexOf('CPU iPhone OS ') !== -1 ? 'CPU iPhone OS ' : (ua.indexOf('CPU OS ') !== -1 ? 'CPU OS ' : '');
    if (iosKey) {
      var iosRaw = ua.split(iosKey)[1] || '';
      var iosVer = iosRaw.split(' ')[0].split(')')[0].split('_').join('.');
      os = 'iOS ' + iosVer;
      device = ua.indexOf('iPad') !== -1 ? 'iPad' : 'iPhone';
      var hwIdx = ua.indexOf('iPhone');
      if (hwIdx !== -1) {
        var hwRaw = ua.substring(hwIdx + 7).split(' ')[0].split(')')[0];
        if (hwRaw.indexOf(',') !== -1) {
          var m = IPHONE_MODELS[hwRaw];
          if (m) device = m;
        }
      }
    } else if (ua.indexOf('Android') !== -1) {
      var andRaw = ua.split('Android ')[1] || '';
      os = 'Android ' + (andRaw.split(';')[0].split(')')[0].split(' ')[0] || '');
      device = ua.indexOf('Tablet') !== -1 ? 'Tablet' : 'Android Phone';
      var buildIdx = ua.indexOf('; ');
      if (buildIdx !== -1) {
        var afterSemi = ua.substring(buildIdx + 2);
        var buildTag = afterSemi.indexOf(' Build/');
        if (buildTag !== -1) {
          var candidate = afterSemi.substring(0, buildTag).trim();
          if (candidate.length > 1 && candidate.length < 50) device = candidate;
        }
      }
    } else if (ua.indexOf('Windows NT') !== -1) {
      var winVer = {'10.0':'10 / 11','6.3':'8.1','6.2':'8','6.1':'7','6.0':'Vista','5.1':'XP'};
      var winRaw = ua.split('Windows NT ')[1] || '';
      var winNum = winRaw.split(';')[0].split(')')[0].trim();
      os = 'Windows ' + (winVer[winNum] || winNum);
      device = 'Desktop';
    } else if (ua.indexOf('Mac OS X') !== -1) {
      var macRaw = ua.split('Mac OS X ')[1] || '';
      var macVer = macRaw.split(')')[0].split(' ')[0].split('_').join('.');
      os = 'macOS ' + macVer;
      device = 'Mac';
    } else if (ua.indexOf('Linux') !== -1) {
      os = 'Linux'; device = 'Desktop';
    }
    return {app:app, os:os, device:device, appTag:appTag};
  }

  function buildSummary(rec) {
    var ua = parseUA(rec.user_agent || '');
    var out = '<div class="rec-summary">';
    out += '<div class="rec-summary-title"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Summary</div>';
    var dp = [];
    if (ua.device && ua.device !== 'Unknown') dp.push(ua.device);
    if (ua.os && ua.os !== 'Unknown') dp.push(ua.os);
    if (dp.length) {
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
      out += '<span class="sum-label">Device</span><span class="sum-val">' + dp.join(', ') + '</span></div>';
    }
    if (ua.app && ua.app !== 'Unknown' && ua.app !== 'Browser') {
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
      out += '<span class="sum-label">App</span><span class="sum-val">' + ua.app;
      if (ua.appTag) out += '<span class="sum-tag">' + ua.appTag + '</span>';
      out += '</span></div>';
    }
    var ref = rec.referer || '';
    var qs = rec.query_string || '';
    var src = '';
    if (ref.indexOf('facebook.com') !== -1 || qs.indexOf('fbclid') !== -1 || ua.app === 'Facebook App') {
      src = 'Facebook';
    } else if (ref.indexOf('instagram.com') !== -1 || ua.app === 'Instagram') {
      src = 'Instagram';
    } else if (ref.indexOf('twitter.com') !== -1 || ref.indexOf('t.co/') !== -1) {
      src = 'Twitter / X';
    } else if (ref.indexOf('linkedin.com') !== -1) {
      src = 'LinkedIn';
    } else if (ref.indexOf('reddit.com') !== -1) {
      src = 'Reddit';
    } else if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) {
      src = 'YouTube';
    } else if (ref.indexOf('whatsapp.com') !== -1) {
      src = 'WhatsApp';
    } else if (ref && ref.length > 0) {
      try { src = new URL(ref).hostname.replace('www.', ''); } catch(e) { src = ref.substring(0, 60); }
    } else {
      src = 'Direct / unknown';
    }
    out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    out += '<span class="sum-label">Source</span><span class="sum-val">' + src + '</span></div>';
    var locParts = [rec.city, rec.region, rec.country].filter(Boolean);
    if (locParts.length) {
      var locStr = locParts.join(', ');
      if (rec.latitude && rec.longitude) locStr += '  \u00b7  ' + rec.latitude + ', ' + rec.longitude;
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
      out += '<span class="sum-label">Location</span><span class="sum-val">' + locStr;
      if (rec.is_eu_country) out += '<span class="sum-tag">EU</span>';
      out += '</span></div>';
    }
    var netParts = [];
    if (rec.as_organization) netParts.push(rec.as_organization);
    if (rec.http_protocol && rec.tls_version) netParts.push(rec.http_protocol + ' \u00b7 ' + rec.tls_version);
    else if (rec.http_protocol) netParts.push(rec.http_protocol);
    if (netParts.length) {
      var modern = (rec.http_protocol === 'HTTP/3' || rec.http_protocol === 'HTTP/2') && rec.tls_version === 'TLSv1.3';
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      out += '<span class="sum-label">Network</span><span class="sum-val">' + netParts.join('  \u00b7  ');
      if (modern) out += '<span class="sum-tag">modern + secure</span>';
      out += '</span></div>';
    }
    if (rec.accept_language) {
      var lang = rec.accept_language.split(',')[0].trim().split(';')[0].trim();
      out += '<div class="sum-row"><svg class="sum-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>';
      out += '<span class="sum-label">Language</span><span class="sum-val">' + lang + '</span></div>';
    }
    out += '</div>';
    return out;
  }

  function showDetail(idx) {
    var rec = recentData[idx];
    if (!rec) return;
    var d = new Date(rec.timestamp);
    var html = '<div class="detail-meta">';
    html += '<div class="meta-row"><span class="meta-label">Timestamp</span><span class="meta-val">' + d.toLocaleString() + '</span></div>';
    html += '<div class="meta-row"><span class="meta-label">Slug</span><span class="meta-val">/' + (rec.slug || '') + '</span></div>';
    if (rec.ip_address) html += '<div class="meta-row"><span class="meta-label">IP Address</span><span class="meta-val">' + rec.ip_address + '</span></div>';
    html += '</div>';
    html += buildSummary(rec);
    if (rec.user_agent) {
      html += '<div class="detail-meta" style="margin-top:1rem;"><div class="meta-row"><span class="meta-label">User Agent</span><span class="meta-val" style="word-break:break-all;font-size:0.68rem;">' + rec.user_agent + '</span></div></div>';
    }
    document.getElementById('detailContent').innerHTML = html;
    document.getElementById('detailModal').classList.add('active');
  }

  function closeDetail() {
    document.getElementById('detailModal').classList.remove('active');
  }

  document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) closeDetail();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDetail();
  });

  Chart.defaults.color = '#7a7a8a';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

  function setPeriod(p) {
    cur = p;
    document.querySelectorAll('.period-btn').forEach(function(b) {
      b.classList.toggle('act', b.getAttribute('data-p') === p);
    });
    refresh();
  }

  function refresh() {
    fetch('/api/dashboard?period=' + cur)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        renderDash(d);
        var now = new Date();
        document.getElementById('lastUp').textContent = now.toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit',second:'2-digit'});
      })
      .catch(function(e) { console.error('refresh error', e); });
  }

  function renderDash(d) {
    var ov = d.overview || {};
    document.getElementById('cTotal').textContent = (ov.total_clicks || 0).toLocaleString();
    document.getElementById('cSlugs').textContent = ov.active_slugs || 0;
    document.getElementById('cCo').textContent = ov.unique_countries || 0;
    document.getElementById('cCi').textContent = ov.unique_cities || 0;
    document.getElementById('cIPs').textContent = (d.uniqueIPs || 0).toLocaleString();
    var pmap = {'24h':'last 24 hours','7d':'last 7 days','30d':'last 30 days','all':'all time'};
    document.getElementById('cPer').textContent = pmap[cur] || '';
    if (d.bySlugs && d.bySlugs.length) {
      document.getElementById('cTop').textContent = '/' + d.bySlugs[0].slug;
      document.getElementById('cTopN').textContent = d.bySlugs[0].count + ' clicks';
    }
    makeTimeChart(d.byTime || []);
    makeSlugChart(d.bySlugs || []);
    makeDonut('chartCountry', (d.byCountry || []).map(function(r){ return cn(r.country); }), (d.byCountry||[]).map(function(r){ return r.count; }));
    makeDonut('chartSource', (d.bySource||[]).map(function(r){ return r.source; }), (d.bySource||[]).map(function(r){ return r.count; }));
    makeDonut('chartDevice', (d.byDevice||[]).map(function(r){ return r.os; }), (d.byDevice||[]).map(function(r){ return r.count; }));
    makeCityChart(d.byCity || []);
    makeHourChart(d.byHour || []);
    makeDonut('chartProto', (d.byProtocol||[]).map(function(r){ return r.proto; }), (d.byProtocol||[]).map(function(r){ return r.count; }));
    makeDonut('chartContinent', (d.byContinent||[]).map(function(r){ return r.continent; }), (d.byContinent||[]).map(function(r){ return r.count; }));
    makeISPChart(d.byISP || []);
    makeDonut('chartTLS', (d.byTLS||[]).map(function(r){ return r.tls; }), (d.byTLS||[]).map(function(r){ return r.count; }));
    renderFeed(d.recent || []);
  }

  function fmtLabel(t) {
    if (!t) return '';
    var ti = t.indexOf('T');
    if (ti !== -1) return t.substring(ti + 1) + ':00';
    var p = t.split('-');
    if (p.length === 3) {
      var ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return ms[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
    }
    return t;
  }

  var TT = { backgroundColor:'#1c1c20', titleColor:'#f0f0f2', bodyColor:'#7a7a8a', borderColor:'#3a3a42', borderWidth:1, padding:10 };

  function makeTimeChart(rows) {
    var labels = rows.map(function(r) { return fmtLabel(r.t); });
    var vals = rows.map(function(r) { return r.count; });
    if (ch.time) {
      ch.time.data.labels = labels;
      ch.time.data.datasets[0].data = vals;
      ch.time.update('none');
    } else {
      ch.time = new Chart(document.getElementById('chartTime'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Clicks', data: vals, borderColor: '#5b8dee', backgroundColor: 'rgba(91,141,238,0.10)', fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#5b8dee', pointHoverRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: TT }, scales: { x: { ticks: { maxTicksLimit: 16 }, grid: { display: false } }, y: { beginAtZero: true } } }
      });
    }
  }

  function makeSlugChart(rows) {
    var data = rows.slice(0, 12);
    var labels = data.map(function(r) { return '/' + r.slug; });
    var vals = data.map(function(r) { return r.count; });
    if (ch.slug) {
      ch.slug.data.labels = labels;
      ch.slug.data.datasets[0].data = vals;
      ch.slug.update('none');
    } else {
      ch.slug = new Chart(document.getElementById('chartSlug'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Clicks', data: vals, backgroundColor: COLS, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TT }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { display: false } } } }
      });
    }
  }

  function makeDonut(id, labels, vals) {
    if (ch[id]) {
      ch[id].data.labels = labels;
      ch[id].data.datasets[0].data = vals;
      ch[id].update('none');
    } else {
      ch[id] = new Chart(document.getElementById(id), {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: vals, backgroundColor: COLS, borderColor: '#131316', borderWidth: 2, hoverOffset: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: '#f0f0f2', font: { size: 10 }, padding: 8, boxWidth: 10, pointStyle: 'circle', usePointStyle: true } }, tooltip: TT } }
      });
    }
  }

  function makeCityChart(rows) {
    var data = rows.slice(0, 12);
    var labels = data.map(function(r) { return r.city + (r.country ? ', ' + r.country : ''); });
    var vals = data.map(function(r) { return r.count; });
    if (ch.city) {
      ch.city.data.labels = labels;
      ch.city.data.datasets[0].data = vals;
      ch.city.update('none');
    } else {
      ch.city = new Chart(document.getElementById('chartCity'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Clicks', data: vals, backgroundColor: 'rgba(91,141,238,0.7)', borderColor:'#5b8dee', borderWidth:1, borderRadius:3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TT }, scales: { x: { ticks: { maxRotation: 40, font: { size: 9 } }, grid: { display: false } }, y: { beginAtZero: true } } }
      });
    }
  }

  function makeHourChart(rows) {
    var labels = [];
    var vals = [];
    var lookup = {};
    rows.forEach(function(r) { lookup[r.hour] = r.count; });
    for (var h = 0; h < 24; h++) {
      var hStr = (h < 10 ? '0' : '') + h + ':00';
      labels.push(hStr);
      vals.push(lookup[h] || 0);
    }
    var maxV = Math.max.apply(null, vals) || 1;
    var colors = vals.map(function(v) {
      var a = 0.2 + 0.7 * (v / maxV);
      return 'rgba(91,141,238,' + a.toFixed(2) + ')';
    });
    if (ch.hour) {
      ch.hour.data.labels = labels;
      ch.hour.data.datasets[0].data = vals;
      ch.hour.data.datasets[0].backgroundColor = colors;
      ch.hour.update('none');
    } else {
      ch.hour = new Chart(document.getElementById('chartHour'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Clicks', data: vals, backgroundColor: colors, borderRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TT }, scales: { x: { ticks: { maxRotation: 0, font: { size: 8 }, maxTicksLimit: 12 }, grid: { display: false } }, y: { beginAtZero: true } } }
      });
    }
  }

  function makeISPChart(rows) {
    var data = rows.slice(0, 10);
    var labels = data.map(function(r) { return r.isp || 'Unknown'; });
    var vals = data.map(function(r) { return r.count; });
    if (ch.isp) {
      ch.isp.data.labels = labels;
      ch.isp.data.datasets[0].data = vals;
      ch.isp.update('none');
    } else {
      ch.isp = new Chart(document.getElementById('chartISP'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Clicks', data: vals, backgroundColor: COLS, borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: TT }, scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } } }
      });
    }
  }

  function gApp(ua) {
    if (!ua) return 'Unknown';
    if (ua.indexOf('FBAN') !== -1 || ua.indexOf('FBIOS') !== -1 || ua.indexOf('FBAV') !== -1) return 'Facebook';
    if (ua.indexOf('Instagram') !== -1) return 'Instagram';
    if (ua.indexOf('WhatsApp') !== -1) return 'WhatsApp';
    if (ua.indexOf('Telegram') !== -1) return 'Telegram';
    if (ua.indexOf('Twitter') !== -1) return 'Twitter/X';
    if (ua.indexOf('TikTok') !== -1) return 'TikTok';
    if (ua.indexOf('Snapchat') !== -1) return 'Snapchat';
    if (ua.indexOf('EdgA') !== -1 || ua.indexOf('Edg/') !== -1) return 'Edge';
    if (ua.indexOf('CriOS') !== -1) return 'Chrome iOS';
    if (ua.indexOf('FxiOS') !== -1) return 'Firefox iOS';
    if (ua.indexOf('OPR') !== -1) return 'Opera';
    if (ua.indexOf('Chrome') !== -1) return 'Chrome';
    if (ua.indexOf('Firefox') !== -1) return 'Firefox';
    if (ua.indexOf('Safari') !== -1) return 'Safari';
    return 'Other';
  }
  function gOS(ua) {
    if (!ua) return '';
    if (ua.indexOf('iPhone') !== -1) return 'iOS';
    if (ua.indexOf('iPad') !== -1) return 'iPadOS';
    if (ua.indexOf('Android') !== -1) return 'Android';
    if (ua.indexOf('Windows') !== -1) return 'Windows';
    if (ua.indexOf('Mac OS') !== -1) return 'macOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    return '';
  }
  function gSrc(rec) {
    var ref = rec.referer || '';
    var qs = rec.query_string || '';
    var ua = rec.user_agent || '';
    if (ref.indexOf('facebook.com') !== -1 || qs.indexOf('fbclid') !== -1 || ua.indexOf('FBAN') !== -1 || ua.indexOf('FBIOS') !== -1) return 'Facebook';
    if (ref.indexOf('instagram.com') !== -1 || ua.indexOf('Instagram') !== -1) return 'Instagram';
    if (ref.indexOf('twitter.com') !== -1 || ref.indexOf('t.co/') !== -1) return 'Twitter/X';
    if (ref.indexOf('linkedin.com') !== -1) return 'LinkedIn';
    if (ref.indexOf('reddit.com') !== -1) return 'Reddit';
    if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) return 'YouTube';
    if (ref.indexOf('whatsapp.com') !== -1 || ua.indexOf('WhatsApp') !== -1) return 'WhatsApp';
    if (ref.indexOf('telegram') !== -1 || ua.indexOf('Telegram') !== -1) return 'Telegram';
    if (!ref) return 'Direct';
    try { return new URL(ref).hostname.replace('www.', ''); } catch(e) { return ref.substring(0, 30); }
  }

  function renderFeed(recent) {
    recentData = recent;
    var newIds = {};
    recent.forEach(function(r) { if (r.id) newIds[r.id] = true; });
    if (!recent.length) {
      document.getElementById('feedCont').innerHTML = '<div class="no-data">No data for this period</div>';
      prevIds = newIds; isFirst = false; return;
    }
    var tbl = '<div class="feed-overflow"><table><thead><tr>';
    tbl += '<th>Slug</th><th>Time</th><th>Location</th><th>App</th><th>OS</th><th>Source</th><th>Protocol</th><th>ISP</th><th>IP</th>';
    tbl += '</tr></thead><tbody id="fBody"></tbody></table></div>';
    document.getElementById('feedCont').innerHTML = tbl;
    var rows = '';
    recent.forEach(function(rec, idx) {
      var isNew = !isFirst && !prevIds[rec.id];
      var d = new Date(rec.timestamp);
      var time = d.toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit',second:'2-digit'});
      var date = d.toLocaleDateString(undefined, {month:'short',day:'numeric'});
      var loc = [rec.city, rec.country].filter(Boolean).join(', ');
      var app = gApp(rec.user_agent || '');
      var os = gOS(rec.user_agent || '');
      var src = gSrc(rec);
      var net = '';
      if (rec.http_protocol && rec.tls_version) net = rec.http_protocol + ' / ' + rec.tls_version;
      else if (rec.http_protocol) net = rec.http_protocol;
      var isp = rec.as_organization || '';
      var ip = rec.ip_address || '';
      rows += '<tr class="' + (isNew ? 'fnew' : '') + '" onclick="showDetail(' + idx + ')" style="cursor:pointer;">';
      rows += '<td><span class="fslug">/' + (rec.slug || '') + '</span></td>';
      rows += '<td style="white-space:nowrap"><span style="font-variant-numeric:tabular-nums">' + time + '</span><br><span style="font-size:0.65rem;color:var(--muted)">' + date + '</span></td>';
      rows += '<td style="white-space:nowrap">' + (loc || '<span style="color:var(--muted)">—</span>') + '</td>';
      rows += '<td style="white-space:nowrap">' + app + '</td>';
      rows += '<td style="white-space:nowrap;color:var(--muted)">' + os + '</td>';
      rows += '<td style="white-space:nowrap">' + src + '</td>';
      rows += '<td style="font-size:0.7rem;color:var(--muted);white-space:nowrap">' + net + '</td>';
      rows += '<td style="font-size:0.7rem;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + isp + '">' + isp + '</td>';
      rows += '<td style="font-size:0.7rem;color:var(--muted);font-family:monospace;white-space:nowrap">' + ip + '</td>';
      rows += '</tr>';
    });
    document.getElementById('fBody').innerHTML = rows;
    prevIds = newIds; isFirst = false;
  }

  document.querySelectorAll('.period-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setPeriod(this.getAttribute('data-p')); });
  });
  refresh();
  setInterval(refresh, 1000);
<\/script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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

