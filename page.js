// scfix: page script (MAIN world, document_start)
//
// Everything that has to touch SoundCloud's own JavaScript lives here:
//   1. API requests: likes fetched 200 per page, preloaded and shared with SoundCloud
//   2. An audio tap on SoundCloud's Web Audio graph, for the scope visualizer
//   3. Full shuffle: SoundCloud's shuffle, but over the whole list
//   4. A message bridge to the scfix UI (app.js, isolated world): state out, commands in
//   5. The scope renderer, which draws into the UI's <canvas data-scope> elements
(() => {
  'use strict';
  if (window.__scfix) return;
  window.__scfix = true;

  const TAG = '[scfix]';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cfg = { fullShuffle: true, includeEarlier: true, preload: true, lookahead: 120, style: 'wave', smooth: 0.8, zoom: 60, height: 1 };

  // ---------------------------------------------------------------------------
  // 1. API: bigger pages, background preload, cache shared with SoundCloud's XHRs
  // ---------------------------------------------------------------------------
  const API = 'https://api-v2.soundcloud.com';
  const PAGE_SIZE = 200; // API max; SoundCloud asks for 24
  const COLLECTION_URL = /^https:\/\/api-v2\.soundcloud\.com\/users\/\d+\/(likes|track_likes)\b/;
  const PLAYLIST_URL = /^https:\/\/api-v2\.soundcloud\.com\/playlists\/\d+\?/;
  const CARRY_PARAMS = ['client_id', 'app_version', 'app_locale']; // next_href omits these
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAX_PLAYLISTS = 50;
  const cache = new Map();       // cacheKey -> { body: Promise<string>, at }
  const preloadRuns = new Map(); // pathname -> latest run token
  const carry = {};              // client_id etc., learned from SoundCloud's own requests
  let authHeader = null;         // "OAuth …" when signed in

  const cacheKey = url => {
    const u = new URL(url);
    for (const p of CARRY_PARAMS) u.searchParams.delete(p);
    u.searchParams.sort();
    return u.pathname + u.search;
  };
  const isFirstPage = url => (new URL(url).searchParams.get('offset') || '0') === '0';
  const headers = () => (authHeader ? { Authorization: authHeader } : {});
  const withCarry = href => {
    const url = new URL(href, API);
    for (const p of CARRY_PARAMS) if (carry[p] && !url.searchParams.has(p)) url.searchParams.set(p, carry[p]);
    return url;
  };

  function prefetch(url) {
    const key = cacheKey(url);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
    const body = fetch(url, { headers: headers() })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))));
    body.catch(() => cache.delete(key)); // SoundCloud fetches it itself
    cache.set(key, { body, at: Date.now() });
    return body;
  }

  // Walks a cursor-paged collection from its first page; also prefetches liked playlists,
  // which the queue expands into tracks. Every page lands in the cache SoundCloud reads from.
  async function walk(firstUrl, firstPage, onPage) {
    const base = new URL(firstUrl);
    const run = {};
    preloadRuns.set(base.pathname, run);
    for (const [key, entry] of cache) if (Date.now() - entry.at > CACHE_TTL_MS) cache.delete(key);
    let page = firstPage, playlists = 0;
    while (page && preloadRuns.get(base.pathname) === run) {
      if (onPage) onPage(page);
      for (const item of page.collection || []) {
        if (item.playlist && playlists++ < MAX_PLAYLISTS) prefetch(withCarry(`/playlists/${item.playlist.id}?representation=full`));
      }
      if (!page.next_href) return true;
      try {
        page = JSON.parse(await prefetch(withCarry(page.next_href)));
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  async function api(path) {
    const r = await fetch(withCarry(path), { headers: headers() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
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
    if (typeof url === 'string' && url.startsWith(API)) {
      const u = new URL(url);
      for (const p of CARRY_PARAMS) if (u.searchParams.has(p)) carry[p] = u.searchParams.get(p);
      this.__scfsApi = true;
      if (/^get$/i.test(method)) {
        const collection = COLLECTION_URL.test(url);
        if (collection) url = url.replace(/([?&]limit=)\d+/, `$1${PAGE_SIZE}`);
        if (collection || PLAYLIST_URL.test(url)) this.__scfs = { url, collection };
      }
    }
    return xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__scfsApi && /^authorization$/i.test(name) && /^OAuth /.test(value)) authHeader = value;
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
    if (req.collection && isFirstPage(req.url) && cfg.preload) {
      this.addEventListener('load', () => {
        if (this.status !== 200) return;
        try {
          const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          if (data) walk(req.url, data);
        } catch (err) { /* not JSON: leave it to SoundCloud */ }
      });
    }
    return xhrSend.apply(this, args);
  };

  // ---------------------------------------------------------------------------
  // 2. Audio tap: SoundCloud routes its <audio> through Web Audio. We branch off an
  //    analyser and put a short delay in front of everything SoundCloud connects, so
  //    the analyser hears each moment slightly before the speakers do (true lookahead).
  // ---------------------------------------------------------------------------
  let analyser = null, waveAn = null, delay = null, mediaEl = null;
  const createSource = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (el) {
    const src = createSource.call(this, el);
    try {
      const an = this.createAnalyser();
      an.fftSize = 4096;              // ~11 Hz bins: enough resolution to separate kick from bass line
      an.smoothingTimeConstant = 0.2; // we do our own smoothing, with lookahead
      src.connect(an);
      // The raw waveform: ~680 ms of history, so we can draw the moment being heard
      // (cfg.lookahead ago) with real samples on both sides of it.
      const wa = this.createAnalyser();
      wa.fftSize = 32768;
      src.connect(wa);
      waveAn = wa;
      mediaEl = el;
      const d = this.createDelay(1);
      d.delayTime.value = cfg.lookahead / 1000;
      src.connect(d);
      // SoundCloud's own connections now leave from the delay instead of the source.
      src.connect = (...args) => d.connect(...args);
      src.disconnect = (...args) => d.disconnect(...args);
      analyser = an;
      delay = d;
    } catch (err) { console.warn(TAG, 'audio tap failed', err); }
    return src;
  };

  // ---------------------------------------------------------------------------
  // 3. SoundCloud internals, found by shape (method names), never by module number
  // ---------------------------------------------------------------------------
  let webpackRequire;
  function findModule(methods) {
    if (!webpackRequire) {
      const chunks = window.webpackJsonp;
      // Wait until the webpack runtime has replaced the plain array's push.
      if (!chunks || chunks.push === Array.prototype.push) return null;
      chunks.push([['scfix'], { __scfix__: (module, exports, req) => { webpackRequire = req; } }, [['__scfix__']]]);
      if (!webpackRequire) return null;
    }
    for (const id in webpackRequire.c) {
      try {
        const ex = webpackRequire.c[id].exports;
        if (ex && methods.every(k => typeof ex[k] === 'function')) return ex;
      } catch (e) { /* cross-origin window exports throw on access */ }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 4. Full shuffle
  // ---------------------------------------------------------------------------
  const PULL_CHUNK = 200;   // tracks per pull, then yield so the page stays responsive
  const MAX_TRACKS = 10000;
  const TIMEOUT_MS = 30000;
  // Finite lists only. Feed, stations and autoplay are endless and keep stock behaviour.
  const FINITE_SOURCE = /like|playlist|album|set|track/i;
  const ENDLESS_SOURCE = /station|stream|autoplay|search/i;
  // Fired once per pulled track; its only listener is analytics, and it makes
  // pulling ~15x slower (1,450 tracks: ~5 s instead of ~0.3 s).
  const PER_TRACK_EVENT = 'add:trackAddedToPlayQueue';

  let pm = null, volume = null, orig = null;
  let busy = false;      // a full shuffle is running
  let directing = false; // playTrack is steering the player; hooks stay quiet
  let notice = null;     // { text, until }: short status line for the UI

  const say = (text, ms) => { notice = { text, until: ms ? Date.now() + ms : Infinity }; pushState(true); };

  // Likes: {type: 'user-likes', resourceType: 'user'}. Playlists: {type: 'single', resourceType: 'playlist'}.
  function isFiniteSource() {
    const { type = '', resourceType = '' } = pm.getCurrentQueueItem()?.sourceInfo || {};
    if (ENDLESS_SOURCE.test(type)) return false;
    return resourceType === 'playlist' || FINITE_SOURCE.test(type);
  }

  function setShuffle(on) {
    if (!!pm.getState('shuffle') !== on) orig.toggleState.call(pm, 'shuffle');
  }

  // Pulls the rest of the current list into the queue (with shuffle off: with it on
  // SoundCloud reshuffles on every pull, ~8x slower, and the page freezes).
  async function pullAll(until) {
    const t0 = performance.now();
    pm.trigger = function (name, ...rest) {
      return name === PER_TRACK_EVENT ? this : orig.trigger.call(this, name, ...rest);
    };
    try {
      while (pm.hasMoreAhead() && pm.getQueue().length < MAX_TRACKS && performance.now() - t0 < TIMEOUT_MS) {
        if (until && until()) return;
        const before = pm.getQueue().length;
        pm.pullNext(PULL_CHUNK);
        const after = pm.getQueue().length;
        say(`Loading all tracks… ${after.toLocaleString()}`);
        await sleep(after > before ? 0 : 50); // no growth: the next page is still downloading
      }
    } finally {
      pm.trigger = orig.trigger;
    }
  }

  async function fullShuffle() {
    if (busy || !cfg.fullShuffle || !isFiniteSource()) return;
    busy = true;
    const t0 = performance.now();
    try {
      setShuffle(false);
      await pullAll();
      // SoundCloud only shuffles what comes after the current track, so tracks earlier in
      // the list (or already played) would never come up. Move them to the end first.
      // The PlayManager keeps its queue cursor in sync on remove/add by itself.
      const queue = pm.getQueue();
      if (cfg.includeEarlier) {
        const earlier = queue.models.slice(0, queue.indexOf(pm.getCurrentQueueItem())).filter(item => !item.explicit);
        if (earlier.length) {
          queue.remove(earlier);
          queue.add(earlier);
        }
      }
      setShuffle(true); // SoundCloud shuffles everything after the current track
      // "Shuffle off" sorts by .order: point it at the list's real order, not the one we just made.
      // Tracks added with "Add to Next up" (explicit) go back right after the current track.
      for (const item of queue.models) item.order = item.explicit ? null : item.index;
      say(`Shuffling all ${queue.length.toLocaleString()} tracks`, 2500);
      console.info(TAG, `shuffled ${queue.length} tracks in ${Math.round(performance.now() - t0)} ms`);
    } catch (err) {
      console.warn(TAG, err);
      setShuffle(true);
      say('Couldn’t load every track. Shuffling what’s loaded.', 3000);
    } finally {
      busy = false;
    }
  }

  function install(found) {
    pm = found;
    orig = { toggleState: pm.toggleState, playSource: pm.playSource, trigger: pm.trigger };

    // toggleState returns the PlayManager for chaining, and SoundCloud relies on that.
    pm.toggleState = function (name, ...rest) {
      if (name !== 'shuffle') return orig.toggleState.call(this, name, ...rest);
      if (busy) return this; // shuffle turns on by itself once loading finishes
      const wasOn = pm.getState('shuffle');
      const result = orig.toggleState.call(this, name, ...rest);
      if (!wasOn && pm.getState('shuffle') && !directing) fullShuffle();
      return result;
    };

    // Starting a new list while shuffle is already on. (Play/pause on the current track
    // also goes through playSource; that must not reshuffle.)
    pm.playSource = function (...args) {
      const before = pm.getCurrentQueueItem();
      const result = orig.playSource.apply(this, args);
      setTimeout(() => {
        if (!directing && pm.getState('shuffle') && pm.getCurrentQueueItem() !== before) fullShuffle();
      }, 300);
      return result;
    };

    console.info(TAG, 'ready');
    pushState(true);
  }

  // ---------------------------------------------------------------------------
  // 5. Playing a list from the scfix UI: steer SoundCloud's own page underneath
  // ---------------------------------------------------------------------------
  async function waitFor(fn, ms = 8000, every = 80) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await sleep(every);
    }
    return null;
  }

  function navigate(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  // route: the SoundCloud page listing the tracks (e.g. /you/likes); id: the track to start.
  // A newer request supersedes one still in flight.
  let playRun = 0;
  async function playTrack({ route, id, permalink, shuffle }) {
    if (!pm) return;
    const run = ++playRun;
    const live = () => run === playRun;
    directing = true;
    try {
      const cur = pm.getCurrentSound(), src = (pm.getCurrentQueueItem() || {}).sourceInfo;
      const fromList = src && src.type !== 'history';
      if (!(cur && cur.id === id && fromList)) {
        const rowsOf = () => [...document.querySelectorAll('.soundList__item, .trackList__item')].filter(r => r.querySelector('.sc-button-play'));
        // A list from the previous page can linger for a moment after navigating.
        const stale = location.pathname === route ? null : rowsOf()[0];
        navigate(route);
        const rows = await waitFor(() => { const r = rowsOf(); return r.length && r[0] !== stale ? r : null; });
        if (!live()) return;
        if (!rows) { say('Couldn’t open that list on SoundCloud.', 3000); return; }

        const row = (permalink && rows.find(r => r.querySelector(`a[href="${permalink}"]`))) || rows[0];
        const before = pm.getCurrentQueueItem();
        setShuffle(false);
        row.querySelector('.sc-button-play').click();
        const started = await waitFor(() => {
          const s = pm.getCurrentSound();
          return s && (pm.getCurrentQueueItem() !== before || s.id === id) ? s : null;
        });
        if (!live()) return;
        if (!started) { say('SoundCloud didn’t start playing.', 3000); return; }

        if (pm.getCurrentSound().id !== id) {
          // Not on screen in SoundCloud's list: find it in the queue and jump there.
          const find = () => pm.getQueue().models.find(m => m.sound && m.sound.id === id);
          if (!find()) await pullAll(() => !live() || find());
          if (!live()) return;
          const item = find();
          if (item) pm.setCurrentItem(item);
        }
      }
      if (!pm.isPlaying()) pm.playCurrent();
      if (shuffle) { setShuffle(true); directing = false; await fullShuffle(); }
    } finally {
      if (live()) {
        directing = false;
        notice = notice && notice.until !== Infinity ? notice : null;
        pushState(true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Bridge to the UI
  // ---------------------------------------------------------------------------
  const post = msg => window.postMessage(Object.assign({ __scfix: 'toUI' }, msg), location.origin);

  const art = (url, size) => (url ? url.replace(/-(large|t\d+x\d+|crop|original)\./, `-${size}.`) : null);
  function trackInfo(a) {
    if (!a) return null;
    const u = a.user || {};
    return {
      id: a.id,
      title: a.title || '',
      artist: u.username || '',
      artistUrl: u.permalink ? '/' + u.permalink : null,
      url: a.permalink_url ? new URL(a.permalink_url).pathname : null,
      art: art(a.artwork_url || u.avatar_url, 't200x200'),
      artBig: art(a.artwork_url || u.avatar_url, 't500x500'),
      duration: a.full_duration || a.duration || 0,
      genre: a.genre || '',
      plays: a.playback_count || 0,
      policy: a.policy || '',
    };
  }
  const attrs = sound => sound && (sound.attributes || null);

  let lastSent = '';
  function snapshot() {
    if (!pm) return { ready: false };
    const sound = pm.getCurrentSound();
    const queue = pm.getQueue();
    const cur = queue.indexOf(pm.getCurrentQueueItem());
    const next = queue.models.slice(cur + 1, cur + 41).map((m, k) => Object.assign({ qi: cur + 1 + k }, trackInfo(attrs(m.sound)) || {}));
    const likeBtn = document.querySelector('.playControls .playbackSoundBadge__like');
    if (notice && notice.until < Date.now()) notice = null;
    return {
      ready: true,
      track: trackInfo(attrs(sound)),
      playing: !!pm.isPlaying(),
      position: sound ? Math.round(sound.currentTime()) : 0,
      duration: sound ? Math.round(sound.duration() || 0) : 0,
      shuffle: !!pm.getState('shuffle') || busy,
      repeat: pm.getQueueState ? pm.getQueueState().repeatMode : 'none',
      liked: likeBtn ? likeBtn.classList.contains('sc-button-selected') : null,
      volume: volume ? volume.getVolume() : null,
      muted: volume ? volume.getMuted() : false,
      queue: { next, total: queue.length, index: cur, source: (pm.getCurrentQueueItem() || {}).sourceInfo || null },
      notice: notice ? notice.text : null,
      busy,
    };
  }
  function pushState(force) {
    const s = snapshot();
    const json = JSON.stringify(s);
    if (force || json !== lastSent) { lastSent = json; post({ type: 'state', state: s }); }
  }
  setInterval(() => pushState(false), 250);

  const COMMANDS = {
    toggle: () => (pm.isPlaying() ? pm.pauseCurrent() : pm.playCurrent()),
    next: () => pm.playNext(),
    prev: () => pm.playPrev(),
    // SoundCloud's seek functions take a function of the sound, not a number.
    seek: ms => pm.seekCurrentTo(() => Math.max(0, ms)),
    seekBy: ms => pm.seekCurrentBy(() => ms),
    shuffle: () => pm.toggleShuffle(),
    repeat: () => pm.cycleRepeatMode(),
    volume: v => volume && volume.setVolume(Math.max(0, Math.min(1, v))),
    mute: () => volume && volume.toggleMuted(),
    like: () => { const b = document.querySelector('.playControls .playbackSoundBadge__like'); if (b) b.click(); },
    jump: qi => { const item = pm.getQueue().at(qi); if (item) pm.setCurrentItem(item); },
    remove: qi => { const item = pm.getQueue().at(qi); if (item) pm.removeItem(item); },
    reshuffle: () => { if (pm.getState('shuffle')) { setShuffle(false); fullShuffle(); } else pm.toggleShuffle(); },
    playTrack: opts => playTrack(opts),
    navigate: path => navigate(path),
    config: c => {
      Object.assign(cfg, c);
      if (delay) delay.delayTime.setTargetAtTime(cfg.lookahead / 1000, delay.context.currentTime, 0.05);
    },
  };

  const RPC = {
    viz() { return { style: cfg.style, bands: Array.from(disp, v => +v.toFixed(2)), kick: +kick.toFixed(2), song: +songScale.toFixed(2), level: +waveLevel.toFixed(4), unvolume: +unvolume().toFixed(2), elVolume: mediaEl ? mediaEl.volume : null, wave: !!wave.env, lookahead: cfg.lookahead }; },
    async me() {
      if (!authHeader) await waitFor(() => authHeader, 4000);
      if (!authHeader) return null;
      try {
        const me = await api('/me');
        return { id: me.id, username: me.username, permalink: me.permalink, avatar: me.avatar_url, likes: me.likes_count };
      } catch (err) { return null; }
    },
    async resolve(path) {
      const u = await api('/resolve?url=' + encodeURIComponent('https://soundcloud.com' + path));
      return { id: u.id, kind: u.kind, username: u.username, permalink: u.permalink, avatar: u.avatar_url, likes: u.likes_count };
    },
    // All liked tracks of a user, in SoundCloud's order. Own likes use track_likes
    // (what /you/likes lists); anyone else's use likes (tracks and playlists mixed).
    async likes(userId, self) {
      await waitFor(() => carry.client_id, 8000);
      const kind = self ? 'track_likes' : 'likes';
      const first = withCarry(`/users/${userId}/${kind}?offset=0&linked_partitioning=1&limit=${PAGE_SIZE}`);
      const items = [];
      let pos = 0;
      const page0 = JSON.parse(await prefetch(first));
      await walk(first, page0, page => {
        for (const it of page.collection || []) {
          const p = pos++;
          if (it.track) items.push(Object.assign(trackInfo(it.track), { likedAt: it.created_at, pos: p }));
        }
      });
      return items;
    },
  };

  window.addEventListener('message', async e => {
    if (e.source !== window || !e.data || e.data.__scfix !== 'toPage') return;
    const m = e.data;
    if (m.type === 'hello') pushState(true);
    if (m.type === 'cmd' && COMMANDS[m.op]) {
      if (!pm && m.op !== 'config' && m.op !== 'navigate') return;
      try { await COMMANDS[m.op](...(m.args || [])); } catch (err) { console.warn(TAG, m.op, err); }
      pushState(true);
    }
    if (m.type === 'rpc' && RPC[m.method]) {
      try { post({ type: 'rpc', id: m.id, result: await RPC[m.method](...(m.args || [])) }); }
      catch (err) { post({ type: 'rpc', id: m.id, error: String(err && err.message || err) }); }
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Scope. Two styles, both drawn at the moment you hear (cfg.lookahead behind the
  //    analyser, so there are real samples on both sides of it):
  //      wave: the song's actual waveform, like an oscilloscope. Triggered on a rising zero
  //            crossing so it stands still, low-passed and blended between frames so it
  //            stays calm.
  //      calm: a line re-synthesised from 8 frequency bands, each scaled against its own
  //            recent range, with hits landing as a soft punch.
  //    Both ignore SoundCloud's volume slider: SoundCloud applies volume on the <audio>
  //    element, before our tap, so we divide it back out; a slow level follower then sets
  //    the height. SoundCloud's loudness map of the whole song sizes the line by section.
  // ---------------------------------------------------------------------------
  const BANDS = 8;
  // Log-spaced from 35 Hz to 14 kHz: sub, kick, bass, low-mids, mids, presence, brilliance, air.
  const EDGES = Array.from({ length: BANDS + 1 }, (_, b) => 35 * Math.pow(400, b / BANDS));
  const WEIGHT = [1, 0.95, 0.85, 0.75, 0.66, 0.58, 0.5, 0.44]; // higher bands: finer, smaller ripples
  const FLUX_W = [1.3, 1.3, 1, 0.8, 0.8, 0.7, 0.6, 0.5];      // what counts as a hit
  const frames = [];                       // { t, v }: raw band levels, oldest first
  const floor = new Float32Array(BANDS), peak = new Float32Array(BANDS).fill(0.1);
  const disp = new Float32Array(BANDS);    // eased 0..1 level per band
  const phases = new Float64Array(BANDS);
  const trail = [];                        // recent drawn shapes (~250 ms), for the echo
  let freq = null, gain = 0, kick = 0, lastHit = 0, fluxMean = 0, fluxVar = 0.001, prevHit = null;
  let wave = { url: null, env: null, top: 1 }, songScale = 1;
  let td = null, prevPts = null, waveLevel = 0.05;
  const WAVE_POINTS = 320;
  const LOCK_POINTS = 64;    // coarse shape used to keep consecutive frames aligned
  let lockShape = null;

  // 1 / the <audio> element's volume: undoes SoundCloud's volume slider (which maps to the
  // element on a steep curve: 15% on the slider is ~0.3% on the element). 0 only when muted.
  function unvolume() {
    if (!mediaEl) return 1;
    if (mediaEl.muted || mediaEl.volume === 0) return 0;
    return 1 / Math.max(mediaEl.volume, 1e-5);
  }

  // Band levels in a 0..1 dB scale (-100 dB → 0, -20 dB → 1), volume slider removed.
  function readBands(comp) {
    const v = new Float32Array(BANDS);
    if (!analyser || !comp) return v;
    if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(freq);
    const hz = analyser.context.sampleRate / analyser.fftSize, boost = 20 * Math.log10(comp);
    for (let b = 0; b < BANDS; b++) {
      const i0 = Math.max(1, Math.floor(EDGES[b] / hz)), i1 = Math.min(freq.length, Math.max(i0 + 1, Math.ceil(EDGES[b + 1] / hz)));
      let p = 0;
      for (let i = i0; i < i1; i++) p += Math.pow(10, freq[i] / 10);
      v[b] = Math.max(0, (10 * Math.log10(p / (i1 - i0) + 1e-12) + boost + 100) / 80);
    }
    return v;
  }

  // Gaussian-weighted average of the frames around time c (ms), past and future alike.
  function around(c, sigma) {
    const out = new Float32Array(BANDS);
    let ws = 0;
    for (const f of frames) {
      const d = (f.t - c) / sigma;
      if (d < -3 || d > 3) continue;
      const w = Math.exp(-0.5 * d * d);
      ws += w;
      for (let b = 0; b < BANDS; b++) out[b] += w * f.v[b];
    }
    if (ws) for (let b = 0; b < BANDS; b++) out[b] /= ws;
    else if (frames.length) out.set(frames[frames.length - 1].v);
    return out;
  }
  const nearest = c => frames.reduce((best, f) => (!best || Math.abs(f.t - c) < Math.abs(best.t - c) ? f : best), null);

  // The song's loudness map, from the same data SoundCloud draws its waveforms with.
  function loadWave(sound) {
    const url = sound && sound.attributes && sound.attributes.waveform_url;
    if (!url || url === wave.url) return;
    wave = { url, env: null, top: 1 };
    fetch(url).then(r => r.json()).then(j => {
      if (wave.url !== url || !j.samples) return;
      const env = j.samples.map(s => s / (j.height || 140));
      const sorted = env.slice().sort((a, b) => a - b);
      wave.env = env;
      wave.top = Math.max(0.05, sorted[Math.floor(sorted.length * 0.95)]); // the song's loud parts
    }).catch(() => {});
  }
  function songLevel(sound) {
    if (!wave.env || !sound) return 1;
    const dur = sound.duration() || 1, pos = sound.currentTime() / dur;
    const i = Math.max(0, Math.min(wave.env.length - 1, Math.floor(pos * wave.env.length)));
    // A centred window over the map: the line already knows where the section is heading.
    let s = 0, n = 0;
    for (let k = i - 6; k <= i + 6; k++) if (k >= 0 && k < wave.env.length) { s += wave.env[k]; n++; }
    return Math.min(1, (s / n) / wave.top);
  }

  // calm: bands → re-synthesised line.
  function analyseBands(now, dt, playing, comp) {
    const L = cfg.lookahead, sigma = Math.max(24, L / 2);
    frames.push({ t: now, v: readBands(comp) });
    while (frames.length && frames[0].t < now - L - 3 * sigma - 60) frames.shift();
    const c = now - L; // the moment coming out of the speakers right now
    const s = around(c, sigma);
    let mean = 0;
    for (let b = 0; b < BANDS; b++) mean += s[b] / BANDS;
    const silent = mean < 0.12;
    for (let b = 0; b < BANDS; b++) {
      const x = s[b];
      peak[b] = Math.max(x, peak[b] - dt * 0.015);
      floor[b] = x < floor[b] ? x : floor[b] + (x - floor[b]) * (1 - Math.exp(-dt / 12));
      const target = silent ? 0 : Math.max(0, Math.min(1, (x - floor[b]) / Math.max(0.12, peak[b] - floor[b])));
      const k = target > disp[b] ? 1 - Math.exp(-dt / 0.07) : 1 - Math.exp(-dt / 0.35);
      disp[b] += (target - disp[b]) * k;
    }
    const cur = nearest(c);
    if (cur && prevHit && cur !== prevHit) {
      let flux = 0;
      for (let b = 0; b < BANDS; b++) flux += FLUX_W[b] * Math.max(0, cur.v[b] - prevHit.v[b]);
      const sd = Math.sqrt(fluxVar);
      if (playing && !silent && flux > fluxMean + 2.6 * sd && flux > 0.05 && now - lastHit > 150) { kick = 1; lastHit = now; }
      const a = 1 - Math.exp(-dt / 1.5);
      fluxMean += (flux - fluxMean) * a;
      fluxVar += ((flux - fluxMean) ** 2 - fluxVar) * a;
    }
    if (cur) prevHit = cur;
    kick *= Math.exp(-dt / 0.2);
    const amps = new Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      amps[b] = WEIGHT[b] * Math.pow(disp[b], 1.4) * songScale * gain * (1 + 0.35 * kick * (b < 3 ? 1 : 0.3));
      if (playing) phases[b] += dt * (2.2 + 1.4 * b) * (0.6 + 0.4 * disp[b]);
    }
    return { kind: 'calm', amps, phases: Float64Array.from(phases) };
  }

  // wave: the real waveform at the heard moment.
  //   cfg.smooth (0..1): how much is filtered out, and how slowly frames glide into each other
  //   cfg.zoom (ms):     how much audio spans the screen
  function analyseWave(dt, comp) {
    if (!waveAn) return { kind: 'wave', pts: new Float32Array(WAVE_POINTS) };
    const sr = waveAn.context.sampleRate, N = waveAn.fftSize, P = WAVE_POINTS;
    if (!td) td = new Float32Array(N);
    waveAn.getFloatTimeDomainData(td);
    const span = Math.round(sr * cfg.zoom / 1000);
    const heard = N - 1 - Math.round(sr * cfg.lookahead / 1000);
    const cycle = Math.round(sr / 40); // the longest cycle we lock onto (40 Hz)
    const nominal = Math.max(cycle + 1, Math.min(N - span - cycle - 2, heard - (span >> 1)));
    const R = Math.max(1, Math.round(sr * (0.0004 + 0.0018 * cfg.smooth))); // box low-pass half-width

    // Running sums over the region we look at, so any box average costs O(1).
    const lo = Math.max(0, nominal - cycle - 2 * R - 1), hi = Math.min(N - 1, nominal + cycle + span + 2 * R + 1);
    const ps = new Float64Array(hi - lo + 2);
    for (let i = lo; i <= hi; i++) ps[i - lo + 1] = ps[i - lo] + td[i];
    const box = i => {
      const a = Math.max(lo, i - R), b = Math.min(hi, i + R);
      return (ps[b - lo + 1] - ps[a - lo]) / (b - a + 1);
    };
    // Drawing uses a box of boxes (triangular): it removes far more fizz than one box does.
    const step = Math.max(1, Math.round(R / 8));
    const tri = i => {
      let s = 0, n = 0;
      for (let m = -R; m <= R; m += step) { s += box(i + m); n++; }
      return s / n;
    };

    // Lock, like a scope app's correlation trigger: among the rising zero crossings (of a
    // 120 Hz low-passed copy) within one cycle of the nominal start, take the one whose shape
    // best matches the previous frame, with a mild pull towards the nominal start. Plain
    // "nearest crossing" hops between neighbouring cycles, which is what made it jitter.
    const k = 1 - Math.exp(-2 * Math.PI * 120 / sr);
    const cands = [];
    let y = 0, prev = 0;
    for (let i = Math.max(0, nominal - cycle - 2000); i < nominal + cycle; i++) {
      y += (td[i] - y) * k;
      if (i >= nominal - cycle && prev < 0 && y >= 0) cands.push(i);
      prev = y;
    }
    cands.sort((a, b) => Math.abs(a - nominal) - Math.abs(b - nominal));
    cands.length = Math.min(cands.length, 24);
    let start = cands.length ? cands[0] : nominal;
    if (lockShape && cands.length > 1) {
      let bestScore = -Infinity;
      for (const c of cands) {
        let dot = 0, e = 0;
        for (let j = 0; j < LOCK_POINTS; j++) { const v = box(c + Math.round(j / (LOCK_POINTS - 1) * span)); dot += v * lockShape[j]; e += v * v; }
        const score = (e ? dot / Math.sqrt(e) : 0) - 0.15 * Math.abs(c - nominal) / cycle;
        if (score > bestScore) { bestScore = score; start = c; }
      }
    }
    // Remember this frame's shape (unit energy) for the next lock.
    const shape = new Float32Array(LOCK_POINTS);
    let e = 0;
    for (let j = 0; j < LOCK_POINTS; j++) { shape[j] = box(start + Math.round(j / (LOCK_POINTS - 1) * span)); e += shape[j] * shape[j]; }
    if (e) { const inv = 1 / Math.sqrt(e); for (let j = 0; j < LOCK_POINTS; j++) shape[j] *= inv; lockShape = shape; }

    const pts = new Float32Array(P);
    let pk = 0;
    for (let j = 0; j < P; j++) {
      const v = tri(start + Math.round(j / (P - 1) * span)) * comp;
      pts[j] = v;
      pk = Math.max(pk, Math.abs(v));
    }
    // Height: rises over ~0.25 s, falls over ~3 s, so loud bars don't make it pump.
    waveLevel += (pk - waveLevel) * (1 - Math.exp(-dt / (pk > waveLevel ? 0.25 : 3)));
    const norm = waveLevel > 1e-6 ? 1.1 / waveLevel : 0;
    // Glide between frames: the smoother the setting, the slower the line follows.
    const glide = 1 - Math.exp(-dt / (0.012 + 0.09 * cfg.smooth));
    for (let j = 0; j < P; j++) {
      const v = pts[j] * norm * songScale * gain;
      pts[j] = prevPts ? prevPts[j] + (v - prevPts[j]) * glide : v;
    }
    prevPts = pts;
    return { kind: 'wave', pts };
  }

  function analyse(now, dt, playing) {
    const comp = unvolume();
    const sound = pm && pm.getCurrentSound();
    loadWave(sound);
    songScale += ((0.45 + 0.55 * songLevel(sound)) - songScale) * (1 - Math.exp(-dt / 0.6));
    gain += ((playing && comp ? 1 : 0) - gain) * (1 - Math.exp(-dt * 4));
    const shape = cfg.style === 'calm' ? analyseBands(now, dt, playing, comp) : analyseWave(dt, comp);
    trail.push(shape);
    if (trail.length > 16) trail.shift(); // ~250 ms at 60 fps
    return shape;
  }

  // Soft limit (tanh) instead of clipping, then taper towards the edges.
  function drawShape(ctx, W, H, shape, scale) {
    if (shape.kind === 'wave') {
      const P = shape.pts.length;
      ctx.beginPath();
      for (let j = 0; j < P; j++) {
        const u = j / (P - 1);
        const y = Math.tanh(shape.pts[j] * scale) * Math.pow(Math.sin(Math.PI * u), 0.6);
        const py = H / 2 - y * (H / 2 - 2);
        if (j) ctx.lineTo(u * W, py); else ctx.moveTo(u * W, py);
      }
      ctx.stroke();
      return;
    }
    const P = Math.max(80, Math.round(W / 2.5));
    ctx.beginPath();
    for (let j = 0; j < P; j++) {
      const u = j / (P - 1);
      let y = 0;
      for (let k = 0; k < shape.amps.length; k++) y += shape.amps[k] * Math.sin(2 * Math.PI * (1.5 + k * 1.6) * u + shape.phases[k] + k * 1.3);
      y = Math.tanh(y / 2.2 * scale) * Math.pow(Math.sin(Math.PI * u), 1.5);
      const py = H / 2 - y * (H / 2 - 2);
      if (j) ctx.lineTo(u * W, py); else ctx.moveTo(u * W, py);
    }
    ctx.stroke();
  }

  const colorCache = new WeakMap();
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const host = document.getElementById('scfix-host');
    const canvases = host && host.shadowRoot && !host.classList.contains('classic')
      ? host.shadowRoot.querySelectorAll('canvas[data-scope]') : [];
    if (!canvases.length) { lastT = now; return; }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const shape = analyse(now, dt, !!(pm && pm.isPlaying()));
    const dpr = window.devicePixelRatio || 1;
    for (const c of canvases) {
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) continue;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      let colors = colorCache.get(c);
      if (!colors || now - colors.at > 1000) {
        const cs = getComputedStyle(c);
        colors = { ink: cs.getPropertyValue('--ink').trim() || '#1D1B17', acc: cs.getPropertyValue('--acc').trim() || '#B4441F', line: cs.getPropertyValue('--line').trim() || '#D8D0C1', at: now };
        colorCache.set(c, colors);
      }
      const ctx = c.getContext('2d');
      const W = c.width, H = c.height, scale = parseFloat(c.dataset.scale || '1') * cfg.height;
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      if (c.dataset.echo === '1' && trail.length) {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = colors.acc;
        ctx.lineWidth = 1.2 * dpr;
        // Calm: the line ~250 ms ago. Waveform: a short afterglow (~80 ms), like a scope's phosphor.
        drawShape(ctx, W, H, shape.kind === 'wave' ? trail[Math.max(0, trail.length - 6)] : trail[0], scale);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = parseFloat(c.dataset.weight || '1.6') * dpr;
      drawShape(ctx, W, H, shape, scale);
    }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------------------
  (async () => {
    for (let i = 0; i < 240; i++) {
      const found = findModule(['toggleShuffle', 'toggleState', 'getState', 'pullNext', 'hasMoreAhead', 'getQueue', 'getCurrentQueueItem', 'playSource']);
      if (found) {
        volume = findModule(['setVolume', 'getVolume', 'toggleMuted', 'getMuted']);
        return install(found);
      }
      await sleep(250);
    }
    console.warn(TAG, 'SoundCloud player not found. SoundCloud may have changed; scfix stays inactive.');
  })();
})();
