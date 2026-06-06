import React, { useState, useEffect } from 'react';
import { Bookmark, X, Plus, Search, Tag, Trash2, Download, Upload, Eye, EyeOff, Loader } from 'lucide-react';

const BookmarkManager = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showUnread, setShowUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  // API base URL - configure this!
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8787/api';

  // Load bookmarks from backend on mount
  useEffect(() => {
    loadBookmarks();
  }, []);

  // Update tags and local cache whenever bookmarks change
  useEffect(() => {
    const tags = new Set();
    bookmarks.forEach(b => b.tags?.forEach(t => tags.add(t)));
    setAllTags(Array.from(tags).sort());
    // Also cache in localStorage as fallback
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  // Fetch bookmarks from backend
  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/bookmarks`);
      if (!response.ok) throw new Error('Failed to load bookmarks');
      const data = await response.json();
      setBookmarks(data);
      setError(null);
    } catch (err) {
      console.error('Error loading bookmarks:', err);
      // Fallback to localStorage
      const cached = localStorage.getItem('bookmarks');
      if (cached) {
        setBookmarks(JSON.parse(cached));
        setError('Using cached data (offline mode)');
      } else {
        setError('Failed to load bookmarks. Backend unavailable.');
      }
    } finally {
      setLoading(false);
    }
  };

  const addOrUpdateBookmark = async () => {
    if (!title.trim() || !url.trim()) return;

    setSyncing(true);
    try {
      if (editingId) {
        // Update existing
        const response = await fetch(`${API_URL}/bookmarks/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            url,
            tags: selectedTags,
          }),
        });
        if (!response.ok) throw new Error('Failed to update bookmark');
        
        // Update local state
        setBookmarks(bookmarks.map(b =>
          b.id === editingId
            ? { ...b, title, url, tags: selectedTags, updatedAt: new Date().toISOString() }
            : b
        ));
        setEditingId(null);
      } else {
        // Create new
        const response = await fetch(`${API_URL}/bookmarks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            url,
            tags: selectedTags,
          }),
        });
        if (!response.ok) throw new Error('Failed to create bookmark');
        
        const newBookmark = await response.json();
        setBookmarks([newBookmark, ...bookmarks]);
      }

      setTitle('');
      setUrl('');
      setSelectedTags([]);
      setNewTag('');
      setShowForm(false);
      setError(null);
    } catch (err) {
      console.error('Error saving bookmark:', err);
      setError('Failed to save bookmark: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const deleteBookmark = async (id) => {
    if (!window.confirm('Delete this bookmark?')) return;

    setSyncing(true);
    try {
      const response = await fetch(`${API_URL}/bookmarks/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete bookmark');
      
      setBookmarks(bookmarks.filter(b => b.id !== id));
      setError(null);
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      setError('Failed to delete bookmark: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addNewTag = () => {
    if (newTag.trim() && !selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
      setNewTag('');
    }
  };

  const toggleRead = async (id) => {
    const bookmark = bookmarks.find(b => b.id === id);
    setSyncing(true);
    try {
      const response = await fetch(`${API_URL}/bookmarks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_read: !bookmark.is_read,
        }),
      });
      if (!response.ok) throw new Error('Failed to update read status');
      
      setBookmarks(bookmarks.map(b =>
        b.id === id ? { ...b, is_read: !b.is_read } : b
      ));
      setError(null);
    } catch (err) {
      console.error('Error updating read status:', err);
      setError('Failed to update: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const editBookmark = (bookmark) => {
    setTitle(bookmark.title);
    setUrl(bookmark.url);
    setSelectedTags(bookmark.tags || []);
    setEditingId(bookmark.id);
    setShowForm(true);
  };

  const exportBookmarks = () => {
    const dataStr = JSON.stringify(bookmarks, null, 2);
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(dataStr));
    element.setAttribute('download', `bookmarks-${new Date().toISOString().split('T')[0]}.json`);
    element.click();
  };

  const importBookmarks = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            setSyncing(true);
            // Add each imported bookmark
            for (const bookmark of imported) {
              await fetch(`${API_URL}/bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: bookmark.title,
                  url: bookmark.url,
                  description: bookmark.description,
                  tags: bookmark.tags || [],
                }),
              });
            }
            setError(null);
            await loadBookmarks(); // Reload all
          }
        } catch (err) {
          setError('Invalid JSON file: ' + err.message);
        } finally {
          setSyncing(false);
        }
      };
      reader.readAsText(file);
    }
  };

  // Filter bookmarks
  let filteredBookmarks = bookmarks;
  if (filterTag) {
    filteredBookmarks = filteredBookmarks.filter(b => b.tags?.includes(filterTag));
  }
  if (searchTerm) {
    filteredBookmarks = filteredBookmarks.filter(b =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.url.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
  if (showUnread) {
    filteredBookmarks = filteredBookmarks.filter(b => !b.is_read);
  }

  return (
    <div style={{ '--primary': '#2563eb', '--secondary': '#1e40af', '--accent': '#3b82f6' }} 
         className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
                <Bookmark className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Georgia, serif' }}>
                  ReadSave
                </h1>
                <p className="text-sm text-slate-500">
                  {syncing ? (
                    <span className="flex items-center gap-1">
                      <Loader className="w-3 h-3 animate-spin" /> Syncing...
                    </span>
                  ) : (
                    'Your personal bookmark archive'
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => document.getElementById('import-file').click()}
                disabled={syncing}
                className="p-2.5 hover:bg-slate-100 rounded-lg transition text-slate-600 disabled:opacity-50"
                title="Import bookmarks"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input id="import-file" type="file" accept=".json" onChange={importBookmarks} className="hidden" />
              <button
                onClick={exportBookmarks}
                disabled={syncing}
                className="p-2.5 hover:bg-slate-100 rounded-lg transition text-slate-600 disabled:opacity-50"
                title="Export bookmarks"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={loadBookmarks}
                disabled={loading || syncing}
                className="p-2.5 hover:bg-slate-100 rounded-lg transition text-slate-600 disabled:opacity-50"
                title="Refresh"
              >
                <Loader className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Error notification */}
          {error && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search bookmarks by title or URL..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Tag Filter & Unread Toggle */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setShowUnread(!showUnread)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                  showUnread
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {showUnread ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Unread
              </button>
              {filterTag && (
                <button
                  onClick={() => setFilterTag(null)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition font-medium whitespace-nowrap"
                >
                  {filterTag}
                  <X className="w-4 h-4" />
                </button>
              )}
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`px-3 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                    filterTag === tag
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Add Bookmark Button */}
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (editingId) {
              setEditingId(null);
              setTitle('');
              setUrl('');
              setSelectedTags([]);
              setNewTag('');
            }
          }}
          disabled={syncing}
          className="mb-8 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all hover:scale-105 disabled:opacity-50"
        >
          <Plus className="w-5 h-5" />
          {editingId ? 'Update Bookmark' : 'Add Bookmark'}
        </button>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6" style={{ fontFamily: 'Georgia, serif' }}>
              {editingId ? 'Edit Bookmark' : 'New Bookmark'}
            </h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Title</label>
                <input
                  type="text"
                  placeholder="e.g., Next.js Documentation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={syncing}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">URL</label>
                <input
                  type="url"
                  placeholder="https://nextjs.org/docs"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={syncing}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Tags</label>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {selectedTags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                    >
                      {tag}
                      <button
                        onClick={() => toggleTag(tag)}
                        className="hover:text-blue-900"
                        disabled={syncing}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Create or select a tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addNewTag()}
                    disabled={syncing}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                  <button
                    onClick={addNewTag}
                    disabled={syncing}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                {allTags.length > selectedTags.length && (
                  <div className="flex gap-2 flex-wrap">
                    {allTags.filter(t => !selectedTags.includes(t)).map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        disabled={syncing}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-sm transition disabled:opacity-50"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={addOrUpdateBookmark}
                  disabled={syncing || !title.trim() || !url.trim()}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  {syncing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader className="w-4 h-4 animate-spin" /> Saving...
                    </span>
                  ) : (
                    `${editingId ? 'Update' : 'Save'} Bookmark`
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setTitle('');
                    setUrl('');
                    setSelectedTags([]);
                    setNewTag('');
                    setEditingId(null);
                  }}
                  disabled={syncing}
                  className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bookmarks List */}
        <div className="grid gap-4">
          {loading ? (
            <div className="text-center py-16">
              <Loader className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-spin" />
              <p className="text-slate-500">Loading bookmarks...</p>
            </div>
          ) : filteredBookmarks.length === 0 ? (
            <div className="text-center py-16">
              <Bookmark className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-slate-900 mb-2">No bookmarks yet</h3>
              <p className="text-slate-500 mb-6">
                {searchTerm || filterTag || showUnread
                  ? 'Try adjusting your filters'
                  : 'Start by adding your first bookmark'}
              </p>
            </div>
          ) : (
            filteredBookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                className="group bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition p-5 flex gap-4 items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-bold text-blue-600 hover:text-blue-700 hover:underline line-clamp-2"
                    >
                      {bookmark.title}
                    </a>
                    <div className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
                      bookmark.is_read
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {bookmark.is_read ? 'Read' : 'Unread'}
                    </div>
                  </div>

                  <p className="text-sm text-slate-500 truncate mb-3">{bookmark.url}</p>

                  {bookmark.tags && bookmark.tags.length > 0 && (
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {bookmark.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium cursor-pointer hover:bg-blue-100 transition"
                          onClick={() => setFilterTag(tag)}
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-slate-400">
                    Added {new Date(bookmark.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => toggleRead(bookmark.id)}
                    disabled={syncing}
                    className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-600 hover:text-blue-600 disabled:opacity-50"
                    title={bookmark.is_read ? 'Mark as unread' : 'Mark as read'}
                  >
                    {bookmark.is_read ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => editBookmark(bookmark)}
                    disabled={syncing}
                    className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-600 hover:text-blue-600 disabled:opacity-50"
                    title="Edit"
                  >
                    <Bookmark className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => deleteBookmark(bookmark.id)}
                    disabled={syncing}
                    className="p-2 hover:bg-red-50 rounded-lg transition text-slate-600 hover:text-red-600 disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        {bookmarks.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-blue-600">{bookmarks.length}</p>
                <p className="text-sm text-slate-600 mt-2">Total Bookmarks</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold text-amber-600">
                  {bookmarks.filter(b => !b.is_read).length}
                </p>
                <p className="text-sm text-slate-600 mt-2">Unread</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold text-green-600">{allTags.length}</p>
                <p className="text-sm text-slate-600 mt-2">Tags</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookmarkManager;
