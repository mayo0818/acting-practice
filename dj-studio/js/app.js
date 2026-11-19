/* ===========================================================
   app.js — 화면 배선, 믹서·VU·크로스페이더, 오디오 잠금 해제, 단축키
   =========================================================== */
(function () {
  'use strict';
  const DJ = window.DJ;

  class App {
    constructor() {
      this.errors = [];
      window.addEventListener('error', (e) => {
        this.errors.push(String((e && e.message) || e));
      });
      window.addEventListener('unhandledrejection', (e) => {
        this.errors.push('unhandledrejection: ' + String((e && e.reason && e.reason.message) || (e && e.reason)));
      });

      this.audio = new DJ.AudioEngine();
      this.audio.ensure();
      DJ.lib = { noise: this.audio.noiseBuf, dist: this.audio._dist };

      this._cacheEls();
      this._paintAudio(this.audio.unlocked);
      this.decks = {
        A: new DJ.Deck(this, 'A', document.querySelector('.deck[data-deck="A"]')),
        B: new DJ.Deck(this, 'B', document.querySelector('.deck[data-deck="B"]')),
      };
      this.pads = new DJ.PadBank(this, document.getElementById('padgrid'), {
        mode: document.getElementById('padMode'),
        modeDesc: document.querySelector('[data-el="modedesc"]'),
        assignBtn: document.querySelector('[data-act="padassign"]'),
        clearBtn: document.querySelector('[data-act="padclear"]'),
        file: document.querySelector('[data-el="padfile"]'),
        selName: document.querySelector('[data-el="padselName"]'),
        selTag: document.querySelector('[data-el="padselTag"]'),
        vol: document.querySelector('[data-el="padvol"]'),
        volVal: document.querySelector('[data-el="padvolval"]'),
      });

      this._wireMixer();
      this._wireGlobal();
      this._fitFaders();
      this._applyCrossfade(50);
      this.decks.A.setVolume(0.85);
      this.decks.B.setVolume(0.85);
      this.audio.setPadVolume(+document.querySelector('[data-el="padvol"]').value / 100);
      this.audio.setMaster(+this.els.master.value / 100);

      this._lastT = performance.now();
      this._vuLast = 0;
      this._loop = this._loop.bind(this);
      requestAnimationFrame(() => this._fitFaders());
      requestAnimationFrame(this._loop);
      this._installTestApi();
      document.body.dataset.ready = '1';
    }

    _cacheEls() {
      const q = (s) => document.querySelector(s);
      this.els = {
        audioBadge: q('#audioBadge'),
        audioText: q('#audioText'),
        master: q('[data-el="master"]'),
        masterVal: q('[data-el="masterval"]'),
        xf: q('[data-el="xf"]'),
        vu: q('[data-el="vu"]'),
        masterBpm: q('[data-el="masterbpm"]'),
        helpModal: q('#helpModal'),
        toast: q('#toast'),
      };
    }

    _wireMixer() {
      this.els.master.addEventListener('input', () => {
        const v = +this.els.master.value;
        this.els.masterVal.textContent = v;
        this.els.master.style.setProperty('--fill', v + '%');
        this.audio.setMaster(v / 100);
      });
      this.els.master.style.setProperty('--fill', this.els.master.value + '%');

      this.els.xf.addEventListener('input', () => this._applyCrossfade(+this.els.xf.value));

      document.querySelector('[data-act="resetfx"]').addEventListener('click', () => {
        this.decks.A.resetFx();
        this.decks.B.resetFx();
        this.toast('EQ · 필터 · 피치 초기화');
      });
      document.querySelector('[data-act="stopall"]').addEventListener('click', () => {
        this.decks.A.stop();
        this.decks.B.stop();
        this.toast('두 데크 정지');
      });
    }

    /* resume 은 비동기라 상태가 곧바로 바뀌지 않는다.
       잠시 뒤에도 안 깨어나 있으면(구형 iOS) 컨텍스트를 새로 만든다. */
    _retryUnlock() {
      if (this._rescueT) return;
      this._rescueT = setTimeout(() => {
        this._rescueT = 0;
        if (this.audio.running) { this._paintAudio(true); return; }
        if (this.audio.rescueIfStuck()) this.toast('오디오 엔진을 다시 연결했어요. 재생을 눌러 주세요.');
        this._paintAudio(this.audio.running);
      }, 700);
    }

    _applyCrossfade(v) {
      const x = DJ.clamp(v, 0, 100) / 100;
      const ga = Math.cos(x * Math.PI * 0.5);
      const gb = Math.sin(x * Math.PI * 0.5);
      this.decks.A.setCrossfade(ga);
      this.decks.B.setCrossfade(gb);
      this.els.xf.style.setProperty('--fill', v + '%');
      this.xfValue = v;
    }

    _wireGlobal() {
      /* iOS/iPadOS 오디오 잠금 해제.
         pointerdown 만으로는 iOS Safari 가 잠금을 풀지 않는 경우가 많아
         touchstart·touchend·click·mousedown 에서도 '동기적으로' resume 한다. */
      const gesture = () => {
        const ok = this.audio.unlockSync();
        this._paintAudio(ok);
        if (!ok) this._retryUnlock();
      };
      ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach((ev) => {
        document.addEventListener(ev, gesture, { capture: true, passive: true });
      });

      this.els.audioBadge.addEventListener('click', async () => {
        const ok = await this.audio.unlock();
        this._paintAudio(ok);
        if (!ok) {
          this._retryUnlock();
          this.toast('오디오를 켜지 못했어요. 화면을 한 번 더 탭해 주세요.');
        }
      });
      window.addEventListener('dj:audio-state', () => this._paintAudio(this.audio.running));

      /* 컨텍스트를 새로 만든 경우(구형 iOS 구제) 데크 그래프를 다시 연결 */
      window.addEventListener('dj:ctx-rebuilt', () => {
        DJ.lib = { noise: this.audio.noiseBuf, dist: this.audio._dist };
        this.decks.A.rebuildGraph();
        this.decks.B.rebuildGraph();
        this.audio.setMaster(+this.els.master.value / 100);
        this.audio.setPadVolume(+document.querySelector('[data-el="padvol"]').value / 100);
        this._applyCrossfade(+this.els.xf.value);
        this._paintAudio(this.audio.running);
      });

      /* 첫 로드 후에도 잠겨 있으면 배지를 깜박여 안내 */
      setTimeout(() => {
        if (!this.audio.running) this.els.audioBadge.classList.add('is-call');
      }, 1400);
      window.addEventListener('dj:audio-state', () => {
        this.els.audioBadge.classList.toggle('is-call', !this.audio.running);
      });

      /* 도움말 */
      const open = () => { this.els.helpModal.hidden = false; };
      const close = () => { this.els.helpModal.hidden = true; };
      document.getElementById('helpBtn').addEventListener('click', open);
      document.getElementById('helpClose').addEventListener('click', close);
      this.els.helpModal.addEventListener('click', (e) => {
        if (e.target === this.els.helpModal) close();
      });

      /* 전체화면 */
      document.getElementById('fsBtn').addEventListener('click', async () => {
        try {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
          else await document.exitFullscreen();
        } catch (e) {
          this.toast('이 브라우저에서는 전체화면을 지원하지 않아요');
        }
      });

      /* 키보드 */
      const keyMap = {};
      this.pads.pads.forEach((p) => { keyMap[p.key] = p.index; });
      const down = new Set();
      window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === ' ') { e.preventDefault(); this.decks.A.toggle(); return; }
        if (k === 'enter') { e.preventDefault(); this.decks.B.toggle(); return; }
        if (k === 'arrowleft' || k === 'arrowright') {
          e.preventDefault();
          const step = k === 'arrowleft' ? -4 : 4;
          this.els.xf.value = String(DJ.clamp(+this.els.xf.value + step, 0, 100));
          this._applyCrossfade(+this.els.xf.value);
          return;
        }
        if (keyMap[k] != null && !down.has(k)) {
          down.add(k);
          const i = keyMap[k];
          this.pads.select(i);
          this.pads._down(i);
        }
      });
      window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (keyMap[k] != null) {
          down.delete(k);
          this.pads._up(keyMap[k]);
        }
      });

      window.addEventListener('blur', () => {
        down.clear();
        this.pads.pads.forEach((p) => this.pads._up(p.index));
      });

      /* 앱을 벗어났다 돌아오면 오디오 다시 깨우기 (iOS 는 'interrupted' 상태가 된다) */
      const wake = () => {
        const ctx = this.audio.ctx;
        if (!ctx) return;
        if (ctx.state !== 'running') {
          try {
            const p = ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) { /* noop */ }
        }
        this._paintAudio(this.audio.running);
      };
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) wake();
      });
      window.addEventListener('pageshow', wake);
      window.addEventListener('focus', wake);

      /* 화면 회전/크기 변경 */
      window.addEventListener('resize', () => {
        this._fitFaders();
        this.decks.A._buildWaveCache();
        this.decks.B._buildWaveCache();
      });
    }

    /* 세로형(회전) 슬라이더: 레이아웃 상자와 무관하게 실제 높이에 맞춰 폭을 맞춤 */
    _fitFaders() {
      document.querySelectorAll('.vwrap').forEach((w) => {
        const inp = w.querySelector('input');
        if (!inp) return;
        const h = w.clientHeight;
        if (!h) return;
        const th = Math.max(30, Math.min(40, w.clientWidth + 6));
        inp.style.width = h + 'px';
        inp.style.height = th + 'px';
        inp.style.marginLeft = h / -2 + 'px';
        inp.style.marginTop = th / -2 + 'px';
      });
    }

    _paintAudio(on) {
      const live = !!on;
      this.els.audioBadge.classList.toggle('is-live', live);
      this.els.audioBadge.classList.toggle('is-call', !live && this._booted);
      this.els.audioText.textContent = live ? '오디오 켜짐' : '탭해서 오디오 켜기';
      document.body.dataset.audio = live ? 'on' : 'off';
      if (live) this._booted = true;
    }

    sync(target) {
      const other = target === this.decks.A ? this.decks.B : this.decks.A;

      /* 이미 SYNC 중이면 두 번째 누름은 해제: 원래 속도(피치 0.0%)로 되돌린다 */
      if (target.els.syncBtn.classList.contains('is-on')) {
        target.setPitch(0);
        target.els.syncBtn.classList.remove('is-on');
        this.toast(`DECK ${target.id} SYNC 해제`);
        return;
      }

      if (!target.buffer || !other.buffer || !target.bpm || !other.bpm) {
        this.toast('두 데크에 곡을 불러와야 SYNC할 수 있어요');
        return;
      }
      const targetBpm = other.effectiveBpm();
      let rate = targetBpm / target.bpm;
      const clamped = DJ.clamp(rate, 0.84, 1.16);
      target.setPitch((clamped - 1) * 100);
      target._syncMetaUI();

      // 박자 위상 맞추기
      const beatB = 60 / target.effectiveBpm();
      const beatA = 60 / other.effectiveBpm();
      const phaseA = ((other.position() / beatA) % 1 + 1) % 1;
      const cur = ((target.position() / beatB) % 1 + 1) % 1;
      let delta = phaseA - cur;
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      const np = DJ.clamp(target.position() + delta * beatB, 0, target.duration);
      if (target.playing) target._start(np);
      else target.offset = np;

      /* 버튼은 해제할 때까지 켜진 상태로 둔다(두 번째 누름 = 해제의 기준) */
      target.els.syncBtn.classList.add('is-on');
      this.toast(`DECK ${target.id} SYNC → ${target.effectiveBpm().toFixed(1)} BPM`);
    }

    toast(msg) {
      const el = this.els.toast;
      el.textContent = msg;
      el.classList.add('is-on');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('is-on'), 1800);
    }

    /* ---------------- VU ---------------- */
    drawVU() {
      const cv = this.els.vu;
      if (!cv || !cv.clientWidth) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const lv = this.audio.levels();
      const segs = 22;
      const gap = 2;
      const barW = Math.max(8, (w - 12 - 6) / 2);
      const segH = (h - (segs - 1) * gap) / segs;

      const frac = (v) => {
        const db = 20 * Math.log10(Math.max(v, 1e-6));
        return DJ.clamp((db + 46) / 46, 0, 1);
      };
      const colorFor = (i, n) => {
        const t = i / (n - 1);
        if (t > 0.86) return '#fb7185';
        if (t > 0.66) return '#fbbf24';
        return '#4ade80';
      };

      const drawBar = (x, value, peak) => {
        const f = frac(value);
        const lit = Math.round(f * segs);
        for (let i = 0; i < segs; i++) {
          const y = h - (i + 1) * segH - i * gap;
          const on = i < lit;
          ctx.fillStyle = on ? colorFor(i, segs) : 'rgba(255,255,255,.055)';
          ctx.globalAlpha = on ? 0.92 : 1;
          const r = Math.min(2, segH / 2);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y, barW, segH, r);
          else ctx.rect(x, y, barW, segH);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const pf = frac(peak);
        if (pf > 0.02) {
          const y = h - pf * h;
          ctx.fillStyle = pf > 0.9 ? '#fb7185' : pf > 0.72 ? '#fbbf24' : '#d9f99d';
          ctx.fillRect(x, Math.max(0, y - 1), barW, 1.5);
        }
      };

      drawBar(6, lv.l, lv.peakL);
      drawBar(6 + barW + 6, lv.r, lv.peakR);
    }

    /* ---------------- main loop ---------------- */
    _loop(now) {
      const dt = Math.min(0.05, (now - this._lastT) / 1000) || 0.016;
      this._lastT = now;

      this.decks.A.update(dt);
      this.decks.B.update(dt);

      if (now - this._vuLast > 33) {
        this._vuLast = now;
        this.drawVU();
      }

      const ba = this.decks.A.effectiveBpm();
      const bb = this.decks.B.effectiveBpm();
      const shown = this.decks.A.playing && ba ? ba : bb || ba;
      const txt = shown ? shown.toFixed(1) : '—';
      if (this.els.masterBpm.textContent !== txt) this.els.masterBpm.textContent = txt;

      requestAnimationFrame(this._loop);
    }

    _installTestApi() {
      const self = this;
      window.__DJ = {
        version: '1.1.1',
        get errors() { return self.errors; },
        deck(id) { return self.decks[id.toUpperCase()].state(); },
        pads() { return self.pads.snapshot(); },
        audio() {
          const c = self.audio.ctx;
          return {
            state: c ? c.state : 'none',
            unlocked: self.audio.unlocked,
            sampleRate: c ? c.sampleRate : 0,
            master: c ? self.audio.masterGain.gain.value : 0,
            padVolume: c ? self.audio.padBus.gain.value : 0,
            session: self.audio.sessionType,
            gestures: self.audio._gestures,
            rebuilt: self.audio._rebuilt,
            silentEl: !!(self.audio._silentEl && !self.audio._silentEl.paused),
          };
        },
        /* 테스트용: iOS 에서 앱 전환 후처럼 컨텍스트를 잠근다 */
        suspend() {
          const c = self.audio.ctx;
          return c ? c.suspend().then(() => c.state, () => c.state) : Promise.resolve('none');
        },
        level() {
          const lv = self.audio.levels();
          return { l: lv.l, r: lv.r, peakL: lv.peakL, peakR: lv.peakR };
        },
        mixer() {
          return {
            crossfade: +self.els.xf.value,
            master: +self.els.master.value,
            aGain: self.decks.A.xfGain.gain.value,
            bGain: self.decks.B.xfGain.gain.value,
          };
        },
        layout() {
          const r = (el) => {
            const b = el.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
          };
          return {
            vw: window.innerWidth,
            vh: window.innerHeight,
            scrollW: document.documentElement.scrollWidth,
            scrollH: document.documentElement.scrollHeight,
            pads: [...document.querySelectorAll('[data-pad]')].map(r),
            deckA: r(document.querySelector('.deck[data-deck="A"]')),
            deckB: r(document.querySelector('.deck[data-deck="B"]')),
            mixer: r(document.querySelector('.mixer')),
            waveA: r(document.querySelector('.deck[data-deck="A"] .wave')),
          };
        },
      };
    }
  }

  function boot() {
    try {
      window.__app = new App();
    } catch (err) {
      document.body.innerHTML =
        '<div style="padding:24px;font:14px/1.6 -apple-system,sans-serif;color:#fff">' +
        '앱을 시작하지 못했습니다.<br><small style="color:#888">' + String(err) + '</small></div>';
      throw err;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
