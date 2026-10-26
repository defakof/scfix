// SoundCloud Full Shuffle
// Makes SoundCloud's own shuffle button shuffle the whole list (likes, playlists),
// not just the ~100 tracks that happen to be loaded into the queue.
//
// How: SoundCloud's shuffle only mixes tracks already pulled into the play queue.
// When shuffle turns on, we pull every remaining track of the current list into
// the queue (SoundCloud's own PlayManager.pullNext), then let SoundCloud shuffle.
(() => {
  'use strict';
  if (window.__scFullShuffle) return;
  window.__scFullShuffle = true;

  const TAG = '[SoundCloud Full Shuffle]';
  const PAGE_SIZE = 200;       // API max; SoundCloud asks for 24
  const PULL_CHUNK = 200;      // tracks per pull, then yield so the page stays responsive
  const MAX_TRACKS = 10000;
  const TIMEOUT_MS = 30000;
  // Finite lists only. Feed, stations and autoplay are endless and keep stock behaviour.
  const FINITE_SOURCE = /like|playlist|album|set|track/i;
  const ENDLESS_SOURCE = /station|stream|autoplay|search/i;
  // Fired once per pulled track; its only listener is analytics, and it makes
  // pulling ~15x slower (1,450 tracks: ~5 s instead of ~0.3 s).
  const PER_TRACK_EVENT = 'add:trackAddedToPlayQueue';

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 1. Likes: fetch 200 per request instead of 24 (1,400 likes: 7 requests instead of 58),
  //    and preload everything the queue will need as soon as the first page arrives:
  //    the remaining pages, plus each liked playlist (the queue expands those into tracks).
  //    Pages are chained by cursor (each names the next), so they can't be fetched in
  //    parallel; preloading means pressing shuffle no longer waits on that chain.
  const API = 'https://api-v2.soundcloud.com';
  const COLLECTION_URL = /^https:\/\/api-v2\.soundcloud\.com\/users\/\d+\/(likes|track_likes)\b/;
  const PLAYLIST_URL = /^https:\/\/api-v2\.soundcloud\.com\/playlists\/\d+\?/;
  const CARRY_PARAMS = ['client_id', 'app_version', 'app_locale']; // next_href omits these
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAX_PLAYLISTS = 50;
  const cache = new Map();       // cacheKey -> { body: Promise<string>, at }
  const preloadRuns = new Map(); // pathname -> latest run token

  const cacheKey = url => {
    const u = new URL(url);
    for (const p of CARRY_PARAMS) u.searchParams.delete(p);
    u.searchParams.sort();
    return u.pathname + u.search;
  };
  const isFirstPage = url => (new URL(url).searchParams.get('offset') || '0') === '0';

  function prefetch(url, headers) {
    const key = cacheKey(url);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
    const body = fetch(url, { headers })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))));
    body.catch(() => cache.delete(key)); // SoundCloud fetches it itself
    cache.set(key, { body, at: Date.now() });
    return body;
  }

  async function preload(firstUrl, firstPage, headers) {
    const base = new URL(firstUrl);
    const withCarry = href => {
      const url = new URL(href, API);
      for (const p of CARRY_PARAMS) {
        if (base.searchParams.has(p) && !url.searchParams.has(p)) url.searchParams.set(p, base.searchParams.get(p));
      }
      return url;
    };
    const run = {};
    preloadRuns.set(base.pathname, run);
    for (const [key, entry] of cache) if (Date.now() - entry.at > CACHE_TTL_MS) cache.delete(key);

    let page = firstPage, playlists = 0;
    while (page && preloadRuns.get(base.pathname) === run) {
      for (const item of page.collection || []) {
        if (item.playlist && playlists++ < MAX_PLAYLISTS) {
          prefetch(withCarry(`/playlists/${item.playlist.id}?representation=full`), headers);
        }
      }
      if (!page.next_href) return;
      try {
        page = JSON.parse(await prefetch(withCarry(page.next_href), headers));
      } catch (err) {
        return;
      }
    }
  }

  // Completes a SoundCloud XHR with a preloaded page instead of sending it.
  function respond(xhr, url, text) {
    if (xhr.readyState !== XMLHttpRequest.OPENED) return; // aborted meanwhile
    const props = {
      readyState: XMLHttpRequest.DONE, status: 200, statusText: 'OK', responseURL: url,
      responseText: text, response: xhr.responseType === 'json' ? JSON.parse(text) : text,
    };
    for (const [k, v] of Object.entries(props)) Object.defineProperty(xhr, k, { configurable: true, get: () => v });
    xhr.getResponseHeader = name => (/^content-type$/i.test(name) ? 'application/json; charset=utf-8' : null);
    xhr.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n';
    xhr.dispatchEvent(new Event('readystatechange'));
    xhr.dispatchEvent(new ProgressEvent('load'));
    xhr.dispatchEvent(new ProgressEvent('loadend'));
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__scfs = null;
    if (typeof url === 'string' && /^get$/i.test(method)) {
      const collection = COLLECTION_URL.test(url);
      if (collection) url = url.replace(/([?&]limit=)\d+/, `$1${PAGE_SIZE}`);
      if (collection || PLAYLIST_URL.test(url)) this.__scfs = { url, headers: {}, collection };
    }
    return xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__scfs) this.__scfs.headers[name] = value; // e.g. Authorization when signed in
    return xhrSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const req = this.__scfs;
    if (!req) return xhrSend.apply(this, args);

    const cached = cache.get(cacheKey(req.url));
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      cached.body.then(text => respond(this, req.url, text), () => xhrSend.apply(this, args));
      return;
    }
    if (req.collection && isFirstPage(req.url)) {
      this.addEventListener('load', () => {
        if (this.status !== 200) return;
        try {
          const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          if (data) preload(req.url, data, req.headers);
        } catch (err) { /* not JSON: leave it to SoundCloud */ }
      });
    }
    return xhrSend.apply(this, args);
  };

  // Toast, styled by toast.css
  let toastEl, hideTimer;
  function toast(text, hideAfter) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'scfs-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('scfs-toast--visible');
    clearTimeout(hideTimer);
    if (hideAfter) hideTimer = setTimeout(() => toastEl.classList.remove('scfs-toast--visible'), hideAfter);
  }

  // 2. Find SoundCloud's PlayManager in the webpack module cache, by shape rather than module id.
  const PM_METHODS = ['toggleShuffle', 'toggleState', 'getState', 'pullNext', 'hasMoreAhead',
    'getQueue', 'getCurrentQueueItem', 'playSource'];
  let webpackRequire;
  function findPlayManager() {
    if (!webpackRequire) {
      const chunks = window.webpackJsonp;
      // Wait until the webpack runtime has replaced the plain array's push.
      if (!chunks || chunks.push === Array.prototype.push) return null;
      chunks.push([['scfs'], { __scfs__: (module, exports, req) => { webpackRequire = req; } }, [['__scfs__']]]);
      if (!webpackRequire) return null;
    }
    for (const id in webpackRequire.c) {
      try {
        const ex = webpackRequire.c[id].exports;
        if (ex && PM_METHODS.every(k => typeof ex[k] === 'function')) return ex;
      } catch (e) { /* cross-origin window exports throw on access */ }
    }
    return null;
  }

  // 3. Hook shuffle.
  function install(pm) {
    const toggleState = pm.toggleState;
    const playSource = pm.playSource;
    const trigger = pm.trigger;
    let busy = false;

    // Likes: {type: 'user-likes', resourceType: 'user'}. Playlists: {type: 'single', resourceType: 'playlist'}.
    function isFiniteSource() {
      const { type = '', resourceType = '' } = pm.getCurrentQueueItem()?.sourceInfo || {};
      if (ENDLESS_SOURCE.test(type)) return false;
      return resourceType === 'playlist' || FINITE_SOURCE.test(type);
    }

    async function fullShuffle() {
      if (busy || !isFiniteSource()) return;
      busy = true;
      const t0 = performance.now();
      try {
        // Pull with shuffle off: with it on SoundCloud reshuffles on every pull (~8x slower, freezes the page).
        if (pm.getState('shuffle')) toggleState.call(pm, 'shuffle');
        pm.trigger = function (name, ...rest) {
          return name === PER_TRACK_EVENT ? this : trigger.call(this, name, ...rest);
        };
        while (pm.hasMoreAhead() && pm.getQueue().length < MAX_TRACKS && performance.now() - t0 < TIMEOUT_MS) {
          const before = pm.getQueue().length;
          pm.pullNext(PULL_CHUNK);
          const after = pm.getQueue().length;
          toast(`Loading all tracks… ${after.toLocaleString()}`);
          await sleep(after > before ? 0 : 50); // no growth: the next page is still downloading
        }
        pm.trigger = trigger;

        // SoundCloud only shuffles what comes after the current track, so tracks earlier in
        // the list (or already played) would never come up. Move them to the end first.
        // The PlayManager keeps its queue cursor in sync on remove/add by itself.
        const queue = pm.getQueue();
        const earlier = queue.models.slice(0, queue.indexOf(pm.getCurrentQueueItem())).filter(item => !item.explicit);
        if (earlier.length) {
          queue.remove(earlier);
          queue.add(earlier);
        }
        toggleState.call(pm, 'shuffle'); // SoundCloud shuffles everything after the current track
        // "Shuffle off" sorts by .order: point it at the list's real order, not the one we just made.
        // Tracks added with "Add to Next up" (explicit) go back right after the current track.
        for (const item of queue.models) item.order = item.explicit ? null : item.index;

        const total = queue.length;
        toast(`Shuffling all ${total.toLocaleString()} tracks`, 2500);
        console.info(TAG, `shuffled ${total} tracks in ${Math.round(performance.now() - t0)} ms`);
      } catch (err) {
        console.warn(TAG, err);
        if (!pm.getState('shuffle')) toggleState.call(pm, 'shuffle');
        toast('Couldn’t load every track. Shuffling what’s loaded.', 3000);
      } finally {
        pm.trigger = trigger;
        busy = false;
      }
    }

    // toggleState returns the PlayManager for chaining, and SoundCloud relies on that.
    pm.toggleState = function (name, ...rest) {
      if (name !== 'shuffle') return toggleState.call(this, name, ...rest);
      if (busy) return this; // shuffle turns on by itself once loading finishes
      const wasOn = pm.getState('shuffle');
      const result = toggleState.call(this, name, ...rest);
      if (!wasOn && pm.getState('shuffle')) fullShuffle();
      return result;
    };

    // Starting a new list while shuffle is already on. (Play/pause on the current track
    // also goes through playSource; that must not reshuffle.)
    pm.playSource = function (...args) {
      const before = pm.getCurrentQueueItem();
      const result = playSource.apply(this, args);
      setTimeout(() => {
        if (pm.getState('shuffle') && pm.getCurrentQueueItem() !== before) fullShuffle();
      }, 300);
      return result;
    };

    console.info(TAG, 'ready');
  }

  (async () => {
    for (let i = 0; i < 240; i++) {
      const pm = findPlayManager();
      if (pm) return install(pm);
      await sleep(250);
    }
    console.warn(TAG, 'SoundCloud player not found. SoundCloud may have changed; shuffle keeps its default behaviour.');
  })();
})();
