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
    if (path === '/admin' || path === '/api/add' || path === '/api/delete' || path === '/api/edit') {
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

    // GET /:slug - Redirect to destination (public)
    if (path !== '/' && request.method === 'GET') {
      const slug = path.substring(1); // Remove leading /
      return handleRedirect(slug, env);
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
          <td><a href="/${link.slug}" target="_blank">${link.slug}</a></td>
          <td><a href="${link.url}" target="_blank">${link.url}</a></td>
          <td>${link.clicks}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="action-btn" onclick="copyToClipboard('https://redirect.ballabotond.com/${link.slug}')">Copy</button>
              <button type="button" class="action-btn" onclick="downloadQR('https://redirect.ballabotond.com/${link.slug}', '${link.slug}')">QR</button>
              <button type="button" class="action-btn" onclick="showEditModal('${link.slug}', '${link.url.replace(/'/g, "\\'")}')">Edit</button>
              <button type="button" class="action-btn action-btn-delete" onclick="showDeleteConfirm('${link.slug}')">Delete</button>
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
  <title>URL Redirector Admin</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      padding: 1rem;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #ddd;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    header {
      background: #000;
      color: #fff;
      padding: 1.5rem;
      border-bottom: 2px solid #000;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
    }
    .subtitle {
      font-size: 0.875rem;
      margin-top: 0.25rem;
      opacity: 0.8;
    }
    .content {
      padding: 1.5rem;
    }
    .form-section {
      background: #fff;
      padding: 1.5rem;
      border: 1px solid #ddd;
      margin-bottom: 2rem;
    }
    .form-section h2 {
      margin-bottom: 1rem;
      color: #000;
      font-size: 1.125rem;
      font-weight: 600;
    }
    form {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .form-group {
      flex: 1;
      min-width: 250px;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: #000;
      font-weight: 500;
      font-size: 0.875rem;
    }
    input[type="url"] {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #000;
      font-size: 1rem;
      font-family: inherit;
    }
    input[type="url"]:focus {
      outline: 2px solid #000;
      outline-offset: -2px;
    }
    button {
      padding: 0.625rem 1.5rem;
      background: #000;
      color: #fff;
      border: 1px solid #000;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    button:hover {
      background: #333;
    }
    button:active {
      background: #555;
    }
    .action-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25rem;
    }
    .action-btn {
      padding: 0.25rem 0.5rem;
      background: #000;
      color: #fff;
      border: 1px solid #000;
      font-size: 0.75rem;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
    }
    .action-btn:hover {
      background: #333;
    }
    .action-btn:active {
      background: #555;
    }
    .action-btn-delete {
      background: #fff;
      color: #000;
    }
    .action-btn-delete:hover {
      background: #000;
      color: #fff;
    }
    .toast {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      background: #000;
      color: #fff;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-content {
      background: #fff;
      padding: 1.5rem;
      border: 1px solid #000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
      min-width: 300px;
    }
    .modal-content p {
      margin-bottom: 1.5rem;
      color: #000;
    }
    .modal-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    .modal-btn {
      padding: 0.5rem 1.5rem;
      border: 1px solid #000;
      font-size: 0.875rem;
      cursor: pointer;
      font-family: inherit;
    }
    .modal-btn-confirm {
      background: #000;
      color: #fff;
    }
    .modal-btn-confirm:hover {
      background: #333;
    }
    .modal-btn-cancel {
      background: #fff;
      color: #000;
    }
    .modal-btn-cancel:hover {
      background: #f5f5f5;
    }
    .table-section h2 {
      margin-bottom: 1rem;
      color: #000;
      font-size: 1.125rem;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #ddd;
    }
    th {
      background: #f5f5f5;
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
      color: #000;
      border: 1px solid #ddd;
      font-size: 0.875rem;
    }
    td {
      padding: 0.75rem;
      border: 1px solid #ddd;
      font-size: 0.875rem;
    }
    tr:hover {
      background: #fafafa;
    }
    td a {
      color: #000;
      text-decoration: underline;
    }
    td a:hover {
      opacity: 0.7;
    }
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #666;
    }
    .empty-state p {
      margin-top: 1rem;
    }
    @media (max-width: 768px) {
      body {
        padding: 0.5rem;
      }
      .content {
        padding: 1rem;
      }
      header {
        padding: 1rem;
      }
      h1 {
        font-size: 1.25rem;
      }
      .form-section {
        padding: 1rem;
      }
      form {
        flex-direction: column;
        align-items: stretch;
      }
      .form-group {
        min-width: 100%;
      }
      button {
        width: 100%;
      }
      table {
        font-size: 0.75rem;
      }
      th, td {
        padding: 0.5rem;
      }
      .action-buttons {
        grid-template-columns: 1fr;
      }
      .action-btn {
        padding: 0.3rem 0.5rem;
        font-size: 0.7rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>URL Redirector Admin</h1>
      <p class="subtitle">redirect.ballabotond.com</p>
    </header>
    
    <div class="content">
      <div class="form-section">
        <h2>Add New Redirect</h2>
        <form method="POST" action="/api/add">
          <div class="form-group">
            <label for="url">Destination URL</label>
            <input 
              type="url" 
              id="url" 
              name="url" 
              placeholder="https://example.com" 
              required
            >
          </div>
          <button type="submit">Generate Link</button>
        </form>
      </div>

      <div class="table-section">
        <h2>All Links (${results.length})</h2>
        ${
          results.length > 0
            ? `
        <table>
          <thead>
            <tr>
              <th>Slug</th>
              <th>Destination URL</th>
              <th>Clicks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${linksRows}
          </tbody>
        </table>
        `
            : `
        <div class="empty-state">
          <p>No links yet. Add your first redirect above.</p>
        </div>
        `
        }
      </div>
    </div>
    <div id="deleteModal" class="modal-overlay">
      <div class="modal-content">
        <p>Delete this link permanently?</p>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-confirm" onclick="confirmDelete()">Delete</button>
          <button class="modal-btn modal-btn-cancel" onclick="cancelDelete()">Cancel</button>
        </div>
      </div>
    </div>
    <div id="editModal" class="modal-overlay">
      <div class="modal-content">
        <p style="margin-bottom: 1rem; font-weight: 600;">Edit Link</p>
        <div style="text-align: left; margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Slug:</label>
          <input type="text" id="editSlugInput" style="width: 100%; padding: 0.5rem; border: 1px solid #000; font-size: 0.875rem; margin-bottom: 1rem;" placeholder="slug">
          <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem;">Destination URL:</label>
          <input type="url" id="editUrlInput" style="width: 100%; padding: 0.5rem; border: 1px solid #000; font-size: 0.875rem;" placeholder="https://example.com">
        </div>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-confirm" onclick="confirmEdit()">Save</button>
          <button class="modal-btn modal-btn-cancel" onclick="cancelEdit()">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <script>
    let pendingDeleteSlug = null;
    let pendingEditSlug = null;

    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.remove();
      }, 2000);
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Copied to clipboard');
      }).catch(function(err) {
        console.error('Failed to copy: ', err);
      });
    }

    function showDeleteConfirm(slug) {
      pendingDeleteSlug = slug;
      document.getElementById('deleteModal').classList.add('active');
    }

    function confirmDelete() {
      if (pendingDeleteSlug) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/delete';
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'slug';
        input.value = pendingDeleteSlug;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      }
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
      const newSlug = document.getElementById('editSlugInput').value;
      const newUrl = document.getElementById('editUrlInput').value;
      if (!newSlug || !newUrl) {
        showToast('Slug and URL are required');
        return;
      }
      if (pendingEditSlug) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/edit';
        const oldSlugInput = document.createElement('input');
        oldSlugInput.type = 'hidden';
        oldSlugInput.name = 'oldSlug';
        oldSlugInput.value = pendingEditSlug;
        const newSlugInput = document.createElement('input');
        newSlugInput.type = 'hidden';
        newSlugInput.name = 'newSlug';
        newSlugInput.value = newSlug;
        const urlInput = document.createElement('input');
        urlInput.type = 'hidden';
        urlInput.name = 'url';
        urlInput.value = newUrl;
        form.appendChild(oldSlugInput);
        form.appendChild(newSlugInput);
        form.appendChild(urlInput);
        document.body.appendChild(form);
        form.submit();
      }
    }

    function cancelEdit() {
      pendingEditSlug = null;
      document.getElementById('editModal').classList.remove('active');
    }

    function downloadQR(url, slug) {
      // Use QR Server API to generate QR code
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=' + encodeURIComponent(url);
      
      // Fetch the QR code image and download it
      fetch(qrUrl)
        .then(response => response.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = 'qr-' + slug + '.png';
          link.href = blobUrl;
          link.click();
          URL.revokeObjectURL(blobUrl);
          showToast('QR code downloaded');
        })
        .catch(error => {
          console.error('QR generation error:', error);
          showToast('Failed to generate QR code');
        });
    }
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
 * Handle GET /:slug - Redirect to destination URL
 */
async function handleRedirect(slug, env) {
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

    // Redirect to destination
    return Response.redirect(link.url, 302);
  } catch (error) {
    return new Response(`Error processing redirect: ${error.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
