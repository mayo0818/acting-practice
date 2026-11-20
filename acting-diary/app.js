/* ============================================================
   연기 일기 · app.js
   영상 + 대사 + 피드백을 이 기기에만 쌓는 배우의 기록장
   ============================================================ */
(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const DB_NAME = 'acting_diary_db';
  const DB_VERSION = 1;
  const SETTINGS_KEY = 'acting_diary_settings';
  const GEMINI_MAX_BYTES = 18 * 1024 * 1024;
  const GEMINI_MODEL = 'gemini-2.5-flash';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  /* ---------------- state ---------------- */
  const state = {
    entries: [],
    view: 'list',
    search: '',
    tag: null,
    calY: 0,
    calM: 0,
    calDay: null,
    draft: null,
    editing: null,
    settings: { apiKey: '' },
    detailId: null
  };

  /* ---------------- utils ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dayKey(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  function fmtDateLine(iso, withYear) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const now = new Date();
    const tail = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
    return (withYear || y !== now.getFullYear()) ? `${y}년 ${tail}` : tail;
  }
  function fmtClock(iso) {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtDuration(sec) {
    if (!sec || !isFinite(sec)) return '길이 확인 중';
    const s = Math.round(sec);
    if (s < 60) return `${s}초`;
    return `${Math.floor(s / 60)}분 ${pad(s % 60)}초`;
  }
  function fmtBytes(b) {
    if (!b) return '0MB';
    return b > 1024 * 1024 * 1024 ? (b / 1073741824).toFixed(1) + 'GB' : (b / 1048576).toFixed(b > 10485760 ? 0 : 1) + 'MB';
  }

  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 260);
    }, isErr ? 4200 : 2600);
  }

  /* ---------------- IndexedDB ---------------- */
  let dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('entries')) {
          const st = d.createObjectStore('entries', { keyPath: 'id' });
          st.createIndex('createdAt', 'createdAt');
          st.createIndex('day', 'day');
        }
        if (!d.objectStoreNames.contains('videos')) {
          d.createObjectStore('videos', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idbAll(store) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readonly');
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(store, value) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(store, key) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDelete(store, key) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbClear(store) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function loadEntries() {
    const rows = await idbAll('entries');
    state.entries = rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  /* ---------------- settings ---------------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) state.settings = Object.assign({ apiKey: '' }, JSON.parse(raw));
    } catch (e) { /* ignore corrupt settings */ }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* private mode */ }
  }

  /* ---------------- stars ---------------- */
  function starsHTML(n) {
    if (!n) return '';
    let out = '<span class="stars" aria-label="별점 ' + n + '점">';
    for (let i = 1; i <= 5; i++) out += `<svg class="ico${i <= n ? ' on' : ''}"><use href="#i-star"/></svg>`;
    return out + '</span>';
  }

  /* ---------------- list ---------------- */
  function filtered() {
    const q = state.search.trim().toLowerCase();
    return state.entries.filter(e => {
      if (state.tag && !(e.tags || []).includes(state.tag)) return false;
      if (!q) return true;
      const hay = [e.work, e.character, e.lines, e.memo, (e.tags || []).join(' '),
        e.feedback ? [e.feedback.emotion, e.feedback.delivery, e.feedback.gaze, e.feedback.summary].filter(Boolean).join(' ') : '']
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function cardHTML(e) {
    const thumb = e.thumb
      ? `<img src="${e.thumb}" alt="${esc(e.work || '연기')} 장면" loading="lazy">`
      : '<svg class="ico"><use href="#i-film"/></svg>';
    const work = e.work || '제목 없는 장면';
    const role = e.character ? `<span class="card-role">${esc(e.character)}</span>` : '';
    const lines = e.lines
      ? `<p class="card-lines">${esc(e.lines.replace(/\n+/g, ' '))}</p>`
      : '<p class="card-lines none">대사 없이 남긴 장면</p>';
    const tags = (e.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<button class="card" type="button" data-id="${esc(e.id)}" aria-label="${esc(work)} 장면 열기">
      <span class="card-thumb${e.thumb ? '' : ' empty-thumb'}">${thumb}${e.thumb ? '<span class="thumb-play"><svg class="ico"><use href="#i-play"/></svg></span>' : ''}</span>
      <span class="card-body">
        <span class="card-top"><span class="card-work">${esc(work)}</span>${role}</span>
        ${lines}
        <span class="card-foot">
          <span class="card-tags">${tags}</span>
          ${starsHTML(e.rating)}
          <span class="card-time">${fmtClock(e.createdAt)}</span>
        </span>
      </span>
    </button>`;
  }

  function renderTimeline() {
    const list = filtered();
    const wrap = $('#timeline');
    $('#entryCount').textContent = state.entries.length + '편';
    if (!list.length) {
      wrap.innerHTML = '';
      const empty = $('#emptyState');
      empty.hidden = false;
      empty.querySelector('.empty-title').textContent = state.entries.length ? '조건에 맞는 장면이 없어요.' : '아직 남긴 장면이 없어요.';
      empty.querySelector('.empty-body').innerHTML = state.entries.length
        ? '검색어나 감정 필터를 바꿔 보세요.'
        : '오늘 연기한 대사를 영상으로 남기면<br>감정과 표정이 그대로 쌓입니다.';
      empty.querySelector('.btn').textContent = state.entries.length ? '조건 지우기' : '첫 장면 기록하기';
      empty.querySelector('.btn').dataset.go = state.entries.length ? 'reset' : 'record';
      return;
    }
    $('#emptyState').hidden = true;

    const groups = [];
    const map = new Map();
    list.forEach(e => {
      const k = e.day || dayKey(e.createdAt);
      if (!map.has(k)) { map.set(k, []); groups.push(k); }
      map.get(k).push(e);
    });
    wrap.innerHTML = groups.map(k => {
      const arr = map.get(k);
      const head = `<div class="day-head"><span class="d-day">${fmtDateLine(arr[0].createdAt)}</span><span class="d-line"></span><span class="d-count">${arr.length}</span></div>`;
      return `<div class="day-group">${head}${arr.map(cardHTML).join('')}</div>`;
    }).join('');
  }

  function renderTagFilter() {
    const row = $('#tagFilterRow');
    const counts = new Map();
    state.entries.forEach(e => (e.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    if (counts.size < 2) { row.hidden = true; row.innerHTML = ''; return; }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (state.tag && !counts.has(state.tag)) state.tag = null;
    row.hidden = false;
    row.innerHTML = top.map(([t, c]) => `<button class="filter-chip${state.tag === t ? ' is-on' : ''}" type="button" data-tag="${esc(t)}">${esc(t)} ${c}</button>`).join('');
  }

  /* ---------------- calendar ---------------- */
  function renderCalendar() {
    const y = state.calY, m = state.calM;
    $('#calTitle').textContent = `${y}년 ${m + 1}월`;
    const first = new Date(y, m, 1);
    const startBlank = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const counts = new Map();
    state.entries.forEach(e => { const k = e.day || dayKey(e.createdAt); counts.set(k, (counts.get(k) || 0) + 1); });
    const today = dayKey(new Date());

    let html = WEEK.map((w, i) => `<div class="cal-week${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('');
    const total = Math.ceil((startBlank + daysInMonth) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const dayNum = i - startBlank + 1;
      if (dayNum < 1 || dayNum > daysInMonth) { html += '<div class="cal-cell out" aria-hidden="true"></div>'; continue; }
      const key = `${y}-${pad(m + 1)}-${pad(dayNum)}`;
      const dow = i % 7;
      const cls = ['cal-cell'];
      if (dow === 0) cls.push('sun');
      if (dow === 6) cls.push('sat');
      if (counts.has(key)) cls.push('has');
      if (key === today) cls.push('today');
      if (state.calDay === key) cls.push('sel');
      const n = counts.get(key) || 0;
      html += `<button class="${cls.join(' ')}" type="button" data-day="${key}" aria-label="${m + 1}월 ${dayNum}일${n ? ', ' + n + '편' : ''}"${n > 1 ? ` data-n="${n}"` : ''}><span class="cal-num">${dayNum}</span></button>`;
    }
    $('#calGrid').innerHTML = html;
    renderCalEntries();
  }

  function renderCalEntries() {
    const box = $('#calEntries');
    const label = $('#calDayLabel');
    const emptyEl = $('#calEmpty');
    $('#calClearDay').hidden = !state.calDay;

    let list;
    if (state.calDay) {
      list = state.entries.filter(e => (e.day || dayKey(e.createdAt)) === state.calDay);
      const d = new Date(state.calDay + 'T12:00:00');
      label.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
    } else {
      const now = new Date();
      list = state.entries.filter(e => (e.day || dayKey(e.createdAt)) === dayKey(now));
      label.textContent = '오늘';
    }
    box.innerHTML = list.map(cardHTML).join('');
    emptyEl.hidden = list.length > 0;
    emptyEl.textContent = state.calDay ? '이 날은 남긴 장면이 없어요.' : '오늘 남긴 장면이 아직 없어요.';
  }

  /* ---------------- tabs / views ---------------- */
  function go(view) {
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.go === view));
    if (view === 'calendar') renderCalendar();
    if (view === 'record') {
      if (!state.draft) ensureCamera();
    } else {
      if (!state.draft) stopCamera();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------- camera & recorder ---------------- */
  const cam = {
    stream: null,
    recorder: null,
    chunks: [],
    mime: '',
    startedAt: 0,
    timer: null,
    facing: 'user',
    active: false,
    finalText: '',
    interimText: '',
    recognition: null,
    sttWanted: false,
    sttFailed: false
  };
  const STT_LANG = 'ko-KR';

  function recorderMime() {
    if (!window.MediaRecorder) return '';
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* ignore */ }
    }
    return '';
  }

  function camSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async function ensureCamera() {
    const idle = $('#stageIdle');
    const shutter = $('#shutterBtn');
    if (cam.stream || cam.active) { shutter.disabled = false; return; }
    if (!camSupported()) {
      idle.innerHTML = '<svg class="ico"><use href="#i-record"/></svg><p>이 브라우저에서는 앱 안에서<br>카메라 녹화를 쓸 수 없습니다.<br>아래에서 영상을 올려 주세요.</p>';
      $('#recHint').textContent = '사진 앱의 영상을 올리면 같은 방식으로 기록됩니다.';
      $('#uploadFallback').open = true;
      shutter.disabled = true;
      return;
    }
    try {
      const constraints = {
        video: { facingMode: cam.facing, width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      };
      cam.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      let retry = null;
      try { retry = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); } catch (e2) { /* fall through */ }
      if (!retry) {
        const name = err && err.name;
        const msg = name === 'NotAllowedError'
          ? '카메라와 마이크 권한이 꺼져 있습니다.<br>사파리 주소창의 <b>aA → 웹사이트 설정</b>에서 허용해 주세요.'
          : name === 'NotFoundError'
            ? '사용할 수 있는 카메라를 찾지 못했습니다.'
            : '카메라를 열지 못했습니다.<br>사파리 주소창의 <b>aA → 웹사이트 설정</b>에서 카메라와 마이크가 허용되어 있는지 확인해 주세요.';
        idle.innerHTML = `<svg class="ico"><use href="#i-record"/></svg><p>${msg}</p><button class="btn btn-ghost btn-sm" type="button" id="retryCam">다시 시도</button>`;
        const rb = $('#retryCam');
        if (rb) rb.onclick = () => { idle.innerHTML = '<svg class="ico"><use href="#i-record"/></svg><p>카메라를 준비하고 있습니다.</p>'; ensureCamera(); };
        $('#recHint').textContent = '카메라 없이도 사진의 영상으로 기록할 수 있습니다.';
        $('#uploadFallback').open = true;
        return;
      }
      cam.stream = retry;
    }
    const v = $('#livePreview');
    v.srcObject = cam.stream;
    v.classList.toggle('rear', cam.facing === 'environment');
    v.play().catch(() => {});
    idle.hidden = true;
    shutter.disabled = false;
    $('#flipBtn').hidden = false;
    $('#recHint').textContent = '셔터를 누르면 바로 녹화가 시작됩니다.';
  }

  function stopCamera() {
    releaseWakeLock();
    if (cam.recorder && cam.recorder.state !== 'inactive') {
      try { cam.recorder.stop(); } catch (e) { /* ignore */ }
    }
    stopSTT();
    if (cam.stream) {
      cam.stream.getTracks().forEach(t => t.stop());
      cam.stream = null;
    }
    const v = $('#livePreview');
    if (v) v.srcObject = null;
    $('#stageIdle').hidden = false;
    $('#shutterBtn').disabled = true;
    $('#flipBtn').hidden = true;
    $('#stageHud').hidden = true;
  }

  async function flipCamera() {
    if (cam.active) return;
    cam.facing = cam.facing === 'user' ? 'environment' : 'user';
    stopCamera();
    await ensureCamera();
  }

  function startTimer() {
    cam.startedAt = Date.now();
    clearInterval(cam.timer);
    cam.timer = setInterval(() => {
      const s = Math.floor((Date.now() - cam.startedAt) / 1000);
      $('#recTimer').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      const bytes = cam.chunks.reduce((a, c) => a + (c.size || 0), 0);
      $('#recSize').textContent = fmtBytes(bytes);
      if (s >= 60 * 10) stopRecording();
    }, 500);
  }

  function beginRecording() {
    if (!cam.stream) return;
    const mime = recorderMime();
    let rec;
    try {
      rec = mime ? new MediaRecorder(cam.stream, { mimeType: mime, videoBitsPerSecond: 2500000 }) : new MediaRecorder(cam.stream);
    } catch (e) {
      try { rec = new MediaRecorder(cam.stream); } catch (e2) {
        toast('이 브라우저에서는 녹화를 시작할 수 없습니다.', true);
        return;
      }
    }
    cam.recorder = rec;
    cam.chunks = [];
    cam.mime = rec.mimeType || mime || 'video/mp4';
    cam.active = true;
    cam.finalText = '';
    cam.interimText = '';
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) cam.chunks.push(ev.data); };
    rec.onstop = () => {
      clearInterval(cam.timer);
      cam.active = false;
      $('#shutterBtn').classList.remove('is-recording');
      $('#stageHud').hidden = true;
      $('#recTimer').textContent = '00:00';
      document.querySelector('.shutter-inner').style.background = '';
      stopSTT();
      releaseWakeLock();
      const parts = cam.chunks.slice();
      cam.chunks = [];
      const calledAt = new Date();
      if (!parts.length) { toast('녹화된 영상이 없습니다. 다시 시도해 주세요.', true); return; }
      const blob = new Blob(parts, { type: cam.mime });
      const transcript = (cam.finalText + ' ' + cam.interimText).trim();
      stopCamera();
      handleClip(blob, 'camera', transcript, calledAt);
    };
    rec.start(1000);
    startTimer();
    requestWakeLock();
    $('#stageHud').hidden = false;
    $('#recTimer').textContent = '00:00';
    $('#shutterBtn').classList.add('is-recording');
    $('#shutterBtn').setAttribute('aria-label', '녹화 정지');
    $('#recHint').textContent = '다시 누르면 녹화가 끝나고 대사가 정리됩니다.';
    startSTT();
  }

  function stopRecording() {
    if (cam.recorder && cam.recorder.state !== 'inactive') {
      try { cam.recorder.requestData(); } catch (e) { /* ignore */ }
      try { cam.recorder.stop(); } catch (e) { /* ignore */ }
    }
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if (navigator.wakeLock && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
  }

  /* ---------------- speech to text ---------------- */
  function sttAvailable() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startSTT() {
    const panel = $('#sttPanel');
    const stateEl = $('#sttState');
    const textEl = $('#sttText');
    panel.hidden = false;
    if (!sttAvailable()) {
      stateEl.textContent = '지원하지 않는 브라우저';
      stateEl.className = 'stt-state';
      textEl.innerHTML = '<span class="stt-placeholder">이 브라우저에서는 실시간 인식이 어렵습니다. 녹화가 끝난 뒤 직접 적어 주세요.</span>';
      cam.sttFailed = true;
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    cam.sttFailed = false;
    cam.sttWanted = true;
    const make = () => {
      const r = new SR();
      r.lang = STT_LANG;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => {
        stateEl.innerHTML = '<span class="pulse"></span>듣는 중';
        stateEl.className = 'stt-state listening';
      };
      r.onresult = ev => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) cam.finalText += (cam.finalText ? ' ' : '') + res[0].transcript.trim();
          else interim += res[0].transcript;
        }
        cam.interimText = interim.trim();
        renderSTT();
      };
      r.onerror = ev => {
        const code = ev.error || '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          cam.sttWanted = false;
          cam.sttFailed = true;
          stateEl.textContent = '인식 꺼짐';
          stateEl.className = 'stt-state';
          textEl.innerHTML = (renderSTTtext() || '') + '<span class="stt-placeholder">마이크 권한이 없어 실시간 인식을 쓸 수 없습니다. 직접 적어 주세요.</span>';
        } else if (code === 'no-speech' || code === 'aborted') {
          /* normal pause — onend restarts */
        } else {
          stateEl.textContent = '인식 일시 중지';
          stateEl.className = 'stt-state';
        }
      };
      r.onend = () => {
        if (cam.active && cam.sttWanted && !cam.sttFailed) {
          try { r.start(); } catch (e) {
            setTimeout(() => { if (cam.active && cam.sttWanted && !cam.sttFailed) { try { r.start(); } catch (e2) { /* give up */ } } }, 400);
          }
        }
      };
      cam.recognition = r;
      try { r.start(); } catch (e) {
        stateEl.textContent = '시작하지 못함';
        cam.sttFailed = true;
      }
    };
    make();
  }

  function renderSTTtext() {
    const t = (cam.finalText + ' ' + (cam.interimText ? cam.interimText : '')).trim();
    return t ? esc(t) : '';
  }
  function renderSTT() {
    const el = $('#sttText');
    const final = cam.finalText.trim();
    const interim = cam.interimText.trim();
    if (!final && !interim) {
      el.innerHTML = '<span class="stt-placeholder">녹화하는 동안 말한 대사가 여기에 쌓입니다.</span>';
      return;
    }
    el.innerHTML = esc(final) + (interim ? `<span class="interim"> ${esc(interim)}</span>` : '');
    el.scrollTop = el.scrollHeight;
  }
  function stopSTT() {
    cam.sttWanted = false;
    if (cam.recognition) {
      try { cam.recognition.onend = null; cam.recognition.stop(); } catch (e) { /* ignore */ }
      cam.recognition = null;
    }
    const stateEl = $('#sttState');
    if (stateEl) { stateEl.textContent = ''; stateEl.className = 'stt-state'; }
  }

  /* ---------------- media probing ---------------- */
  function probe(blob) {
    return new Promise(resolve => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(blob);
      let done = false;

      function finish(thumb) {
        if (done) return;
        done = true;
        const d = (isFinite(v.duration) && v.duration > 0) ? v.duration : 0;
        URL.revokeObjectURL(url);
        resolve({ duration: d, thumb: thumb || '' });
      }
      function grab() {
        try {
          const w = v.videoWidth || 0, h = v.videoHeight || 0;
          if (!w || !h) return '';
          const tw = 420;
          const th = Math.round(tw * h / w);
          const c = document.createElement('canvas');
          c.width = tw; c.height = th;
          c.getContext('2d').drawImage(v, 0, 0, tw, th);
          return c.toDataURL('image/jpeg', 0.72);
        } catch (e) { return ''; }
      }
      function capture() {
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        const target = dur ? Math.min(1.2, Math.max(0.15, dur * 0.25)) : 0.3;
        if (Math.abs(v.currentTime - target) < 0.05) { finish(grab()); return; }
        let fired = false;
        const onSeek = () => { if (fired) return; fired = true; v.removeEventListener('seeked', onSeek); finish(grab()); };
        v.addEventListener('seeked', onSeek);
        try { v.currentTime = target; } catch (e) { finish(grab()); }
        setTimeout(() => { if (!fired) { fired = true; finish(grab()); } }, 1500);
      }
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.src = url;
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration > 0) { capture(); return; }
        // MediaRecorder 결과물은 길이가 Infinity로 나올 때가 있다.
        // 아주 큰 시간으로 점프하면 브라우저가 실제 길이를 계산해 durationchange를 보낸다.
        const onDur = () => {
          if (isFinite(v.duration) && v.duration > 0) {
            v.removeEventListener('durationchange', onDur);
            capture();
          }
        };
        v.addEventListener('durationchange', onDur);
        try { v.currentTime = 1e7; } catch (e) { capture(); }
        setTimeout(() => { if (!done && !isFinite(v.duration)) finish(grab()); }, 2200);
      };
      v.onerror = () => finish('');
      setTimeout(() => { if (!done) finish(grab()); }, 6000);
    });
  }

  /* ---------------- clip → compose ---------------- */
  let clipUrl = null;
  async function handleClip(blob, source, transcript, when) {
    const stamp = when || new Date();
    const meta = await probe(blob);
    if (clipUrl) { URL.revokeObjectURL(clipUrl); clipUrl = null; }
    clipUrl = URL.createObjectURL(blob);
    state.draft = {
      blob,
      thumb: meta.thumb,
      duration: meta.duration,
      mime: blob.type,
      size: blob.size,
      createdAt: stamp.toISOString(),
      source,
      transcript: transcript || '',
      feedback: null
    };
    showCompose(state.draft, null);
  }

  function setSeg(mode) {
    $('#segCamera').classList.toggle('is-active', mode === 'camera');
    $('#segUpload').classList.toggle('is-active', mode === 'upload');
    $('#segCamera').setAttribute('aria-selected', mode === 'camera');
    $('#segUpload').setAttribute('aria-selected', mode === 'upload');
    $('#recPanel').hidden = mode !== 'camera';
    $('#uploadPanel').hidden = mode !== 'upload';
  }

  const EMOTIONS = ['절제', '분노', '슬픔', '설렘', '불안', '체념', '유쾌', '긴장', '다정', '허탈'];
  let selectedTags = [];
  let rating = 0;
  let customEmotions = [];

  function renderEmotions() {
    const all = EMOTIONS.concat(customEmotions.filter(t => !EMOTIONS.includes(t)));
    $('#emotionChips').innerHTML = all.map(t => `<button class="emotion${selectedTags.includes(t) ? ' is-on' : ''}" type="button" data-emo="${esc(t)}" aria-pressed="${selectedTags.includes(t)}">${esc(t)}</button>`).join('');
  }
  function renderRating() {
    const labels = ['아직 없음', '아쉬움', '조금 아쉬움', '무난함', '좋았음', '오늘 최고'];
    $('#ratingLabel').textContent = labels[rating] || labels[0];
    $('#ratingStars').innerHTML = [1, 2, 3, 4, 5].map(i =>
      `<button class="rate-star${i <= rating ? ' on' : ''}" type="button" role="radio" aria-checked="${i === rating}" data-rate="${i}" aria-label="${i}점"><svg class="ico"><use href="#i-star"/></svg></button>`
    ).join('');
  }

  function updateLineStats() {
    const t = $('#fLines').value.trim();
    if (!t) { $('#lineStats').textContent = '0자'; return; }
    const beats = t.split(/\n+/).filter(Boolean).length;
    $('#lineStats').textContent = `${beats}줄 · ${t.length}자`;
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px';
  }

  function showCompose(draft, editingEntry) {
    state.editing = editingEntry || null;
    $('#recPanel').hidden = true;
    $('#uploadPanel').hidden = true;
    $('.segmented').hidden = true;
    $('#sttPanel').hidden = true;
    const form = $('#composeForm');
    form.hidden = false;

    const d = new Date(draft.createdAt);
    $('#composeTime').textContent = `${fmtDateLine(draft.createdAt, true)} ${fmtClock(draft.createdAt)}`;
    $('#composeDur').textContent = `${fmtDuration(draft.duration)} · ${fmtBytes(draft.size)}`;
    const clip = $('#clipPreview');
    if (clipUrl) { URL.revokeObjectURL(clipUrl); clipUrl = null; }
    if (draft.blob) {
      clipUrl = URL.createObjectURL(draft.blob);
      clip.src = clipUrl;
      clip.hidden = false;
    } else {
      clip.removeAttribute('src');
      clip.hidden = false;
    }
    clip.poster = draft.thumb || '';

    selectedTags = (editingEntry && editingEntry.tags ? editingEntry.tags.slice() : []);
    customEmotions = selectedTags.filter(t => !EMOTIONS.includes(t));
    rating = editingEntry ? (editingEntry.rating || 0) : 0;
    $('#fWork').value = editingEntry ? (editingEntry.work || '') : '';
    $('#fCharacter').value = editingEntry ? (editingEntry.character || '') : '';
    $('#fLines').value = editingEntry ? (editingEntry.lines || '') : (draft.transcript || '');
    $('#fMemo').value = editingEntry ? (editingEntry.memo || '') : '';
    renderEmotions();
    renderRating();
    updateLineStats();
    autoGrow($('#fLines'));

    const fb = editingEntry ? editingEntry.feedback : null;
    if (fb) { state.draft.feedback = fb; renderFeedback(fb); }
    else { $('#aiResult').hidden = true; $('#aiResult').innerHTML = ''; }

    updateAIDesc();
    $('#saveBtn').textContent = editingEntry ? '수정 저장' : '일기에 남기기';
    $('#composeNote').textContent = editingEntry
      ? '수정한 내용은 이 기기에 바로 반영됩니다.'
      : '영상과 기록은 이 기기의 브라우저 저장소에 남습니다.';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function hideCompose() {
    $('#composeForm').hidden = true;
    $('.segmented').hidden = false;
    $('#recPanel').hidden = false;
    $('#uploadPanel').hidden = true;
    setSeg('camera');
    $('#stageIdle').hidden = false;
    $('#shutterBtn').disabled = true;
    $('#clipPreview').removeAttribute('src');
    if (clipUrl) { URL.revokeObjectURL(clipUrl); clipUrl = null; }
    state.draft = null;
    state.editing = null;
    $('#fWork').value = ''; $('#fCharacter').value = ''; $('#fLines').value = '';
    $('#fMemo').value = ''; $('#emotionInput').value = '';
    selectedTags = []; customEmotions = []; rating = 0;
    $('#aiResult').hidden = true; $('#aiResult').innerHTML = '';
    updateLineStats();
  }

  function updateAIDesc() {
    const has = !!state.settings.apiKey;
    const desc = $('#aiDesc');
    const btn = $('#aiRunBtn');
    if (has) {
      desc.textContent = '영상을 Gemini로 보내 대사를 받아 적고, 감정선·대사 전달력·시선을 짚어 줍니다. 분석에는 10~30초가 걸립니다.';
      btn.disabled = false;
      btn.textContent = '분석하기';
    } else {
      desc.textContent = '설정에서 Gemini 키를 넣으면 대사를 받아 적고 감정선·전달력·시선을 짚어 줍니다. 키가 없어도 직접 적어 저장할 수 있습니다.';
      btn.disabled = false;
      btn.textContent = '키 설정';
    }
  }

  function renderFeedback(fb) {
    const box = $('#aiResult');
    box.hidden = false;
    const row = (t, v) => v ? `<div><h4>${t}</h4><p>${esc(v)}</p></div>` : '';
    box.innerHTML = row('감정선', fb.emotion) + row('대사 전달력', fb.delivery) + row('시선과 표정', fb.gaze) +
      row('한 줄 총평', fb.summary) + `<p class="ai-note">Gemini 영상 분석 · 저장하면 이 일기에 함께 남습니다.</p>`;
  }

  /* ---------------- gemini ---------------- */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  const GEMINI_PROMPT = [
    '이 영상은 한국의 고등학생 배우 지망생이 연기 연습을 하며 찍은 것이다.',
    '1) 화자가 말한 한국어 대사를 들리는 그대로 정확히 받아 적어라. 대사만, 따옴표나 해설 없이 적어라. 들리지 않는 부분은 비워 두어라.',
    '2) 배우에게 도움이 되는 연기 피드백을 아주 구체적으로 적어라. 칭찬과 개선점을 함께, 2~3문장씩.',
    '   - emotion: 감정선이 어떻게 흐르는지, 어디서 끊기거나 살아나는지',
    '   - delivery: 발음·속도·강세·호흡·끝처리',
    '   - gaze: 시선과 표정, 카메라와의 거리, 몸의 방향',
    '3) 이 장면을 한 줄로 요약하라(summary).',
    '4) 어울리는 감정 키워드를 한국어 1~3개 골라 tags에 담아라.',
    '과장된 칭찬이나 일반론은 쓰지 말고, 이 영상에서 실제로 보이는 것만 근거로 삼아라.'
  ].join('\n');

  async function runGemini() {
    if (!state.settings.apiKey) {
      openSettings();
      toast('먼저 Gemini API 키를 등록해 주세요.');
      return;
    }
    const draft = state.draft;
    if (!draft || !draft.blob) return;
    if (draft.size > GEMINI_MAX_BYTES) {
      renderAIError(`영상이 ${fmtBytes(draft.size)}로 커서 분석할 수 없습니다. 18MB 이하 영상이면 분석되고, 지금은 직접 대사를 적어 주세요.`);
      return;
    }
    const btn = $('#aiRunBtn');
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>분석 중';
    const box = $('#aiResult');
    box.hidden = false;
    box.innerHTML = '<p class="ai-desc" style="margin:0">영상을 읽고 있습니다. 10~30초 정도 걸립니다.</p>';
    try {
      const b64 = await blobToBase64(draft.blob);
      const mime = (draft.mime || 'video/mp4').split(';')[0];
      const body = {
        contents: [{ role: 'user', parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              transcript: { type: 'STRING' },
              emotion: { type: 'STRING' },
              delivery: { type: 'STRING' },
              gaze: { type: 'STRING' },
              summary: { type: 'STRING' },
              tags: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['transcript', 'emotion', 'delivery', 'gaze', 'summary']
          }
        }
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(state.settings.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text();
        let msg = '';
        try { msg = JSON.parse(txt).error?.message || ''; } catch (e) { msg = txt.slice(0, 160); }
        if (res.status === 400 && /API key not valid/i.test(msg)) throw new Error('API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.');
        if (res.status === 403) throw new Error('이 키로는 Gemini를 부를 수 없습니다. 키 권한을 확인해 주세요.');
        if (res.status === 429) throw new Error('무료 사용량을 다 썼습니다. 잠시 뒤나 내일 다시 시도해 주세요.');
        if (res.status === 413 || /too large|exceeds/i.test(msg)) throw new Error('영상이 너무 큽니다. 18MB 이하로 줄이거나 직접 대사를 적어 주세요.');
        throw new Error('분석에 실패했습니다. (' + res.status + ') ' + msg.slice(0, 120));
      }
      const json = await res.json();
      const cand = json.candidates && json.candidates[0];
      const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
      if (!text) {
        const block = json.promptFeedback && json.promptFeedback.blockReason;
        throw new Error(block ? '이 영상은 분석이 막혔습니다. (' + block + ')' : '분석 결과를 받지 못했습니다.');
      }
      let data;
      try { data = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()); } catch (e) {
        throw new Error('분석 결과를 읽지 못했습니다. 다시 시도해 주세요.');
      }
      if (data.transcript) {
        const cur = $('#fLines').value.trim();
        if (!cur) {
          $('#fLines').value = data.transcript.trim();
          updateLineStats(); autoGrow($('#fLines'));
        } else {
          data.transcript = data.transcript.trim();
        }
      }
      if (Array.isArray(data.tags)) {
        data.tags.map(t => String(t).trim().slice(0, 12)).filter(Boolean).slice(0, 3).forEach(t => {
          if (!selectedTags.includes(t)) {
            selectedTags.push(t);
            if (!EMOTIONS.includes(t)) customEmotions.push(t);
          }
        });
        renderEmotions();
      }
      draft.feedback = {
        emotion: data.emotion || '', delivery: data.delivery || '',
        gaze: data.gaze || '', summary: data.summary || '',
        transcript: data.transcript || ''
      };
      renderFeedback(draft.feedback);
      toast('분석을 마쳤습니다. 대사와 피드백을 확인해 보세요.');
    } catch (err) {
      renderAIError(err.message || '분석에 실패했습니다.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
      updateAIDesc();
    }
  }

  function renderAIError(msg) {
    const box = $('#aiResult');
    box.hidden = false;
    box.innerHTML = `<p class="ai-desc" style="margin:0;color:#d98b7d">${esc(msg)}</p>
      <p class="ai-note">키 없이도 대사·감정·별점을 직접 적어 저장할 수 있습니다.</p>`;
  }

  /* ---------------- save / delete ---------------- */
  async function saveEntry(ev) {
    if (ev) ev.preventDefault();
    const draft = state.draft;
    if (!draft) return;
    const work = $('#fWork').value.trim();
    const lines = $('#fLines').value.trim();
    if (!work && !lines) {
      toast('작품이나 대사 중 하나는 적어 주세요.', true);
      $('#fWork').focus();
      return;
    }
    const btn = $('#saveBtn');
    btn.disabled = true;
    try {
      const editing = state.editing;
      const now = new Date();
      const entry = {
        id: editing ? editing.id : uid(),
        createdAt: draft.createdAt || now.toISOString(),
        day: dayKey(draft.createdAt || now),
        updatedAt: now.toISOString(),
        work,
        character: $('#fCharacter').value.trim(),
        lines,
        tags: selectedTags.slice(),
        rating,
        memo: $('#fMemo').value.trim(),
        feedback: draft.feedback || null,
        thumb: draft.thumb || (editing ? editing.thumb : ''),
        duration: draft.duration || 0,
        mime: draft.mime || '',
        size: draft.size || 0,
        source: draft.source || (editing ? editing.source : 'upload')
      };
      if (draft.blob) {
        await idbPut('videos', { id: entry.id, blob: draft.blob });
      }
      await idbPut('entries', entry);
      await loadEntries();
      renderTimeline();
      renderTagFilter();
      if (state.view === 'calendar') renderCalendar();
      hideCompose();
      go('list');
      toast(editing ? '장면을 고쳐 남겼습니다.' : '오늘의 장면을 남겼습니다.');
    } catch (err) {
      console.error(err);
      toast('저장하지 못했습니다. 저장 공간을 확인해 주세요.', true);
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteEntry(id) {
    try {
      await idbDelete('entries', id);
      await idbDelete('videos', id).catch(() => {});
      state.detailId = null;
      closeSheet('detail');
      await loadEntries();
      renderTimeline();
      renderTagFilter();
      if (state.view === 'calendar') renderCalendar();
      toast('장면을 지웠습니다.');
    } catch (e) {
      toast('삭제하지 못했습니다.', true);
    }
  }

  /* ---------------- detail sheet ---------------- */
  let detailUrl = null;
  async function openDetail(id) {
    const e = state.entries.find(x => x.id === id);
    if (!e) return;
    state.detailId = id;
    const sheet = $('#detailSheet');
    const body = $('#detailBody');
    body.innerHTML = '<p class="ai-desc" style="margin:0">장면을 불러오는 중입니다.</p>';
    openSheet('detail');
    let blob = null;
    try { const row = await idbGet('videos', id); blob = row ? row.blob : null; } catch (err) { blob = null; }
    if (detailUrl) { URL.revokeObjectURL(detailUrl); detailUrl = null; }
    let media = '';
    if (blob) {
      detailUrl = URL.createObjectURL(blob);
      media = `<video class="detail-video" src="${detailUrl}" controls playsinline preload="metadata"${e.thumb ? ` poster="${e.thumb}"` : ''}></video>`;
    } else if (e.thumb) {
      media = `<img class="detail-video" src="${e.thumb}" alt="${esc(e.work || '')} 장면">`;
    } else {
      media = '<div class="detail-video" style="display:flex;align-items:center;justify-content:center;color:#5f5b53;font-size:12.5px;min-height:180px">영상이 이 기기에 없습니다</div>';
    }
    const d = new Date(e.createdAt);
    const tags = (e.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const lines = e.lines
      ? e.lines.split(/\n+/).filter(Boolean).map(b => `<span class="beat">${esc(b)}</span>`).join('')
      : '<span style="color:#6d685f">대사를 적지 않은 장면입니다.</span>';
    const fb = e.feedback;
    const fbHTML = fb ? `<div class="detail-section"><h3>연기 피드백</h3><div class="feedback">
        ${fb.emotion ? `<div class="fb-item"><h4>감정선</h4><p>${esc(fb.emotion)}</p></div>` : ''}
        ${fb.delivery ? `<div class="fb-item"><h4>대사 전달력</h4><p>${esc(fb.delivery)}</p></div>` : ''}
        ${fb.gaze ? `<div class="fb-item"><h4>시선과 표정</h4><p>${esc(fb.gaze)}</p></div>` : ''}
        ${fb.summary ? `<div class="fb-item"><h4>한 줄 총평</h4><p>${esc(fb.summary)}</p></div>` : ''}
      </div></div>` : '';

    body.innerHTML = `
      ${media}
      <div class="detail-head">
        <h2 class="detail-work" id="detailTitle">${esc(e.work || '제목 없는 장면')}</h2>
        ${e.character ? `<span class="detail-role">${esc(e.character)}</span>` : ''}
      </div>
      <div class="detail-meta">
        <span>${fmtDateLine(e.createdAt, true)} ${fmtClock(e.createdAt)}</span>
        ${e.duration ? `<span>${fmtDuration(e.duration)}</span>` : ''}
        <span>${starsHTML(e.rating) || ''}</span>
      </div>
      ${tags ? `<div class="detail-tags">${tags}</div>` : ''}
      <div class="detail-section"><h3>대사</h3><div class="detail-lines">${lines}</div></div>
      ${fbHTML}
      ${e.memo ? `<div class="detail-section"><h3>메모</h3><p class="detail-memo">${esc(e.memo)}</p></div>` : ''}
      <div class="detail-actions">
        <button class="btn btn-ghost" type="button" data-act="edit"><svg class="ico"><use href="#i-edit"/></svg>수정</button>
        <button class="btn btn-danger" type="button" data-act="delete"><svg class="ico"><use href="#i-trash"/></svg>삭제</button>
      </div>
      <p class="fine-print center">${e.source === 'camera' ? '카메라로 기록' : '영상 올려서 기록'} · ${fmtBytes(e.size)}</p>
    `;
  }

  /* ---------------- edit ---------------- */
  async function editEntry() {
    const entry = state.entries.find(e => e.id === state.detailId);
    if (!entry) return;
    let blob = null;
    try { const row = await idbGet('videos', entry.id); blob = row ? row.blob : null; } catch (err) { blob = null; }
    if (!blob) {
      toast('이 장면의 영상이 이 기기에 없어 대사만 고칠 수 있습니다.', true);
    }
    closeSheet('detail');
    go('record');
    state.draft = {
      blob: blob || null,
      thumb: entry.thumb,
      duration: entry.duration,
      mime: entry.mime,
      size: entry.size,
      createdAt: entry.createdAt,
      source: entry.source,
      transcript: entry.lines,
      feedback: entry.feedback || null
    };
    showCompose(state.draft, entry);
  }

  /* ---------------- sheets ---------------- */
  function openSheet(which) {
    const sheet = which === 'detail' ? $('#detailSheet') : $('#settingsSheet');
    const back = which === 'detail' ? $('#detailBackdrop') : $('#settingsBackdrop');
    back.hidden = false;
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.querySelector('.sheet-body').scrollTop = 0;
  }
  function closeSheet(which) {
    const sheet = which === 'detail' ? $('#detailSheet') : $('#settingsSheet');
    const back = which === 'detail' ? $('#detailBackdrop') : $('#settingsBackdrop');
    sheet.hidden = true;
    back.hidden = true;
    if ($('#detailSheet').hidden && $('#settingsSheet').hidden) document.body.style.overflow = '';
    if (which === 'detail') {
      if (detailUrl) { URL.revokeObjectURL(detailUrl); detailUrl = null; }
      $('#detailBody').innerHTML = '';
      state.detailId = null;
    }
  }

  /* ---------------- settings ---------------- */
  async function openSettings() {
    $('#setApiKey').value = state.settings.apiKey || '';
    updateKeyState();
    $('#statCount').textContent = state.entries.length + '편';
    $('#statStorage').textContent = '—';
    openSheet('settings');
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        $('#statStorage').textContent = `${fmtBytes(est.usage || 0)} / ${fmtBytes(est.quota || 0)}`;
      }
    } catch (e) { /* ignore */ }
  }
  function updateKeyState() {
    const el = $('#keyState');
    if (state.settings.apiKey) {
      const k = state.settings.apiKey;
      el.textContent = '등록됨 · ' + k.slice(0, 4) + '···' + k.slice(-4);
      el.classList.add('ok');
    } else {
      el.textContent = '등록된 키 없음';
      el.classList.remove('ok');
    }
  }

  function exportJSON() {
    const payload = {
      app: 'acting-diary',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      entries: state.entries.map(e => Object.assign({}, e, { thumb: e.thumb || '', videoIncluded: false }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acting-diary-${dayKey(new Date()).replace(/-/g, '')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(state.entries.length ? `${state.entries.length}편의 기록을 내보냈습니다.` : '내보낼 기록이 아직 없습니다.');
  }

  async function importJSON(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(rows)) throw new Error('형식이 다릅니다');
      let added = 0, updated = 0;
      for (const r of rows) {
        if (!r || !r.id) continue;
        const existing = state.entries.find(e => e.id === r.id);
        const entry = Object.assign({}, r, {
          day: r.day || dayKey(r.createdAt || new Date()),
          tags: Array.isArray(r.tags) ? r.tags : [],
          videoIncluded: undefined
        });
        if (existing) { updated++; } else { added++; }
        await idbPut('entries', entry);
      }
      await loadEntries();
      renderTimeline(); renderTagFilter();
      if (state.view === 'calendar') renderCalendar();
      toast(`${added}편을 더하고 ${updated}편을 갱신했습니다. 영상은 기기에 있는 것만 재생됩니다.`);
    } catch (err) {
      console.error(err);
      toast('가져오지 못했습니다. 이 앱에서 내보낸 JSON인지 확인해 주세요.', true);
    }
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    $$('[data-go]').forEach(b => b.addEventListener('click', ev => {
      const target = b.dataset.go;
      if (target === 'reset') {
        state.search = ''; state.tag = null;
        $('#searchInput').value = '';
        $('#searchClear').hidden = true;
        renderTagFilter(); renderTimeline();
        return;
      }
      go(target);
    }));

    $('#btnSettings').addEventListener('click', openSettings);

    // search
    const search = $('#searchInput');
    search.addEventListener('input', () => {
      state.search = search.value;
      $('#searchClear').hidden = !search.value;
      renderTimeline();
    });
    $('#searchClear').addEventListener('click', () => {
      search.value = ''; state.search = ''; $('#searchClear').hidden = true; renderTimeline(); search.focus();
    });

    // tag filter
    $('#tagFilterRow').addEventListener('click', ev => {
      const chip = ev.target.closest('[data-tag]');
      if (!chip) return;
      state.tag = state.tag === chip.dataset.tag ? null : chip.dataset.tag;
      renderTagFilter(); renderTimeline();
    });

    // timeline / calendar entries → detail
    document.addEventListener('click', ev => {
      const card = ev.target.closest('.card[data-id]');
      if (card) openDetail(card.dataset.id);
    });

    // calendar
    $('#calPrev').addEventListener('click', () => {
      state.calM--; if (state.calM < 0) { state.calM = 11; state.calY--; }
      state.calDay = null; renderCalendar();
    });
    $('#calNext').addEventListener('click', () => {
      state.calM++; if (state.calM > 11) { state.calM = 0; state.calY++; }
      state.calDay = null; renderCalendar();
    });
    $('#calGrid').addEventListener('click', ev => {
      const cell = ev.target.closest('[data-day]');
      if (!cell) return;
      state.calDay = state.calDay === cell.dataset.day ? null : cell.dataset.day;
      renderCalendar();
    });
    $('#calClearDay').addEventListener('click', () => { state.calDay = null; renderCalendar(); });

    // record tabs
    $('#segCamera').addEventListener('click', () => { setSeg('camera'); ensureCamera(); });
    $('#segUpload').addEventListener('click', () => { setSeg('upload'); stopCamera(); });

    // shutter
    $('#shutterBtn').addEventListener('click', async () => {
      if (cam.active) { stopRecording(); return; }
      if (!cam.stream) { await ensureCamera(); }
      if (!cam.stream) return;
      beginRecording();
      if (navigator.vibrate) navigator.vibrate(12);
    });
    $('#flipBtn').addEventListener('click', flipCamera);

    // uploads
    ['#fileInput', '#fileInputFallback'].forEach(sel => {
      const input = $(sel);
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
          toast('영상 파일을 골라 주세요.', true);
          return;
        }
        if (file.size > 600 * 1024 * 1024) {
          toast('600MB가 넘는 영상은 저장 공간 때문에 올릴 수 없습니다.', true);
          return;
        }
        toast('영상을 읽는 중입니다.');
        const when = file.lastModified ? new Date(file.lastModified) : new Date();
        await handleClip(file, 'upload', '', when);
      });
    });

    // compose
    $('#composeForm').addEventListener('submit', saveEntry);
    $('#cancelCompose').addEventListener('click', () => { if (state.editing) { hideCompose(); go('list'); } else { hideCompose(); } });
    $('#discardBtn').addEventListener('click', () => {
      hideCompose();
      toast('초안을 버렸습니다.');
    });
    $('#fLines').addEventListener('input', () => { updateLineStats(); autoGrow($('#fLines')); });
    $('#emotionChips').addEventListener('click', ev => {
      const b = ev.target.closest('[data-emo]');
      if (!b) return;
      const t = b.dataset.emo;
      const i = selectedTags.indexOf(t);
      if (i >= 0) selectedTags.splice(i, 1); else selectedTags.push(t);
      renderEmotions();
    });
    const addEmotion = () => {
      const v = $('#emotionInput').value.trim().slice(0, 12);
      if (!v) return;
      if (!selectedTags.includes(v)) selectedTags.push(v);
      if (!EMOTIONS.includes(v) && !customEmotions.includes(v)) customEmotions.push(v);
      $('#emotionInput').value = '';
      renderEmotions();
    };
    $('#emotionAdd').addEventListener('click', addEmotion);
    $('#emotionInput').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); addEmotion(); }
    });
    $('#ratingStars').addEventListener('click', ev => {
      const b = ev.target.closest('[data-rate]');
      if (!b) return;
      const v = Number(b.dataset.rate);
      rating = rating === v ? 0 : v;
      renderRating();
    });
    $('#aiRunBtn').addEventListener('click', () => {
      if (!state.settings.apiKey) { openSettings(); return; }
      runGemini();
    });

    // detail sheet actions
    $('#detailClose').addEventListener('click', () => closeSheet('detail'));
    $('#detailBackdrop').addEventListener('click', () => closeSheet('detail'));
    $('#detailEdit').addEventListener('click', editEntry);
    $('#detailBody').addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'edit') { editEntry(); return; }
      if (b.dataset.act === 'delete') {
        const actions = b.closest('.detail-actions');
        if (b.dataset.confirm === '1') { deleteEntry(state.detailId); return; }
        b.dataset.confirm = '1';
        b.innerHTML = '정말 삭제할까요?';
        b.classList.remove('btn-danger');
        b.classList.add('btn-accent');
        const cancel = document.createElement('button');
        cancel.className = 'btn btn-ghost';
        cancel.type = 'button';
        cancel.textContent = '취소';
        cancel.addEventListener('click', () => openDetail(state.detailId));
        actions.innerHTML = '';
        actions.appendChild(b);
        actions.appendChild(cancel);
      }
    });

    // settings
    $('#settingsClose').addEventListener('click', () => closeSheet('settings'));
    $('#settingsBackdrop').addEventListener('click', () => closeSheet('settings'));
    $('#saveKeyBtn').addEventListener('click', () => {
      const v = $('#setApiKey').value.trim();
      if (v && !/^[A-Za-z0-9_\-]{20,}$/.test(v)) { toast('키 형식이 조금 이상합니다. aistudio에서 복사한 값인지 확인해 주세요.', true); return; }
      state.settings.apiKey = v;
      saveSettings(); updateKeyState(); updateAIDesc();
      toast(v ? 'Gemini 키를 저장했습니다.' : '키를 비웠습니다.');
    });
    $('#clearKeyBtn').addEventListener('click', () => {
      state.settings.apiKey = '';
      $('#setApiKey').value = '';
      saveSettings(); updateKeyState(); updateAIDesc();
      toast('저장된 키를 지웠습니다.');
    });
    $('#exportBtn').addEventListener('click', exportJSON);
    $('#importInput').addEventListener('change', async ev => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) importJSON(f);
    });
    $('#wipeBtn').addEventListener('click', async () => {
      const b = $('#wipeBtn');
      if (b.dataset.confirm !== '1') {
        b.dataset.confirm = '1';
        b.textContent = '한 번 더 누르면 모두 지웁니다';
        setTimeout(() => { b.dataset.confirm = '0'; b.textContent = '모든 기록 삭제'; }, 4000);
        return;
      }
      await idbClear('entries');
      await idbClear('videos');
      await loadEntries();
      renderTimeline(); renderTagFilter();
      b.dataset.confirm = '0';
      b.textContent = '모든 기록 삭제';
      closeSheet('settings');
      toast('모든 기록을 지웠습니다.');
    });

    // keyboard / escape
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (!$('#detailSheet').hidden) closeSheet('detail');
      else if (!$('#settingsSheet').hidden) closeSheet('settings');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && cam.active) stopRecording();
    });
    window.addEventListener('pagehide', () => { if (cam.stream) cam.stream.getTracks().forEach(t => t.stop()); });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    loadSettings();
    const now = new Date();
    state.calY = now.getFullYear();
    state.calM = now.getMonth();
    $('#appVersion').textContent = 'v' + APP_VERSION;
    bind();
    renderEmotions();
    renderRating();
    updateAIDesc();
    try {
      await loadEntries();
    } catch (err) {
      console.error(err);
      toast('기록 저장소를 열지 못했습니다. 사파리 개인정보 보호 설정을 확인해 주세요.', true);
    }
    renderTimeline();
    renderTagFilter();
    renderCalendar();
    setSeg('camera');
    if (!camSupported()) {
      $('#stageIdle').innerHTML = '<svg class="ico"><use href="#i-record"/></svg><p>이 브라우저에서는 앱 안에서<br>카메라 녹화를 쓸 수 없습니다.<br>아래에서 영상을 올려 주세요.</p>';
      $('#recHint').textContent = '사진 앱의 영상을 올리면 같은 방식으로 기록됩니다.';
    }
    // friendly first impression: record tab pre-arms camera on explicit tap only
    $('#uploadFallback').hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // expose a tiny hook for testing without affecting normal use
  window.__actingDiary = {
    version: APP_VERSION,
    count: () => state.entries.length,
    openDetail,
    go,
    state
  };
})();
