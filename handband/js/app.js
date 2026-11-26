/* =========================================================
   app.js — HandBand 가이드 신스
   My Pace(손가락으로 한 칸씩) / Auto-play(BPM 자동) · 가로모드 기준
   ========================================================= */
(function (global) {
  'use strict';

  var HB = global.HB;
  var Chords = HB.Chords;
  var Score = HB.Score;
  var Stage = HB.Stage;

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var LS_SONGS = 'hb.v2.songs';
  var LS_PREFS = 'hb.v2.prefs';
  var HOLD_MS = 430;          // My Pace — 손가락을 유지하는 시간

  /* ── 엘리먼트 ─────────────────────────────────────────── */
  var view = $('#view');
  var ctx = view.getContext('2d', { alpha: false });
  var recCv = document.createElement('canvas');
  var recCtx = recCv.getContext('2d', { alpha: false });

  var video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.autoplay = true;

  var synth = new HB.Synth();
  var tracker = new HB.HandTracker();

  /* ── 상태 ─────────────────────────────────────────────── */
  var state = {
    songId: null,
    songs: [],
    song: null,
    compiled: null,
    step: 0,
    mode: 'mypace',
    playing: false,
    bpm: 84,
    transpose: 0,
    muted: false,
    preset: 'warm',
    volume: 0.82,
    reverb: 0.55,
    camOn: false,
    camTried: false,
    trackerOn: true,
    rot: 0,
    mirror: true,
    swap: true,
    showLyric: true,
    showCard: true,
    showHands: true,
    countdownOn: true,
    micOn: true,
    recAspect: 'scene',
    recording: false,
    recSec: 0,
    panoramaHint: false
  };

  /* 무대(그리기) 상태 */
  var S = {
    time: 0, scroll: 0, step: null, score: null, hands: [],
    inset: { top: 56, bottom: 100 },
    progress: 0, segProgress: 0, matched: false, muted: false,
    needLeft: 1, rightCount: 5, curChord: '—', curDegree: '',
    hint: '', partLabel: '', songTitle: '', songArtist: '',
    recording: false, recText: ''
  };

  var now = 0;
  var fired = false;
  var holdStart = 0;
  var stepStart = 0;
  var virtual = null;         // 터치로 만든 손가락
  var lastDetect = 0;
  var lastTick = 0;

  /* ── 저장 ─────────────────────────────────────────────── */
  function readJSON(key, fb) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; }
    catch (e) { return fb; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* noop */ }
  }

  function store() { return readJSON(LS_SONGS, {}); }
  function putSong(song) { var s = store(); s[song.id] = song; writeJSON(LS_SONGS, s); }
  function dropSong(id) { var s = store(); delete s[id]; writeJSON(LS_SONGS, s); }

  function buildSongs() {
    var custom = store();
    var list = HB.Songs.builtin().map(function (b) { return custom[b.id] || b; });
    Object.keys(custom).forEach(function (id) {
      var s = custom[id];
      if (!s.builtin) list.push(s);
    });
    state.songs = list;
    return list;
  }

  /* ── 곡 선택 / 컴파일 ─────────────────────────────────── */
  function pickSong(id) {
    var list = state.songs.length ? state.songs : buildSongs();
    var song = list.filter(function (s) { return s.id === id; })[0] || list[0];
    if (!song) return;
    state.song = song;
    state.songId = song.id;
    state.compiled = Score.compile(song);
    state.bpm = song.bpm || 84;
    state.transpose = 0;
    if (song.preset) setPreset(song.preset, true);

    $('#songTitle').textContent = song.title;
    $('#songMeta').textContent = [song.artist, song.key].filter(Boolean).join(' · ');
    $('#bpmVal').textContent = String(state.bpm);
    S.songTitle = song.title;
    S.songArtist = song.artist || '';
    S.score = state.compiled;
    S.scroll = 0;
    fired = false;
    goStep(0, { silent: true });
    savePrefs();
  }

  /* 묶음 → 오른손 손가락 수 (가이드 그림과 실제 판정이 같은 표를 쓴다) */
  function rightFor(bank) {
    if (bank <= 1) return 5;
    if (bank === 2) return 3;
    if (bank === 3) return 2;
    return 1;
  }

  /* 오른손 손가락 수 → 묶음 (편 손 4~5 = 기본 묶음, 접을수록 다음 묶음) */
  function bankOf(right) {
    if (right >= 4) return 1;
    if (right === 3) return 2;
    if (right === 2) return 3;
    if (right === 1) return 4;
    return 0;
  }

  function curStep() {
    var st = state.compiled && state.compiled.steps;
    return st && st.length ? st[Math.min(state.step, st.length - 1)] : null;
  }

  function tonicPc() {
    var key = state.song && state.song.key;
    if (key) {
      var c = Chords.parse(String(key).split(/[\s·(]/)[0].replace('♭', 'b').replace('♯', '#'));
      if (c) return c.root;
    }
    var st = state.compiled && state.compiled.steps[0];
    if (st) { var c2 = Chords.parse(st.chord); if (c2) return c2.root; }
    return null;
  }

  function displayChord(sym) {
    return Stage.chordLabel(sym, state.transpose);
  }

  /* ── 스텝 이동 ────────────────────────────────────────── */
  function goStep(i, opts) {
    opts = opts || {};
    var steps = state.compiled ? state.compiled.steps : [];
    if (!steps.length) return;

    if (i < 0) i = 0;
    if (i >= steps.length) {
      if (opts.stopAtEnd) { i = steps.length - 1; }
      else i = 0;
    }

    state.step = i;
    var st = steps[i];
    S.step = st;
    fired = false;
    holdStart = 0;
    stepStart = now;
    S.progress = 0;
    S.segProgress = 0;
    S.matched = false;

    S.needLeft = st.left;
    S.rightCount = rightFor(st.bank);
    S.curChord = displayChord(st.chord);
    S.curDegree = Stage.degreeLabel(st.chord, tonicPc());
    S.partLabel = st.line.partLabel || '';

    if (!opts.silent) {
      if (state.mode === 'auto' || opts.play) fireChord();
    }
    updateHint();
    renderUi();
  }

  function updateHint() {
    var st = S.step;
    if (!st) { S.hint = ''; return; }
    if (S.muted) { S.hint = '오른손을 펴면 소리가 나요'; return; }
    if (S.matched) { S.hint = '좋아요 · 다음 코드로 넘어가요'; return; }
    var bank = st.bank;
    var parts = ['왼손 ' + st.left + '손가락'];
    if (bank > 1) parts.push('오른손 ' + rightFor(bank) + '손가락');
    else parts.push('오른손 펴기');
    S.hint = parts.join(' · ');
  }

  /* ── 소리 ─────────────────────────────────────────────── */
  function fireChord() {
    var st = S.step;
    if (!st) return;
    var sym = displayChord(st.chord);
    var chord = Chords.parse(sym);
    if (!chord) return;
    var midis = Chords.midisFor(chord, 0, synth.currentNotes);
    synth.play(midis, 0.92);
  }

  function stepDur() {
    return (60000 / Math.max(30, state.bpm)) * 2;
  }

  /* ── 손가락 읽기 ──────────────────────────────────────── */
  function handByLabel(label) {
    for (var i = 0; i < S.hands.length; i++) if (S.hands[i].label === label) return S.hands[i];
    return null;
  }

  function readGesture() {
    if (state.sim) return state.sim;
    if (virtual && now < virtual.until) {
      return { left: virtual.left, right: virtual.right, bank: virtual.bank, hasRight: true };
    }
    if (!state.camOn || !state.trackerOn) return { left: null, right: null, hasRight: false };

    var L = handByLabel('L');
    var R = handByLabel('R');
    if (!L && R) { L = R; R = null; }         // 한 손만 보이면 그 손을 왼손으로
    return {
      left: L ? L.count : null,
      right: R ? R.count : null,
      hasRight: !!R
    };
  }

  function matches(g, st) {
    if (!st) return false;
    if (g.left == null) return false;
    if (g.left !== st.left) return false;
    if (g.hasRight) {
      if (g.right <= 0) return false;                 // 주먹 = 뮤트
      if (bankOf(g.right) !== st.bank) return false;  // 묶음이 다르면 다른 코드
    }
    return true;
  }

  /* ── 매 프레임 ────────────────────────────────────────── */
  function tick(ts) {
    var dt = Math.min(64, ts - lastTick || 16);
    lastTick = ts;
    now = ts;
    S.time = ts / 1000;

    if (state.camOn && state.trackerOn && tracker.ready && video.videoWidth && ts - lastDetect > 45) {
      S.hands = tracker.detect(video, ts);
      lastDetect = ts;
    } else if (!state.camOn || !state.trackerOn) {
      if (S.hands.length) S.hands = [];
    }

    var g = readGesture();
    var st = S.step;
    var ok = matches(g, st);

    var wasMuted = S.muted;
    S.muted = !!(g.hasRight && g.right <= 0);
    if (S.muted !== wasMuted) {
      if (S.muted) synth.release(0.18);
      updateHint();
    }

    if (st) {
      if (state.mode === 'mypace') {
        if (!ok) {
          if (fired) fired = false;
          S.progress = 0;
          S.segProgress = 0;
          if (S.matched) { S.matched = false; updateHint(); }
        } else {
          if (!fired) { fired = true; holdStart = now; fireChord(); }
          var p = (now - holdStart) / HOLD_MS;
          S.progress = Math.min(1, p);
          S.segProgress = Math.min(1, p);
          if (!S.matched) { S.matched = true; updateHint(); }
          if (p >= 1) {
            goStep(state.step + 1);
            S.matched = false;
          }
        }
      } else {
        var dur = stepDur();
        var pa = (now - stepStart) / dur;
        S.progress = Math.min(1, pa);
        S.segProgress = Math.min(1, pa);
        S.matched = ok;
        if (pa >= 1) goStep(state.step + 1, { play: true });
      }
    }

    /* 스크롤 이징 */
    var target = S.step ? S.step.lineIndex : 0;
    var k = 1 - Math.exp(-dt / 160);
    S.scroll += (target - S.scroll) * k;

    draw(ts);
    if (state.recording) {
      state.recSec = (performance.now() - recStartAt) / 1000;
      S.recText = fmtTime(state.recSec);
      $('#recLabel').textContent = 'REC ' + S.recText;
      renderRecFrame();
    }

    requestAnimationFrame(tick);
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /* ── 그리기 ───────────────────────────────────────────── */
  function draw() {
    var w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (view.width !== Math.round(w * dpr) || view.height !== Math.round(h * dpr)) {
      view.width = Math.round(w * dpr);
      view.height = Math.round(h * dpr);
      Stage.invalidate();
    }
    S.video = video;
    S.camOn = state.camOn;
    S.rot = state.rot;
    S.mirror = state.mirror;
    S.showLyric = state.showLyric;
    S.showCard = state.showCard;
    S.showHands = state.showHands;
    S.recording = state.recording;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Stage.render(ctx, w, h, S);
  }

  function renderRecFrame() {
    var w, h;
    if (state.recAspect === '9:16') { w = 720; h = 1280; }
    else if (state.recAspect === '16:9') { w = 1280; h = 720; }
    else return;

    if (recCv.width !== w) { recCv.width = w; recCv.height = h; }
    recCtx.setTransform(1, 0, 0, 1, 0, 0);
    /* 녹화 프레임에는 DOM 컨트롤 바가 없으니 여백도 그에 맞춰 */
    var keepInset = S.inset;
    S.inset = { top: Math.round(h * 0.075), bottom: Math.round(h * 0.05) };
    Stage.render(recCtx, w, h, S);
    S.inset = keepInset;
  }

  function recStreamCanvas() {
    if (state.recAspect === '9:16' || state.recAspect === '16:9') return recCv;
    return view;
  }

  /* ── 리사이즈 ─────────────────────────────────────────── */
  function measureInset() {
    var top = $('.topbar');
    var ctl = $('#ctlbar');
    var th = top ? top.getBoundingClientRect().height : 56;
    var ch = ctl ? ctl.getBoundingClientRect().height : 100;
    S.inset = { top: th + 6, bottom: ch + 8 };
  }

  function resize() {
    measureInset();
    Stage.invalidate();
    draw();
  }

  /* ── 카메라 ───────────────────────────────────────────── */
  async function startCamera() {
    state.camTried = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.camOn = false;
      toast('이 브라우저에서는 카메라를 쓸 수 없어요 · 터치로 연주해요');
      syncCamBtn();
      return false;
    }
    var tries = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } }, audio: false },
      { video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false },
      { video: true, audio: false }
    ];
    for (var i = 0; i < tries.length; i++) {
      try {
        var stream = await navigator.mediaDevices.getUserMedia(tries[i]);
        video.srcObject = stream;
        await video.play().catch(function () {});
        state.camOn = true;
        syncCamBtn();
        loadTracker();
        setTimeout(checkOrientation, 900);
        return true;
      } catch (e) { /* 다음 제약으로 */ }
    }
    state.camOn = false;
    syncCamBtn();
    toast('카메라를 켜지 못했어요 · 터치로도 연주돼요', 2800);
    return false;
  }

  function stopCamera() {
    state.camOn = false;
    if (video.srcObject) video.srcObject.getTracks().forEach(function (t) { t.stop(); });
    video.srcObject = null;
    S.hands = [];
    tracker.reset();
    syncCamBtn();
  }

  function checkOrientation() {
    if (!state.camOn) return;
    var landscapeScreen = view.clientWidth > view.clientHeight;
    if (landscapeScreen && video.videoWidth && video.videoHeight > video.videoWidth * 1.15 && state.rot === 0) {
      S.hint = '카메라가 세로로 들어왔어요 · 설정에서 90° 회전';
      toast('카메라가 세로로 들어왔어요. 설정 → 카메라 → 90° 회전을 눌러 주세요.', 4200);
    }
  }

  async function loadTracker() {
    if (tracker.ready || tracker.loading) return;
    var ok = await tracker.load();
    if (ok) toast('손을 비추면 가이드가 켜져요', 2200);
    else if (tracker.failed) toast('손 인식을 불러오지 못했어요 · 터치로 연주해요', 3200);
  }

  function syncCamBtn() {
    $('#camBtn').classList.toggle('off', !state.camOn);
  }

  /* ── UI ───────────────────────────────────────────────── */
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, ms || 2000);
  }

  function renderUi() {
    $('#modeSeg').querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === state.mode);
    });
    var play = $('#playBtn');
    if (state.mode === 'auto') {
      play.textContent = state.playing ? '❚❚' : '▶';
      play.classList.toggle('on', state.playing);
    } else {
      play.textContent = '↺';
      play.classList.remove('on');
    }
    $('#bpmVal').textContent = String(state.bpm);
    $('#trackBtn').classList.toggle('off', !state.trackerOn);
  }

  /* ── 오디오 잠금 ──────────────────────────────────────── */
  function syncAudioBar() {
    var el = $('#audioBar');
    var ok = synth.state() === 'running';
    el.hidden = ok;
  }

  /* ── 설정 시트 ────────────────────────────────────────── */
  function openSheet(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('on'); });
  }
  function closeSheet(el) {
    el = el || document.querySelector('.sheet.on');
    if (!el) return;
    el.classList.remove('on');
    setTimeout(function () { if (!el.classList.contains('on')) el.hidden = true; }, 240);
  }

  function renderPresets() {
    var box = $('#presets');
    box.innerHTML = synth.available().map(function (p) {
      return '<button class="preset' + (p.id === state.preset ? ' on' : '') + '" data-preset="' + p.id + '">' +
        '<b>' + p.label + '</b><span>' + p.desc + '</span></button>';
    }).join('');
  }

  function setPreset(id, silent) {
    state.preset = id;
    synth.setPreset(id);
    $$('#presets .preset').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-preset') === id);
    });
    if (!silent) savePrefs();
  }

  /* ── 곡 목록 ──────────────────────────────────────────── */
  function renderSongList() {
    var box = $('#songList');
    box.innerHTML = state.songs.map(function (s) {
      return '<button class="songrow' + (s.id === state.songId ? ' on' : '') + '" data-song="' + s.id + '">' +
        '<span class="songrow__t">' + esc(s.title) + '</span>' +
        '<span class="songrow__m">' + esc([s.artist, s.key].filter(Boolean).join(' · ')) + '</span>' +
        '</button>';
    }).join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 악보 편집 ────────────────────────────────────────── */
  var editing = null;

  function toScoreText(song) {
    if (song.score && String(song.score).trim()) return song.score;
    var parts = Score.compile(song).parts;
    return parts.map(function (p) {
      var body = p.lines.map(function (l) {
        var s = '';
        var prev = 0;
        l.chords.forEach(function (c) {
          s += l.text.slice(prev, c.at) + '[' + c.sym + ']';
          prev = c.at;
        });
        s += l.text.slice(prev);
        return s;
      }).join('\n');
      return '#' + p.label + '\n' + body;
    }).join('\n\n');
  }

  function openEditor(song) {
    editing = song;
    $('#editorTitle').textContent = song ? '악보 편집' : '새 악보';
    $('#fTitle').value = song ? song.title : '';
    $('#fArtist').value = song ? (song.artist || '') : '';
    $('#fKey').value = song ? (song.key || '') : '';
    $('#fScore').value = song ? toScoreText(song) : HB.Songs.blank().score;
    $('#deleteSong').hidden = !song;
    $('#resetSong').hidden = !(song && song.builtin);
    updatePreview();
    openSheet('#editorSheet');
    setTimeout(function () { $('#fTitle').focus(); }, 260);
  }

  function updatePreview() {
    var text = $('#fScore').value;
    var fake = { title: 'x', parts: [], score: text };
    var comp = Score.compile(fake);
    var steps = comp.steps;
    var chips = steps.slice(0, 28).map(function (s) {
      return '<span class="chip">' + esc(s.chord) + '<i>' + s.left + '</i></span>';
    }).join('');
    $('#previewChips').innerHTML = chips || '<span class="muted">코드가 없어요</span>';
    $('#previewMsg').textContent = steps.length
      ? steps.length + '개 코드 · ' + comp.parts.length + '구간'
      : '가사와 코드를 적어 주세요. 형식: [Eb]나의 모든 [Gm]사랑이';
  }

  function saveEditor() {
    var title = $('#fTitle').value.trim() || '이름 없는 곡';
    var text = $('#fScore').value.trim();
    if (!text) { toast('악보 내용을 적어 주세요'); return; }

    var song = {
      id: editing ? editing.id : 'user-' + Date.now(),
      title: title,
      artist: $('#fArtist').value.trim(),
      key: $('#fKey').value.trim(),
      preset: state.preset,
      bpm: state.bpm,
      builtin: editing ? !!editing.builtin : false,
      score: text
    };
    putSong(song);
    buildSongs();
    renderSongList();
    pickSong(song.id);
    closeSheet($('#editorSheet'));
    toast('악보를 저장했어요');
  }

  function deleteEditor() {
    if (!editing) return;
    if (!confirm('이 악보를 지울까요?')) return;
    dropSong(editing.id);
    buildSongs();
    renderSongList();
    pickSong(state.songs[0] && state.songs[0].id);
    closeSheet($('#editorSheet'));
    toast('악보를 지웠어요');
  }

  function resetEditor() {
    if (!editing) return;
    dropSong(editing.id);
    buildSongs();
    var fresh = state.songs.filter(function (s) { return s.id === editing.id; })[0];
    closeSheet($('#editorSheet'));
    if (fresh) { pickSong(fresh.id); openEditor(fresh); }
  }

  /* ── 녹화 ─────────────────────────────────────────────── */
  var recorder = null;
  var recChunks = [];
  var recStartAt = 0;
  var micNodes = null;
  var takes = [];
  var canvasStream = null;

  var MIMES = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  function pickMime() {
    if (!global.MediaRecorder) return null;
    for (var i = 0; i < MIMES.length; i++) {
      try { if (MediaRecorder.isTypeSupported(MIMES[i])) return MIMES[i]; } catch (e) { /* noop */ }
    }
    return '';
  }

  async function startRecording() {
    if (state.recording) return;
    if (!global.MediaRecorder) { toast('이 브라우저는 영상 녹화를 지원하지 않아요'); return; }
    if (!view.captureStream) { toast('이 브라우저는 캔버스 녹화를 지원하지 않아요'); return; }

    synth.unlock();
    await synth.start();
    var mime = pickMime();
    if (mime === null) { toast('이 브라우저는 영상 녹화를 지원하지 않아요'); return; }

    try {
      var target = recStreamCanvas();
      if (state.recAspect === '9:16') { recCv.width = 720; recCv.height = 1280; }
      else if (state.recAspect === '16:9') { recCv.width = 1280; recCv.height = 720; }
      canvasStream = target.captureStream(30);

      var tracks = [];
      var vt = canvasStream.getVideoTracks()[0];
      if (!vt) throw new Error('no-video');
      tracks.push(vt);

      var st = synth.streamTrack();
      if (st) tracks.push(st);

      if (state.micOn) {
        try {
          var mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
          var src = synth.ctx.createMediaStreamSource(mic);
          var dest = synth.ctx.createMediaStreamDestination();
          var gain = synth.ctx.createGain();
          gain.gain.value = 1.0;
          src.connect(gain);
          gain.connect(dest);
          micNodes = { src: src, gain: gain, dest: dest, stream: mic };
          var mt = dest.stream.getAudioTracks()[0];
          if (mt) tracks.push(mt);
        } catch (err) {
          toast('마이크 없이 신스 소리만 담을게요', 2600);
        }
      }

      state.lastTracks = tracks.map(function (t) { return t.kind; });
      var mixed = new MediaStream(tracks);
      recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
      recChunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = finishRecording;
      recorder.start(1000);

      recStartAt = performance.now();
      state.recording = true;
      state.recSec = 0;
      $('#recBtn').classList.add('is-rec');
      toast('녹화 중 · 다시 누르면 멈춰요', 2200);
    } catch (e) {
      cleanupMic();
      toast('녹화를 시작하지 못했어요: ' + (e && e.message ? e.message : '오류'), 3200);
    }
  }

  function stopRecording() {
    if (!state.recording || !recorder) return;
    try { recorder.stop(); } catch (e) { /* noop */ }
    state.recording = false;
    S.recording = false;
    $('#recBtn').classList.remove('is-rec');
    $('#recLabel').textContent = '촬영';
    if (canvasStream) { canvasStream.getTracks().forEach(function (t) { t.stop(); }); canvasStream = null; }
  }

  function cleanupMic() {
    if (!micNodes) return;
    try {
      micNodes.src.disconnect();
      micNodes.gain.disconnect();
      micNodes.stream.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) { /* noop */ }
    micNodes = null;
  }

  function finishRecording() {
    var type = (recorder && recorder.mimeType) || 'video/webm';
    var blob = new Blob(recChunks, { type: type });
    recChunks = [];
    cleanupMic();
    if (!blob.size) { toast('녹화된 내용이 없어요'); return; }

    var d = new Date();
    var ext = /mp4/.test(type) ? 'mp4' : 'webm';
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    var take = {
      url: URL.createObjectURL(blob), blob: blob, type: type,
      name: 'handband-' + stamp + '.' + ext, size: blob.size, at: d
    };
    takes.unshift(take);
    openTake(take);
    toast('저장 준비 완료 · ' + (blob.size / 1048576).toFixed(1) + 'MB', 2600);
  }

  function openTake(take) {
    var v = $('#takeVideo');
    v.src = take.url;
    v.muted = false;
    $('#saveTake').href = take.url;
    $('#saveTake').download = take.name;
    $('#takeMeta').textContent = (take.size / 1048576).toFixed(1) + 'MB · .' + take.name.split('.').pop();
    var shareBtn = $('#shareTake');
    if (navigator.canShare && navigator.share) {
      var f = new File([take.blob], take.name, { type: take.type });
      shareBtn.hidden = !navigator.canShare({ files: [f] });
      shareBtn.onclick = function () { navigator.share({ files: [f], title: 'HandBand' }).catch(function () {}); };
    } else shareBtn.hidden = true;
    openSheet('#takeSheet');
    v.play().catch(function () {});
  }

  function runCountdown(done) {
    var el = $('#countdown');
    var span = el.querySelector('span');
    var n = 3;
    el.classList.add('on');
    span.textContent = String(n);
    var timer = setInterval(function () {
      n -= 1;
      if (n <= 0) { clearInterval(timer); el.classList.remove('on'); done(); return; }
      span.textContent = String(n);
      span.style.animation = 'none';
      void span.offsetWidth;
      span.style.animation = '';
    }, 750);
  }

  /* ── 환경 설정 ────────────────────────────────────────── */
  function savePrefs() {
    writeJSON(LS_PREFS, {
      songId: state.songId, mode: state.mode, bpm: state.bpm, preset: state.preset,
      volume: state.volume, reverb: state.reverb, trackerOn: state.trackerOn,
      rot: state.rot, mirror: state.mirror, swap: state.swap,
      showLyric: state.showLyric, showCard: state.showCard, showHands: state.showHands,
      countdownOn: state.countdownOn, micOn: state.micOn, recAspect: state.recAspect
    });
  }

  function loadPrefs() {
    var p = readJSON(LS_PREFS, {});
    ['songId', 'mode', 'bpm', 'preset', 'volume', 'reverb', 'trackerOn', 'rot', 'mirror', 'swap',
      'showLyric', 'showCard', 'showHands', 'countdownOn', 'micOn', 'recAspect'].forEach(function (k) {
      if (p[k] !== undefined) state[k] = p[k];
    });
    if (typeof state.trackerOn !== 'boolean') state.trackerOn = true;
  }

  /* ── 이벤트 ───────────────────────────────────────────── */
  function bind() {
    /* 어떤 터치든 오디오 잠금 해제 */
    document.addEventListener('pointerdown', function once() {
      synth.unlock();
      setTimeout(syncAudioBar, 120);
    }, { once: true, capture: true });

    $('#startBtn').addEventListener('click', function () {
      synth.unlock();
      boot(true);
    });
    $('#skipCam').addEventListener('click', function () {
      synth.unlock();
      boot(false);
    });
    $('#audioBar').addEventListener('click', function () {
      synth.unlock();
      setTimeout(syncAudioBar, 200);
      if (synth.state() === 'running') toast('소리 켜짐');
      else toast('무음 모드를 꺼 주세요 (아이폰 옆면 스위치)');
    });

    $('#songBtn').addEventListener('click', function () {
      renderSongList();
      openSheet('#songSheet');
    });
    $('#songList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-song]');
      if (!b) return;
      pickSong(b.getAttribute('data-song'));
      renderSongList();
      closeSheet($('#songSheet'));
    });
    $('#sheetEdit').addEventListener('click', function () {
      closeSheet($('#songSheet'));
      openEditor(state.song);
    });
    $('#sheetNew').addEventListener('click', function () {
      closeSheet($('#songSheet'));
      openEditor(null);
    });

    $('#modeSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      var m = b.getAttribute('data-mode');
      if (m === state.mode) return;
      state.mode = m;
      state.playing = false;
      stepStart = now;
      S.progress = 0;
      if (m === 'auto') { synth.unlock(); toast('자동 재생 · ▶ 를 눌러 시작'); }
      else toast('내 속도 · 손가락 모양을 만들면 넘어가요');
      renderUi();
      savePrefs();
    });

    $('#playBtn').addEventListener('click', function () {
      synth.unlock();
      if (state.mode === 'auto') {
        state.playing = !state.playing;
        if (state.playing) {
          goStep(state.step, { play: true });
          stepStart = now;
          toast('자동 재생');
        }
        renderUi();
      } else {
        var steps = state.compiled.steps;
        var pi = S.step ? S.step.partIndex : 0;
        var idx = 0;
        for (var i = 0; i < steps.length; i++) { if (steps[i].partIndex === pi) { idx = i; break; } }
        goStep(idx);
        toast('이 구간 처음부터');
      }
    });

    $('#bpmBox').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bpm]');
      if (!b) return;
      var d = parseInt(b.getAttribute('data-bpm'), 10);
      state.bpm = Math.max(40, Math.min(160, state.bpm + d));
      stepStart = now;
      renderUi();
      savePrefs();
    });

    $('#tapPad').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tap]');
      if (!b) return;
      synth.unlock();
      var n = parseInt(b.getAttribute('data-tap'), 10);
      var st = S.step;
      if (st && n !== st.left) { toast('이번 코드는 왼손 ' + st.left + '손가락이에요'); return; }
      virtual = { left: n, right: st ? rightFor(st.bank) : 5, until: performance.now() + 900 };
      now = performance.now();
    });

    $('#recBtn').addEventListener('click', function () {
      if (state.recording) { stopRecording(); return; }
      synth.unlock();
      if (state.countdownOn) runCountdown(startRecording);
      else startRecording();
    });

    $('#trackBtn').addEventListener('click', function () {
      state.trackerOn = !state.trackerOn;
      if (state.trackerOn && !state.camOn && !state.camTried) startCamera();
      else if (state.trackerOn) loadTracker();
      else { S.hands = []; tracker.reset(); }
      toast(state.trackerOn ? '손 인식 켬' : '손 인식 끔 · 터치로 연주');
      renderUi();
      savePrefs();
    });

    $('#camBtn').addEventListener('click', function () {
      if (state.camOn) { stopCamera(); toast('카메라 껐어 · 터치로 연주'); }
      else startCamera();
    });

    $('#setBtn').addEventListener('click', function () {
      syncSettings();
      openSheet('#setSheet');
    });

    $('#fScore').addEventListener('input', updatePreview);
    $('#saveSong').addEventListener('click', saveEditor);
    $('#deleteSong').addEventListener('click', deleteEditor);
    $('#resetSong').addEventListener('click', resetEditor);

    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-close]');
      if (c) closeSheet(c.closest('.sheet'));
    });
    $$('.sheet').forEach(function (s) {
      s.addEventListener('click', function (e) {
        if (e.target === s) closeSheet(s);
      });
    });

    $$('[data-set]').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-set');
        if (k === 'rot') {
          state.rot = (state.rot + 90) % 360;
          toast('카메라 ' + state.rot + '°');
        } else if (k === 'mirror') {
          state.mirror = !state.mirror;
        } else if (k === 'swap') {
          state.swap = !state.swap;
          tracker.swap = state.swap;
          tracker.reset();
        } else if (k === 'cam') {
          if (state.camOn) stopCamera(); else startCamera();
        } else {
          state[k] = !state[k];
        }
        syncSettings();
        savePrefs();
        Stage.invalidate();
      });
    });

    $$('[data-rec]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.recAspect = el.getAttribute('data-rec');
        syncSettings();
        savePrefs();
        toast(state.recAspect === 'scene' ? '화면 비율 그대로 녹화' : state.recAspect + ' 녹화');
      });
    });

    $('#presets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-preset]');
      if (b) setPreset(b.getAttribute('data-preset'));
    });

    $('#trDown').addEventListener('click', function () { transposeBy(-1); });
    $('#trUp').addEventListener('click', function () { transposeBy(1); });

    $('#revRange').addEventListener('input', function (e) {
      state.reverb = parseInt(e.target.value, 10) / 100;
      synth.setReverb(state.reverb);
      $('#revVal').textContent = e.target.value;
      savePrefs();
    });
    $('#volRange').addEventListener('input', function (e) {
      state.volume = parseInt(e.target.value, 10) / 100;
      synth.setVolume(state.volume);
      $('#volVal').textContent = e.target.value;
      savePrefs();
    });

    $('#closeTake').addEventListener('click', function () {
      $('#takeVideo').pause();
      closeSheet($('#takeSheet'));
    });

    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
    if (global.visualViewport) global.visualViewport.addEventListener('resize', function () { setTimeout(resize, 60); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.recording) stopRecording();
    });
  }

  function transposeBy(d) {
    state.transpose = Math.max(-6, Math.min(6, state.transpose + d));
    if (S.step) {
      var st = S.step;
      S.curChord = displayChord(st.chord);
      S.curDegree = Stage.degreeLabel(st.chord, tonicPc());
    }
    var tv = $('#trVal');
    if (tv) tv.textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
    Stage.invalidate();
    fireChord();
  }

  function syncSettings() {
    $$('[data-set]').forEach(function (el) {
      var k = el.getAttribute('data-set');
      var on = false;
      if (k === 'rot') { el.querySelector('b').textContent = state.rot + '°'; return; }
      if (k === 'cam') { el.querySelector('b').textContent = state.camOn ? '켜짐' : '꺼짐'; return; }
      if (k === 'mirror') on = state.mirror;
      else if (k === 'swap') on = state.swap;
      else if (k === 'showLyric') on = state.showLyric;
      else if (k === 'showCard') on = state.showCard;
      else if (k === 'showHands') on = state.showHands;
      else if (k === 'countdownOn') on = state.countdownOn;
      else if (k === 'micOn') on = state.micOn;
      el.classList.toggle('on', on);
    });
    $$('[data-rec]').forEach(function (el) {
      el.classList.toggle('on', el.getAttribute('data-rec') === state.recAspect);
    });
    var tv = $('#trVal');
    if (tv) tv.textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
    $('#revRange').value = Math.round(state.reverb * 100);
    $('#revVal').textContent = String(Math.round(state.reverb * 100));
    $('#volRange').value = Math.round(state.volume * 100);
    $('#volVal').textContent = String(Math.round(state.volume * 100));
    renderPresets();
  }

  /* ── 부팅 ─────────────────────────────────────────────── */
  async function boot(withCamera) {
    $('#intro').classList.add('hide');
    setTimeout(function () { $('#intro').hidden = true; }, 420);

    synth.setPreset(state.preset);
    synth.setVolume(state.volume);
    synth.setReverb(state.reverb);
    await synth.start().catch(function () { toast('소리를 켜지 못했어요 · 무음 모드를 확인해 주세요', 3600); });
    setTimeout(syncAudioBar, 300);

    resize();
    setTimeout(function () { if (S.step) fireChord(); }, 260);
    if (withCamera) { await startCamera(); }
    else { state.camTried = true; toast('터치로 연주해요 · 아래 1~5 를 눌러 보세요', 3200); }

    if (withCamera && view.clientWidth > view.clientHeight * 1.2) {
      setTimeout(function () {
        if (!window.matchMedia('(display-mode: standalone)').matches && document.documentElement.requestFullscreen) {
          /* 브라우저 전체화면은 사용자가 원할 때만 */
        }
      }, 100);
    }
    renderUi();
    syncSettings();
  }

  function init() {
    loadPrefs();
    tracker.swap = state.swap;
    buildSongs();
    pickSong(state.songId);
    renderSongList();
    renderPresets();
    bind();
    resize();
    renderUi();
    syncSettings();
    syncAudioBar();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { Stage.invalidate(); });
      document.fonts.load('400 40px "Gowun Batang"').catch(function () {});
      document.fonts.load('600 24px "Pretendard Variable"').catch(function () {});
    }
    requestAnimationFrame(function (ts) { lastTick = ts; now = ts; requestAnimationFrame(tick); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 테스트/디버그 */
  global.__hb = {
    state: state, S: S, synth: synth, tracker: tracker,
    goStep: goStep, pickSong: pickSong, buildSongs: buildSongs,
    fire: fireChord, tap: function (n) { virtual = { left: n, right: 5, bank: S.step ? S.step.bank : 1, until: performance.now() + 900 }; },
    current: function () { return S.step; },
    hands: function (arr) { S.hands = arr; },
    simulate: function (g) { state.sim = g || null; },
    layout: function () { return Stage.layout(view.clientWidth, view.clientHeight, S.inset); },
    tickNow: function () { return now; }
  };
})(window);
