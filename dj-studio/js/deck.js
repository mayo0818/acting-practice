/* ===========================================================
   deck.js — 턴테이블(데크) 한 대: 파형·조그휠·전송·핫큐·루프·EQ
   =========================================================== */
(function () {
  'use strict';
  const DJ = window.DJ;

  const LOOP_BEATS = [1, 2, 4, 8];

  class Deck {
    constructor(app, id, root) {
      this.app = app;
      this.id = id;
      this.root = root;
      this.audio = app.audio;

      this.buffer = null;
      this.name = '';
      this.duration = 0;
      this.bpm = null;

      this.playing = false;
      this.offset = 0;
      this.startedAt = 0;
      this.rate = 1;
      this.pitch = 0;

      this.cue = 0;
      this.cueSet = false;
      this.hotcues = [null, null, null, null];
      this.loop = null;

      this.eq = { low: 0, mid: 0, high: 0 };
      this.filter = 0;
      this.volume = 0.85;

      this.angle = 0;
      this.peaks = null;
      this._cacheW = 0;
      this._cacheH = 0;

      this._voice = null;
      this._pendingSeek = null;
      this._lastStart = 0;
      this._jog = null;
      this._hotLong = false;
      this._hotTimer = 0;
      this._last = { time: '', bpm: '', pitch: '', badge: '' };

      this.root.innerHTML = Deck.template(id);
      this._q();
      this._buildGraph();
      this._wire();
      // 초기 시각 상태
      ['low', 'mid', 'high'].forEach((b) => this.setEq(b, 0));
      this.setPitch(0);
      this.setFilter(0);
      this.setVolume(this.volume);
      this._syncLoopUI();
      this._syncHotUI();
    }

    static template(id) {
      const eqCol = (band, label) => `
        <div class="eqcol">
          <span class="eqcol__label">${label}</span>
          <div class="vwrap"><input class="vrange vrange--bi" type="range" min="-26" max="6" step="0.5" value="0" data-eq="${band}" aria-label="${label} EQ"></div>
          <span class="eqcol__val" data-val="${band}">0</span>
        </div>`;
      const loops = LOOP_BEATS.map(
        (b) => `<button class="loop" type="button" data-loop="${b}">${b}박</button>`
      ).join('');
      const hots = [0, 1, 2, 3]
        .map((i) => `<button class="hot" type="button" data-hot="${i}"><b>${i + 1}</b><span>—</span></button>`)
        .join('');
      return `
        <div class="deck__top">
          <span class="deck__tag">DECK ${id}</span>
          <div class="track">
            <span class="track__name is-empty" data-el="name">곡을 불러오세요</span>
            <span class="track__meta">
              <b data-el="time">0:00.0</b><span class="sep"></span>
              <i data-el="bpm">— BPM</i><span class="sep"></span>
              <i data-el="pitch">0.0%</i>
            </span>
          </div>
          <label class="btn btn--load" data-act="load">＋ 곡
            <input class="filehit" type="file" accept="audio/*,.mp3,.m4a,.mp4,.aac,.wav,.aif,.aiff,.caf,.flac,.ogg,.oga,.opus,.webm,.m4b" data-el="file">
          </label>
        </div>
        <div class="wavewrap">
          <canvas class="wave" data-el="wave"></canvas>
          <div class="wavewrap__empty" data-el="empty">곡을 불러오면 파형이 표시됩니다</div>
          <div class="wavewrap__drop">여기에 파일을 놓으세요</div>
          <div class="wavewrap__badge" data-el="badge" hidden></div>
        </div>
        <div class="deck__mid">
          <div class="platter"><canvas class="jog" data-el="jog"></canvas></div>
          <div class="controls">
            <div class="transport">
              <button class="btn btn--cue" type="button" data-act="cue">CUE</button>
              <button class="btn btn--play" type="button" data-act="play"><span data-el="playicon">▶</span></button>
              <button class="btn btn--sync" type="button" data-act="sync">SYNC</button>
            </div>
            <div class="hots">${hots}</div>
            <div class="loops">${loops}</div>
          </div>
        </div>
        <div class="deck__mix">
          <div class="eq3">
            ${eqCol('high', 'HIGH')}${eqCol('mid', 'MID')}${eqCol('low', 'LOW')}
          </div>
          <div class="filterbox">
            <canvas class="knob" data-el="knob" width="104" height="104" aria-label="필터 노브"></canvas>
            <span class="filterbox__label">FILTER</span>
            <span class="filterbox__val" data-el="filterval">OFF</span>
          </div>
          <div class="pitchbox">
            <span class="pitchbox__label">피치 ±16%</span>
            <div class="hwraph"><input class="hrange hrange--bi" type="range" min="-16" max="16" step="0.1" value="0" data-el="pitch" aria-label="피치"></div>
            <span class="pitchbox__val" data-el="pitchval">0.0%</span>
          </div>
          <div class="volbox">
            <span class="volbox__label">VOL</span>
            <div class="vwrap"><input class="vrange" type="range" min="0" max="100" value="85" data-el="vol" aria-label="채널 볼륨"></div>
            <span class="volbox__val" data-el="volval">85</span>
          </div>
        </div>`;
    }

    _q() {
      const q = (s) => this.root.querySelector(s);
      this.els = {
        name: q('[data-el="name"]'),
        time: q('[data-el="time"]'),
        bpmEl: q('[data-el="bpm"]'),
        pitchEl: q('[data-el="pitch"]'),
        file: q('[data-el="file"]'),
        wave: q('[data-el="wave"]'),
        empty: q('[data-el="empty"]'),
        badge: q('[data-el="badge"]'),
        jog: q('[data-el="jog"]'),
        playIcon: q('[data-el="playicon"]'),
        knob: q('[data-el="knob"]'),
        filterVal: q('[data-el="filterval"]'),
        pitch: q('[data-el="pitch"]'),
        pitchVal: q('[data-el="pitchval"]'),
        vol: q('[data-el="vol"]'),
        volVal: q('[data-el="volval"]'),
        play: q('[data-act="play"]'),
        cueBtn: q('[data-act="cue"]'),
        syncBtn: q('[data-act="sync"]'),
      };
      this.eqInputs = {};
      this.eqVals = {};
      this.root.querySelectorAll('[data-eq]').forEach((el) => {
        this.eqInputs[el.dataset.eq] = el;
        this.eqVals[el.dataset.eq] = this.root.querySelector(`[data-val="${el.dataset.eq}"]`);
      });
      this.hotEls = [...this.root.querySelectorAll('[data-hot]')];
      this.loopEls = [...this.root.querySelectorAll('[data-loop]')];
    }

    /* ---------------- audio graph ---------------- */
    _buildGraph() {
      const ctx = this.audio.ensure();
      this.srcGain = ctx.createGain();
      this.srcGain.gain.value = 1;

      this.low = ctx.createBiquadFilter();
      this.low.type = 'lowshelf';
      this.low.frequency.value = 220;
      this.mid = ctx.createBiquadFilter();
      this.mid.type = 'peaking';
      this.mid.frequency.value = 1100;
      this.mid.Q.value = 1.0;
      this.high = ctx.createBiquadFilter();
      this.high.type = 'highshelf';
      this.high.frequency.value = 4200;

      this.lpf = ctx.createBiquadFilter();
      this.lpf.type = 'lowpass';
      this.lpf.frequency.value = 20000;
      this.lpf.Q.value = 0.7;
      this.hpf = ctx.createBiquadFilter();
      this.hpf.type = 'highpass';
      this.hpf.frequency.value = 20;
      this.hpf.Q.value = 0.7;

      this.chanGain = ctx.createGain();
      this.chanGain.gain.value = this.volume;
      this.xfGain = ctx.createGain();
      this.xfGain.gain.value = 0.707;

      this.srcGain
        .connect(this.low)
        .connect(this.mid)
        .connect(this.high)
        .connect(this.lpf)
        .connect(this.hpf)
        .connect(this.chanGain)
        .connect(this.xfGain)
        .connect(this.audio.masterGain);
    }

    /* 오디오 컨텍스트가 새로 만들어졌을 때 그래프 다시 연결 */
    rebuildGraph() {
      this._killSource(0);
      this.playing = false;
      this._voice = null;
      this._pendingSeek = null;
      this._buildGraph();
      ['low', 'mid', 'high'].forEach((b) => this.setEq(b, this.eq[b]));
      this.setFilter(this.filter);
      this.setPitch(this.pitch);
      this.setVolume(this.volume);
      this._syncTransportUI();
    }

    _wire() {
      const r = this.root;
      /* iOS Safari 는 display:none 인 file input 의 programmatic click 을 무시한다.
         입력을 버튼 위에 opacity:0 으로 겹쳐 두고 손가락이 입력을 직접 누르게 한다. */
      this.els.file.addEventListener('change', (e) => {
        const input = e.target;
        const f = input.files && input.files[0];
        if (!f) return;
        /* 파일을 다 읽고 디코딩할 때까지 value 를 비우지 않는다
           (iOS 에서 먼저 비우면 File 접근이 막힌다) */
        Promise.resolve(this.loadFile(f)).then(
          () => { try { input.value = ''; } catch (err) { /* noop */ } },
          () => { try { input.value = ''; } catch (err) { /* noop */ } }
        );
      });

      this.els.play.addEventListener('click', () => this.toggle());
      this.els.cueBtn.addEventListener('click', () => this.cueAction());
      this.els.syncBtn.addEventListener('click', () => this.app.sync(this));

      this.hotEls.forEach((el) => {
        const i = +el.dataset.hot;
        el.addEventListener('pointerdown', (e) => {
          el.setPointerCapture(e.pointerId);
          this._hotLong = false;
          clearTimeout(this._hotTimer);
          this._hotTimer = setTimeout(() => {
            this._hotLong = true;
            this.clearHotcue(i);
            this.app.toast(`핫큐 ${i + 1} 삭제`);
          }, 550);
        });
        el.addEventListener('pointerup', () => {
          clearTimeout(this._hotTimer);
          if (this._hotLong) { this._hotLong = false; return; }
          this.hotcue(i);
        });
        el.addEventListener('pointercancel', () => clearTimeout(this._hotTimer));
      });

      this.loopEls.forEach((el) => {
        el.addEventListener('click', () => this.toggleLoop(+el.dataset.loop));
      });

      Object.keys(this.eqInputs).forEach((band) => {
        const el = this.eqInputs[band];
        const apply = () => this.setEq(band, +el.value);
        el.addEventListener('input', apply);
      });

      this.els.pitch.addEventListener('input', () => this.setPitch(+this.els.pitch.value));
      this.els.vol.addEventListener('input', () => this.setVolume(+this.els.vol.value / 100));

      /* 파형 스크러빙 */
      this.els.wave.addEventListener('pointerdown', (e) => this._scrubStart(e));
      this.els.wave.addEventListener('pointermove', (e) => this._scrubMove(e));
      this.els.wave.addEventListener('pointerup', (e) => this._scrubEnd(e));
      this.els.wave.addEventListener('pointercancel', (e) => this._scrubEnd(e));

      /* 조그휠 */
      this.els.jog.addEventListener('pointerdown', (e) => this._jogStart(e));
      this.els.jog.addEventListener('pointermove', (e) => this._jogMove(e));
      this.els.jog.addEventListener('pointerup', (e) => this._jogEnd(e));
      this.els.jog.addEventListener('pointercancel', (e) => this._jogEnd(e));

      /* 필터 노브 */
      this._wireKnob();

      /* 드래그&드롭 */
      ['dragenter', 'dragover'].forEach((ev) =>
        r.addEventListener(ev, (e) => {
          e.preventDefault();
          r.classList.add('is-drop');
        })
      );
      ['dragleave', 'drop'].forEach((ev) =>
        r.addEventListener(ev, (e) => {
          e.preventDefault();
          if (ev === 'dragleave' && r.contains(e.relatedTarget)) return;
          r.classList.remove('is-drop');
        })
      );
      r.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this.loadFile(f);
      });
    }

    // 파일 로드
    async loadFile(file) {
      if (!file) return false;
      const ctx = this.audio.ensure();
      this.audio.unlockSync();
      const pretty = file.name.replace(/\.[^.]+$/, '');
      const prevName = this.buffer ? this.name : null;
      this.els.name.textContent = '불러오는 중… ' + pretty;
      this.els.name.classList.remove('is-empty');
      try {
        const buf = await DJ.decodeFile(ctx, file);
        this.setBuffer(buf, pretty);
        this.app.toast(`DECK ${this.id} · ${pretty} (${DJ.fmtTime(buf.duration)})`);
        return true;
      } catch (err) {
        this.els.name.textContent = prevName || '곡을 불러오세요';
        this.els.name.classList.toggle('is-empty', !prevName);
        const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        let why = '이 파일은 열 수 없어요.';
        if (ext === '.m4p') why = '애플뮤직에서 받은 보호 파일(.m4p)은 열 수 없어요.';
        else if (ext === '.mid' || ext === '.midi') why = 'MIDI 파일은 지원하지 않아요.';
        else if (!file.size) why = '파일이 비어 있어요.';
        this.app.toast(why + ' MP3 · M4A · WAV 로 다시 시도해 주세요.');
        return false;
      }
    }

    setBuffer(buf, name) {
      this._killSource(0);
      this.playing = false;
      this.buffer = buf;
      this.name = name || '이름 없는 곡';
      this.duration = buf.duration;
      this.offset = 0;
      this.cue = 0;
      this.cueSet = false;
      this.hotcues = [null, null, null, null];
      this.loop = null;
      this.bpm = DJ.detectBpm(buf);
      this.peaks = null;
      this.els.name.textContent = this.name;
      this.els.name.classList.remove('is-empty');
      this.els.empty.hidden = true;
      this._buildWaveCache();
      this._syncTransportUI();
      this._syncLoopUI();
      this._syncHotUI();
    }

    /* ---------------- transport ---------------- */
    get t() { return this.audio.ctx.currentTime; }

    effectiveBpm() {
      return this.bpm ? Math.round(this.bpm * this.rate * 10) / 10 : null;
    }

    position() {
      if (!this.buffer) return 0;
      if (!this.playing) return this.offset;
      let p = this.offset + (this.t - this.startedAt) * this.rate;
      if (this.loop) {
        const len = this.loop.end - this.loop.start;
        if (len > 0.05 && p >= this.loop.start) p = this.loop.start + ((p - this.loop.start) % len);
      }
      return DJ.clamp(p, 0, this.duration);
    }

    _start(pos) {
      const ctx = this.audio.ctx;
      if (!this.buffer) return;
      if (!this.audio.running) this.audio.unlockSync();
      pos = DJ.clamp(pos, 0, Math.max(0, this.duration - 0.002));
      this._killSource(0.008, true);

      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.playbackRate.value = this.rate;
      if (this.loop && this.loop.end - this.loop.start > 0.05) {
        src.loop = true;
        src.loopStart = DJ.clamp(this.loop.start, 0, this.duration);
        src.loopEnd = DJ.clamp(this.loop.end, 0, this.duration);
      }
      const g = ctx.createGain();
      const t0 = ctx.currentTime + 0.004;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, t0 + 0.006);
      src.connect(g).connect(this.srcGain);
      src.start(t0, pos);
      src.onended = () => {
        if (this._voice && this._voice.src === src) {
          this._voice = null;
          this.playing = false;
          this.offset = this.loop ? this.loop.start : this.duration;
          this._syncTransportUI();
        }
      };
      this._voice = { src, g };
      this.offset = pos;
      this.startedAt = t0;
      this.playing = true;
      this._lastStart = performance.now();
      this._pendingSeek = null;
      this._syncTransportUI();
    }

    _killSource(fade, keepPlaying) {
      const v = this._voice;
      if (!v) return;
      this._voice = null;
      const ctx = this.audio.ctx;
      const t = ctx.currentTime;
      try {
        if (fade > 0) {
          v.g.gain.cancelScheduledValues(t);
          v.g.gain.setValueAtTime(v.g.gain.value, t);
          v.g.gain.linearRampToValueAtTime(0.0001, t + fade);
          v.src.stop(t + fade + 0.01);
        } else {
          v.src.stop();
        }
      } catch (e) { /* 이미 정지 */ }
      if (!keepPlaying && this.playing) {
        // _start가 아닌 단독 정지
      }
    }

    toggle() {
      /* 터치와 클릭이 겹쳐 두 번 실행되면 켜졌다 바로 꺼지는 일이 생긴다.
         80ms 안에 들어온 중복 호출은 같은 탭으로 보고 무시한다. */
      const now = performance.now();
      if (now - (this._tg || 0) < 80) return;
      this._tg = now;
      if (this.playing) this.pause();
      else this.play();
    }

    play() {
      if (!this.buffer) {
        this.audio.unlockSync();
        this.app.toast('먼저 곡을 불러오세요');
        return;
      }
      /* iOS: 재생 예약 전에 동기적으로 resume */
      const live = this.audio.unlockSync();
      if (this.playing) return;
      let pos = this.offset;
      if (pos >= this.duration - 0.03) pos = this.loop ? this.loop.start : 0;
      this._start(pos);
      if (!live) this.app.toast('화면을 한 번 탭하면 소리가 켜져요');
    }

    pause() {
      if (!this.playing) return;
      const p = this.position();
      this._killSource(0.01);
      this.playing = false;
      this.offset = p;
      this._syncTransportUI();
    }

    stop() {
      this._killSource(0.01);
      this.playing = false;
      this.offset = this.loop ? this.loop.start : 0;
      this._syncTransportUI();
    }

    seek(pos) {
      if (!this.buffer) return;
      pos = DJ.clamp(pos, 0, this.duration);
      this.offset = pos;
      if (this.playing) {
        this._pendingSeek = pos;
        const now = performance.now();
        if (now - this._lastStart > 30) this._start(pos);
      }
    }

    _flushPending() {
      if (this.playing && this._pendingSeek != null && performance.now() - this._lastStart > 30) {
        const p = this._pendingSeek;
        this._pendingSeek = null;
        this._start(p);
      }
    }

    cueAction() {
      if (!this.buffer) {
        this.app.toast('먼저 곡을 불러오세요');
        return;
      }
      if (!this.cueSet) {
        this.cue = this.position();
        this.cueSet = true;
        this._syncTransportUI();
        return;
      }
      if (this.playing) {
        this.pause();
        this.offset = this.cue;
        this._syncTransportUI();
      } else {
        this.offset = this.cue;
        this.play();
      }
      this._syncTransportUI();
    }

    hotcue(i) {
      if (!this.buffer) {
        this.app.toast('먼저 곡을 불러오세요');
        return;
      }
      if (this.hotcues[i] == null) {
        this.hotcues[i] = this.position();
        this._syncHotUI();
        return;
      }
      const p = this.hotcues[i];
      if (this.playing) {
        this._start(p);
      } else {
        this.offset = p;
        this.play();
      }
    }

    clearHotcue(i) {
      this.hotcues[i] = null;
      this._syncHotUI();
    }

    toggleLoop(beats) {
      if (!this.buffer) {
        this.app.toast('먼저 곡을 불러오세요');
        return;
      }
      if (this.loop && this.loop.beats === beats) {
        this.loop = null;
      } else {
        const bpm = this.effectiveBpm() || 120;
        const len = beats * (60 / bpm);
        let start = this.position();
        // 곡 끝을 넘어가면 루프가 잘리므로, 온전한 길이가 들어가도록 시작점을 당긴다
        if (start + len > this.duration) start = Math.max(0, this.duration - len);
        this.loop = {
          start,
          end: Math.min(this.duration, start + len),
          beats,
        };
      }
      this._applyLoop();
      this._syncLoopUI();
    }

    _applyLoop() {
      if (this.playing) {
        this.offset = this.position();
        this.startedAt = this.t;
      }
      const v = this._voice;
      if (v) {
        if (this.loop) {
          v.src.loop = true;
          v.src.loopStart = this.loop.start;
          v.src.loopEnd = Math.max(this.loop.start + 0.05, this.loop.end);
        } else {
          v.src.loop = false;
        }
      }
    }

    setPitch(pct) {
      pct = DJ.clamp(pct, -16, 16);
      if (this.playing) {
        this.offset = this.position();
        this.startedAt = this.t;
      }
      this.pitch = pct;
      this.rate = 1 + pct / 100;
      if (this._voice) this._voice.src.playbackRate.setTargetAtTime(this.rate, this.t, 0.01);
      this.els.pitch.value = String(pct);
      this.els.pitchVal.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
      this._fill(this.els.pitch, ((pct + 16) / 32) * 100, 50);
      this._syncMetaUI();
    }

    setEq(band, db) {
      this.eq[band] = db;
      const node = this[band];
      if (node) node.gain.setTargetAtTime(db, this.t, 0.02);
      const valEl = this.eqVals[band];
      if (valEl) {
        valEl.textContent = db > 0 ? '+' + db : String(db);
        valEl.style.color = db === 0 ? '' : db > 0 ? 'var(--warn)' : 'var(--acc)';
      }
      this._fill(this.eqInputs[band], ((db + 26) / 32) * 100, (26 / 32) * 100);
    }

    setFilter(v) {
      this.filter = DJ.clamp(v, -1, 1);
      const t = this.t;
      if (this.filter < 0) {
        const k = Math.pow(300 / 20000, -this.filter);
        this.lpf.frequency.setTargetAtTime(DJ.clamp(20000 * k, 120, 20000), t, 0.02);
        this.hpf.frequency.setTargetAtTime(20, t, 0.02);
      } else if (this.filter > 0) {
        const k = Math.pow(6000 / 20, this.filter);
        this.hpf.frequency.setTargetAtTime(DJ.clamp(20 * k, 20, 9000), t, 0.02);
        this.lpf.frequency.setTargetAtTime(20000, t, 0.02);
      } else {
        this.lpf.frequency.setTargetAtTime(20000, t, 0.02);
        this.hpf.frequency.setTargetAtTime(20, t, 0.02);
      }
      const pct = Math.round(this.filter * 100);
      this.els.filterVal.textContent =
        this.filter === 0 ? 'OFF' : (pct > 0 ? 'HPF ' + pct : 'LPF ' + -pct);
      this.drawKnob();
    }

    setVolume(v) {
      this.volume = DJ.clamp(v, 0, 1);
      this.chanGain.gain.setTargetAtTime(this.volume, this.t, 0.02);
      this.els.volVal.textContent = Math.round(this.volume * 100);
      this._fill(this.els.vol, this.volume * 100);
    }

    setCrossfade(v) {
      this.xfGain.gain.setTargetAtTime(v, this.t, 0.02);
    }

    resetFx() {
      ['low', 'mid', 'high'].forEach((b) => {
        this.eqInputs[b].value = '0';
        this.setEq(b, 0);
      });
      this.setFilter(0);
      this.setPitch(0);
      if (this.loop) { this.loop = null; this._applyLoop(); this._syncLoopUI(); }
      this.els.syncBtn.classList.remove('is-on');
    }

    _fill(el, pct, zeroPct) {
      if (!el) return;
      const p = DJ.clamp(pct, 0, 100).toFixed(1) + '%';
      if (zeroPct == null) {
        el.style.setProperty('--fill', p);
        return;
      }
      const z = DJ.clamp(zeroPct, 0, 100);
      const lo = Math.min(pct, z).toFixed(1) + '%';
      const hi = Math.max(pct, z).toFixed(1) + '%';
      el.style.setProperty('--f0', lo);
      el.style.setProperty('--f1', hi);
    }

    /* ---------------- scrubbing / jog ---------------- */
    _scrubStart(e) {
      if (!this.buffer) return;
      this.els.wave.setPointerCapture(e.pointerId);
      this._scrubbing = true;
      this._scrubTo(e);
    }
    _scrubMove(e) {
      if (!this._scrubbing) return;
      this._scrubTo(e);
    }
    _scrubEnd(e) {
      if (!this._scrubbing) return;
      this._scrubbing = false;
      try { this.els.wave.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    }
    _scrubTo(e) {
      if (!this.buffer) return;
      const r = this.els.wave.getBoundingClientRect();
      const x = DJ.clamp(e.clientX - r.left, 0, r.width);
      this.seek((x / r.width) * this.duration);
    }

    _jogStart(e) {
      if (!this.buffer) return;
      this.els.jog.setPointerCapture(e.pointerId);
      const r = this.els.jog.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      this._jog = {
        last: Math.atan2(e.clientY - cy, e.clientX - cx),
        base: this.position(),
        acc: 0,
        playing: this.playing,
      };
      if (this.playing) {
        this.offset = this.position();
        this.startedAt = this.t;
      }
    }

    _jogMove(e) {
      if (!this._jog) return;
      const r = this.els.jog.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const a = Math.atan2(e.clientY - cy, e.clientX - cx);
      let d = a - this._jog.last;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this._jog.last = a;
      this.angle += d;
      this._jog.acc += (d / (Math.PI * 2)) * 1.8; // 한 바퀴 ≈ 1.8초
      const target = DJ.clamp(this._jog.base + this._jog.acc, 0, this.duration);
      if (this.playing) {
        this._pendingSeek = target;
        this.offset = target;
        this.startedAt = this.t;
        const now = performance.now();
        if (now - this._lastStart > 32) this._start(target);
      } else {
        this.offset = target;
      }
    }

    _jogEnd(e) {
      if (!this._jog) return;
      try { this.els.jog.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      const wasPlaying = this._jog.playing;
      this._jog = null;
      if (wasPlaying && !this.playing) this.play();
    }

    /* ---------------- filter knob ---------------- */
    _wireKnob() {
      const cv = this.els.knob;
      let drag = null;
      let lastTap = 0;
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        const now = performance.now();
        if (now - lastTap < 320) {
          lastTap = 0;
          this.setFilter(0);
          drag = null;
          return;
        }
        lastTap = now;
        drag = { y: e.clientY, v: this.filter };
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dy = drag.y - e.clientY;
        this.setFilter(drag.v + (dy / 110) * 2);
      });
      const end = (e) => {
        if (!drag) return;
        drag = null;
        try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
    }

    drawKnob() {
      const cv = this.els.knob;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = 52;
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr);
        cv.height = Math.round(size * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2, rad = size / 2 - 5;
      const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
      const accent = getComputedStyle(this.root).getPropertyValue('--acc').trim() || '#22d3ee';

      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, start, start + sweep);
      ctx.stroke();

      const v = this.filter;
      const mid = start + sweep / 2;
      const ang = mid + (v * sweep) / 2;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, Math.min(mid, ang), Math.max(mid, ang));
      ctx.stroke();

      // 손잡이
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(-1.5, -rad + 1, 3, 10);
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (v === 0) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(cx - 1, 3, 2, 4);
      }
    }

    /* ---------------- waveform ---------------- */
    _fit(cv) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 1, h = cv.clientHeight || 1;
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
      return { w, h, dpr };
    }

    _buildWaveCache() {
      const cv = this.els.wave;
      const { w, h, dpr } = this._fit(cv);
      this._cacheW = w;
      this._cacheH = h;
      this._cacheDpr = dpr;
      if (!this.buffer || !w || !h) { this.peaks = null; return; }

      const cols = Math.max(8, Math.round(w));
      const ch = this.buffer.getChannelData(0);
      const ch2 = this.buffer.numberOfChannels > 1 ? this.buffer.getChannelData(1) : null;
      const step = ch.length / cols;
      const amp = new Float32Array(cols);
      for (let i = 0; i < cols; i++) {
        const s = Math.floor(i * step), e = Math.min(ch.length, Math.floor((i + 1) * step));
        let m = 0;
        for (let j = s; j < e; j += 3) {
          const v = Math.abs(ch[j]) + (ch2 ? Math.abs(ch2[j]) : 0);
          if (v > m) m = v;
        }
        amp[i] = Math.min(1, m / (ch2 ? 2 : 1));
      }
      this.peaks = amp;

      const accent = getComputedStyle(this.root).getPropertyValue('--acc').trim() || '#22d3ee';
      const paint = (baseColor, tipColor) => {
        const c = document.createElement('canvas');
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, baseColor);
        grad.addColorStop(0.5, tipColor);
        grad.addColorStop(1, baseColor);
        g.fillStyle = grad;
        const mid = h / 2;
        for (let i = 0; i < cols; i++) {
          const a = Math.max(0.03, amp[i]);
          const hh = Math.max(1.2, a * (h * 0.88));
          g.fillRect(i, mid - hh / 2, 1, hh);
        }
        return c;
      };
      this._cacheDim = paint('rgba(150,162,190,.34)', 'rgba(178,190,216,.55)');
      this._cacheHot = paint(accent, accent);
      this._cacheAccent = accent;
    }

    drawWave() {
      const cv = this.els.wave;
      if (!cv || !cv.clientWidth) return;
      if (!this.peaks || this._cacheW !== cv.clientWidth || this._cacheH !== cv.clientHeight) {
        this._buildWaveCache();
      }
      const { w, h, dpr } = this._fit(cv);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!this.buffer || !this._cacheDim) return;

      ctx.drawImage(this._cacheDim, 0, 0, w, h);

      const pos = this.position();
      const px = this.duration ? (pos / this.duration) * w : 0;

      // 재생된 구간
      if (px > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, px, h);
        ctx.clip();
        ctx.drawImage(this._cacheHot, 0, 0, w, h);
        ctx.restore();
      }

      // 루프 구간
      if (this.loop && this.duration) {
        const x1 = (this.loop.start / this.duration) * w;
        const x2 = (this.loop.end / this.duration) * w;
        ctx.fillStyle = 'rgba(251,191,36,.16)';
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), h);
        ctx.strokeStyle = 'rgba(251,191,36,.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1 + 0.5, 0); ctx.lineTo(x1 + 0.5, h);
        ctx.moveTo(x2 - 0.5, 0); ctx.lineTo(x2 - 0.5, h);
        ctx.stroke();
      }

      // CUE 마커
      if (this.cueSet) {
        const cx = (this.cue / this.duration) * w;
        ctx.fillStyle = this.playing ? '#fbbf24' : 'rgba(251,191,36,.75)';
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx + 7, 0);
        ctx.lineTo(cx, 7);
        ctx.closePath();
        ctx.fill();
      }

      // 핫큐 마커
      this.hotcues.forEach((hc, i) => {
        if (hc == null) return;
        const hx = (hc / this.duration) * w;
        ctx.fillStyle = this._cacheAccent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(hx - 0.5, h - 9, 1.6, 9);
        ctx.globalAlpha = 1;
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText(String(i + 1), hx + 2, h - 2);
      });

      // 재생 커서
      ctx.fillStyle = this.playing ? '#ffffff' : 'rgba(255,255,255,.85)';
      ctx.shadowColor = this._cacheAccent;
      ctx.shadowBlur = this.playing ? 8 : 0;
      ctx.fillRect(px - 1, 0, 2, h);
      ctx.shadowBlur = 0;
    }

    /* ---------------- jog draw ---------------- */
    drawJog(dt) {
      const cv = this.els.jog;
      if (!cv || !cv.clientWidth) return;
      if (this.playing && !this._jog) this.angle += dt * 3.1 * this.rate;
      const { w, h, dpr } = this._fit(cv);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2;
      const accent = this._cacheAccent || '#22d3ee';

      // 접시
      const g = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(52,60,80,.95)');
      g.addColorStop(0.72, 'rgba(24,29,40,.98)');
      g.addColorStop(1, 'rgba(12,15,21,1)');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.playing ? accent : 'rgba(255,255,255,.14)';
      ctx.shadowColor = accent;
      ctx.shadowBlur = this.playing ? 16 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 홈
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.angle);
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const r1 = R * 0.86, r2 = i % 3 === 0 ? R * 0.95 : R * 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      // 회전 표식
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(R * 0.7, 0, Math.max(2.5, R * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 중앙 허브
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,13,19,.96)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.stroke();
      ctx.fillStyle = this.playing ? accent : 'rgba(255,255,255,.5)';
      ctx.font = `700 ${Math.round(R * 0.34)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.id, cx, cy + 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    /* ---------------- UI sync ---------------- */
    _syncTransportUI() {
      this.els.play.classList.toggle('is-playing', this.playing);
      this.els.playIcon.textContent = this.playing ? '❚❚' : '▶';
      this.els.cueBtn.classList.toggle('is-on', this.cueSet && !this.playing);
      this._syncMetaUI();
    }

    _syncMetaUI() {
      const eb = this.effectiveBpm();
      const bpmTxt = eb ? eb.toFixed(1) + ' BPM' : '— BPM';
      if (this.els.bpmEl.textContent !== bpmTxt) this.els.bpmEl.textContent = bpmTxt;
      this.els.pitchEl.textContent = (this.pitch > 0 ? '+' : '') + this.pitch.toFixed(1) + '%';
    }

    _syncHotUI() {
      this.hotEls.forEach((el, i) => {
        const v = this.hotcues[i];
        el.classList.toggle('is-set', v != null);
        el.querySelector('span').textContent = v == null ? '—' : DJ.fmtTime(v);
      });
    }

    _syncLoopUI() {
      this.loopEls.forEach((el) => {
        el.classList.toggle('is-on', !!this.loop && this.loop.beats === +el.dataset.loop);
      });
      const b = this.els.badge;
      if (this.loop) {
        b.hidden = false;
        b.textContent = 'LOOP ' + this.loop.beats + '박';
        b.classList.add('is-loop');
      } else {
        b.hidden = true;
        b.classList.remove('is-loop');
      }
    }

    update(dt) {
      this._flushPending();
      const pos = this.position();
      const timeTxt = this.buffer
        ? DJ.fmtTime(pos) + ' / ' + DJ.fmtTime(this.duration)
        : '0:00.0';
      if (timeTxt !== this._last.time) {
        this.els.time.textContent = timeTxt;
        this._last.time = timeTxt;
      }
      this.drawWave();
      this.drawJog(dt);
    }

    state() {
      return {
        id: this.id,
        loaded: !!this.buffer,
        name: this.name,
        duration: this.duration,
        playing: this.playing,
        position: this.position(),
        rate: this.rate,
        pitch: this.pitch,
        bpm: this.bpm,
        effectiveBpm: this.effectiveBpm(),
        cue: this.cue,
        cueSet: this.cueSet,
        hotcues: this.hotcues.slice(),
        loop: this.loop ? { ...this.loop } : null,
        eq: { ...this.eq },
        filter: this.filter,
        volume: this.volume,
        xfGain: this.xfGain.gain.value,
        filters: {
          low: this.low.gain.value,
          mid: this.mid.gain.value,
          high: this.high.gain.value,
          lpf: this.lpf.frequency.value,
          hpf: this.hpf.frequency.value,
        },
      };
    }
  }

  DJ.Deck = Deck;
})();
