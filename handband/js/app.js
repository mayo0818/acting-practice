/* =========================================================
   app.js — HandBand Reels
   캔버스 합성(카메라 미러 + 휠 + 가사 + 손) · 제스처 연주 ·
   악보 편집/저장 · MediaRecorder 촬영
   ========================================================= */
(function () {
  'use strict';

  var Chords = HB.Chords;
  var Synth = HB.Synth;
  var HandTracker = HB.HandTracker;

  var $ = function (s) { return document.querySelector(s); };
  var TAU = Math.PI * 2;
  /* W/H는 화면(프레임) 비율에 맞춰 동적으로 잡힌다 — 세로 720×1280급, 가로 1280×720급 */
  var W = 720, H = 1280;

  /* ── 캔버스 / 비디오 ───────────────────────────────── */
  var view = $('#view');
  var ctx = view.getContext('2d');
  var frame = $('#frame');
  var video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.muted = true;
  video.autoplay = true;
  video.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:.001;pointer-events:none;';
  frame.appendChild(video);

  var synth = new Synth();
  var tracker = new HandTracker();

  /* ── 오디오 잠금 · iOS 안전장치 ──────────────────────
     iOS Safari는 제스처 없이 만든 AudioContext가 잠겨 있거나,
     카메라/마이크 세션 때문에 'interrupted'가 되기도 한다.
     → 제스처 첫 줄에서 동기 unlock + 상태 배지로 복구할 수 있게 한다. */
  var audioBar = $('#audioBar');
  var audioRecheckTimers = [];

  function refreshAudioBar() {
    if (!audioBar) return;
    audioBar.hidden = !(synth.isReady() && !synth.isRunning());
  }

  synth.onStateChange = function () { refreshAudioBar(); };

  function unlockAudio(thenPlay) {
    var wasRunning = synth.isRunning();
    synth.unlock();
    refreshAudioBar();
    audioRecheckTimers.forEach(clearTimeout);
    audioRecheckTimers = [
      setTimeout(refreshAudioBar, 150),
      setTimeout(refreshAudioBar, 600),
      setTimeout(refreshAudioBar, 1500)
    ];
    if (!wasRunning && thenPlay) {
      playChord(state.chordIndex >= 0 ? state.chordIndex : 0, { force: true });
    }
    return synth.isRunning();
  }

  /* ── 상태 ─────────────────────────────────────────── */
  var state = {
    songs: [],
    songId: null,
    partIndex: 0,
    chordIndex: -1,
    hoverIndex: -1,
    prevMidis: null,
    preset: 'warm',
    transpose: 0,
    trackerOn: true,
    camOn: false,
    camTried: false,
    muted: false,
    recording: false,
    countdownOn: true,
    micOn: true,
    showWheel: true,
    showLyric: true,
    showHands: true,
    showDots: true,
    pointerMode: 'aim',
    volume: 0.82,
    reverb: 0.55,
    pointer: null,
    hand: null,
    handSeenAt: 0,
    level: 0,
    toastTimer: 0
  };

  /* ── 저장 ─────────────────────────────────────────── */
  var LS_SONGS = 'hb.songs.v1';
  var LS_PREFS = 'hb.prefs.v1';

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* noop */ }
  }

  function loadStore() {
    var s = readJSON(LS_SONGS, null);
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.user)) s.user = [];
    if (!s.overrides || typeof s.overrides !== 'object') s.overrides = {};
    return s;
  }
  function saveStore(s) { writeJSON(LS_SONGS, s); }

  function buildSongs(keepId) {
    var store = loadStore();
    var base = HB.Songs.builtin().map(function (b) {
      var ov = store.overrides[b.id];
      return ov ? Object.assign({}, b, ov, { builtin: true }) : b;
    });
    var mine = store.user.map(function (u) {
      return Object.assign({ builtin: false }, u);
    });
    state.songs = base.concat(mine);
    var exists = state.songs.some(function (s) { return s.id === (keepId || state.songId); });
    if (!exists) state.songId = state.songs[0] ? state.songs[0].id : null;
    else if (keepId) state.songId = keepId;
  }

  function currentSong() {
    for (var i = 0; i < state.songs.length; i++) if (state.songs[i].id === state.songId) return state.songs[i];
    return state.songs[0] || null;
  }
  function currentPart() {
    var s = currentSong();
    if (!s || !s.parts || !s.parts.length) return null;
    return s.parts[Math.min(state.partIndex, s.parts.length - 1)] || s.parts[0];
  }
  function currentPads() {
    var p = currentPart();
    return p && p.chords ? p.chords : [];
  }

  /* ── 토스트 ───────────────────────────────────────── */
  var toastEl = $('#toast');
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2600);
  }

  /* ── 코드 연주 ────────────────────────────────────── */
  var lastPlayAt = 0;

  function playChord(index, opts) {
    opts = opts || {};
    var pads = currentPads();
    var sym = pads[index];
    if (!sym) return;
    if (!synth.isRunning()) { synth.unlock(); refreshAudioBar(); }
    if (state.muted) { state.chordIndex = index; state.hoverIndex = index; renderChips(); return; }

    var parsed = Chords.parse(sym);
    if (!parsed) return;

    var now = performance.now();
    if (!opts.force && now - lastPlayAt < 90) return;
    lastPlayAt = now;

    var midis = Chords.midisFor(parsed, state.transpose, state.prevMidis);
    state.prevMidis = midis;
    synth.play(midis, 1);
    state.chordIndex = index;
    state.hoverIndex = index;
    renderChips();
  }

  function releaseChord() {
    synth.release();
    state.chordIndex = -1;
    renderChips();
  }

  /* ── UI 렌더 ──────────────────────────────────────── */
  var songTitleEl = $('#songTitle');
  var songMetaEl = $('#songMeta');
  var topTitleEl = $('#topTitle');
  var songListEl = $('#songList');
  var partTabsEl = $('#partTabs');
  var partRowEl = $('#partRow');
  var chordChipsEl = $('#chordChips');
  var chordHintEl = $('#chordHint');
  var lyricBoxEl = $('#lyricBox');
  var trValEl = $('#trVal');

  function renderSong() {
    var s = currentSong();
    if (!s) return;
    songTitleEl.textContent = s.title;
    songMetaEl.textContent = [s.artist, s.key].filter(Boolean).join(' · ');
    topTitleEl.textContent = s.title;
    trValEl.textContent = state.transpose > 0 ? '+' + state.transpose : String(state.transpose);

    var list = '';
    var builtins = state.songs.filter(function (x) { return x.builtin; });
    var mine = state.songs.filter(function (x) { return !x.builtin; });
    list += '<div class="sect">기본 악보</div>';
    builtins.forEach(function (x) {
      list += '<button data-song="' + x.id + '" class="' + (x.id === s.id ? 'on' : '') + '"><b>' + esc(x.title) + '</b><span>' + esc(x.artist || '') + '</span></button>';
    });
    if (mine.length) {
      list += '<div class="sect">내 악보</div>';
      mine.forEach(function (x) {
        list += '<button data-song="' + x.id + '" class="' + (x.id === s.id ? 'on' : '') + '"><b>' + esc(x.title) + '</b><span>' + esc(x.artist || '내가 만든 악보') + '</span></button>';
      });
    }
    songListEl.innerHTML = list;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderParts() {
    var s = currentSong();
    var parts = s && s.parts ? s.parts : [];
    var html = '';
    parts.forEach(function (p, i) {
      var on = i === state.partIndex ? ' on' : '';
      html += '<button data-part="' + i + '" class="' + on.trim() + '">' + esc(p.label || '구간 ' + (i + 1)) + '</button>';
    });
    partTabsEl.innerHTML = html;
    partTabsEl.style.display = parts.length > 1 ? '' : 'none';
    partRowEl.innerHTML = html;
    partRowEl.style.display = parts.length > 1 ? '' : 'none';
  }

  function renderChips() {
    var pads = currentPads();
    var html = '';
    pads.forEach(function (sym, i) {
      var parsed = Chords.parse(sym);
      var cls = 'chip' + (i === state.chordIndex ? ' on' : '') + (!parsed ? ' bad' : '');
      var label = parsed ? Chords.transposeSymbol(parsed, state.transpose) : sym;
      html += '<button class="' + cls + '" data-chord="' + i + '"><i>' + String(i + 1).padStart(2, '0') + '</i>' + esc(label) + '</button>';
    });
    chordChipsEl.innerHTML = html || '<span class="empty">코드가 없어요</span>';
    chordHintEl.textContent = pads.length ? pads.length + '칸' : '';
  }

  function renderLyric() {
    var p = currentPart();
    var text = p && p.lyric ? p.lyric : '';
    if (!text) {
      lyricBoxEl.innerHTML = '<span class="empty">가사를 넣으면 릴스처럼 화면에 떠요.</span>';
      return;
    }
    // 코드 마커는 코드 칩으로 보이므로 가사 상자에서는 글자만 보여 준다
    var plain = text.replace(/\[([^\]]{1,10})\]/g, function (m, s) {
      return Chords.parse(String(s).trim()) ? '' : m;
    });
    lyricBoxEl.innerHTML = '<em>' + esc(p.label || '') + '</em>' + esc(plain);
  }

  function renderAll() {
    renderSong();
    renderParts();
    renderChips();
    renderLyric();
  }

  /* 곡 · 구간 선택 */
  function selectSong(id) {
    state.songId = id;
    state.partIndex = 0;
    state.chordIndex = -1;
    state.prevMidis = null;
    state.transpose = 0;
    var s = currentSong();
    if (s && s.preset && HB.PRESETS[s.preset]) setPreset(s.preset, true);
    renderAll();
    closeSongList();
    savePrefs();
  }

  function selectPart(i) {
    state.partIndex = i;
    state.chordIndex = -1;
    state.prevMidis = null;
    renderParts();
    renderChips();
    renderLyric();
  }

  /* ── 사운드 프리셋 ────────────────────────────────── */
  var presetsEl = $('#presets');
  function renderPresets() {
    var html = synth.available().map(function (p) {
      return '<button data-preset="' + p.id + '" class="' + (state.preset === p.id ? 'on' : '') + '"><b>' + p.label + '</b><span>' + p.desc + '</span></button>';
    }).join('');
    presetsEl.innerHTML = html;
  }
  function setPreset(id, silent) {
    state.preset = id;
    synth.setPreset(id);
    renderPresets();
    if (!silent) {
      var p = HB.PRESETS[id];
      if (state.chordIndex >= 0) playChord(state.chordIndex, { force: true });
    }
  }

  /* ── 패널 열기/닫기 (모바일 시트) ──────────────────── */
  var sideScore = $('#sideScore');
  var sideSound = $('#sideSound');
  var scrim = $('#scrim');
  var isNarrow = function () { return window.matchMedia('(max-width:1120px)').matches; };

  function openPanel(which) {
    if (!isNarrow()) {
      if (which === 'score') $('#songPick').classList.toggle('is-open');
      return;
    }
    sideScore.classList.toggle('is-open', which === 'score');
    sideSound.classList.toggle('is-open', which === 'sound');
    scrim.hidden = false;
    requestAnimationFrame(function () { scrim.classList.add('on'); });
  }
  function closePanels() {
    sideScore.classList.remove('is-open');
    sideSound.classList.remove('is-open');
    scrim.classList.remove('on');
    setTimeout(function () { if (!sideScore.classList.contains('is-open') && !sideSound.classList.contains('is-open')) scrim.hidden = true; }, 260);
  }

  /* ── 카메라 ───────────────────────────────────────── */
  async function startCamera() {
    state.camTried = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.camOn = false;
      toast('이 브라우저에서는 카메라를 쓸 수 없어요. 포인터로 연주해요.');
      return false;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play().catch(function () {});
      state.camOn = true;
      $('#camBtn').classList.remove('off');
      loadTracker();
      return true;
    } catch (e) {
      state.camOn = false;
      $('#camBtn').classList.add('off');
      toast('카메라를 켜지 못했어요. 손 대신 포인터로도 연주돼요.');
      return false;
    }
  }

  async function loadTracker() {
    if (!state.trackerOn) return;
    if (tracker.ready || tracker.loading) return;
    toast('손 인식 모델을 불러오는 중…', 1800);
    var ok = await tracker.load();
    if (ok) toast('손을 비추면 코드가 켜져요', 2200);
    else if (tracker.failed) toast('손 인식은 이 기기에서 안 돼요. 포인터로 연주해요.', 3000);
  }

  /* ── 화면 그리기 ──────────────────────────────────── */
  var grain = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var g = c.getContext('2d');
    var img = g.createImageData(96, 96);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (Math.random() * 2 - 1) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return ctx.createPattern(c, 'repeat');
  })();

  var L = { cx: W / 2, cy: H * 0.545, R: W * 0.335 };

  /* ── 반응형 캔버스 · 레이아웃 ────────────────────────
     프레임이 화면을 꽉 채우므로, 그 비율 그대로 캔버스 해상도를 맞췄다.
     (짧은 변 720px 기준 · 긴 변 최대 1600px → 세로 720×1280급 / 가로 1280×720급)
     좌표는 모두 W·H 비례값으로 계산해 두 방향 모두에서 안 잘긴다. */
  var SHORT_SIDE = 720;
  var LONG_CAP = 1600;
  var hudTopEl = null, hudBottomEl = null;

  var layout = {
    land: false,
    R: W * 0.335,
    cx: W / 2,
    cy: H * 0.545,
    dotsY: H * 0.79,
    lyric: { x: W / 2, maxW: W * 0.85, font: 29, lh: 46, bottom: H * 0.87, center: H * 0.5, centerMode: false }
  };

  function resizeCanvas() {
    var r = frame.getBoundingClientRect();
    var aw = r.width, ah = r.height;
    if (aw < 8 || ah < 8) return;
    var aspect = aw / ah;
    var w, h;
    if (aspect >= 1) { w = Math.min(LONG_CAP, Math.round(SHORT_SIDE * aspect)); h = Math.round(w / aspect); }
    else { h = Math.min(LONG_CAP, Math.round(SHORT_SIDE / aspect)); w = Math.round(h * aspect); }
    w = Math.max(2, w - (w % 2));
    h = Math.max(2, h - (h % 2));
    if (w !== W || h !== H) {
      W = w;
      H = h;
      view.width = W;
      view.height = H;
      canvasStream = null;   // 해상도가 바뀌면 녹화 스트림도 새로 만든다
    }
    computeLayout();
  }

  function computeLayout() {
    var r = frame.getBoundingClientRect();
    if (!r.height || !r.width) return;
    var sy = H / r.height;
    var topInset = 0, botInset = 0;
    try {
      if (hudTopEl) {
        var tb = hudTopEl.getBoundingClientRect();
        if (tb.height) topInset = Math.max(0, (tb.bottom - r.top) * sy);
      }
      if (hudBottomEl) {
        var bb = hudBottomEl.getBoundingClientRect();
        if (bb.height) botInset = Math.max(0, (r.bottom - bb.top) * sy);
      }
    } catch (e) { /* noop */ }

    var land = (W / H) > 1.02;
    var pad = Math.min(W, H) * 0.045;
    var top = topInset + pad * 0.30;
    var bot = H - botInset - pad * 0.40;

    layout.land = land;

    if (land) {
      /* 아이폰 가로 등 낮고 넓은 화면: 왼쪽에 휠, 오른쪽 전용 영역에 가사 */
      var availH = Math.max(H * 0.28, bot - top);
      var R = Math.min(availH * 0.44, H * 0.30, W * 0.19);
      layout.R = R;
      layout.cx = Math.max(R + W * 0.05, W * 0.28);
      layout.cy = top + availH * 0.5;
      layout.dotsY = Math.min(layout.cy + R * 1.14, bot - Math.max(4, H * 0.012));

      var colX = layout.cx + R + W * 0.055;
      var colW = Math.max(W * 0.26, W * 0.965 - colX);
      var lf = Math.max(15, Math.min(colW / 21, H * 0.075));
      layout.lyric = {
        x: colX + colW * 0.5, maxW: colW, font: lf, lh: lf * 1.6,
        bottom: bot, center: layout.cy, centerMode: true
      };
      var reserveLand = guideMetrics(lf).block * 2;
      applyToastSpot(H - (layout.cy - reserveLand / 2), r.height);
    } else {
      /* 세로: 휠 아래 전용 가사 영역, 그 아래 촬영 버튼 */
      var lf = Math.max(15, Math.min(W * 0.042, W * 0.86 / 17));
      var lh = lf * 1.62;
      layout.lyric = {
        x: W / 2, maxW: W * 0.86, font: lf, lh: lh,
        bottom: bot, center: bot - lh, centerMode: false
      };
      var reserve = guideMetrics(lf).block * 2;   // 가사 2줄 + 코드 뱃지 자리
      var lyricTop = bot - reserve;
      applyToastSpot(H - lyricTop, r.height);
      var wheelBottom = lyricTop - pad * 0.6;
      var availH = Math.max(H * 0.24, wheelBottom - top);
      var R = Math.min(W * 0.345, availH * 0.47, W * 0.47);
      layout.R = R;
      layout.cx = W / 2;
      layout.cy = top + availH * 0.5;
      layout.dotsY = Math.min(layout.cy + R * 1.10, wheelBottom - Math.max(4, H * 0.004));
    }

    L.cx = layout.cx;
    L.cy = layout.cy;
    L.R = layout.R;
  }

  function applyToastSpot(canvasFromBottom, frameH) {
    // 토스트가 가사·코드 뱃지를 가리지 않도록 가사 블록 바로 위로 올린다
    if (!toastEl) return;
    var css = canvasFromBottom * (frameH / H);
    toastEl.style.bottom = Math.round(css + 12) + 'px';
  }

  function fitRect() {
    var vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    // 화면을 꽉 채우되(cover), 과한 크롭이면 비율 유지(contain)로 돌아간다
    var sContain = Math.min(W / vw, H / vh);
    var sCover = Math.max(W / vw, H / vh);
    var s = (sCover / sContain <= 1.6) ? sCover : sContain;
    return { s: s, dw: vw * s, dh: vh * s, dx: (W - vw * s) / 2, dy: (H - vh * s) / 2 };
  }

  function drawBackground(t) {
    var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, '#2b2118');
    g.addColorStop(0.55, '#1d1712');
    g.addColorStop(1, '#120e0b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var blobs = [
      { x: 0.30 + Math.sin(t * 0.11) * 0.07, y: 0.26 + Math.cos(t * 0.09) * 0.05, r: 0.62, c: 'rgba(176,124,70,.42)' },
      { x: 0.74 + Math.cos(t * 0.13) * 0.06, y: 0.58 + Math.sin(t * 0.10) * 0.06, r: 0.55, c: 'rgba(122,86,120,.30)' },
      { x: 0.46, y: 0.86 + Math.sin(t * 0.08) * 0.04, r: 0.6, c: 'rgba(198,150,96,.22)' }
    ];
    blobs.forEach(function (b) {
      var rg = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W);
      rg.addColorStop(0, b.c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    });
  }

  function drawVideo() {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    var f = fitRect();

    // 배경: 블러 처리한 확대본
    var sCover = Math.max(W / vw, H / vh);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(-1, 1);
    if ('filter' in ctx) ctx.filter = 'blur(26px) saturate(1.05) brightness(.55)';
    else ctx.globalAlpha = 0.5;
    ctx.drawImage(video, -(vw * sCover) / 2, -(vh * sCover) / 2, vw * sCover, vh * sCover);
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();

    // 본 영상 (비율 유지)
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, W - f.dx - f.dw, f.dy, f.dw, f.dh);
    ctx.restore();
  }

  function drawGrade() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(52,32,14,.20)');
    g.addColorStop(0.42, 'rgba(40,26,14,.03)');
    g.addColorStop(1, 'rgba(18,11,6,.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var vg = ctx.createRadialGradient(W / 2, H * 0.46, W * 0.22, W / 2, H * 0.5, W * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(12,7,3,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWarm() {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(232,178,112,.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawGrain() {
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawWheel(t) {
    if (!state.showWheel) return;
    var pads = currentPads();
    var n = pads.length;
    if (!n) return;

    var cx = L.cx, cy = L.cy, R = L.R;
    var u = Math.max(0.5, R / 241);   // 720 너비 기준 대비 배율
    var rIn = R * 0.44;
    var step = TAU / n;
    var gap = Math.min(0.05, step * 0.07);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < n; i++) {
      var a0 = -Math.PI / 2 + i * step + gap / 2;
      var a1 = -Math.PI / 2 + (i + 1) * step - gap / 2;
      var active = i === state.chordIndex;
      var hover = i === state.hoverIndex;

      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.arc(cx, cy, rIn, a1, a0, true);
      ctx.closePath();

      if (active) {
        var rg = ctx.createRadialGradient(cx, cy, rIn, cx, cy, R);
        rg.addColorStop(0, 'rgba(240,205,152,.10)');
        rg.addColorStop(1, 'rgba(240,205,152,.36)');
        ctx.fillStyle = rg;
      } else if (hover) {
        ctx.fillStyle = 'rgba(255,248,238,.14)';
      } else {
        ctx.fillStyle = 'rgba(255,248,238,.045)';
      }
      ctx.fill();

      ctx.lineWidth = (active ? 1.6 : 1) * u;
      ctx.strokeStyle = active ? 'rgba(255,240,214,.85)' : (hover ? 'rgba(255,248,238,.45)' : 'rgba(255,248,238,.20)');
      ctx.stroke();

      // 코드 이름
      var mid = -Math.PI / 2 + (i + 0.5) * step;
      var lr = rIn + (R - rIn) * 0.54;
      var lx = cx + Math.cos(mid) * lr;
      var ly = cy + Math.sin(mid) * lr;

      var parsed = Chords.parse(pads[i]);
      var label = parsed ? Chords.transposeSymbol(parsed, state.transpose) : pads[i];
      var fs = (n <= 3 ? 44 : (n <= 5 ? 38 : (n <= 6 ? 34 : 30))) * u;
      if (label.length > 6) fs *= 0.82;

      ctx.fillStyle = active ? 'rgba(255,250,240,.98)' : 'rgba(255,248,238,.80)';
      ctx.font = '600 ' + fs + 'px "Pretendard Variable", "Pretendard", system-ui, sans-serif';
      ctx.fillText(label, lx, ly + 2);

      ctx.fillStyle = active ? 'rgba(255,248,238,.72)' : 'rgba(255,248,238,.36)';
      ctx.font = '500 ' + Math.max(8, 11 * u).toFixed(1) + 'px "Pretendard Variable", system-ui, sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), lx, ly - fs * 0.62 - 9 * u);
    }

    // 바깥 링 + 음량 펄스
    var lv = state.level;
    ctx.beginPath();
    ctx.arc(cx, cy, R + (5 + lv * 12) * u, 0, TAU);
    ctx.lineWidth = (1 + lv * 2.2) * Math.max(0.7, u);
    ctx.strokeStyle = 'rgba(240,211,168,' + (0.10 + lv * 0.35).toFixed(3) + ')';
    ctx.stroke();

    // 가운데 원반
    var cd = rIn - 12 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, cd, 0, TAU);
    ctx.fillStyle = 'rgba(26,19,13,.34)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,248,238,.26)';
    ctx.stroke();

    var curPads = currentPads();
    var cur = state.chordIndex >= 0 ? curPads[state.chordIndex] : null;
    var curParsed = cur ? Chords.parse(cur) : null;
    var name = curParsed ? Chords.transposeSymbol(curParsed, state.transpose) : '—';

    ctx.fillStyle = 'rgba(255,248,238,.45)';
    ctx.font = '500 ' + Math.max(7.5, 10 * u).toFixed(1) + 'px "Pretendard Variable", system-ui, sans-serif';
    if (String(name).length < 4) ctx.fillText('C H O R D', cx, cy - 34 * u);

    ctx.fillStyle = curParsed ? 'rgba(255,250,240,.98)' : 'rgba(255,248,238,.35)';
    var nfs = (String(name).length > 6 ? 34 : 44) * u;
    ctx.font = '600 ' + nfs.toFixed(1) + 'px "Pretendard Variable", "Pretendard", system-ui, sans-serif';
    ctx.fillText(name, cx, cy + (String(name).length < 4 ? 4 * u : 0));

    if (curParsed) {
      ctx.fillStyle = 'rgba(255,248,238,.55)';
      ctx.font = '500 ' + Math.max(8.5, 12 * u).toFixed(1) + 'px "Pretendard Variable", system-ui, sans-serif';
      ctx.fillText(Chords.noteNames(curParsed, state.transpose), cx, cy + 30 * u);
    }

    // 손/포인터 가리키는 선
    var pt = pointerPoint();
    if (pt) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = 'rgba(255,248,238,.22)';
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  var HAND_CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
    [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

  function drawHand() {
    var h = state.hand;
    if (!state.showHands || !h || !h.landmarks) return;
    if (performance.now() - state.handSeenAt > 420) return;

    var f = fitRect();
    var pts = h.landmarks.map(function (p) {
      return { x: f.dx + (1 - p.x) * f.dw, y: f.dy + p.y * f.dh };
    });

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,246,228,.62)';
    ctx.beginPath();
    HAND_CONN.forEach(function (c) {
      ctx.moveTo(pts[c[0]].x, pts[c[0]].y);
      ctx.lineTo(pts[c[1]].x, pts[c[1]].y);
    });
    ctx.stroke();

    for (var i = 0; i < pts.length; i++) {
      var r = (i === 4 || i === 8) ? 5.5 : (i === 0 ? 4.5 : 3.2);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, TAU);
      ctx.fillStyle = 'rgba(255,235,200,.95)';
      ctx.fill();
    }

    var palm = pts[9];
    var rg = ctx.createRadialGradient(palm.x, palm.y, 0, palm.x, palm.y, 34);
    rg.addColorStop(0, 'rgba(255,214,150,.30)');
    rg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 34, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function handCanvasPoint() {
    var h = state.hand;
    if (!h) return null;
    var f = fitRect();
    var useTip = state.pointerMode !== 'fingers';
    var hx = (useTip && h.tipX != null) ? h.tipX : h.x;
    var hy = (useTip && h.tipY != null) ? h.tipY : h.y;
    return { x: f.dx + (1 - hx) * f.dw, y: f.dy + hy * f.dh };
  }

  function pointerPoint() {
    if (state.hand && performance.now() - state.handSeenAt < 500) {
      var hp = handCanvasPoint();
      if (hp) return hp;
    }
    if (state.pointer) return state.pointer;
    return null;
  }

  /* 검지 끝 포인터 — 빛나는 커서 */
  function drawPointer(t) {
    if (!state.showHands) return;
    var pt = pointerPoint();
    if (!pt) return;
    var R = L.R;
    var u = Math.max(0.5, R / 241);
    var hot = state.hoverIndex >= 0;
    var active = hot && state.hoverIndex === state.chordIndex;
    var r = Math.max(9, R * (active ? 0.075 : (hot ? 0.062 : 0.05)));
    var pulse = 0.5 + 0.5 * Math.sin(t * 4.4);

    ctx.save();
    var glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 4.2);
    glow.addColorStop(0, 'rgba(255,214,150,' + (active ? 0.5 : (hot ? 0.36 : 0.22)) + ')');
    glow.addColorStop(0.45, 'rgba(255,206,140,' + (active ? 0.18 : 0.10) + ')');
    glow.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 4.2, 0, TAU);
    ctx.fill();

    // 바깥 링
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, TAU);
    ctx.lineWidth = Math.max(1.2, 2.2 * u);
    ctx.strokeStyle = active ? 'rgba(244,215,164,.98)' : 'rgba(255,248,238,.86)';
    ctx.stroke();

    // 조준 중일 때 확산 링
    if (hot) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r + (10 + pulse * 14) * u, 0, TAU);
      ctx.lineWidth = Math.max(1, 1.4 * u);
      ctx.strokeStyle = 'rgba(240,211,168,' + (0.42 - pulse * 0.34).toFixed(2) + ')';
      ctx.stroke();
    }

    // 중심 점
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 0.42, 0, TAU);
    ctx.fillStyle = active ? 'rgba(255,240,214,1)' : 'rgba(255,214,150,.95)';
    ctx.fill();

    // 손가락 개수 모드에서는 숫자 배지
    if (state.pointerMode === 'fingers' && state.hand && state.hand.fingers) {
      var label = String(state.hand.fingers);
      var bf = Math.max(11, R * 0.09);
      ctx.font = '700 ' + bf.toFixed(1) + 'px "Pretendard Variable", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var bw = ctx.measureText(label).width + bf * 1.1;
      var by = pt.y - r - bf * 1.25;
      roundRect(pt.x - bw / 2, by - bf * 0.85, bw, bf * 1.7, bf * 0.85);
      ctx.fillStyle = 'rgba(28,20,14,.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,238,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,238,.96)';
      ctx.fillText(label, pt.x, by);
    }
    ctx.restore();
  }

  function drawProgress(t) {
    if (!state.showDots) return;
    var pads = currentPads();
    if (!pads.length) return;
    var n = pads.length;
    var u = Math.max(0.5, L.R / 241);
    var gap = (n > 6 ? 13 : 17) * u;
    var total = (n - 1) * gap;
    var y = layout.dotsY;
    for (var i = 0; i < n; i++) {
      var x = W / 2 - total / 2 + i * gap;
      var on = i === state.chordIndex;
      ctx.beginPath();
      if (on) {
        roundRect(x - 7 * u, y - 2.5 * u, 14 * u, 5 * u, 2.5 * u);
        ctx.fillStyle = 'rgba(240,211,168,.95)';
        ctx.fill();
      } else {
        ctx.arc(x, y, 2.4 * u, 0, TAU);
        ctx.fillStyle = 'rgba(255,248,238,.35)';
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ── 가사 · 코드 싱크 가이드 ───────────────────────
     가사 줄 위에 그 자리에 monk 코드 뱃지를 올리고,
     지금 칠 코드(또는 다음 코드)와 그 가사 줄을 밝게 표시한다. */
  var LYRIC_FONT = '"Gowun Batang", "Nanum Myeongjo", serif';
  var BADGE_FONT = '"Pretendard Variable", "Pretendard", system-ui, sans-serif';
  var guideCache = { key: '', data: null };

  function guideMetrics(fontPx) {
    var bf = Math.max(10, fontPx * 0.72);
    var bh = bf * 1.7;
    var lh = fontPx * 1.62;
    return { bf: bf, bh: bh, lh: lh, block: bh + lh + fontPx * 0.36 };
  }

  function stripMarkTokens(line) {
    var out = '', marks = [], i = 0;
    while (i < line.length) {
      if (line.charAt(i) === '[') {
        var close = line.indexOf(']', i);
        if (close > i) {
          var sym = line.slice(i + 1, close).trim();
          if (sym && Chords.parse(sym)) {
            marks.push({ ci: out.length, sym: sym });
            i = close + 1;
            continue;
          }
        }
      }
      out += line.charAt(i);
      i++;
    }
    return { text: out.replace(/\s+$/, ''), marks: marks };
  }

  function buildGuide(part) {
    if (!part) return [];
    var ly = layout.lyric;
    var lf = Math.max(10, ly.font);
    var met = guideMetrics(lf);
    var key = [(part.lyric || ''), (part.chords || []).join(','), Math.round(W), Math.round(H), Math.round(lf * 10)].join('|');
    if (guideCache.key === key) return guideCache.data;

    ctx.save();
    ctx.font = '400 ' + lf + 'px ' + LYRIC_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    var rawLines = String(part.lyric || '').replace(/\r/g, '').split('\n')
      .map(stripMarkTokens)
      .filter(function (l) { return l.text.trim() !== ''; });

    // [C] 마크가 없으면 구간 코드를 가사 줄 길이에 비례해 나눠 배치
    var hasInline = rawLines.some(function (l) { return l.marks.length; });
    var chords = (part.chords || []).slice();
    if (!hasInline && chords.length && rawLines.length) {
      var lens = rawLines.map(function (l) { return Math.max(1, l.text.replace(/\s/g, '').length); });
      var totalLen = lens.reduce(function (a, b) { return a + b; }, 0) || 1;
      var cum = 0;
      var bounds = lens.map(function (l) { cum += l / totalLen; return cum; });
      var buckets = rawLines.map(function () { return []; });
      chords.forEach(function (sym, i) {
        var pos = chords.length === 1 ? 0 : (i + 0.5) / chords.length;
        var k = 0;
        while (k < bounds.length - 1 && pos > bounds[k]) k++;
        buckets[k].push(sym);
      });
      rawLines.forEach(function (l, k) {
        var arr = buckets[k];
        var len = Math.max(1, l.text.length);
        l.marks = arr.map(function (sym, j) {
          return { ci: Math.max(0, Math.min(len - 1, Math.round(((j + 0.5) / arr.length) * len))), sym: sym };
        });
      });
    }

    // 자르며 줄 나누기(글자 단위) + 각 글자 앞까지의 넓이 기록
    var maxDisplay = 3;
    var items = [];
    for (var ri = 0; ri < rawLines.length && items.length < maxDisplay; ri++) {
      var text = rawLines[ri].text;
      var i = 0, buf = '', startChar = 0, widths = [0];
      while (i < text.length && items.length < maxDisplay) {
        var ch = text.charAt(i);
        var w = ctx.measureText(buf + ch).width;
        if (buf && w > ly.maxW) {
          items.push({ text: buf, startChar: startChar, charW: widths, rawIndex: ri, marks: [] });
          startChar = i;
          buf = ch;
          widths = [0, ctx.measureText(ch).width];
        } else {
          buf += ch;
          widths.push(w);
        }
        i++;
      }
      if (items.length >= maxDisplay) break;
      items.push({ text: buf, startChar: startChar, charW: widths, rawIndex: ri, marks: [] });
    }

    // 마크를 표시 줄에 붙이고 뱃지 넓이 계산
    ctx.font = '650 ' + met.bf.toFixed(1) + 'px ' + BADGE_FONT;
    var order = 0;
    rawLines.forEach(function (rl, ri) {
      var lineItems = items.filter(function (it) { return it.rawIndex === ri; });
      if (!lineItems.length) { order += rl.marks.length; return; }
      rl.marks.forEach(function (m) {
        var target = lineItems[lineItems.length - 1];
        for (var q = 0; q < lineItems.length; q++) {
          var it = lineItems[q];
          if (m.ci >= it.startChar && m.ci < it.startChar + it.text.length) { target = it; break; }
        }
        var idx = Math.max(0, Math.min(target.charW.length - 1, m.ci - target.startChar));
        target.marks.push({
          xOff: target.charW[idx] || 0,
          sym: m.sym,
          index: order,
          w: ctx.measureText(m.sym).width + met.bf * 1.05
        });
        order++;
      });
    });

    // 뱃지 x좌표(가운데 정렬 기준 줄 왼쪽) · 겹치지 않게 밀기
    ctx.font = '400 ' + lf + 'px ' + LYRIC_FONT;
    items.forEach(function (it) {
      it.width = it.charW[it.charW.length - 1] || ctx.measureText(it.text).width;
      it.left = ly.x - it.width / 2;
      var minLeft = ly.x - ly.maxW / 2;
      var maxRight = ly.x + ly.maxW / 2;
      var prevRight = -1e9;
      it.marks.forEach(function (m) {
        var cx = it.left + m.xOff + m.w / 2;
        var left = Math.max(minLeft, Math.min(cx - m.w / 2, maxRight - m.w));
        if (left < prevRight + met.bf * 0.22) left = prevRight + met.bf * 0.22;
        if (left + m.w > maxRight) left = Math.max(minLeft, maxRight - m.w);
        m.left = left;
        prevRight = left + m.w;
        m.cy = 0;
      });
    });

    ctx.restore();

    var data = { items: items, met: met, lf: lf };
    guideCache = { key: key, data: data };
    return data;
  }

  function drawLyric() {
    if (!state.showLyric) return;
    var p = currentPart();
    if (!p) return;
    var ly = layout.lyric;
    var data = buildGuide(p);
    if (!data.items || !data.items.length) return;

    var met = data.met;
    var totalH = data.items.length * met.block;
    var top = ly.centerMode ? (ly.center - totalH / 2) : (ly.bottom - totalH);

    var pads = currentPads();
    var n = pads.length;
    var curIdx = state.chordIndex;
    var nextIdx = n ? (curIdx >= 0 ? (curIdx + 1) % n : 0) : -1;

    // 지금 코드가 들어 있는 가사 줄을 밝게
    var activeLine = -1;
    data.items.forEach(function (it, i) {
      it.marks.forEach(function (m) { if (m.index === curIdx) activeLine = i; });
    });
    if (activeLine < 0) {
      var firstMarkLine = -1;
      data.items.forEach(function (it, i) {
        if (firstMarkLine < 0 && it.marks.length) firstMarkLine = i;
      });
      activeLine = firstMarkLine;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      var lineTop = top + i * met.block;
      var baseline = lineTop + met.bh + data.lf * 1.02;
      var isActiveLine = i === activeLine;

      // 코드 뱃지
      for (var k = 0; k < it.marks.length; k++) {
        var m = it.marks[k];
        var bh = met.bh * 0.82;
        var by = lineTop + met.bh * 0.5 - bh / 2;
        var isOn = m.index === curIdx;
        var isNext = !isOn && m.index === nextIdx;
        roundRect(m.left, by, m.w, bh, bh / 2);
        if (isOn) {
          var bg = ctx.createLinearGradient(m.left, by, m.left, by + bh);
          bg.addColorStop(0, '#f6dcae');
          bg.addColorStop(1, '#e0bd8a');
          ctx.fillStyle = bg;
          ctx.shadowColor = 'rgba(240,200,140,.75)';
          ctx.shadowBlur = met.bf * 0.9;
        } else if (isNext) {
          ctx.fillStyle = 'rgba(240,211,168,.26)';
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = 'rgba(28,20,14,.34)';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(1, met.bf * 0.055);
        ctx.strokeStyle = isOn ? 'rgba(255,248,238,.85)' : (isNext ? 'rgba(240,211,168,.8)' : 'rgba(255,248,238,.28)');
        ctx.stroke();

        ctx.font = '650 ' + met.bf.toFixed(1) + 'px ' + BADGE_FONT;
        ctx.fillStyle = isOn ? '#2b2114' : (isNext ? 'rgba(250,232,204,.98)' : 'rgba(255,248,238,.82)');
        ctx.textBaseline = 'middle';
        ctx.fillText(m.sym, m.left + m.w / 2, by + bh / 2 + met.bf * 0.02);
        ctx.textBaseline = 'alphabetic';
      }

      // 가사
      ctx.font = '400 ' + data.lf.toFixed(1) + 'px ' + LYRIC_FONT;
      ctx.fillStyle = isActiveLine ? 'rgba(255,252,246,.98)' : 'rgba(255,248,238,.60)';
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = isActiveLine ? Math.max(12, data.lf * 0.7) : Math.max(8, data.lf * 0.4);
      ctx.shadowOffsetY = 2;
      ctx.fillText(it.text, ly.x, baseline);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.restore();
  }

  /* ── 프레임 루프 ──────────────────────────────────── */
  var hoverPending = -1, hoverSince = 0, lastSwitchAt = 0;

  function frameLoop(ts) {
    requestAnimationFrame(frameLoop);
    var now = performance.now();
    var t = now / 1000;

    // 손 인식
    if (state.camOn && state.trackerOn && tracker.ready) {
      var h = tracker.detect(video, ts);
      if (h) {
        state.hand = h;
        state.handSeenAt = now;
        handleHand(h, now);
      }
    }

    state.level = synth.readLevel();

    // 그리기
    ctx.clearRect(0, 0, W, H);
    if (state.camOn && video.readyState >= 2 && video.videoWidth) {
      drawVideo();
      drawWarm();
    } else {
      drawBackground(t);
    }
    drawGrade();
    drawHand();
    drawWheel(t);
    drawPointer(t);
    drawProgress(t);
    drawLyric();
    drawGrain();

    if (state.recording) updateRecLabel(now);
  }

  function handleHand(h, now) {
    var f = fitRect();

    var pads = currentPads();
    var n = pads.length;
    if (!n) return;

    /* ① 손가락 개수 모드 — 1~5개 편 손가락 수로 바로 코드 선택 */
    if (state.pointerMode === 'fingers') {
      var cnt = Math.max(1, Math.min(n, h.fingers || 1));
      var fidx = cnt - 1;
      state.hoverIndex = fidx;
      hoverPending = fidx;
      if (fidx !== state.chordIndex && now - lastSwitchAt > 80) {
        lastSwitchAt = now;
        playChord(fidx, { force: true });
      }
      var swellF = Math.max(0, Math.min(1, ((h.pinch || 0) - 0.30) / 0.85));
      synth.setExpression(0.22 + 0.78 * swellF, 0.7);
      return;
    }

    /* ② 포인터 조준 모드 — 검지 끝이 부채꼴 안에 닿았을 때만 선택 */
    var pt = handCanvasPoint();
    if (!pt) return;
    var x = pt.x, y = pt.y;

    var dx = x - L.cx, dy = y - L.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var rIn = L.R * 0.44;

    if (dist < rIn * 0.98) {
      // 가운데 CHORD 원 안 → 중립(지금 코드 유지)
      state.hoverIndex = -1;
      hoverPending = -1;
    } else if (dist > L.R * 1.06) {
      // 휠 밖 → 선택 없음
      state.hoverIndex = -1;
      hoverPending = -1;
    } else {
      var ang = Math.atan2(dx, -dy);
      if (ang < 0) ang += TAU;
      var idx = Math.floor(ang / (TAU / n)) % n;
      state.hoverIndex = idx;
      if (idx !== hoverPending) { hoverPending = idx; hoverSince = now; }
      else if (now - hoverSince > 110 && idx !== state.chordIndex) {
        playChord(idx, { force: true });
      }
    }

    // 엄지–검지 벌림 → 음량, 중심에서 거리 → 밝기
    var swell = Math.max(0, Math.min(1, ((h.pinch || 0) - 0.30) / 0.85));
    var bright = Math.max(0, Math.min(1, (dist - rIn * 0.8) / (L.R * 0.95)));
    synth.setExpression(0.18 + 0.82 * swell, 0.32 + 0.68 * bright);
  }

  /* ── 포인터 ───────────────────────────────────────── */
  var dragging = false;

  function toCanvas(e) {
    var r = view.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function sectorAt(p) {
    var pads = currentPads();
    var n = pads.length;
    if (!n) return -1;
    var dx = p.x - L.cx, dy = p.y - L.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < L.R * 0.16 || dist > L.R * 1.12) return -1;
    var ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += TAU;
    return Math.floor(ang / (TAU / n)) % n;
  }

  view.addEventListener('pointerdown', function (e) {
    if (!synth.isReady()) synth.start();
    var p = toCanvas(e);
    dragging = true;
    var idx = sectorAt(p);
    if (idx >= 0) {
      state.pointer = p;
      playChord(idx, { force: true });
      view.setPointerCapture && view.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  }, { passive: false });

  view.addEventListener('pointermove', function (e) {
    var p = toCanvas(e);
    var idx = sectorAt(p);
    state.pointer = idx >= 0 || dragging ? p : null;
    state.hoverIndex = idx;
    if (dragging && idx >= 0 && idx !== state.chordIndex) playChord(idx, { force: true });
  });

  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointercancel', function () { dragging = false; });

  view.addEventListener('pointerleave', function () {
    if (!dragging) { state.pointer = null; state.hoverIndex = -1; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= '9') {
      var i = parseInt(e.key, 10) - 1;
      if (i < currentPads().length) playChord(i, { force: true });
    } else if (e.key === ' ') {
      e.preventDefault();
      releaseChord();
    }
  });

  /* ── 촬영 ─────────────────────────────────────────── */
  var canvasStream = null;
  var recorder = null;
  var recChunks = [];
  var recStartAt = 0;
  var micNodes = null;
  var takes = [];
  var lastTake = null;

  var MIMES = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  function pickMime() {
    if (!window.MediaRecorder) return null;
    for (var i = 0; i < MIMES.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(MIMES[i])) return MIMES[i];
      } catch (e) { /* noop */ }
    }
    return '';
  }

  async function startRecording() {
    if (state.recording) return;
    if (!window.MediaRecorder) { toast('이 브라우저는 영상 녹화를 지원하지 않아요.'); return; }
    if (!view.captureStream) { toast('이 브라우저는 캔버스 녹화를 지원하지 않아요.'); return; }

    unlockAudio(false);
    synth.setAudioSession(!!state.micOn);
    if (!canvasStream) canvasStream = view.captureStream(30);
    var mime = pickMime();
    if (mime === null) { toast('이 브라우저는 영상 녹화를 지원하지 않아요.'); return; }

    try {
      if (!canvasStream) canvasStream = view.captureStream(30);

      var tracks = [];
      var vt = canvasStream.getVideoTracks()[0];
      if (!vt) throw new Error('no-video-track');
      tracks.push(vt);

      var st = synth.streamTrack();
      if (st) tracks.push(st);

      if (state.micOn) {
        try {
          var mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
          });
          var src = synth.ctx.createMediaStreamSource(mic);
          var dest = synth.ctx.createMediaStreamDestination();
          var g = synth.ctx.createGain();
          g.gain.value = 0.95;
          src.connect(g);
          g.connect(dest);
          micNodes = { src: src, g: g, dest: dest, stream: mic };
          var mt = dest.stream.getAudioTracks()[0];
          if (mt) tracks.push(mt);
        } catch (err) {
          toast('마이크 없이 신스 소리만 담을게요.', 3000);
        }
      }

      var mixed = new MediaStream(tracks);
      var opts = mime ? { mimeType: mime } : undefined;
      recorder = new MediaRecorder(mixed, opts);
      recChunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = finishRecording;
      recorder.start(1000);

      state.recording = true;
      recStartAt = performance.now();
      $('#recBtn').classList.add('is-rec');
      $('#recLabel').textContent = '00:00';
      toast('녹화 중 · 다시 누르면 멈춰요', 2400);
    } catch (e) {
      cleanupMic();
      toast('녹화를 시작하지 못했어요: ' + (e && e.message ? e.message : '알 수 없는 오류'), 3600);
    }
  }

  function stopRecording() {
    if (!state.recording || !recorder) return;
    try { recorder.stop(); } catch (e) { /* noop */ }
    state.recording = false;
    $('#recBtn').classList.remove('is-rec');
    $('#recLabel').textContent = '촬영';
  }

  function cleanupMic() {
    if (!micNodes) return;
    try {
      micNodes.src.disconnect();
      micNodes.g.disconnect();
      micNodes.stream.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { /* noop */ }
    micNodes = null;
    synth.setAudioSession(false);
  }

  function updateRecLabel(now) {
    var s = Math.floor((now - recStartAt) / 1000);
    var mm = String(Math.floor(s / 60)).padStart(2, '0');
    var ss = String(s % 60).padStart(2, '0');
    $('#recLabel').textContent = mm + ':' + ss;
  }

  function finishRecording() {
    var type = (recorder && recorder.mimeType) || 'video/webm';
    var blob = new Blob(recChunks, { type: type });
    recChunks = [];
    cleanupMic();
    if (!blob.size) { toast('녹화된 내용이 없어요.'); return; }

    // 썸네일
    var thumb = '';
    try { thumb = view.toDataURL('image/jpeg', 0.55); } catch (e) { /* noop */ }

    var ext = /mp4/.test(type) ? 'mp4' : 'webm';
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    var name = 'handband-' + stamp + '.' + ext;

    var take = { url: URL.createObjectURL(blob), blob: blob, type: type, name: name, thumb: thumb, at: d, size: blob.size };
    takes.unshift(take);
    if (takes.length > 6) takes.pop();
    lastTake = take;
    renderTakes();
    openTake(take);
    toast('저장 준비 완료 · ' + (blob.size / 1048576).toFixed(1) + 'MB', 3000);
  }

  function renderTakes() {
    var el = $('#takes');
    if (!takes.length) { el.innerHTML = '<p class="empty">아직 없어요</p>'; return; }
    el.innerHTML = takes.map(function (t, i) {
      var time = t.at.toTimeString().slice(0, 5);
      return '<div class="take">' +
        '<img src="' + t.thumb + '" alt="">' +
        '<div><b>' + t.name.replace('handband-', '') + '</b><span>' + time + ' · ' + (t.size / 1048576).toFixed(1) + 'MB</span></div>' +
        '<a href="' + t.url + '" download="' + t.name + '" title="저장"><svg><use href="#i-download"/></svg></a>' +
        '</div>';
    }).join('');
  }

  function openTake(take) {
    var modal = $('#takeModal');
    var v = $('#takeVideo');
    v.src = take.url;
    v.muted = false;
    v.loop = false;
    $('#saveTake').href = take.url;
    $('#saveTake').download = take.name;
    $('#takeMeta').textContent = (take.size / 1048576).toFixed(1) + 'MB · .' + take.name.split('.').pop();

    var shareBtn = $('#shareTake');
    if (navigator.canShare && navigator.share) {
      var f = new File([take.blob], take.name, { type: take.type });
      shareBtn.hidden = !navigator.canShare({ files: [f] });
      shareBtn.onclick = function () {
        navigator.share({ files: [f], title: 'HandBand' }).catch(function () {});
      };
    } else {
      shareBtn.hidden = true;
    }
    modal.hidden = false;
    v.play().catch(function () { /* noop */ });
  }

  /* ── 악보 편집 ────────────────────────────────────── */
  var editorState = null;

  function openEditor(song) {
    var src = song || currentSong();
    var isNew = !song;
    editorState = { id: isNew ? null : src.id, builtin: !isNew && !!src.builtin, data: null };

    $('#editorTitle').textContent = isNew ? '새 악보' : '악보 편집';
    $('#fTitle').value = isNew ? '' : (src.title || '');
    $('#fArtist').value = isNew ? '' : (src.artist || '');
    $('#fKey').value = isNew ? '' : (src.key || '');
    $('#editorErr').textContent = '';

    var parts = isNew
      ? [{ label: '1절', chords: [], lyric: '' }]
      : JSON.parse(JSON.stringify(src.parts || []));

    $('#partsEditor').innerHTML = '';
    parts.forEach(function (p, i) { addPartRow(p, i === 0); });

    var del = $('#deleteSong');
    del.style.display = (!isNew && !src.builtin) ? '' : 'none';
    var reset = $('#resetSong');
    reset.style.display = (!isNew && src.builtin) ? '' : 'none';

    $('#editorModal').hidden = false;
    setTimeout(function () { $('#fTitle').focus(); }, 120);
    updatePreview();
  }

  function addPartRow(p, focus) {
    var host = $('#partsEditor');
    var row = document.createElement('div');
    row.className = 'part';
    row.innerHTML =
      '<div class="part__head">' +
      '<input class="p-label" type="text" maxlength="14" placeholder="구간 이름">' +
      '<button class="part__del" title="구간 삭제"><svg><use href="#i-trash"/></svg></button>' +
      '</div>' +
      '<input class="p-chords" type="text" placeholder="예) Ebmaj7, Gm7, Abmaj7, Bb7">' +
      '<div class="countmsg"></div>' +
      '<textarea class="p-lyric" placeholder="가사 · 코드 자리에 [Bb]나는 읽기 [Dm]쉬운 마음이야 처럼 넣으면 그 자리에 코드가 떠요"></textarea>';
    row.querySelector('.p-label').value = p.label || '';
    row.querySelector('.p-chords').value = (p.chords || []).join(', ');
    row.querySelector('.p-lyric').value = p.lyric || '';
    row.querySelector('.p-chords').addEventListener('input', function () {
      updateRowMsg(row);
      updatePreview(row);
    });
    row.querySelector('.p-label').addEventListener('input', function () {
      if (row === $('#partsEditor').firstElementChild) updatePreview(row);
    });
    row.querySelector('.part__del').addEventListener('click', function () {
      if ($('#partsEditor').children.length <= 1) { toast('구간은 최소 하나 필요해요'); return; }
      row.remove();
      updatePreview();
    });
    host.appendChild(row);
    updateRowMsg(row);
    if (focus) row.querySelector('.p-chords').focus();
    return row;
  }

  function updateRowMsg(row) {
    var val = row.querySelector('.p-chords').value;
    var list = Chords.splitChords(val);
    var msg = row.querySelector('.countmsg');
    var bad = list.filter(function (c) { return !Chords.parse(c); });
    if (!list.length) { msg.textContent = '코드를 넣으면 원형 패드가 만들어져요'; msg.className = 'countmsg'; return; }
    if (list.length > 8) {
      msg.textContent = list.length + '칸 → 화면에는 8칸까지 보여요';
      msg.className = 'countmsg bad';
      return;
    }
    msg.textContent = list.length + '칸' + (bad.length ? ' · 못 읽은 코드: ' + bad.join(' ') : ' · 확인됨');
    msg.className = 'countmsg' + (bad.length ? ' bad' : '');
  }

  function updatePreview(row) {
    var target = row || $('#partsEditor').querySelector('.part');
    var chips = $('#previewChips');
    var msgEl = $('#previewMsg');
    if (!target) { chips.innerHTML = ''; msgEl.textContent = ''; return; }

    var list = Chords.splitChords(target.querySelector('.p-chords').value);
    var html = '';
    list.slice(0, 8).forEach(function (sym, i) {
      var parsed = Chords.parse(sym);
      html += '<button class="chip' + (parsed ? '' : ' bad') + '"><i>' + String(i + 1).padStart(2, '0') + '</i>' +
        esc(parsed ? Chords.transposeSymbol(parsed, 0) : sym) + '</button>';
    });
    chips.innerHTML = html || '<span class="empty">코드가 아직 없어요</span>';

    var bad = list.filter(function (c) { return !Chords.parse(c); });
    msgEl.className = 'preview__msg' + (bad.length ? ' bad' : '');
    msgEl.textContent = list.length
      ? (bad.length ? '읽을 수 없는 코드: ' + bad.join(', ') : list.length + '칸 원형 패드로 만들어져요.')
      : '코드를 쉼표나 띄어쓰기로 구분해 넣어 주세요.';
  }

  function collectEditor() {
    var rows = Array.prototype.slice.call($('#partsEditor').children);
    var parts = rows.map(function (row) {
      var typed = Chords.splitChords(row.querySelector('.p-chords').value);
      var lyric = row.querySelector('.p-lyric').value.trim();
      // 가사에 [Bb] 처럼 넣은 코드를 우선 사용 (그 자리에 표시되므로)
      var marks = [];
      lyric.replace(/\[([^\]]{1,10})\]/g, function (m, s) {
        var t = s.trim();
        if (t && Chords.parse(t)) marks.push(t);
        return m;
      });
      return {
        label: row.querySelector('.p-label').value.trim() || '구간',
        chords: marks.length ? marks.slice(0, 8) : typed,
        lyric: lyric
      };
    }).filter(function (p) { return p.chords.length; });

    var title = $('#fTitle').value.trim();
    if (!title) return { error: '곡 제목을 넣어 주세요.' };
    if (!parts.length) return { error: '코드가 있는 구간이 하나는 있어야 해요.' };
    var badAll = [];
    parts.forEach(function (p) {
      p.chords.slice(0, 8).forEach(function (c) { if (!Chords.parse(c)) badAll.push(c); });
    });
    if (badAll.length) return { error: '읽을 수 없는 코드: ' + badAll.join(', ') };
    parts.forEach(function (p) { p.chords = p.chords.slice(0, 8); });

    return {
      song: {
        id: editorState.id,
        title: title,
        artist: $('#fArtist').value.trim(),
        key: $('#fKey').value.trim(),
        preset: (currentSong() && currentSong().preset) || state.preset,
        parts: parts
      }
    };
  }

  function saveSong() {
    var res = collectEditor();
    if (res.error) { $('#editorErr').textContent = res.error; return; }

    var store = loadStore();
    var data = res.song;

    if (editorState.builtin) {
      store.overrides[editorState.id] = { title: data.title, artist: data.artist, key: data.key, parts: data.parts };
    } else if (editorState.id) {
      var idx = store.user.findIndex(function (u) { return u.id === editorState.id; });
      if (idx >= 0) store.user[idx] = Object.assign({}, store.user[idx], data);
      else store.user.push(data);
    } else {
      data.id = 'u' + Date.now();
      store.user.push(data);
    }

    saveStore(store);
    buildSongs(data.id);
    state.partIndex = 0;
    state.chordIndex = -1;
    state.prevMidis = null;
    renderAll();
    savePrefs();
    $('#editorModal').hidden = true;
    toast('악보를 저장했어요');
  }

  function deleteSong() {
    if (!editorState || !editorState.id || editorState.builtin) return;
    var store = loadStore();
    store.user = store.user.filter(function (u) { return u.id !== editorState.id; });
    saveStore(store);
    buildSongs();
    state.partIndex = 0;
    renderAll();
    savePrefs();
    $('#editorModal').hidden = true;
    toast('악보를 지웠어요');
  }

  function resetSong() {
    if (!editorState || !editorState.id || !editorState.builtin) return;
    var store = loadStore();
    delete store.overrides[editorState.id];
    saveStore(store);
    buildSongs(editorState.id);
    state.partIndex = 0;
    state.chordIndex = -1;
    renderAll();
    $('#editorModal').hidden = true;
    toast('기본 악보로 되돌렸어요');
  }

  /* ── 이벤트 연결 ──────────────────────────────────── */
  function bind() {
    $('#songBtn').addEventListener('click', function () {
      $('#songPick').classList.toggle('is-open');
    });
    songListEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-song]');
      if (b) selectSong(b.getAttribute('data-song'));
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#songPick')) closeSongList();
    });

    partTabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-part]');
      if (b) selectPart(parseInt(b.getAttribute('data-part'), 10));
    });
    partRowEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-part]');
      if (b) selectPart(parseInt(b.getAttribute('data-part'), 10));
    });
    chordChipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chord]');
      if (b) playChord(parseInt(b.getAttribute('data-chord'), 10), { force: true });
    });

    document.querySelectorAll('[data-tr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = parseInt(b.getAttribute('data-tr'), 10);
        state.transpose = Math.max(-6, Math.min(6, state.transpose + d));
        renderSong();
        renderChips();
        if (state.chordIndex >= 0) playChord(state.chordIndex, { force: true });
      });
    });

    presetsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-preset]');
      if (b) setPreset(b.getAttribute('data-preset'));
    });

    $('#editSong').addEventListener('click', function () { openEditor(currentSong()); });
    $('#newSong').addEventListener('click', function () { openEditor(null); });
    $('#addPart').addEventListener('click', function () { addPartRow({ label: '', chords: [], lyric: '' }, true); });
    $('#saveSong').addEventListener('click', saveSong);
    $('#deleteSong').addEventListener('click', deleteSong);
    $('#resetSong').addEventListener('click', resetSong);

    document.querySelectorAll('[data-mclose]').forEach(function (b) {
      b.addEventListener('click', function () {
        var modal = b.closest('.modal');
        if (modal && modal.id === 'takeModal') { var v = $('#takeVideo'); v.pause(); }
        if (modal) modal.hidden = true;
      });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target === m) {
          if (m.id === 'takeModal') $('#takeVideo').pause();
          m.hidden = true;
        }
      });
    });

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', closePanels);
    });
    scrim.addEventListener('click', closePanels);
    $('#openScore').addEventListener('click', function () { openPanel('score'); });
    $('#openSound').addEventListener('click', function () { openPanel('sound'); });

    $('#trackBtn').addEventListener('click', function () {
      state.trackerOn = !state.trackerOn;
      $('#trackBtn').setAttribute('aria-pressed', String(state.trackerOn));
      if (state.trackerOn) {
        if (!state.camOn && !state.camTried) startCamera();
        else loadTracker();
        toast('손 추적 켬');
      } else {
        toast('손 추적 끔 · 포인터로 연주하세요');
        state.hand = null;
      }
      savePrefs();
    });

    $('#camBtn').addEventListener('click', function () {
      if (state.camOn) {
        state.camOn = false;
        if (video.srcObject) video.srcObject.getTracks().forEach(function (t) { t.stop(); });
        video.srcObject = null;
        $('#camBtn').classList.add('off');
        toast('카메라를 껐어요 · 포인터 모드');
      } else {
        startCamera().then(function (ok) {
          if (ok) {
            synth.setAudioSession(false);
            synth.resume();
            refreshAudioBar();
            toast('카메라를 켰어요');
          }
        });
      }
    });

    $('#muteBtn').addEventListener('click', function () {
      state.muted = !state.muted;
      $('#muteBtn').classList.toggle('off', state.muted);
      $('#muteBtn').textContent = state.muted ? '소리 켜기' : '코드 끄기';
      if (state.muted) { synth.release(); state.chordIndex = -1; renderChips(); }
      else unlockAudio(false);
    });

    $('#recBtn').addEventListener('click', function () {
      if (state.recording) { stopRecording(); return; }
      unlockAudio(false);
      if (state.countdownOn) runCountdown(startRecording);
      else startRecording();
    });

    $('#revRange').addEventListener('input', function (e) {
      var v = parseInt(e.target.value, 10) / 100;
      state.reverb = v;
      $('#revVal').textContent = e.target.value;
      synth.setReverb(v);
      savePrefs();
    });
    $('#volRange').addEventListener('input', function (e) {
      var v = parseInt(e.target.value, 10) / 100;
      state.volume = v;
      $('#volVal').textContent = String(Math.round(v * 100));
      synth.setVolume(v);
      savePrefs();
    });

    function bindToggle(id, key, fn) {
      var el = $(id);
      el.checked = state[key];
      el.addEventListener('change', function () {
        state[key] = el.checked;
        if (fn) fn(el.checked);
        savePrefs();
      });
    }
    bindToggle('#tWheel', 'showWheel');
    bindToggle('#tLyric', 'showLyric');
    bindToggle('#tHands', 'showHands');
    bindToggle('#tDots', 'showDots');
    bindToggle('#tCount', 'countdownOn');
    bindToggle('#tMic', 'micOn');

    $('#startBtn').addEventListener('click', function () { unlockAudio(false); boot(true); });
    $('#skipCam').addEventListener('click', function () { unlockAudio(false); boot(false); });

    /* 손 포인터 모드 */
    var pmodeBtns = document.querySelectorAll('#pointerModes .modebtn');
    function paintPmode() {
      Array.prototype.forEach.call(pmodeBtns, function (b) {
        b.classList.toggle('on', b.getAttribute('data-pmode') === state.pointerMode);
      });
      var note = $('#pmodeNote');
      if (note) {
        note.textContent = state.pointerMode === 'fingers'
          ? '편 손가락 수(1~5개)로 코드를 골라요. 1개가 첫 번째 코드.'
          : '검지 끝으로 부채꼴을 짚으면 그 코드가 켜져요. 가운데 원은 중립(지금 코드 유지).';
      }
    }
    Array.prototype.forEach.call(pmodeBtns, function (b) {
      b.addEventListener('click', function () {
        state.pointerMode = b.getAttribute('data-pmode') === 'fingers' ? 'fingers' : 'aim';
        hoverPending = -1;
        paintPmode();
        savePrefs();
        toast(state.pointerMode === 'fingers' ? '손가락 개수 모드 · 1~5개로 코드 선택' : '검지 끝 조준 모드 · 부채꼴을 짚어요', 2200);
      });
    });
    paintPmode();

    /* 오디오 배지 */
    var unlockBtn = $('#audioUnlock');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', function () {
        if (unlockAudio(true)) toast('소리를 켰어요', 1800);
        else toast('아이폰 무음 모드를 해제했는지 확인해 주세요', 3200);
      });
    }

    /* 어느 제스처든 오디오가 잠겨 있으면 풀어 준다 (iOS) */
    var gestureUnlock = function () {
      if (synth.isReady() && !synth.isRunning()) {
        synth.unlock();
        refreshAudioBar();
      }
    };
    document.addEventListener('pointerdown', gestureUnlock, true);
    document.addEventListener('touchstart', gestureUnlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (synth.isReady() && !synth.isRunning()) {
        synth.resume();
        setTimeout(refreshAudioBar, 250);
      }
    });
  }

  function closeSongList() { $('#songPick').classList.remove('is-open'); }

  function runCountdown(done) {
    var el = $('#countdown');
    var span = el.querySelector('span');
    var n = 3;
    el.classList.add('on');
    span.textContent = String(n);
    var timer = setInterval(function () {
      n -= 1;
      if (n <= 0) {
        clearInterval(timer);
        el.classList.remove('on');
        done();
        return;
      }
      span.textContent = String(n);
      span.style.animation = 'none';
      void span.offsetWidth;
      span.style.animation = '';
    }, 800);
  }

  /* ── 환경 설정 저장/복원 ──────────────────────────── */
  function savePrefs() {
    writeJSON(LS_PREFS, {
      preset: state.preset,
      volume: state.volume,
      reverb: state.reverb,
      showWheel: state.showWheel,
      showLyric: state.showLyric,
      showHands: state.showHands,
      showDots: state.showDots,
      pointerMode: state.pointerMode,
      countdownOn: state.countdownOn,
      micOn: state.micOn,
      trackerOn: state.trackerOn,
      songId: state.songId
    });
  }

  function loadPrefs() {
    var p = readJSON(LS_PREFS, {});
    ['preset', 'volume', 'reverb', 'showWheel', 'showLyric', 'showHands', 'showDots', 'countdownOn', 'micOn', 'trackerOn', 'pointerMode'].forEach(function (k) {
      if (p[k] !== undefined) state[k] = p[k];
    });
    if (p.songId) state.songId = p.songId;
  }

  /* ── 부팅 ─────────────────────────────────────────── */
  async function boot(withCamera) {
    $('#intro').classList.add('hide');
    // 제스처 안에서 이미 열렸을 수도 있으니 한 번 더 확인
    synth.unlock();
    synth.setPreset(state.preset);
    synth.setVolume(state.volume);
    synth.setReverb(state.reverb);
    if (!synth.isRunning()) toast('소리 잠금이 풀리지 않았어요 · 화면의 🔊 버튼을 눌러 주세요', 4000);
    refreshAudioBar();

    if (withCamera) {
      var ok = await startCamera();
      if (ok) {
        // 카메라 세션이 오디오를 interrupt시키는 경우가 있어 한 번 더 살린다
        synth.setAudioSession(false);
        synth.resume();
        loadTracker();
      }
    } else {
      state.camTried = true;
      toast('휠을 눌러 연주해요', 2600);    }
    setTimeout(refreshAudioBar, 400);
  }

  function init() {
    hudTopEl = document.querySelector('.hud__top');
    hudBottomEl = document.querySelector('.hud__bottom');
    loadPrefs();
    buildSongs();
    renderPresets();
    renderAll();

    $('#revRange').value = Math.round(state.reverb * 100);
    $('#revVal').textContent = String(Math.round(state.reverb * 100));
    $('#volRange').value = Math.round(state.volume * 100);
    $('#volVal').textContent = String(Math.round(state.volume * 100));
    $('#trackBtn').setAttribute('aria-pressed', String(state.trackerOn));

    bind();
    resizeCanvas();
    requestAnimationFrame(frameLoop);

    /* 화면 크기 · 방향이 바뀌면 캔버스 해상도와 배치를 다시 잡는다 */
    var relayoutQueued = false;
    function relayout() {
      if (relayoutQueued) return;
      relayoutQueued = true;
      requestAnimationFrame(function () {
        relayoutQueued = false;
        resizeCanvas();
      });
    }
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 260); setTimeout(resizeCanvas, 520); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    if (window.ResizeObserver) {
      try { new ResizeObserver(relayout).observe(frame); } catch (e) { /* noop */ }
    }

    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 29px "Gowun Batang"').catch(function () {});
      document.fonts.load('600 30px "Pretendard Variable"').catch(function () {});
      if (document.fonts.ready) document.fonts.ready.then(function () { guideCache.key = ''; relayout(); }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 디버그용 */
  window.__hb = {
    state: state, synth: synth, playChord: playChord, selectSong: selectSong, handleHand: handleHand,
    layout: layout, guide: function () { return buildGuide(currentPart()); },
    size: function () { return { W: W, H: H }; }
  };
})();
