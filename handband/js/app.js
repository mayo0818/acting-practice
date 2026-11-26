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
    lyricBoxEl.innerHTML = '<em>' + esc(p.label || '') + '</em>' + esc(text);
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

  function fitRect() {
    var vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    var s = Math.min(W / vw, H / vh);
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

      ctx.lineWidth = active ? 1.6 : 1;
      ctx.strokeStyle = active ? 'rgba(255,240,214,.85)' : (hover ? 'rgba(255,248,238,.45)' : 'rgba(255,248,238,.20)');
      ctx.stroke();

      // 코드 이름
      var mid = -Math.PI / 2 + (i + 0.5) * step;
      var lr = rIn + (R - rIn) * 0.54;
      var lx = cx + Math.cos(mid) * lr;
      var ly = cy + Math.sin(mid) * lr;

      var parsed = Chords.parse(pads[i]);
      var label = parsed ? Chords.transposeSymbol(parsed, state.transpose) : pads[i];
      var fs = n <= 3 ? 44 : (n <= 5 ? 38 : (n <= 6 ? 34 : 30));
      if (label.length > 6) fs *= 0.82;

      ctx.fillStyle = active ? 'rgba(255,250,240,.98)' : 'rgba(255,248,238,.80)';
      ctx.font = '600 ' + fs + 'px "Pretendard Variable", "Pretendard", system-ui, sans-serif';
      ctx.fillText(label, lx, ly + 2);

      ctx.fillStyle = active ? 'rgba(255,248,238,.72)' : 'rgba(255,248,238,.36)';
      ctx.font = '500 11px "Pretendard Variable", system-ui, sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), lx, ly - fs * 0.62 - 9);
    }

    // 바깥 링 + 음량 펄스
    var lv = state.level;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 5 + lv * 12, 0, TAU);
    ctx.lineWidth = 1 + lv * 2.2;
    ctx.strokeStyle = 'rgba(240,211,168,' + (0.10 + lv * 0.35).toFixed(3) + ')';
    ctx.stroke();

    // 가운데 원반
    var cd = rIn - 12;
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
    ctx.font = '500 10px "Pretendard Variable", system-ui, sans-serif';
    if (String(name).length < 4) ctx.fillText('C H O R D', cx, cy - 34);

    ctx.fillStyle = curParsed ? 'rgba(255,250,240,.98)' : 'rgba(255,248,238,.35)';
    var nfs = String(name).length > 6 ? 34 : 44;
    ctx.font = '600 ' + nfs + 'px "Pretendard Variable", "Pretendard", system-ui, sans-serif';
    ctx.fillText(name, cx, cy + (String(name).length < 4 ? 4 : 0));

    if (curParsed) {
      ctx.fillStyle = 'rgba(255,248,238,.55)';
      ctx.font = '500 12px "Pretendard Variable", system-ui, sans-serif';
      ctx.fillText(Chords.noteNames(curParsed, state.transpose), cx, cy + 30);
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

  function pointerPoint() {
    if (state.hand && performance.now() - state.handSeenAt < 420) {
      var f = fitRect();
      return { x: f.dx + (1 - state.hand.x) * f.dw, y: f.dy + state.hand.y * f.dh };
    }
    if (state.pointer) return state.pointer;
    return null;
  }

  function drawProgress(t) {
    if (!state.showDots) return;
    var pads = currentPads();
    if (!pads.length) return;
    var n = pads.length;
    var gap = n > 6 ? 13 : 17;
    var total = (n - 1) * gap;
    var y = 1016;
    for (var i = 0; i < n; i++) {
      var x = W / 2 - total / 2 + i * gap;
      var on = i === state.chordIndex;
      ctx.beginPath();
      if (on) {
        roundRect(x - 7, y - 2.5, 14, 5, 2.5);
        ctx.fillStyle = 'rgba(240,211,168,.95)';
        ctx.fill();
      } else {
        ctx.arc(x, y, 2.4, 0, TAU);
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

  function drawLyric() {
    if (!state.showLyric) return;
    var p = currentPart();
    var text = p && p.lyric ? p.lyric.trim() : '';
    if (!text) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '400 29px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = 'rgba(255,250,242,.96)';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 2;

    var lines = wrapText(text, 610, 2);
    var baseY = lines.length > 1 ? 1078 : 1112;
    lines.forEach(function (line, i) {
      ctx.fillText(line, W / 2, baseY + i * 46);
    });
    ctx.restore();
  }

  function wrapText(text, maxW, maxLines) {
    var out = [];
    var paras = text.split(/\n+/);
    for (var p = 0; p < paras.length && out.length < maxLines; p++) {
      var words = paras[p].trim().split(/\s+/);
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
          out.push(line);
          line = words[i];
          if (out.length >= maxLines) break;
        } else {
          line = test;
        }
      }
      if (out.length < maxLines && line) out.push(line);
    }
    return out.slice(0, maxLines);
  }

  /* ── 프레임 루프 ──────────────────────────────────── */
  var hoverPending = -1, hoverSince = 0;

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
    drawProgress(t);
    drawLyric();
    drawGrain();

    if (state.recording) updateRecLabel(now);
  }

  function handleHand(h, now) {
    var f = fitRect();
    var x = f.dx + (1 - h.x) * f.dw;
    var y = f.dy + h.y * f.dh;

    var dx = x - L.cx, dy = y - L.cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += TAU;

    var pads = currentPads();
    var n = pads.length;
    if (!n) return;

    var step = TAU / n;
    var idx = Math.floor(ang / step) % n;
    var inBand = dist > L.R * 0.10 && dist < L.R * 1.55;

    if (inBand) {
      state.hoverIndex = idx;
      if (idx !== hoverPending) { hoverPending = idx; hoverSince = now; }
      else if (now - hoverSince > 70 && idx !== state.chordIndex) {
        playChord(idx, { force: true });
      }
    } else {
      state.hoverIndex = -1;
      hoverPending = -1;
    }

    // 엄지–검지 벌림 → 음량, 중심에서 거리 → 밝기
    var swell = Math.max(0, Math.min(1, (h.pinch - 0.30) / 0.85));
    var bright = Math.max(0, Math.min(1, (dist - L.R * 0.25) / (L.R * 0.95)));
    synth.setExpression(0.14 + 0.86 * swell, 0.32 + 0.68 * bright);
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

    await synth.start();
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
      '<textarea class="p-lyric" placeholder="이 구간에서 부를 가사나 메모 (선택)"></textarea>';
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
      return {
        label: row.querySelector('.p-label').value.trim() || '구간',
        chords: Chords.splitChords(row.querySelector('.p-chords').value),
        lyric: row.querySelector('.p-lyric').value.trim()
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
        startCamera().then(function (ok) { if (ok) toast('카메라를 켰어요'); });
      }
    });

    $('#muteBtn').addEventListener('click', function () {
      state.muted = !state.muted;
      $('#muteBtn').classList.toggle('off', state.muted);
      $('#muteBtn').textContent = state.muted ? '소리 켜기' : '코드 끄기';
      if (state.muted) { synth.release(); state.chordIndex = -1; renderChips(); }
    });

    $('#recBtn').addEventListener('click', function () {
      if (state.recording) { stopRecording(); return; }
      synth.start();
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

    $('#startBtn').addEventListener('click', function () { boot(true); });
    $('#skipCam').addEventListener('click', function () { boot(false); });
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
      countdownOn: state.countdownOn,
      micOn: state.micOn,
      trackerOn: state.trackerOn,
      songId: state.songId
    });
  }

  function loadPrefs() {
    var p = readJSON(LS_PREFS, {});
    ['preset', 'volume', 'reverb', 'showWheel', 'showLyric', 'showHands', 'showDots', 'countdownOn', 'micOn', 'trackerOn'].forEach(function (k) {
      if (p[k] !== undefined) state[k] = p[k];
    });
    if (p.songId) state.songId = p.songId;
  }

  /* ── 부팅 ─────────────────────────────────────────── */
  async function boot(withCamera) {
    $('#intro').classList.add('hide');
    try { await synth.start(); } catch (e) { toast('소리를 켜지 못했어요. 무음 모드를 확인해 주세요.', 4000); }
    synth.setPreset(state.preset);
    synth.setVolume(state.volume);
    synth.setReverb(state.reverb);

    if (withCamera) {
      var ok = await startCamera();
      if (ok) loadTracker();
    } else {
      state.camTried = true;
      toast('포인터로 연주해요 · 휠을 눌러 보세요', 3200);
    }
    if (document.documentElement.requestFullscreen && !isNarrow()) { /* 데스크톱은 그대로 */ }
  }

  function init() {
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
    requestAnimationFrame(frameLoop);

    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 29px "Gowun Batang"').catch(function () {});
      document.fonts.load('600 30px "Pretendard Variable"').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 디버그용 */
  window.__hb = { state: state, synth: synth, playChord: playChord, selectSong: selectSong };
})();
