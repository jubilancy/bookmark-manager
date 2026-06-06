/**
 * Bookmark Manager API
 * Cloudflare Workers + D1 Database
 * 
 * Endpoints:
 * GET  /api/bookmarks              - Get all bookmarks
 * GET  /api/bookmarks/:id          - Get single bookmark
 * POST /api/bookmarks              - Create bookmark
 * PUT  /api/bookmarks/:id          - Update bookmark
 * DELETE /api/bookmarks/:id        - Delete bookmark
 * GET  /api/tags                   - Get all tags
 * GET  /api/bookmarks/tag/:name    - Get bookmarks by tag
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // Route requests
      if (path === '/api/bookmarks' && method === 'GET') {
        return await getBookmarks(env, corsHeaders);
      }
      if (path.match(/^\/api\/bookmarks\/\d+$/) && method === 'GET') {
        const id = parseInt(path.split('/').pop());
        return await getBookmark(env, id, corsHeaders);
      }
      if (path === '/api/bookmarks' && method === 'POST') {
        return await createBookmark(request, env, corsHeaders);
      }
      if (path.match(/^\/api\/bookmarks\/\d+$/) && method === 'PUT') {
        const id = parseInt(path.split('/').pop());
        return await updateBookmark(request, env, id, corsHeaders);
      }
      if (path.match(/^\/api\/bookmarks\/\d+$/) && method === 'DELETE') {
        const id = parseInt(path.split('/').pop());
        return await deleteBookmark(env, id, corsHeaders);
      }
      if (path === '/api/tags' && method === 'GET') {
        return await getTags(env, corsHeaders);
      }
      if (path.match(/^\/api\/bookmarks\/tag\//) && method === 'GET') {
        const tagName = decodeURIComponent(path.split('/').pop());
        return await getBookmarksByTag(env, tagName, corsHeaders);
      }
      if (path === '/api/search' && method === 'GET') {
        return await searchBookmarks(url, env, corsHeaders);
      }

      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: corsHeaders }
      );
    } catch (error) {
      console.error('API Error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

// Get all bookmarks with tags
async function getBookmarks(env, corsHeaders) {
  const result = await env.DB.prepare(`
    SELECT 
      b.id, b.title, b.url, b.description, b.is_read, 
      b.created_at, b.updated_at,
      GROUP_CONCAT(t.name, ',') as tags
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).all();

  const bookmarks = result.results.map(row => ({
    ...row,
    tags: row.tags ? row.tags.split(',') : [],
    is_read: Boolean(row.is_read),
  }));

  return new Response(JSON.stringify(bookmarks), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Get single bookmark with tags
async function getBookmark(env, id, corsHeaders) {
  const result = await env.DB.prepare(`
    SELECT 
      b.id, b.title, b.url, b.description, b.is_read,
      b.created_at, b.updated_at,
      GROUP_CONCAT(t.name, ',') as tags
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    WHERE b.id = ?
    GROUP BY b.id
  `).bind(id).first();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Bookmark not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const bookmark = {
    ...result,
    tags: result.tags ? result.tags.split(',') : [],
    is_read: Boolean(result.is_read),
  };

  return new Response(JSON.stringify(bookmark), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Create bookmark
async function createBookmark(request, env, corsHeaders) {
  const { title, url, description, tags } = await request.json();

  if (!title || !url) {
    return new Response(
      JSON.stringify({ error: 'Title and URL are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Insert bookmark
  const bookmarkResult = await env.DB.prepare(
    'INSERT INTO bookmarks (title, url, description) VALUES (?, ?, ?)'
  ).bind(title, url, description || null).run();

  const bookmarkId = bookmarkResult.meta.last_row_id;

  // Insert tags
  if (tags && tags.length > 0) {
    for (const tagName of tags) {
      const tagResult = await env.DB.prepare(
        'INSERT OR IGNORE INTO tags (name) VALUES (?)'
      ).bind(tagName).run();

      const tag = await env.DB.prepare(
        'SELECT id FROM tags WHERE name = ?'
      ).bind(tagName).first();

      await env.DB.prepare(
        'INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)'
      ).bind(bookmarkId, tag.id).run();
    }
  }

  const bookmark = {
    id: bookmarkId,
    title,
    url,
    description: description || null,
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tags: tags || [],
  };

  return new Response(JSON.stringify(bookmark), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Update bookmark
async function updateBookmark(request, env, id, corsHeaders) {
  const { title, url, description, tags, is_read } = await request.json();

  // Check if bookmark exists
  const existing = await env.DB.prepare(
    'SELECT id FROM bookmarks WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return new Response(
      JSON.stringify({ error: 'Bookmark not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update bookmark
  const updateFields = [];
  const updateValues = [];

  if (title !== undefined) {
    updateFields.push('title = ?');
    updateValues.push(title);
  }
  if (url !== undefined) {
    updateFields.push('url = ?');
    updateValues.push(url);
  }
  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description);
  }
  if (is_read !== undefined) {
    updateFields.push('is_read = ?');
    updateValues.push(is_read ? 1 : 0);
  }

  updateFields.push('updated_at = ?');
  updateValues.push(new Date().toISOString());
  updateValues.push(id);

  if (updateFields.length > 1) {
    await env.DB.prepare(
      `UPDATE bookmarks SET ${updateFields.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();
  }

  // Update tags if provided
  if (tags !== undefined) {
    // Delete existing tags
    await env.DB.prepare(
      'DELETE FROM bookmark_tags WHERE bookmark_id = ?'
    ).bind(id).run();

    // Insert new tags
    for (const tagName of tags) {
      const tagResult = await env.DB.prepare(
        'INSERT OR IGNORE INTO tags (name) VALUES (?)'
      ).bind(tagName).run();

      const tag = await env.DB.prepare(
        'SELECT id FROM tags WHERE name = ?'
      ).bind(tagName).first();

      await env.DB.prepare(
        'INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)'
      ).bind(id, tag.id).run();
    }
  }

  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Delete bookmark
async function deleteBookmark(env, id, corsHeaders) {
  const existing = await env.DB.prepare(
    'SELECT id FROM bookmarks WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return new Response(
      JSON.stringify({ error: 'Bookmark not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  await env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Get all tags
async function getTags(env, corsHeaders) {
  const result = await env.DB.prepare(
    'SELECT name FROM tags ORDER BY name ASC'
  ).all();

  const tags = result.results.map(row => row.name);

  return new Response(JSON.stringify(tags), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Get bookmarks by tag
async function getBookmarksByTag(env, tagName, corsHeaders) {
  const result = await env.DB.prepare(`
    SELECT 
      b.id, b.title, b.url, b.description, b.is_read,
      b.created_at, b.updated_at,
      GROUP_CONCAT(t.name, ',') as tags
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    WHERE b.id IN (
      SELECT bt2.bookmark_id FROM bookmark_tags bt2
      JOIN tags t2 ON bt2.tag_id = t2.id
      WHERE t2.name = ?
    )
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).bind(tagName).all();

  const bookmarks = result.results.map(row => ({
    ...row,
    tags: row.tags ? row.tags.split(',') : [],
    is_read: Boolean(row.is_read),
  }));

  return new Response(JSON.stringify(bookmarks), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Search bookmarks
async function searchBookmarks(url, env, corsHeaders) {
  const query = url.searchParams.get('q') || '';

  if (!query) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const searchTerm = `%${query}%`;

  const result = await env.DB.prepare(`
    SELECT 
      b.id, b.title, b.url, b.description, b.is_read,
      b.created_at, b.updated_at,
      GROUP_CONCAT(t.name, ',') as tags
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    WHERE b.title LIKE ? OR b.url LIKE ? OR b.description LIKE ?
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).bind(searchTerm, searchTerm, searchTerm).all();

  const bookmarks = result.results.map(row => ({
    ...row,
    tags: row.tags ? row.tags.split(',') : [],
    is_read: Boolean(row.is_read),
  }));

  return new Response(JSON.stringify(bookmarks), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
