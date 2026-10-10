// Nghe nhạc: phát file nhạc trong thư mục Google Drive (qua Apps Script) — playlist riêng từng người,
// nhớ chỗ đang nghe, tải trước bài kế tiếp, lưu bài đã nghe trên máy (nghe lại không cần mạng),
// thanh phát nhỏ ở mọi trang, điều khiển từ màn hình khoá / tai nghe (Media Session).
(function () {
  const esc = U.esc;
  const ALL = '__all__';
  const CACHE_NAME = 'music-v1', CACHE_MAX = 400 * 1048576;   // nhạc lưu trên máy tối đa ~400 MB, quá thì xoá bài nghe lâu nhất
  const PALETTE = [['#8b5cf6', '#ec4899'], ['#06b6d4', '#3b82f6'], ['#f59e0b', '#ef4444'], ['#10b981', '#06b6d4'],
    ['#f43f5e', '#f59e0b'], ['#6366f1', '#22d3ee'], ['#d946ef', '#8b5cf6'], ['#14b8a6', '#84cc16']];
  // WAV rỗng: phát ngay trong cú bấm đầu tiên để iPhone/Safari cho phép phát nhạc sau đó
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  const M = (window.Music = {});
  let songs = [], byId = {}, playlists = {}, loaded = false, loading = null, offline = false;
  let st = { id: null, time: 0, vol: 100, view: ALL, ctx: ALL, shuffle: false, repeat: false, t: 0 };
  let audio = null, urlNow = null, reqToken = 0, resume = null, isLoading = false, unlocked = false;   // resume = { id, time }: chỗ nghe dở lần trước
  let miniClosed = true, cardVisible = false, seeking = false, lastServer = 0, plTimer = null;
  const inflight = {};

  // ---------------- tiện ích ----------------
  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  };
  const me = () => (App.user && App.user.email) || '';
  const K = { state: () => 'pwa-music-state:' + me(), pl: () => 'pwa-music-pl:' + me(), songs: 'pwa-music-songs', cache: 'pwa-music-cache' };
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const grad = s => { const p = PALETTE[hash(s) % PALETTE.length]; return `linear-gradient(135deg,${p[0]},${p[1]})`; };
  const ini = s => (String(s).trim()[0] || '♪').toUpperCase();
  const fmt = s => { if (!s || !isFinite(s)) return '0:00'; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
  const mb = b => (U.num(b) / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const ctxName = c => (c === ALL ? 'Tất cả bài hát' : c);
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Lưu ngầm lên máy chủ chỉ khi phiên đăng nhập còn hạn (không bật màn hình đăng nhập giữa lúc nghe)
  const canSync = () => window.APP_CONFIG.mode !== 'live' || (window.Auth && Auth.valid());
  const onPage = () => /^#\/i\/NHAC(\?|$)/.test(location.hash);
  const $ = id => document.getElementById(id);

  // ---------------- lưu nhạc trên máy (Cache Storage) ----------------
  const meta = () => ls.get(K.cache, {});
  const cached = id => !!meta()[id];
  async function cacheGet(id) {
    if (!('caches' in window)) return null;
    try {
      const r = await (await caches.open(CACHE_NAME)).match('music/' + id);
      if (!r) return null;
      const m = meta(); if (m[id]) { m[id].t = Date.now(); ls.set(K.cache, m); }
      return await r.blob();
    } catch (e) { return null; }
  }
  async function cachePut(id, blob) {
    if (!('caches' in window)) return;
    try {
      const c = await caches.open(CACHE_NAME);
      await c.put('music/' + id, new Response(blob, { headers: { 'Content-Type': blob.type } }));
      const m = meta(); m[id] = { s: blob.size, t: Date.now() };
      let total = Object.values(m).reduce((a, x) => a + x.s, 0);
      for (const k of Object.keys(m).sort((a, b) => m[a].t - m[b].t)) {
        if (total <= CACHE_MAX) break;
        if (k === st.id || k === id) continue;
        await c.delete('music/' + k); total -= m[k].s; delete m[k];
      }
      ls.set(K.cache, m);
    } catch (e) { /* bộ nhớ máy đầy → chỉ phát, không lưu */ }
  }
  // Đồng bộ danh sách "đã lưu" với bộ nhớ thật (người dùng có thể đã xoá dữ liệu trình duyệt)
  async function cacheSync() {
    if (!('caches' in window)) return;
    try {
      const keys = new Set((await (await caches.open(CACHE_NAME)).keys()).map(r => decodeURIComponent(r.url.split('/music/').pop())));
      const m = meta(); let changed = false;
      Object.keys(m).forEach(k => { if (!keys.has(k)) { delete m[k]; changed = true; } });
      if (changed) ls.set(K.cache, m);
    } catch (e) { /* bỏ qua */ }
  }
  async function cacheClear() {
    try { await caches.delete(CACHE_NAME); } catch (e) { /* bỏ qua */ }
    ls.set(K.cache, {});
  }
  // Lấy dữ liệu 1 bài: có trên máy thì dùng ngay, chưa có thì tải qua Apps Script rồi lưu lại
  function getBlob(id) {
    if (inflight[id]) return inflight[id];
    return (inflight[id] = (async () => {
      try {
        let b = await cacheGet(id);
        if (b) return b;
        if (offline) throw new Error('Đang mất mạng — bài này chưa được lưu trên máy');
        const r = await API.audio(id);
        b = U.b64ToBlob(r.data, r.mime);
        await cachePut(id, b);
        return b;
      } finally { delete inflight[id]; }
    })());
  }

  // ---------------- dữ liệu: danh sách bài, playlist, chỗ đang nghe ----------------
  M.ensure = (force) => {
    if (loaded && !force) return Promise.resolve();
    if (loading) return loading;
    return (loading = (async () => {
      const local = ls.get(K.state(), null);
      try {
        const [list, data] = await Promise.all([API.songs(), API.musicGet()]);
        songs = list || []; offline = false;
        ls.set(K.songs, songs);
        playlists = (data && data.playlists) || {};
        ls.set(K.pl(), playlists);
        const srv = data && data.state;
        if (!loaded) applyState(srv && (!local || (srv.t || 0) > (local.t || 0)) ? srv : local);
      } catch (e) {
        // Mất mạng: dùng danh sách đã lưu lần trước, chỉ phát được bài đã lưu trên máy
        const old = ls.get(K.songs, null);
        if (!old || e.code === 'NOT_ALLOWED' || /quyền|MUSIC_FOLDER_ID/.test(e.message)) throw e;
        songs = old; offline = true;
        playlists = ls.get(K.pl(), {});
        if (!loaded) applyState(local);
      }
      byId = {}; songs.forEach(s => { byId[s.id] = s; });
      Object.keys(playlists).forEach(k => { playlists[k] = (playlists[k] || []).filter(id => byId[id]); });
      if (st.view !== ALL && !playlists[st.view]) st.view = ALL;
      if (st.ctx !== ALL && !playlists[st.ctx]) st.ctx = ALL;
      await cacheSync();
      loaded = true;
    })().finally(() => { loading = null; }));
  };
  function applyState(s) {
    if (!s) return;
    st = Object.assign(st, s, { t: s.t || 0 });
    if (!st.ctx) st.ctx = st.view || ALL;
    if (audio) audio.volume = st.vol / 100;
    if (!audio || !audio.src) resume = st.id && st.time > 1 ? { id: st.id, time: st.time } : null;
  }
  // Lưu chỗ đang nghe: trên máy mỗi lần gọi, lên máy chủ tối đa 20 giây/lần (force = lưu ngay)
  function saveState(force) {
    if (audio && audio.src && audio.src !== SILENT) st.time = audio.currentTime || 0;
    st.t = Date.now();
    ls.set(K.state(), st);
    if (!loaded || offline || !canSync()) return;
    if (!force && Date.now() - lastServer < 20000) return;
    lastServer = Date.now();
    const { id, time, vol, view, ctx, shuffle, repeat, t } = st;
    API.musicSave({ state: { id, time: Math.round(time), vol, view, ctx, shuffle, repeat, t } }).catch(() => {});
  }
  function savePlaylists() {
    ls.set(K.pl(), playlists);
    clearTimeout(plTimer);
    plTimer = setTimeout(() => {
      if (offline) return U.toast('Đang mất mạng — playlist chỉ lưu trên máy này', 'err');
      API.musicSave({ playlists }).catch(e => U.toast('Không lưu được playlist: ' + e.message, 'err'));
    }, 500);
  }

  // ---------------- phát nhạc ----------------
  function el() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = st.vol / 100;
    audio.addEventListener('play', () => { if (actx && actx.state === 'suspended') actx.resume(); paint(); startViz(); });
    // Bỏ qua sự kiện đến trễ của đoạn âm thanh rỗng (SILENT) sau khi đã đổi sang bài thật
    audio.addEventListener('pause', () => { if (audio.src === SILENT || !audio.paused) return; paint(); saveState(true); });
    audio.addEventListener('timeupdate', () => { if (audio.src === SILENT) return; paintTime(); saveState(false); });
    audio.addEventListener('loadedmetadata', paintTime);
    audio.addEventListener('ended', () => {
      if (audio.src === SILENT || !audio.ended) return;
      if (st.repeat) { audio.currentTime = 0; audio.play().catch(() => {}); } else M.next();
    });
    window.addEventListener('pagehide', () => { if (st.id) saveState(true); });
    return audio;
  }
  // Gọi đồng bộ trong cú bấm của người dùng (trước mọi await) để trình duyệt cho phép phát
  function unlock() {
    const a = el();
    if (!unlocked) { unlocked = true; if (!a.src) { a.src = SILENT; a.play().catch(() => {}); } }
    initViz();
  }
  const queue = (c = st.ctx) => c === ALL ? songs : (playlists[c] || []).map(id => byId[id]).filter(Boolean);
  const idx = () => queue().findIndex(s => s.id === st.id);

  // Bấm vào 1 bài = phát từ đầu. Chỉ nút ▶ "nghe tiếp" (opts.resume) mới phát tiếp từ chỗ dở lần trước, và chỉ đúng bài đó.
  M.play = async (id, ctx, opts) => {
    const s = byId[id]; if (!s) return;
    unlock();
    const a = el();
    if (ctx) st.ctx = ctx;
    miniClosed = false;
    const at = opts && opts.resume && resume && resume.id === id ? resume.time : 0;
    resume = null;
    if (id === st.id && a.src && a.src !== SILENT && !isLoading) { a.currentTime = 0; a.play().catch(() => {}); return; }
    const my = ++reqToken;
    st.id = id; isLoading = true;
    if (a.src && a.src !== SILENT) a.pause();
    paint(); paintList();
    try {
      const b = await getBlob(id);
      if (my !== reqToken) return;
      if (urlNow) URL.revokeObjectURL(urlNow);
      urlNow = URL.createObjectURL(b);
      a.src = urlNow;
      if (at > 1) a.addEventListener('loadedmetadata', () => { if (at < a.duration - 1) a.currentTime = at; }, { once: true });
      isLoading = false;
      await a.play().catch(() => {});
      mediaSession(s);
      saveState(true);
      setTimeout(() => preloadNext(my), 2000);
    } catch (e) {
      if (my === reqToken) U.toast('Không phát được "' + s.name + '": ' + e.message, 'err');
    } finally {
      if (my === reqToken) { isLoading = false; paint(); paintList(); }
    }
  };
  M.toggle = () => {
    unlock();
    const a = el();
    if (!st.id) { const q = queue(st.view); if (q.length) M.play(q[0].id, st.view); return; }
    if (!a.src || a.src === SILENT) { M.play(st.id, null, { resume: true }); return; }   // nghe tiếp chỗ dở sau khi mở lại app
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  M.next = () => {
    const q = queue(); if (!q.length) return;
    const i = idx();
    if (st.shuffle && q.length > 1) { let r; do { r = Math.floor(Math.random() * q.length); } while (r === i); M.play(q[r].id); }
    else M.play(q[(i + 1) % q.length].id);
  };
  M.prev = () => {
    const q = queue(); if (!q.length) return;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    M.play(q[(idx() - 1 + q.length) % q.length].id);
  };
  // Tải sẵn bài kế tiếp vào máy (phát ngẫu nhiên thì không đoán được bài nào)
  function preloadNext(my) {
    if (my !== reqToken || st.shuffle || offline) return;
    const q = queue(); if (q.length < 2) return;
    const n = q[(idx() + 1) % q.length];
    if (n && !cached(n.id)) getBlob(n.id).then(() => paintList()).catch(() => {});
  }
  function closeMini() { if (audio && !audio.paused) audio.pause(); miniClosed = true; sync(); }

  // Màn hình khoá / thông báo / tai nghe bluetooth
  function mediaSession(s) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.name, artist: ctxName(st.ctx), album: window.APP_CONFIG.appName,
        artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    } catch (e) { /* bỏ qua */ }
    if (mediaSession.done) return;
    mediaSession.done = true;
    const h = (k, f) => { try { navigator.mediaSession.setActionHandler(k, f); } catch (e) { /* trình duyệt không hỗ trợ */ } };
    h('play', () => M.toggle()); h('pause', () => audio && audio.pause());
    h('previoustrack', M.prev); h('nexttrack', M.next);
    h('seekto', d => { if (audio) audio.currentTime = d.seekTime; });
    h('seekbackward', d => { if (audio) audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
    h('seekforward', d => { if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10)); });
  }

  // ---------------- sóng nhạc (không dùng trên iPhone: dễ bị tắt tiếng khi khoá màn hình) ----------------
  let actx = null, analyser = null, freq = null, vizOn = false;
  function initViz() {
    if (actx || isIOS || !(window.AudioContext || window.webkitAudioContext)) { if (actx && actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaElementSource(el());
      analyser = actx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser); analyser.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { actx = null; analyser = null; }
  }
  function startViz() {
    const c = $('muViz');
    if (!analyser || !c || vizOn) return;
    vizOn = true; c.classList.add('on');
    const g = c.getContext('2d');
    const draw = () => {
      const cv = $('muViz');
      if (!cv || !audio || audio.paused) { vizOn = false; if (cv) cv.classList.remove('on'); return; }
      requestAnimationFrame(draw);
      const d = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(freq);
      const bars = 48, gap = 3, bw = (w - gap * (bars - 1)) / bars;
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, '#22d3ee'); gr.addColorStop(0.55, '#8b5cf6'); gr.addColorStop(1, '#ff4d94');
      g.fillStyle = gr;
      for (let i = 0; i < bars; i++) {
        const v = freq[Math.floor(i * freq.length / bars / 1.4)] / 255, bh = Math.max(2, v * h * 0.95), x = i * (bw + gap);
        g.beginPath();
        if (g.roundRect) g.roundRect(x, h - bh, bw, bh, [Math.min(bw / 2, 3), Math.min(bw / 2, 3), 0, 0]); else g.rect(x, h - bh, bw, bh);
        g.fill();
      }
    };
    draw();
  }

  // ---------------- thanh phát nhỏ (mọi trang) ----------------
  M.init = () => {
    const mp = $('mp');
    mp.innerHTML = `<div class="mp-prog"><i id="mpFill"></i></div>
      <button type="button" class="mp-cov" data-open aria-label="Mở trang nghe nhạc">♪</button>
      <button type="button" class="mp-info" data-open><b id="mpName">—</b><small id="mpTime">0:00 / 0:00</small></button>
      <button type="button" class="mp-b mp-prev" data-a="prev" title="Bài trước">${Icon('prev')}</button>
      <button type="button" class="mp-b mp-play" data-a="toggle" title="Phát / Tạm dừng">${Icon('play')}</button>
      <button type="button" class="mp-b" data-a="next" title="Bài sau">${Icon('next')}</button>
      <button type="button" class="mp-b mp-x" data-a="close" title="Dừng và ẩn">${Icon('x')}</button>`;
    mp.addEventListener('click', e => {
      if (e.target.closest('[data-open]')) { location.hash = '#/i/NHAC'; return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      ({ prev: M.prev, next: M.next, toggle: M.toggle, close: closeMini })[b.dataset.a]();
    });
    // Phím tắt trên trang nghe nhạc: Space = phát/dừng, ←/→ = tua 5 giây
    document.addEventListener('keydown', e => {
      if (!onPage() || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || document.querySelector('.modal-bg')) return;
      if (e.code === 'Space') { e.preventDefault(); M.toggle(); }
      else if (audio && audio.src && e.code === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
      else if (audio && audio.src && e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    });
  };
  // Hiện/ẩn thanh nhỏ theo trang: ẩn ở form nhập liệu và khi khối phát lớn đang hiện trên màn hình
  function sync() {
    const mp = $('mp'); if (!mp) return;
    const show = !!st.id && loaded && !miniClosed && !/^#\/f\//.test(location.hash) && !(onPage() && cardVisible);
    mp.hidden = !show;
    document.body.classList.toggle('has-mp', show);
  }
  M.sync = sync;

  // ---------------- vẽ lại giao diện ----------------
  function paint() {
    const s = byId[st.id], playing = !!(audio && !audio.paused && audio.src !== SILENT);
    // thanh nhỏ
    const cov = document.querySelector('.mp-cov');
    if (cov && s) { cov.style.background = grad(s.name); cov.textContent = ini(s.name); cov.classList.toggle('spin', playing); }
    if ($('mpName')) $('mpName').textContent = s ? s.name : '—';
    document.querySelectorAll('[data-a="toggle"]').forEach(b => { b.innerHTML = Icon(playing ? 'pause' : 'play'); b.title = playing ? 'Tạm dừng' : 'Phát'; });
    // khối phát lớn
    if ($('muCard')) {
      const c = $('muCov');
      c.style.background = s ? grad(s.name) : ''; c.textContent = s ? ini(s.name) : '♪';
      c.classList.toggle('spin', playing); c.classList.toggle('load', isLoading);
      $('muTitle').textContent = s ? s.name : 'Chọn một bài để nghe';
      $('muEq').classList.toggle('on', playing);
      $('muSub').textContent = isLoading ? (cached(st.id) ? 'Đang mở…' : 'Đang tải từ Google Drive…')
        : !s ? (offline ? 'Đang mất mạng — chỉ phát được bài đã lưu trên máy' : songs.length + ' bài trong thư mục nhạc')
        : resume && resume.id === st.id && resume.time > 5 ? 'Bấm ▶ để nghe tiếp từ ' + fmt(resume.time)
        : ctxName(st.ctx) + ' · ' + mb(s.size);
      $('muDl').hidden = !s;
      document.querySelectorAll('.mu-ctrl [data-a="shuffle"]').forEach(b => b.classList.toggle('on', st.shuffle));
      document.querySelectorAll('.mu-ctrl [data-a="repeat"]').forEach(b => b.classList.toggle('on', st.repeat));
      paintVol();
    }
    paintTime();
    if (playing) startViz();
    sync();
  }
  function paintTime() {
    const a = audio, dur = a && a.duration && isFinite(a.duration) ? a.duration : 0, cur = a && a.src !== SILENT ? a.currentTime : 0;
    const p = dur ? cur / dur * 100 : 0;
    if ($('mpFill')) $('mpFill').style.width = p + '%';
    if ($('mpTime')) $('mpTime').textContent = fmt(cur) + ' / ' + fmt(dur);
    if ($('muCard') && !seeking) {
      $('muFill').style.width = p + '%'; $('muDot').style.left = p + '%';
      $('muCur').textContent = fmt(cur); $('muDur').textContent = fmt(dur);
      $('muBar').setAttribute('aria-valuenow', Math.round(p));
    }
    if (dur && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try { navigator.mediaSession.setPositionState({ duration: dur, playbackRate: a.playbackRate || 1, position: Math.min(cur, dur) }); } catch (e) { /* bỏ qua */ }
    }
  }
  function paintVol() {
    if (!$('muVol')) return;
    $('muVol').value = st.vol; $('muVolV').textContent = st.vol;
    $('muVol').style.setProperty('--p', st.vol + '%');
    const b = document.querySelector('[data-a="mute"]');
    b.innerHTML = Icon(st.vol === 0 ? 'mute' : 'volume'); b.classList.toggle('on', st.vol === 0);
  }
  function setVol(v, save) {
    st.vol = Math.max(0, Math.min(100, Math.round(v)));
    if (audio) audio.volume = st.vol / 100;
    paintVol();
    if (save) saveState(true);
  }

  function paintTabs() {
    const box = $('muTabs'); if (!box) return;
    const tab = (key, label, n, ic) => `<button type="button" class="gtab ${st.view === key ? 'on' : ''}" data-v="${esc(key)}" style="--gc:var(--g8)">
      <span class="gt-ic">${Icon(ic)}</span>${esc(label)}<b>${n}</b></button>`;
    box.innerHTML = tab(ALL, 'Tất cả bài hát', songs.length, 'music') +
      Object.keys(playlists).map(k => tab(k, k, playlists[k].length, 'folder')).join('') +
      `<button type="button" class="gtab mu-new" data-newpl>${Icon('plus', 'sm')} Playlist mới</button>`;
    const on = box.querySelector('.gtab.on');
    if (on) box.scrollTo({ left: on.offsetLeft - box.offsetLeft - (box.clientWidth - on.offsetWidth) / 2 });
  }
  function paintList() {
    const box = $('muList'); if (!box) return;
    const q = U.norm(($('muQ') || {}).value || '').trim();
    const all = queue(st.view), rows = q ? all.filter(s => U.norm(s.name).includes(q)) : all;
    const inPl = st.view !== ALL;
    box.innerHTML = rows.map(s => {
      const on = s.id === st.id, playing = on && audio && !audio.paused;
      return `<div class="mrow ${on ? 'on' : ''}" data-id="${esc(s.id)}" role="button" tabindex="0">
        <span class="mthumb" style="background:${grad(s.name)}">${playing ? '<span class="mu-eq on"><i></i><i></i><i></i><i></i></span>' : esc(ini(s.name))}</span>
        <span class="mmain"><span class="mname">${esc(s.name)}</span>
          <span class="mmeta">${mb(s.size)}${cached(s.id) ? `<span class="msaved">${Icon('saved', 'sm')} đã lưu trên máy</span>` : ''}${on && isLoading ? '<span>· đang tải…</span>' : ''}</span></span>
        <button type="button" class="mu-ib" data-dl title="Tải về máy" aria-label="Tải về máy">${Icon('download')}</button>
        ${inPl ? `<button type="button" class="mu-ib rm" data-rm title="Bỏ khỏi playlist" aria-label="Bỏ khỏi playlist">${Icon('minus')}</button>`
          : `<button type="button" class="mu-ib" data-add title="Thêm vào playlist" aria-label="Thêm vào playlist">${Icon('plus')}</button>`}
      </div>`;
    }).join('') || `<div class="lempty"><span class="tic" style="--gc:var(--g8)">${Icon('music')}</span>
      <div>${q ? 'Không có bài nào khớp từ khoá' : inPl ? 'Playlist này chưa có bài nào.<br>Vào <b>Tất cả bài hát</b> rồi bấm ＋ để thêm.' : 'Thư mục nhạc chưa có file nào (mp3, m4a, wav, ogg).'}</div></div>`;
    $('muCount').textContent = ctxName(st.view) + ' · ' + rows.length + ' bài';
    $('muTools').innerHTML = inPl
      ? `<button type="button" class="dtbl" data-t="rename">${Icon('edit', 'sm')} Đổi tên</button><button type="button" class="dtbl danger" data-t="delete">${Icon('trash', 'sm')} Xoá playlist</button>`
      : `<button type="button" class="dtbl" data-t="import" title="Chép playlist từ app nhạc cũ">${Icon('upload', 'sm')} Nhập playlist</button><button type="button" class="dtbl" data-t="refresh" title="Đọc lại thư mục nhạc trên Drive">${Icon('refresh', 'sm')} Làm mới</button>`;
    paintStore();
  }
  function paintStore() {
    const box = $('muStore'); if (!box) return;
    const m = meta(), n = Object.keys(m).length, size = Object.values(m).reduce((a, x) => a + x.s, 0);
    box.innerHTML = n ? `${Icon('saved', 'sm')} Đã lưu trên máy này <b>${n}</b> bài · ${mb(size)} — nghe lại được cả khi mất mạng.
      <button type="button" class="linkbtn" data-t="clear">Xoá nhạc đã lưu</button>`
      : `${Icon('saved', 'sm')} Bài đã nghe sẽ được lưu trên máy này để lần sau mở ngay, nghe được cả khi mất mạng.`;
  }

  // ---------------- playlist ----------------
  async function askName(initial) {
    const r = await U.ask({ title: initial ? 'Đổi tên playlist' : 'Playlist mới', ok: 'Lưu',
      fields: [{ name: 'n', label: initial ? 'Tên mới' : 'Tên playlist', value: initial || '', placeholder: 'Ví dụ: Nhạc thư giãn', maxlength: 40 }] });
    const n = r && r.n.trim();
    if (!n || n === initial) return null;
    if (n === ALL || playlists[n]) { U.toast('Tên này đã có', 'err'); return null; }
    return n;
  }
  async function createPlaylist(withSong) {
    const n = await askName(''); if (!n) return null;
    playlists[n] = withSong ? [withSong.id] : [];
    savePlaylists(); paintTabs(); paintList();
    U.toast(withSong ? `Đã tạo "${n}" và thêm bài` : `Đã tạo playlist "${n}"`);
    return n;
  }
  function addDialog(s) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    const draw = () => {
      const names = Object.keys(playlists);
      wrap.innerHTML = `<div class="modal"><h3>Thêm vào playlist</h3><p class="muted small">${esc(s.name)}</p>
        <div class="mpl-opts">${names.length ? names.map(n => { const has = playlists[n].includes(s.id);
          return `<button type="button" class="mpl-opt ${has ? 'has' : ''}" data-n="${esc(n)}"><span>${esc(n)}</span><small>${has ? '✓ Đã có — bấm để bỏ' : 'Thêm'}</small></button>`; }).join('')
          : '<div class="muted small">Chưa có playlist nào — tạo mới bên dưới.</div>'}
          <button type="button" class="mpl-opt new" data-new>${Icon('plus', 'sm')} Tạo playlist mới</button></div>
        <div class="row-end"><button type="button" class="btn ghost" data-x>Đóng</button></div></div>`;
    };
    draw();
    document.body.appendChild(wrap);
    wrap.addEventListener('click', async e => {
      if (e.target === wrap || e.target.closest('[data-x]')) return wrap.remove();
      if (e.target.closest('[data-new]')) { wrap.remove(); return createPlaylist(s); }
      const o = e.target.closest('[data-n]'); if (!o) return;
      const arr = playlists[o.dataset.n], i = arr.indexOf(s.id);
      if (i < 0) { arr.push(s.id); U.toast(`Đã thêm vào "${o.dataset.n}"`); } else { arr.splice(i, 1); U.toast(`Đã bỏ khỏi "${o.dataset.n}"`); }
      savePlaylists(); paintTabs(); draw();
    });
  }
  // Nhập playlist từ app nhạc cũ: chạy hàm kiemTra() trong Apps Script cũ, copy phần JSON sau "Playlist đã lưu:"
  async function importPlaylists() {
    const r = await U.ask({ title: 'Nhập playlist từ app cũ', ok: 'Nhập',
      message: 'Mở project app nhạc cũ trên <b>script.google.com</b> → chọn hàm <b>kiemTra</b> → <b>Chạy</b> → trong Nhật ký thực thi, copy phần nằm sau chữ <b>"Playlist đã lưu:"</b> (bắt đầu bằng dấu {) rồi dán vào đây.',
      fields: [{ name: 'j', label: 'Dữ liệu playlist', type: 'textarea', placeholder: '{"Nhạc thư giãn":["1AbC…","1XyZ…"]}' }] });
    if (!r) return;
    let obj;
    try { obj = JSON.parse(r.j.slice(r.j.indexOf('{'), r.j.lastIndexOf('}') + 1)); } catch (e) { return U.toast('Dữ liệu không đúng dạng — hãy copy đủ từ dấu { đến dấu }', 'err'); }
    let nPl = 0, nSong = 0, skip = 0;
    Object.keys(obj || {}).forEach(name => {
      if (!Array.isArray(obj[name]) || name === ALL) return;
      const arr = playlists[name] = playlists[name] || [];
      if (!arr.length) nPl++;
      obj[name].forEach(id => { if (!byId[id]) skip++; else if (!arr.includes(id)) { arr.push(id); nSong++; } });
    });
    savePlaylists(); paintTabs(); paintList();
    U.toast(`Đã nhập ${nPl} playlist, ${nSong} bài` + (skip ? ` (bỏ qua ${skip} bài không còn trong thư mục)` : ''));
  }

  async function download(s) {
    try {
      U.toast('Đang chuẩn bị "' + s.name + '"…');
      const b = await getBlob(s.id), url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = s.file || s.name + '.mp3';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      paintList();
    } catch (e) { U.toast('Không tải được: ' + e.message, 'err'); }
  }

  // ---------------- trang Nghe nhạc ----------------
  M.render = async it => {
    App.head(it.label, { back: true });
    App.main.classList.remove('has-fab');
    App.loading();
    try { await M.ensure(); } catch (e) {
      App.main.innerHTML = `<div class="empty err">⚠️ ${esc(e.message)}<br><button class="btn" onclick="location.reload()">Thử lại</button></div>`;
      return;
    }
    App.main.innerHTML = `<div class="mu" id="mu">
      ${offline ? `<div class="card mu-off">${Icon('alert', 'sm')} Đang mất mạng — chỉ phát được bài đã lưu trên máy.</div>` : ''}
      <section class="mu-card" id="muCard">
        <canvas class="mu-viz" id="muViz" aria-hidden="true"></canvas>
        <div class="mu-head">
          <div class="mu-cov" id="muCov">♪</div>
          <div class="mu-meta"><div class="mu-title" id="muTitle"></div>
            <div class="mu-sub"><span class="mu-eq" id="muEq"><i></i><i></i><i></i><i></i></span><span id="muSub"></span></div></div>
          <button type="button" class="mu-b sm" id="muDl" data-a="dl" title="Tải bài đang phát về máy">${Icon('download')}</button>
        </div>
        <div class="mu-bar" id="muBar" role="slider" aria-label="Vị trí đang phát" aria-valuemin="0" aria-valuemax="100" tabindex="0">
          <div class="mu-track"><div class="mu-fill" id="muFill"></div><div class="mu-dot" id="muDot"></div></div></div>
        <div class="mu-time"><span id="muCur">0:00</span><span id="muDur">0:00</span></div>
        <div class="mu-ctrl">
          <button type="button" class="mu-b" data-a="shuffle" title="Phát ngẫu nhiên">${Icon('shuffle')}</button>
          <button type="button" class="mu-b" data-a="prev" title="Bài trước">${Icon('prev')}</button>
          <button type="button" class="mu-b mu-play" data-a="toggle" title="Phát">${Icon('play')}</button>
          <button type="button" class="mu-b" data-a="next" title="Bài sau">${Icon('next')}</button>
          <button type="button" class="mu-b" data-a="repeat" title="Lặp lại bài đang phát">${Icon('repeat')}</button>
        </div>
        <div class="mu-vol"><button type="button" class="mu-b sm" data-a="mute" title="Tắt / bật tiếng"></button>
          <input type="range" id="muVol" min="0" max="100" step="1" aria-label="Âm lượng"><span id="muVolV"></span></div>
      </section>
      <div class="gtabs mu-tabs" id="muTabs"></div>
      <div class="lbar mu-lbar"><label class="lsearch">${Icon('search')}<input type="search" id="muQ" placeholder="Tìm bài hát…" autocomplete="off"></label></div>
      <div class="mu-tool"><span class="muted small" id="muCount"></span><span class="mu-tools" id="muTools"></span></div>
      <div class="mu-list" id="muList"></div>
      <div class="mu-store muted small" id="muStore"></div>
    </div>`;
    const root = $('mu');
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]');
      if (a) {
        const k = a.dataset.a, s = byId[st.id];
        if (k === 'toggle') M.toggle(); else if (k === 'next') M.next(); else if (k === 'prev') M.prev();
        else if (k === 'shuffle') { st.shuffle = !st.shuffle; saveState(true); paint(); if (!st.shuffle) preloadNext(reqToken); }
        else if (k === 'repeat') { st.repeat = !st.repeat; saveState(true); paint(); }
        else if (k === 'mute') { if (st.vol > 0) { st.lastVol = st.vol; setVol(0, true); } else setVol(st.lastVol || 70, true); }
        else if (k === 'dl' && s) download(s);
        return;
      }
      const tab = e.target.closest('[data-v]');
      if (tab) { st.view = tab.dataset.v; $('muQ').value = ''; saveState(true); paintTabs(); paintList(); return; }
      if (e.target.closest('[data-newpl]')) { const n = await createPlaylist(); if (n) { st.view = n; paintTabs(); paintList(); } return; }
      const t = e.target.closest('[data-t]');
      if (t) {
        const k = t.dataset.t;
        if (k === 'rename') {
          const n = await askName(st.view); if (!n) return;
          const out = {}; Object.keys(playlists).forEach(x => { out[x === st.view ? n : x] = playlists[x]; });
          playlists = out; if (st.ctx === st.view) st.ctx = n; st.view = n;
          savePlaylists(); saveState(true); paintTabs(); paintList(); U.toast('Đã đổi tên');
        } else if (k === 'delete') {
          if (!await U.confirm(`Xoá playlist "${st.view}"? File nhạc trên Drive vẫn còn nguyên.`)) return;
          delete playlists[st.view]; if (st.ctx === st.view) st.ctx = ALL; st.view = ALL;
          savePlaylists(); saveState(true); paintTabs(); paintList(); U.toast('Đã xoá playlist');
        } else if (k === 'import') importPlaylists();
        else if (k === 'refresh') { t.disabled = true; try { await M.ensure(true); paintTabs(); paintList(); paint(); U.toast('Đã đọc lại thư mục nhạc: ' + songs.length + ' bài'); } catch (er) { U.toast(er.message, 'err'); } finally { t.disabled = false; } }
        else if (k === 'clear') {
          if (!await U.confirm('Xoá toàn bộ nhạc đã lưu trên máy này? Lần sau nghe sẽ tải lại từ Google Drive.')) return;
          await cacheClear(); paintList(); U.toast('Đã xoá nhạc đã lưu trên máy');
        }
        return;
      }
      const row = e.target.closest('.mrow'); if (!row) return;
      const s = byId[row.dataset.id];
      if (e.target.closest('[data-dl]')) return download(s);
      if (e.target.closest('[data-add]')) return addDialog(s);
      if (e.target.closest('[data-rm]')) {
        const arr = playlists[st.view], i = arr.indexOf(s.id); if (i >= 0) arr.splice(i, 1);
        savePlaylists(); paintTabs(); paintList(); U.toast('Đã bỏ khỏi playlist'); return;
      }
      M.play(s.id, st.view);
    });
    root.addEventListener('keydown', e => { const row = e.target.closest('.mrow'); if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); } });
    $('muQ').addEventListener('input', paintList);
    $('muVol').addEventListener('input', e => setVol(+e.target.value));
    $('muVol').addEventListener('change', e => setVol(+e.target.value, true));
    // Tua: kéo trên thanh thời gian (chuột hoặc ngón tay), hoặc ←/→ khi thanh đang được chọn
    const bar = $('muBar');
    const at = e => { const r = bar.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      $('muFill').style.width = x * 100 + '%'; $('muDot').style.left = x * 100 + '%'; return x; };
    bar.addEventListener('pointerdown', e => { if (!audio || !audio.duration) return; seeking = true; bar.setPointerCapture(e.pointerId); at(e); });
    bar.addEventListener('pointermove', e => { if (seeking) $('muCur').textContent = fmt(at(e) * audio.duration); });
    bar.addEventListener('pointerup', e => { if (!seeking) return; seeking = false; audio.currentTime = at(e) * audio.duration; saveState(true); });
    bar.addEventListener('pointercancel', () => { seeking = false; paintTime(); });
    bar.addEventListener('keydown', e => {
      if (!audio || !audio.duration) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); audio.currentTime += e.key === 'ArrowRight' ? 5 : -5; }
    });
    // Khối phát lớn trôi khỏi màn hình → hiện thanh phát nhỏ
    if ('IntersectionObserver' in window) {
      cardVisible = true;
      const io = new IntersectionObserver(([en]) => {
        if (!document.body.contains(en.target)) { io.disconnect(); return; }
        cardVisible = en.isIntersecting; sync();
      }, { rootMargin: '-54px 0px 0px 0px' });
      io.observe($('muCard'));
      window.addEventListener('hashchange', () => { io.disconnect(); cardVisible = false; sync(); }, { once: true });
    }
    paintTabs(); paintList(); paint();
  };
})();
