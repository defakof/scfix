// scfix: the UI (isolated world). Renders the app inside a shadow root over soundcloud.com
// and talks to page.js (MAIN world) through window messages: state comes in, commands go out.
(() => {
  'use strict';
  if (window.__scfixUI) return;
  window.__scfixUI = true;

  // ---------------------------------------------------------------------------
  // Icons (static strings, the only innerHTML used)
  // ---------------------------------------------------------------------------
  const svg = (w, vb, d, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}/></svg>`;
  const I = {
    play: '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1v12l10-6z" fill="currentColor"/></svg>',
    pause: '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3" height="12" fill="currentColor"/><rect x="9" y="1" width="3" height="12" fill="currentColor"/></svg>',
    playBig: '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1v12l10-6z" fill="currentColor"/></svg>',
    pauseBig: '<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3" height="12" fill="currentColor"/><rect x="9" y="1" width="3" height="12" fill="currentColor"/></svg>',
    prev: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5v11M13 2.8v10.4L5.5 8z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    next: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 2.5v11M3 2.8v10.4L10.5 8z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    shuffle: svg(18, 18, 'M2.5 5h2.6c3.5 0 4.3 8 7.8 8h2.6M13.2 10.6l2.3 2.4-2.3 2.4M2.5 13h2.6c1.2 0 2-.9 2.7-2.1M10.2 7.1C10.9 5.9 11.7 5 12.9 5h2.6M13.2 2.6L15.5 5l-2.3 2.4'),
    repeat: svg(18, 18, 'M3.5 8.5V7.4A2.4 2.4 0 0 1 5.9 5h8.6M12.2 2.6L14.6 5l-2.4 2.4M14.5 9.5v1.1a2.4 2.4 0 0 1-2.4 2.4H3.5M5.8 15.4L3.4 13l2.4-2.4'),
    heart: svg(18, 18, 'M9 14.6S2.8 10.9 2.8 6.6A3.1 3.1 0 0 1 9 5.2a3.1 3.1 0 0 1 6.2 1.4c0 4.3-6.2 8-6.2 8z'),
    heartOn: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 14.6S2.8 10.9 2.8 6.6A3.1 3.1 0 0 1 9 5.2a3.1 3.1 0 0 1 6.2 1.4c0 4.3-6.2 8-6.2 8z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    vol: svg(18, 18, 'M3 7h2.6L9 4v10l-3.4-3H3zM12 6.4a3.6 3.6 0 0 1 0 5.2M14.1 4.3a6.6 6.6 0 0 1 0 9.4'),
    muted: svg(18, 18, 'M3 7h2.6L9 4v10l-3.4-3H3zM12 7l4 4M16 7l-4 4'),
    queue: svg(18, 18, 'M3 4.5h12M3 9h12M3 13.5h7M13 12v4l3-2z'),
    expand: svg(18, 18, 'M10.5 3h4.5v4.5M15 3l-5 5M7.5 15H3v-4.5M3 15l5-5'),
    back: svg(16, 16, 'M10 3L5 8l5 5'),
    x: svg(12, 12, 'M2.5 2.5l7 7M9.5 2.5l-7 7'),
    search: svg(16, 18, 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zM11.6 11.6L15 15'),
    ext: svg(10, 12, 'M3.5 8.5l5-5M4.5 3.5h4v4'),
    feed: svg(18, 18, 'M3 4.5h12M3 9h12M3 13.5h7'),
    likes: svg(18, 18, 'M9 14.6S2.8 10.9 2.8 6.6A3.1 3.1 0 0 1 9 5.2a3.1 3.1 0 0 1 6.2 1.4c0 4.3-6.2 8-6.2 8z'),
    playlists: svg(18, 18, 'M3 4.5h9M3 8.5h9M3 12.5h5M13.5 10v5M11 12.5h5'),
    following: svg(18, 18, 'M6.5 8.5a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zM2 15c0-2.5 2-4.2 4.5-4.2S11 12.5 11 15M12 4a2.4 2.4 0 0 1 0 4.4M13.5 10.9c1.4.6 2.5 2 2.5 4.1'),
    history: svg(18, 18, 'M9 2.8a6.2 6.2 0 1 1-6 7.7M2.8 4.5v3.3h3.3M9 5.6V9l2.4 1.6'),
    gear: svg(16, 16, 'M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3'),
    moon: svg(16, 16, 'M13.6 9.6A5.8 5.8 0 0 1 6.4 2.4a5.8 5.8 0 1 0 7.2 7.2z'),
    sun: svg(16, 16, 'M8 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zM8 1v1.4M8 13.6V15M1 8h1.4M13.6 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1'),
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'icon') el.innerHTML = v; // static icon markup only
      else if (k === 'style') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const icon = name => { const s = document.createElement('span'); s.style.display = 'contents'; s.innerHTML = I[name]; return s; };
  const fmt = ms => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const nf = n => (n || 0).toLocaleString('en-US');
  const NOW_YEAR = new Date().getFullYear();
  const month = iso => { const d = new Date(iso); const m = d.toLocaleString('en-US', { month: 'long' }); return d.getFullYear() === NOW_YEAR ? m : m + ' ' + d.getFullYear(); };
  const day = iso => new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short' });
  const unplayable = t => t.policy === 'BLOCK' || t.policy === 'SNIP';
  function cover(t, cls = 'cover') {
    const el = h('span', { class: cls, 'aria-hidden': 'true' });
    if (t && t.art) el.style.backgroundImage = `url("${t.art}")`;
    else el.textContent = t && t.artist ? t.artist.slice(0, 1).toLowerCase() : '';
    return el;
  }

  // ---------------------------------------------------------------------------
  // Settings (chrome.storage) and state
  // ---------------------------------------------------------------------------
  const DEFAULTS = { theme: 'system', accent: 'rust', echo: true, mini: true, fullShuffle: true, includeEarlier: true, preload: true, lookahead: 120, style: 'wave', smooth: 0.8, zoom: 60, height: 1, feedReposts: true, feedLiked: true, on: true };
  const S = { set: Object.assign({}, DEFAULTS), st: { ready: false }, view: 'likes', params: {}, key: 'likes', lastMain: 'likes', me: undefined, owner: null, likes: null, likedPlaylists: null, likesErr: null, filter: '', sort: 'recent' };
  const save = () => chrome.storage.local.set({ scfix: S.set });
  const pageConfig = () => cmd('config', { fullShuffle: S.set.fullShuffle, includeEarlier: S.set.includeEarlier, preload: S.set.preload, lookahead: S.set.lookahead, style: S.set.style, smooth: S.set.smooth, zoom: S.set.zoom, height: S.set.height });

  // ---------------------------------------------------------------------------
  // Bridge to page.js
  // ---------------------------------------------------------------------------
  const send = (type, data) => window.postMessage(Object.assign({ __scfix: 'toPage', type }, data), location.origin);
  const cmd = (op, ...args) => send('cmd', { op, args });
  let rpcId = 0;
  const pending = new Map();
  const rpc = (method, ...args) => new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    send('rpc', { id, method, args });
    setTimeout(() => { if (pending.delete(id)) reject(new Error('timeout')); }, 90000);
  });
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__scfix !== 'toUI') return;
    const m = e.data;
    if (m.type === 'state') onState(m.state);
    if (m.type === 'rpc' && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    }
  });

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  let host, app, mainEl, B = {}, N = {}, rowById = new Map();

  function mount() {
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Display:ital,wght@0,400;0,500;1,400&family=Golos+Text:wght@400;500;600&family=Great+Vibes&family=Comforter+Brush&display=swap';
    document.head.append(fonts);
    const hide = document.createElement('style');
    hide.textContent = 'html.scfix-on, html.scfix-on body { overflow: hidden !important; }';
    document.head.append(hide);

    host = h('div', { id: 'scfix-host' });
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    fetch(chrome.runtime.getURL('app.css')).then(r => r.text()).then(css => { style.textContent = css; });
    app = h('div', { class: 'app' });
    const pill = h('button', { class: 'pill', type: 'button', onclick: () => setOn(true), 'aria-label': 'Back to scfix' }, h('b', {}, 'scfix'), 'Back');
    root.append(style, app, pill);
    document.documentElement.append(host);

    app.append(h('div', { class: 'shell' }, sidebar(), mainEl = h('main', { class: 'main' })), bar(), now());
    applyTheme();
    setOn(S.set.on);
    show('likes');
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  function setOn(on) {
    S.set.on = on;
    save();
    host.classList.toggle('classic', !on);
    document.documentElement.classList.toggle('scfix-on', on);
  }
  function classic(path) {
    if (path) cmd('navigate', path);
    setOn(false);
  }
  function applyTheme() {
    const dark = S.set.theme === 'dark' || (S.set.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    app.dataset.theme = dark ? 'dark' : 'light';
    app.dataset.accent = S.set.accent;
    if (B.themeBtn) {
      B.themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
      B.themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  // Views: likes, playlists, playlist {id}, artist {permalink}, search {q, tab}, feed, following,
  // settings, and now (Now Playing, drawn over the rest). go() remembers where you were; back() returns.
  const PAGES = { likes: () => likesPage(), settings: () => settingsPage(), playlists: () => playlistsPage(), playlist: () => playlistPage(),
    artist: () => artistPage(), search: () => searchPage(), feed: () => feedPage(), following: () => followingPage() };
  const NAV_OF = { playlist: 'playlists', artist: 'following' };
  const stack = [];
  function go(view, params) {
    const from = S.view === 'now' ? S.lastMain : S.view;
    stack.push({ view: from, params: S.params, top: mainEl.scrollTop });
    if (stack.length > 50) stack.shift();
    S.params = params || {};
    show(view);
  }
  function back() {
    if (S.view === 'now') return show(S.lastMain);
    const prev = stack.pop();
    S.params = prev ? prev.params : {};
    show(prev ? prev.view : 'likes');
    if (prev) mainEl.scrollTop = prev.top || 0;
  }
  function show(view) {
    const key = view + JSON.stringify(S.params || {});
    const same = S.key === key && S.view === view, top = mainEl.scrollTop;
    S.view = view;
    app.dataset.view = view;
    if (view !== 'now') { S.lastMain = view; S.key = key; }
    const nav = NAV_OF[view] || view;
    for (const b of app.querySelectorAll('[data-nav]')) {
      if (b.dataset.nav === nav) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (PAGES[view]) { rowById = new Map(); mainEl.replaceChildren(PAGES[view]()); }
    if (view !== 'now') mainEl.scrollTop = same ? top : 0;
    onState(S.st);
  }

  // ---------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------
  function sidebar() {
    const item = (label, ic, opts) => h('button', Object.assign({ class: 'nav-i', type: 'button' }, opts.nav ? { 'data-nav': opts.nav, onclick: () => go(opts.nav) } : { onclick: () => classic(opts.path), title: 'Opens in classic SoundCloud' }),
      icon(ic), h('span', {}, label), opts.count ? h('span', { class: 'count', 'data-count': opts.nav }, '') : null,
      opts.nav ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : h('span', { class: 'ext' }, icon('ext')));
    B.themeBtn = h('button', { class: 'round', type: 'button', onclick: () => { const dark = app.dataset.theme === 'dark'; S.set.theme = dark ? 'light' : 'dark'; save(); applyTheme(); } });
    B.who = h('span', { class: 'who' }, '');
    B.avatar = h('span', { class: 'avatar', 'aria-hidden': 'true' });
    return h('nav', { class: 'side', 'aria-label': 'Main' },
      h('button', { class: 'logo', type: 'button', onclick: () => go('likes'), 'aria-label': 'scfix by defakof, home', style: { background: 'none', border: '0', padding: '0', textAlign: 'left' } },
        h('span', { class: 'logo-word' }, 'scfix'),
        h('span', { class: 'logo-by' }, h('small', {}, 'by'), h('span', {}, 'defakof'))),
      h('div', { class: 'nav' },
        item('Feed', 'feed', { nav: 'feed' }),
        item('Search', 'search', { nav: 'search' })),
      h('div', { class: 'nav' },
        h('span', { class: 'nav-h' }, 'Library'),
        item('Likes', 'likes', { nav: 'likes', count: true }),
        item('Playlists', 'playlists', { nav: 'playlists' }),
        item('Following', 'following', { nav: 'following' }),
        item('History', 'history', { path: '/you/history' })),
      B.pls = h('div', { class: 'nav', hidden: true }),
      h('div', { class: 'side-foot' }, B.avatar, B.who, B.themeBtn,
        h('button', { class: 'round', type: 'button', 'data-nav': 'settings', onclick: () => go('settings'), 'aria-label': 'Settings' }, icon('gear'))));
  }

  // ---------------------------------------------------------------------------
  // Likes
  // ---------------------------------------------------------------------------
  let listEl, countEl, ownerEl;

  async function loadLikes() {
    try {
      const m = location.pathname.match(/^\/([^/]+)\/likes\/?$/);
      S.me = await rpc('me');
      if (S.me) {
        B.who.textContent = S.me.username;
        if (S.me.avatar) B.avatar.style.backgroundImage = `url("${S.me.avatar}")`;
        else B.avatar.textContent = S.me.username.slice(0, 1).toLowerCase();
      } else {
        B.who.textContent = 'Not signed in';
      }
      if (m && m[1] !== 'you' && (!S.me || m[1] !== S.me.permalink)) S.owner = Object.assign(await rpc('resolve', '/' + m[1]), { self: false });
      else if (S.me) S.owner = Object.assign({}, S.me, { self: true });
      else S.owner = null;
      if (S.view === 'likes') show('likes');
      if (!S.owner) return;
      loadSidebarPlaylists();
      const res = await rpc('likes', S.owner.id, S.owner.self);
      S.likes = res.tracks;
      S.likedPlaylists = res.playlists;
    } catch (err) {
      S.likesErr = err.message;
    }
    for (const c of app.querySelectorAll('[data-count="likes"]')) c.textContent = S.likes && S.owner && S.owner.self ? nf(S.likes.length) : '';
    if (S.view === 'likes') show('likes');
  }
  async function loadSidebarPlaylists() {
    try {
      const key = 'playlists:' + S.owner.id;
      const list = loaded.get(key) || await rpc('playlists', S.owner.id);
      loaded.set(key, list);
      if (!list.length) return;
      B.pls.replaceChildren(h('span', { class: 'nav-h' }, S.owner.self ? 'Your playlists' : 'Playlists'),
        ...list.slice(0, 8).map(p => h('button', { class: 'nav-pl', type: 'button', title: p.title, onclick: () => go('playlist', { id: p.id }) }, p.title)));
      B.pls.hidden = false;
    } catch (err) { /* the sidebar list is optional */ }
  }

  const route = () => (S.owner.self ? '/you/likes' : `/${S.owner.permalink}/likes`);
  function play(t, shuffle) {
    if (!t) return;
    cmd('playTrack', { route: route(), id: t.id, permalink: t.url, shuffle });
  }
  function playable() { return (S.likes || []).filter(t => !unplayable(t)); }

  function likesPage() {
    const o = S.owner;
    const filter = h('input', { type: 'search', placeholder: 'Filter by title or artist', value: S.filter, oninput: e => { S.filter = e.target.value; renderList(); } });
    const sort = h('select', { onchange: e => { S.sort = e.target.value; renderList(); } },
      ...[['recent', 'Recently liked'], ['title', 'Title'], ['artist', 'Artist'], ['length', 'Length']].map(([v, l]) => h('option', { value: v, selected: S.sort === v }, l)));
    countEl = h('span', { class: 'big-num' }, S.likes ? nf(S.likes.length) : '…');
    ownerEl = h('span', { class: 'serif-i' }, S.likes ? 'tracks' : 'loading likes');
    listEl = h('div', { role: 'table', 'aria-label': 'Liked tracks' });
    const page = h('div', { class: 'page' },
      h('header', { class: 'head' },
        h('div', { class: 'head-l' },
          h('span', { class: 'kicker' }, o && !o.self ? o.username : 'Library'),
          h('h1', { class: 'h1' }, 'Likes')),
        h('div', { class: 'head-r' }, countEl, ownerEl)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn solid', type: 'button', disabled: !S.likes, onclick: () => { const p = playable(); play(p[Math.floor(Math.random() * p.length)], true); } }, icon('shuffle'), 'Shuffle all'),
        h('button', { class: 'btn', type: 'button', disabled: !S.likes, onclick: () => play(playable()[0], false) }, icon('play'), 'Play in order'),
        h('div', { class: 'grow' },
          h('label', { class: 'field' }, h('span', { class: 'sr' }, 'Filter likes'), icon('search'), filter),
          h('label', { class: 'sel' }, 'Sort', sort))),
      listEl);
    renderList();
    return page;
  }

  function renderList() {
    if (!listEl) return;
    rowById = new Map();
    if (S.likesErr) return listEl.replaceChildren(h('p', { class: 'empty' }, 'Couldn’t load likes: ' + S.likesErr));
    if (!S.owner && S.me === null) return listEl.replaceChildren(h('p', { class: 'empty' }, 'Sign in to SoundCloud to see your likes, or open someone’s likes page.'));
    if (!S.likes) return listEl.replaceChildren(h('p', { class: 'empty' }, 'Loading likes…'));
    const q = S.filter.trim().toLowerCase();
    let items = q ? S.likes.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)) : S.likes.slice();
    const by = { title: (a, b) => a.title.localeCompare(b.title), artist: (a, b) => a.artist.localeCompare(b.artist), length: (a, b) => a.duration - b.duration }[S.sort];
    if (by) items.sort(by);
    countEl.textContent = nf(q ? items.length : S.likes.length);
    ownerEl.textContent = q ? `of ${nf(S.likes.length)} tracks` : 'tracks';

    const frag = document.createDocumentFragment();
    frag.append(tableHead([GENRE, LIKED]));
    let lastMonth = null;
    items.forEach((t, i) => {
      if (S.sort === 'recent' && !q) {
        const m = month(t.likedAt);
        if (m !== lastMonth) { lastMonth = m; frag.append(h('div', { class: 'month', role: 'row' }, h('span', { role: 'cell' }, m))); }
      }
      frag.append(trackRow(t, i + 1, play, [GENRE, LIKED]));
    });
    if (!items.length) frag.append(h('p', { class: 'empty' }, 'Nothing matches “' + S.filter + '”.'));
    listEl.replaceChildren(frag);
    highlight();
  }

  const LIKED = ['Liked', t => day(t.likedAt)];
  let lit = null;
  function highlight() {
    const id = S.st.track && S.st.track.id;
    if (lit && lit.dataset) lit.classList.remove('current', 'paused');
    lit = rowById.get(id) || null;
    if (lit) { lit.classList.add('current'); lit.classList.toggle('paused', !S.st.playing); }
  }

  // ---------------------------------------------------------------------------
  // Screens: playlists, playlist, artist, search, feed, following
  // ---------------------------------------------------------------------------
  const longDur = ms => { const m = Math.round((ms || 0) / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  const longDate = iso => new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const permalinkOf = url => (url || '').replace(/^\//, '');
  const keep = (...xs) => xs.flat().filter(x => x != null && x !== false);

  // Playing a list: steer SoundCloud to the page that lists it, then start the track.
  function playFrom(route, t, shuffle) { if (t && route) cmd('playTrack', { route, id: t.id, permalink: t.url, shuffle }); }
  function shuffleFrom(route, items) { const p = items.filter(t => !unplayable(t)); playFrom(route, p[Math.floor(Math.random() * p.length)], true); }
  function inOrderFrom(route, items) { playFrom(route, items.filter(t => !unplayable(t))[0], false); }

  function backLink() {
    return stack.length ? h('button', { class: 'back', type: 'button', onclick: back, style: { alignSelf: 'flex-start', marginBottom: '-12px' } }, icon('back'), 'Back') : null;
  }
  function head(kicker, title, right, cls) {
    return h('header', { class: 'head' },
      h('div', { class: 'head-l' }, h('span', { class: 'kicker' }, kicker), h('h1', { class: 'h1' + (cls ? ' ' + cls : '') }, title)),
      right ? h('div', { class: 'head-r' }, ...right) : null);
  }
  const section = (title, ...body) => h('section', { class: 'block' }, h('h2', { class: 'h2' }, title), ...body);
  function listActions(route, items, ...extra) {
    const none = !items.some(t => !unplayable(t));
    return h('div', { class: 'actions' },
      h('button', { class: 'btn solid', type: 'button', disabled: none, onclick: () => shuffleFrom(route, items) }, icon('shuffle'), 'Shuffle all'),
      h('button', { class: 'btn', type: 'button', disabled: none, onclick: () => inOrderFrom(route, items) }, icon('play'), 'Play in order'),
      ...extra);
  }

  // One row of any track table. `cols` are the two middle columns: [label, value(t)].
  function trackRow(t, n, onPlay, cols) {
    const row = h('div', { class: 'row' + (unplayable(t) ? ' unavailable' : ''), role: 'row', ondblclick: () => onPlay(t) },
      h('div', { class: 'num', role: 'cell' },
        h('span', {}, String(n)),
        h('button', { type: 'button', 'aria-label': 'Play ' + t.title, onclick: () => onPlay(t) }, icon('play')),
        h('div', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'))),
      h('div', { class: 't', role: 'cell' }, cover(t),
        h('div', { class: 't-text' }, h('span', { class: 't-title', title: t.title }, t.title),
          h('button', { class: 't-sub link-sub', type: 'button', onclick: () => t.artistUrl && go('artist', { permalink: permalinkOf(t.artistUrl) }) }, t.artist + (unplayable(t) ? ' · not available' : '')))),
      ...cols.map(([, get]) => h('div', { class: 'cell', role: 'cell' }, get(t))),
      h('div', { class: 'cell r', role: 'cell' }, fmt(t.duration)));
    rowById.set(t.id, row);
    return row;
  }
  const tableHead = cols => h('div', { class: 'thead', role: 'row' },
    h('span', { role: 'columnheader' }, '#'), h('span', { role: 'columnheader' }, 'Title'),
    ...cols.map(([label]) => h('span', { role: 'columnheader' }, label)),
    h('span', { role: 'columnheader', style: { textAlign: 'right' } }, 'Time'));
  function trackTable(items, onPlay, cols, label) {
    if (!items.length) return h('p', { class: 'empty' }, 'No tracks here.');
    return h('div', { role: 'table', 'aria-label': label || 'Tracks' }, tableHead(cols), ...items.map((t, i) => trackRow(t, i + 1, onPlay, cols)));
  }
  const PLAYS = ['Plays', t => (t.plays ? nf(t.plays) : '—')];
  const GENRE = ['Genre', t => t.genre || '—'];

  function playlistCard(p) {
    const art = h('span', { class: 'card-art', 'aria-hidden': 'true' });
    if (p.art) art.style.backgroundImage = `url("${p.art}")`; else art.textContent = String(p.count);
    return h('button', { class: 'card', type: 'button', onclick: () => go('playlist', { id: p.id }) },
      art, h('span', { class: 'card-title' }, p.title), h('span', { class: 'card-sub' }, `${nf(p.count)} tracks · ${p.artist}`));
  }
  function artistCard(u) {
    const art = h('span', { class: 'card-art', 'aria-hidden': 'true' });
    if (u.avatar) art.style.backgroundImage = `url("${u.avatar}")`; else art.textContent = u.username.slice(0, 1).toLowerCase();
    return h('button', { class: 'card artist', type: 'button', onclick: () => go('artist', { permalink: u.permalink }) },
      art, h('span', { class: 'card-title' }, u.username), h('span', { class: 'card-sub' }, `${nf(u.followers)} followers`));
  }
  const cardGrid = cards => h('div', { class: 'grid' }, ...cards);

  // A page whose content arrives later. Results are kept, so Back is instant.
  const loaded = new Map();
  function asyncPage(key, load, render) {
    const box = h('div', { class: 'page' }, backLink(), h('p', { class: 'empty' }, 'Loading…'));
    const shown = S.key; // the screen this page belongs to; skip filling if you've moved on
    const fill = data => { if (S.key !== shown) return; box.replaceChildren(...keep(backLink(), render(data))); highlight(); };
    if (loaded.has(key)) fill(loaded.get(key));
    else load().then(d => { loaded.set(key, d); fill(d); })
      .catch(err => box.replaceChildren(...keep(backLink(), h('p', { class: 'empty' }, 'Couldn’t load this: ' + err.message))));
    return box;
  }
  const notice = (title, text) => h('div', { class: 'page' }, backLink(), head('scfix', title), h('p', { class: 'empty' }, text));

  function playlistsPage() {
    const o = S.owner;
    if (!o) return notice('Playlists', S.me === null ? 'Sign in to SoundCloud to see your playlists.' : 'Loading…');
    return asyncPage('playlists:' + o.id, () => rpc('playlists', o.id), own => {
      const liked = S.likedPlaylists || [];
      return [
        head(o.self ? 'Library' : o.username, 'Playlists', [h('span', { class: 'big-num' }, nf(own.length + liked.length)), h('span', { class: 'serif-i' }, 'playlists')]),
        section(o.self ? 'Made by you' : 'Made by ' + o.username, own.length ? cardGrid(own.map(playlistCard)) : h('p', { class: 'empty' }, 'None yet.')),
        liked.length ? section('Liked', cardGrid(liked.map(playlistCard))) : null,
      ];
    });
  }

  function playlistPage() {
    const { id } = S.params;
    return asyncPage('playlist:' + id, () => rpc('playlist', id), p => {
      const art = h('span', { class: 'pl-art', 'aria-hidden': 'true' });
      if (p.art) art.style.backgroundImage = `url("${p.art}")`;
      const meta = `by ${p.artist} — ${nf(p.tracks.length)} tracks, ${longDur(p.duration)}` + (p.created ? `, made ${longDate(p.created)}` : '');
      return [
        h('header', { class: 'head pl-head' }, art,
          h('div', { class: 'head-l', style: { flex: '1 1 360px' } },
            h('span', { class: 'kicker' }, p.album ? 'Album' : 'Playlist'),
            h('h1', { class: 'h1 fit' }, p.title),
            h('p', { class: 'serif-i', style: { margin: '0' } }, meta))),
        listActions(p.url, p.tracks,
          h('button', { class: 'btn', type: 'button', onclick: () => go('artist', { permalink: permalinkOf(p.artistUrl) }) }, p.artist),
          h('button', { class: 'btn', type: 'button', onclick: () => classic(p.url) }, 'Open in SoundCloud')),
        trackTable(p.tracks, t => playFrom(p.url, t), [GENRE, PLAYS], p.title),
      ];
    });
  }

  function artistPage() {
    const { permalink } = S.params;
    return asyncPage('artist:' + permalink, () => rpc('artist', permalink), a => {
      const tracksRoute = `/${a.permalink}/tracks`;
      return [
        head('Artist', a.username, [h('span', { class: 'big-num' }, nf(a.followers)), h('span', { class: 'serif-i' }, `followers · ${nf(a.tracks)} tracks`)], 'fit'),
        a.description ? h('p', { class: 'desc' }, a.description) : null,
        listActions(tracksRoute, a.latest.length ? a.latest : a.top,
          h('button', { class: 'btn', type: 'button', onclick: () => classic(a.url) }, 'Open in SoundCloud')),
        a.top.length ? section('Popular', trackTable(a.top, t => playFrom(`/${a.permalink}/popular-tracks`, t), [GENRE, PLAYS], 'Popular tracks')) : null,
        a.latest.length ? section('Latest', trackTable(a.latest, t => playFrom(tracksRoute, t), [GENRE, PLAYS], 'Latest tracks')) : null,
        a.playlists.length ? section('Playlists', cardGrid(a.playlists.map(playlistCard))) : null,
      ];
    });
  }

  function followingPage() {
    const o = S.owner;
    if (!o) return notice('Following', S.me === null ? 'Sign in to SoundCloud to see who you follow.' : 'Loading…');
    return asyncPage('following:' + o.id, () => rpc('following', o.id), users => [
      head(o.self ? 'Library' : o.username, 'Following', [h('span', { class: 'big-num' }, nf(users.length)), h('span', { class: 'serif-i' }, 'people')]),
      users.length ? cardGrid(users.map(artistCard)) : h('p', { class: 'empty' }, 'Not following anyone yet.'),
    ]);
  }

  function searchPage() {
    let q = S.params.q || '', tab = S.params.tab || 'all', data = null, timer = null;
    const results = h('div', { class: 'stack' });
    const input = h('input', { class: 'bigq', type: 'search', value: q, placeholder: 'Search SoundCloud', 'aria-label': 'Search SoundCloud',
      oninput: e => { q = e.target.value; S.params = { q, tab }; clearTimeout(timer); timer = setTimeout(run, 350); },
      onkeydown: e => { if (e.key === 'Enter') { clearTimeout(timer); run(); } } });
    const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Result type' });
    const drawTabs = () => tabs.replaceChildren(...[['all', 'All'], ['tracks', 'Tracks'], ['artists', 'Artists'], ['playlists', 'Playlists']].map(([v, l]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === v), 'aria-checked': String(tab === v), onclick: () => { tab = v; S.params = { q, tab }; drawTabs(); draw(); } }, l)));
    const draw = () => {
      rowById = new Map();
      if (!data) return results.replaceChildren(h('p', { class: 'empty' }, q.trim() ? 'Searching…' : 'Tracks, artists and playlists.'));
      const route = '/search/sounds?q=' + encodeURIComponent(data.q);
      const all = tab === 'all';
      const parts = keep(
        (all || tab === 'artists') && data.users.length ? section('Artists', cardGrid((all ? data.users.slice(0, 6) : data.users).map(artistCard))) : null,
        (all || tab === 'tracks') && data.tracks.length ? section('Tracks', trackTable(all ? data.tracks.slice(0, 10) : data.tracks, t => playFrom(route, t), [GENRE, PLAYS], 'Tracks')) : null,
        (all || tab === 'playlists') && data.playlists.length ? section('Playlists', cardGrid((all ? data.playlists.slice(0, 6) : data.playlists).map(playlistCard))) : null);
      results.replaceChildren(...(parts.length ? parts : [h('p', { class: 'empty' }, `Nothing found for “${data.q}”.`)]));
      highlight();
    };
    const run = async () => {
      const query = q.trim();
      if (!query) { data = null; return draw(); }
      if (!data || data.q !== query) { data = null; draw(); }
      try {
        const r = loaded.get('search:' + query) || await rpc('search', query);
        loaded.set('search:' + query, r);
        if (q.trim() === query) { data = Object.assign({ q: query }, r); draw(); }
      } catch (err) { results.replaceChildren(h('p', { class: 'empty' }, 'Search failed: ' + err.message)); }
    };
    drawTabs();
    if (q.trim()) run(); else draw();
    setTimeout(() => input.focus(), 0);
    return h('div', { class: 'page' }, backLink(),
      h('label', { class: 'bigq-wrap' }, icon('search'), input), tabs, results);
  }

  function feedPage() {
    if (!S.me) return notice('Feed', S.me === null ? 'Sign in to SoundCloud to see uploads and reposts from people you follow.' : 'Loading…');
    let items = [], next = null, busy = false;
    const list = h('div', { class: 'stack' });
    const more = h('button', { class: 'btn', type: 'button', onclick: () => load(next) }, 'Load more');
    const sw = (key, label) => h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': String(!!S.set[key]),
      onclick: e => { S.set[key] = !S.set[key]; save(); e.currentTarget.setAttribute('aria-checked', String(!!S.set[key])); draw(); } },
      h('span', { class: 'lbl' }, h('span', {}, label)), h('span', { class: 'tog', 'aria-hidden': 'true' }));
    const draw = () => {
      rowById = new Map();
      const liked = new Set(S.owner && S.owner.self ? (S.likes || []).map(t => t.id) : []);
      const shown = items.filter(it => it.kind === 'track' && (S.set.feedReposts || !it.repost) && (S.set.feedLiked || !liked.has(it.track.id)));
      const tracks = shown.map(it => Object.assign({}, it.track, { feedBy: it.by ? it.by.username : '', feedRepost: it.repost, feedAt: it.at }));
      const cols = [['From', t => (t.feedRepost ? 'Repost · ' : '') + (t.feedBy || '')], ['Posted', t => day(t.feedAt)]];
      list.replaceChildren(...keep(
        tracks.length ? trackTable(tracks, t => playFrom('/feed', t), cols, 'Feed') : h('p', { class: 'empty' }, busy ? 'Loading…' : 'Nothing new with these filters.'),
        next ? h('div', {}, more) : null));
      highlight();
    };
    const load = async cursor => {
      if (busy) return;
      busy = true; more.disabled = true; draw();
      try {
        const r = await rpc('feed', cursor || null);
        if (r) { items = items.concat(r.items); next = r.next; }
      } catch (err) { list.replaceChildren(h('p', { class: 'empty' }, 'Couldn’t load the feed: ' + err.message)); busy = false; return; }
      busy = false; more.disabled = false; draw();
    };
    load(null);
    return h('div', { class: 'page' }, backLink(),
      head('From people you follow', 'Feed', [sw('feedReposts', 'Show reposts'), sw('feedLiked', 'Show tracks I’ve liked')]),
      list);
  }

  // ---------------------------------------------------------------------------
  // Player bar
  // ---------------------------------------------------------------------------
  function seekBar(refs) {
    refs.fill = h('div', { class: 'fill' });
    refs.knob = h('div', { class: 'knob' });
    refs.seek = h('input', { type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Seek',
      oninput: () => { refs.dragging = true; },
      onchange: e => { refs.dragging = false; cmd('seek', +e.target.value / 1000 * (S.st.duration || 0)); } });
    return h('div', { class: 'track' }, h('div', { class: 'rail' }, refs.fill, refs.knob), refs.seek);
  }
  function bar() {
    B.cover = h('span', { class: 'cover', 'aria-hidden': 'true' });
    B.title = h('button', { class: 'bar-title', type: 'button', onclick: () => show('now') }, '');
    B.artist = h('button', { class: 'bar-artist', type: 'button', onclick: () => S.st.track && go('artist', { permalink: permalinkOf(S.st.track.artistUrl) }) }, '');
    B.like = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('like'), 'aria-label': 'Like' }, icon('heart'));
    B.shuffle = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('shuffle'), 'aria-label': 'Shuffle whole list', 'aria-pressed': 'false' }, icon('shuffle'));
    B.play = h('button', { class: 'play', type: 'button', onclick: () => cmd('toggle'), 'aria-label': 'Play' }, icon('play'));
    B.repeat = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('repeat'), 'aria-label': 'Repeat' }, icon('repeat'));
    B.now = h('span', {}, '0:00');
    B.total = h('span', {}, '0:00');
    B.notice = h('div', { class: 'notice', role: 'status' });
    B.mini = h('button', { class: 'mini', type: 'button', onclick: () => show('now'), 'aria-label': 'Open Now Playing' }, h('canvas', { 'data-scope': '', 'data-weight': '1.3', 'data-scale': '0.9' }));
    B.mute = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('mute'), 'aria-label': 'Mute' }, icon('vol'));
    B.vol = h('input', { class: 'vol', type: 'range', min: '0', max: '100', 'aria-label': 'Volume', oninput: e => cmd('volume', +e.target.value / 100) });
    return h('footer', { class: 'bar' },
      h('div', { class: 'bar-l' }, B.cover, h('div', { class: 't-text' }, B.title, B.artist), B.like),
      h('div', { class: 'bar-c' },
        h('div', { class: 'ctl' }, B.shuffle,
          h('button', { class: 'ib', type: 'button', onclick: () => cmd('prev'), 'aria-label': 'Previous track' }, icon('prev')),
          B.play,
          h('button', { class: 'ib', type: 'button', onclick: () => cmd('next'), 'aria-label': 'Next track' }, icon('next')),
          B.repeat),
        h('div', { class: 'prog' }, B.now, seekBar(B), B.total),
        B.notice),
      h('div', { class: 'bar-r' }, B.mini, B.mute, B.vol,
        h('button', { class: 'ib dim', type: 'button', onclick: () => show('now'), 'aria-label': 'Queue' }, icon('queue')),
        h('button', { class: 'ib dim', type: 'button', onclick: () => show('now'), 'aria-label': 'Expand player' }, icon('expand'))));
  }

  // ---------------------------------------------------------------------------
  // Now Playing
  // ---------------------------------------------------------------------------
  function now() {
    N.title = h('h1', { class: 'now-title' }, '');
    N.artist = h('button', { class: 'now-artist', type: 'button', onclick: () => S.st.track && go('artist', { permalink: permalinkOf(S.st.track.artistUrl) }) }, '');
    N.time = h('span', { class: 'now-time' }, '0:00');
    N.total = h('span', { class: 'serif-i', style: { fontSize: '14px', fontStyle: 'normal', fontFamily: 'var(--sans)' } }, 'of 0:00');
    N.kicker = h('span', { class: 'kicker' }, 'Now playing');
    N.canvas = h('canvas', { 'data-scope': '', 'data-weight': '1.8' });
    N.like = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('like'), 'aria-label': 'Like' }, icon('heart'));
    N.meta = h('span', {}, '');
    N.shuffle = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('shuffle'), 'aria-label': 'Shuffle whole list', 'aria-pressed': 'false' }, icon('shuffle'));
    N.play = h('button', { class: 'play big', type: 'button', onclick: () => cmd('toggle'), 'aria-label': 'Play' }, icon('playBig'));
    N.repeat = h('button', { class: 'ib dim', type: 'button', onclick: () => cmd('repeat'), 'aria-label': 'Repeat' }, icon('repeat'));
    N.vol = h('input', { class: 'vol', type: 'range', min: '0', max: '100', 'aria-label': 'Volume', style: { width: '112px' }, oninput: e => cmd('volume', +e.target.value / 100) });
    N.note = h('span', { style: { fontSize: '13px', color: 'var(--mute)' } }, '');
    N.list = h('ol', {});
    N.notice = h('div', { class: 'notice', role: 'status' });
    return h('div', { class: 'now' },
      h('main', { class: 'now-main' },
        h('div', { class: 'now-top' },
          h('button', { class: 'back', type: 'button', onclick: () => show(S.lastMain) }, icon('back'), 'Back'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } }, N.kicker,
            h('button', { class: 'back', type: 'button', onclick: () => openVizSettings(), 'aria-label': 'Visualizer settings' }, icon('gear'), 'Visualizer'))),
        h('div', { class: 'now-head' },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0', flex: '1 1 400px' } }, N.title, N.artist),
          h('div', { class: 'head-r' }, N.time, N.total)),
        h('div', { class: 'scope' }, N.canvas),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
          seekBar(N),
          h('div', { class: 'transport' },
            h('div', { class: 'l' }, N.like, N.meta),
            h('div', { class: 'ctl' }, N.shuffle,
              h('button', { class: 'ib', type: 'button', onclick: () => cmd('prev'), 'aria-label': 'Previous track' }, icon('prev')),
              N.play,
              h('button', { class: 'ib', type: 'button', onclick: () => cmd('next'), 'aria-label': 'Next track' }, icon('next')),
              N.repeat),
            h('div', { class: 'r' }, icon('vol'), N.vol)),
          N.notice)),
      h('aside', { class: 'up', 'aria-label': 'Up next' },
        h('div', { class: 'up-head' },
          h('div', { class: 'row1' }, h('h2', { class: 'h2' }, 'Up next'), h('button', { class: 'link', type: 'button', onclick: () => cmd('reshuffle') }, 'Reshuffle')),
          N.note),
        N.list));
  }

  let queueSig = null;
  function renderQueue(st) {
    const items = (st.queue && st.queue.next) || [];
    const sig = items.map(t => t.qi + ':' + t.id).join(',');
    if (sig === queueSig) return;
    queueSig = sig;
    N.list.replaceChildren(...items.map(t => h('li', { class: 'q' },
      h('button', { class: 'q-pick', type: 'button', onclick: () => cmd('jump', t.qi), 'aria-label': 'Play ' + (t.title || 'track') },
        cover(t), h('span', { class: 't-text' }, h('span', { class: 't-title' }, t.title || 'Loading…'), h('span', { class: 't-sub' }, (t.artist || '') + (t.duration ? ' · ' + fmt(t.duration) : '')))),
      h('button', { class: 'x', type: 'button', onclick: () => cmd('remove', t.qi), 'aria-label': 'Remove ' + (t.title || 'track') + ' from queue' }, icon('x')))));
    if (!items.length) N.list.replaceChildren(h('li', { class: 'empty', style: { padding: '24px 28px' } }, 'Nothing queued.'));
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  function settingsPage() {
    const seg = (key, opts, after) => h('div', { class: 'seg', role: 'radiogroup' }, ...opts.map(([v, l]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(S.set[key] === v), onclick: () => { S.set[key] = v; save(); after(); show('settings'); } }, l)));
    const sw = (key, label, note, after) => h('button', { class: 'sw', type: 'button', role: 'switch', 'aria-checked': String(!!S.set[key]),
      onclick: () => { S.set[key] = !S.set[key]; save(); after && after(); show('settings'); } },
      h('span', { class: 'lbl' }, h('span', {}, label), h('span', {}, note)), h('span', { class: 'tog', 'aria-hidden': 'true' }));
    const swatch = (v, label, color) => h('button', { class: 'swatch', type: 'button', role: 'radio', 'aria-checked': String(S.set.accent === v), 'aria-label': label,
      onclick: () => { S.set.accent = v; save(); applyTheme(); show('settings'); } }, h('i', { style: { background: color } }));
    const keys = [['Play or pause', 'Space'], ['Seek 5 s', '← →'], ['Previous / next track', 'Shift ← →'], ['Shuffle', 'S'], ['Like', 'L'], ['Now Playing', 'N'], ['Search', '/'], ['Back', 'Esc'], ['Classic SoundCloud', 'C']];
    return h('div', { class: 'page' },
      h('header', { class: 'head' }, h('div', { class: 'head-l' }, h('span', { class: 'kicker' }, 'scfix'), h('h1', { class: 'h1' }, 'Settings'))),
      h('section', { class: 'sec' }, h('h2', { class: 'h2' }, 'Appearance'),
        h('div', { class: 'sec-body' },
          h('div', { class: 'opt' }, h('span', {}, 'Theme'), seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']], applyTheme)),
          h('div', { class: 'opt' }, h('span', {}, 'Highlight color'),
            h('div', { class: 'seg', role: 'radiogroup' }, swatch('ink', 'Ink', 'var(--ink)'), swatch('rust', 'Rust', app.dataset.theme === 'dark' ? '#E07A52' : '#B4441F'), swatch('navy', 'Navy', 'var(--navy)'))))),
      h('section', { class: 'sec', id: 'set-viz' }, h('h2', { class: 'h2' }, 'Visualizer'),
        h('div', { class: 'sec-body' },
          h('div', { class: 'preview' }, h('canvas', { 'data-scope': '', 'data-echo': S.set.echo ? '1' : '0', 'data-weight': '1.6' })),
          h('div', { class: 'opt' }, h('span', {}, 'Style'), seg('style', [['wave', 'Waveform'], ['calm', 'Calm']], pageConfig)),
          h('span', { style: { fontSize: '13px', color: 'var(--mute)' } }, S.set.style === 'calm'
            ? 'Calm: a line re-drawn from eight frequency bands, so bass swells and highs ripple on their own.'
            : 'Waveform: the song’s real sound wave, held steady like an oscilloscope and smoothed so it stays calm.'),
          h('span', { style: { fontSize: '13px', color: 'var(--mute)' } }, 'Both ignore the volume slider, and both follow SoundCloud’s loudness map of the whole song, so quiet parts stay small and drops hit big.'),
          slider('smooth', 'Smoothness', 'Higher is calmer: filters out more detail and glides between frames.', 0, 1, 0.05, v => Math.round(v * 100) + '%'),
          slider('zoom', 'Zoom', 'How much of the sound fits across the screen. Less shows the wave up close.', 20, 150, 5, v => v + ' ms'),
          slider('height', 'Height', 'How tall the line is.', 0.5, 1.5, 0.05, v => Math.round(v * 100) + '%'),
          slider('lookahead', 'Lookahead', 'Plays the sound this much later so the visualizer can see what’s coming. 0 turns it off.', 0, 250, 10, v => v + ' ms'),
          sw('echo', 'Echo trail', 'A faint highlight-colored line trailing the live one', applyViz),
          sw('mini', 'Mini visualizer in the player bar', 'A small live scope next to the volume control', applyViz))),
      h('section', { class: 'sec' }, h('h2', { class: 'h2' }, 'Playback'),
        h('div', { class: 'sec-body' },
          sw('fullShuffle', 'Shuffle the whole list', 'Loads every track of likes and playlists before shuffling', pageConfig),
          sw('includeEarlier', 'Include tracks before the one you start from', 'Otherwise shuffle only mixes what comes after it', pageConfig),
          sw('preload', 'Preload likes in the background', 'Makes the first shuffle near-instant; about 4.5 MB per visit for 1,400 likes', pageConfig))),
      h('section', { class: 'sec' }, h('h2', { class: 'h2' }, 'Shortcuts'),
        h('dl', { class: 'keys sec-body' }, ...keys.map(([w, k]) => h('div', {}, h('dt', {}, w), h('dd', {}, h('kbd', {}, k)))))),
      h('section', { class: 'sec' }, h('h2', { class: 'h2' }, 'Classic'),
        h('div', { class: 'sec-body' },
          h('span', { style: { color: 'var(--mute)' } }, 'Anything scfix doesn’t cover yet (history, uploads, comments) opens in SoundCloud’s own interface. The scfix button in the corner brings you back.'),
          h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => classic() }, 'Use classic SoundCloud')))));
  }
  // A labelled range input bound to a setting; changes reach page.js live.
  function slider(key, label, note, min, max, step, show) {
    const out = h('span', { style: { fontVariantNumeric: 'tabular-nums', minWidth: '52px', textAlign: 'right' } }, show(S.set[key]));
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(S.set[key]), 'aria-label': label, style: { width: '200px', accentColor: 'var(--ink)' },
      oninput: e => { S.set[key] = +e.target.value; out.textContent = show(S.set[key]); pageConfig(); },
      onchange: () => save() });
    return h('div', { class: 'opt' },
      h('span', { style: { display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '380px' } },
        h('span', { style: { fontSize: '15px' } }, label),
        h('span', { style: { fontSize: '13px', color: 'var(--mute)' } }, note)),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--mute)' } }, input, out));
  }
  function openVizSettings() {
    go('settings');
    const sec = mainEl.querySelector('#set-viz');
    if (sec) sec.scrollIntoView({ block: 'start' });
  }
  function applyViz() {
    N.canvas.dataset.echo = S.set.echo ? '1' : '0';
    B.mini.style.display = S.set.mini ? '' : 'none';
  }

  // ---------------------------------------------------------------------------
  // State → screen
  // ---------------------------------------------------------------------------
  function setBtn(btn, on, iconOn, iconOff, labelOn, labelOff) {
    btn.replaceChildren(icon(on ? iconOn : iconOff));
    btn.setAttribute('aria-label', on ? labelOn : labelOff);
  }
  function setProgress(refs, pct) {
    if (refs.dragging) return;
    refs.fill.style.width = pct + '%';
    refs.knob.style.left = pct + '%';
    refs.seek.value = String(Math.round(pct * 10));
  }

  function onState(st) {
    S.st = st || { ready: false };
    if (!app) return;
    const t = st && st.track;
    const pct = st && st.duration ? Math.min(100, st.position / st.duration * 100) : 0;

    const tid = t ? t.id : null;
    if (B.coverId !== tid) { B.coverId = tid; B.cover.replaceWith(B.cover = cover(t)); }
    B.title.textContent = t ? t.title : 'Nothing playing';
    B.artist.textContent = t ? t.artist : 'Pick something from your likes';
    setBtn(B.play, st.playing, 'pause', 'play', 'Pause', 'Play');
    setBtn(N.play, st.playing, 'pauseBig', 'playBig', 'Pause', 'Play');
    for (const [btn, on] of [[B.shuffle, st.shuffle], [N.shuffle, st.shuffle]]) { btn.classList.toggle('on', !!on); btn.classList.toggle('dim', !on); btn.setAttribute('aria-pressed', String(!!on)); }
    for (const btn of [B.repeat, N.repeat]) { const on = st.repeat && st.repeat !== 'none'; btn.classList.toggle('on', on); btn.classList.toggle('dim', !on); btn.setAttribute('aria-label', 'Repeat: ' + (st.repeat || 'none')); }
    for (const btn of [B.like, N.like]) { setBtn(btn, st.liked, 'heartOn', 'heart', 'Unlike', 'Like'); btn.classList.toggle('on', !!st.liked); btn.classList.toggle('dim', !st.liked); }
    B.now.textContent = fmt(st.position);
    B.total.textContent = fmt(st.duration);
    setProgress(B, pct);
    setProgress(N, pct);
    if (st.volume != null) {
      for (const v of [B.vol, N.vol]) if (document.activeElement !== host || host.shadowRoot.activeElement !== v) v.value = String(Math.round((st.muted ? 0 : st.volume) * 100));
      B.mute.replaceChildren(icon(st.muted ? 'muted' : 'vol'));
    }
    B.notice.textContent = st.notice || '';
    N.notice.textContent = st.notice || '';

    N.title.textContent = t ? t.title : 'Nothing playing';
    N.artist.textContent = t ? t.artist : '';
    N.time.textContent = fmt(st.position);
    N.total.textContent = 'of ' + fmt(st.duration);
    N.meta.textContent = t ? [t.genre, t.plays ? nf(t.plays) + ' plays' : ''].filter(Boolean).join(' · ') : '';
    const src = st.queue && st.queue.source;
    N.kicker.textContent = 'Now playing' + (src && /like/i.test(src.type || '') ? ' · from Likes' : src && src.resourceType === 'playlist' ? ' · from a playlist' : '');
    N.note.textContent = st.queue ? (st.shuffle ? `Shuffling all ${nf(st.queue.total)} tracks` : `In order · ${nf(st.queue.total)} in the queue`) : '';
    if (st.queue) renderQueue(st);
    highlight();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  window.addEventListener('keydown', e => {
    if (!S.set.on || e.metaKey || e.ctrlKey || e.altKey) return;
    const tgt = e.composedPath()[0];
    if (tgt && ((tgt.tagName === 'INPUT' && tgt.type !== 'range') || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
    const k = e.key;
    const act = {
      ' ': () => cmd('toggle'),
      ArrowLeft: () => (e.shiftKey ? cmd('prev') : cmd('seekBy', -5000)),
      ArrowRight: () => (e.shiftKey ? cmd('next') : cmd('seekBy', 5000)),
      s: () => cmd('shuffle'), S: () => cmd('shuffle'),
      l: () => cmd('like'), L: () => cmd('like'),
      n: () => show(S.view === 'now' ? S.lastMain : 'now'), N: () => show(S.view === 'now' ? S.lastMain : 'now'),
      '/': () => go('search'),
      Escape: () => back(),
      c: () => classic(), C: () => classic(),
    }[k];
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    act();
  }, true);

  // ---------------------------------------------------------------------------
  chrome.storage.local.get('scfix', data => {
    Object.assign(S.set, data && data.scfix);
    mount();
    applyViz();
    pageConfig();
    send('hello', {});
    loadLikes();
  });
})();
