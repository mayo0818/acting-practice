/* =========================================================
   hands.js — MediaPipe Hand Landmarker (양손)
   · numHands: 2, VIDEO 모드
   · 손가락 개수(엄지 포함 0~5)를 시간축 다수결로 안정화
   · 좌/우 손 라벨 보정 스위치 (셀카 미러 기준)
   CDN 로드 실패 · 카메라 없음 → 조용히 터치 모드로
   ========================================================= */
(function (global) {
  'use strict';

  var VERSION = '0.10.14';
  var BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION;
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  var TIP = [4, 8, 12, 16, 20];
  var PIP = [3, 6, 10, 14, 18];
  var MCP = [2, 5, 9, 13, 17];

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) || 0.0001;
  }

  /* 손 21점 → 편 손가락 5개 판정 */
  function fingersOf(lm) {
    var wrist = lm[0];
    var palmSize = dist(lm[0], lm[9]) || 0.001;
    var out = [false, false, false, false, false];

    /* 엄지: 손목에서 멀어졌고 + 검지 관절에서 떨어졌으면 편 것 */
    var thumbFar = dist(lm[4], wrist) > dist(lm[3], wrist) * 1.09;
    var thumbOut = dist(lm[4], lm[5]) > palmSize * 0.62;
    out[0] = thumbFar && thumbOut;

    /* 나머지 네 손가락: 끝이 PIP보다 손목에서 멀면 편 것 */
    for (var i = 1; i < 5; i++) {
      var tip = lm[TIP[i]], pip = lm[PIP[i]], mcp = lm[MCP[i]];
      var straight = dist(tip, wrist) > dist(pip, wrist) * 1.075;
      var longEnough = dist(tip, mcp) > palmSize * 0.55;
      out[i] = straight && longEnough;
    }
    return out;
  }

  function countOf(lm) {
    var f = fingersOf(lm);
    var n = 0;
    for (var i = 0; i < f.length; i++) if (f[i]) n++;
    return { count: n, extended: f };
  }

  function HandTracker() {
    this.ready = false;
    this.loading = false;
    this.failed = false;
    this.landmarker = null;
    this.lastTs = 0;
    this.swap = true;          // 셀카 미러 기준 보정
    this._smooth = {};         // label → {hist:[], count:0, x:0, y:0, size:0}
    this.hands = [];           // 최근 프레임 결과
  }

  HandTracker.prototype.load = function () {
    var self = this;
    if (this.ready) return Promise.resolve(true);
    if (this._pending) return this._pending;

    this.loading = true;
    this._pending = import(BASE + '/vision_bundle.mjs')
      .then(function (mod) {
        return mod.FilesetResolver.forVisionTasks(BASE + '/wasm').then(function (vision) {
          var opts = {
            baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55
          };
          return mod.HandLandmarker.createFromOptions(vision, opts).catch(function () {
            opts.baseOptions.delegate = 'CPU';
            return mod.HandLandmarker.createFromOptions(vision, opts);
          }).then(function (lm) {
            self.landmarker = lm;
            self.ready = true;
            self.loading = false;
            return true;
          });
        });
      })
      .catch(function (err) {
        self.loading = false;
        self.failed = true;
        self.error = err;
        return false;
      });

    return this._pending;
  };

  HandTracker.prototype.reset = function () {
    this._smooth = {};
    this.hands = [];
  };

  /* 매 프레임 호출 — {hands:[{label,count,extended,x,y,size,landmarks}]} */
  HandTracker.prototype.detect = function (video, ts) {
    if (!this.ready || !this.landmarker || !video) return this.hands;
    if (!video.videoWidth || video.readyState < 2) return this.hands;

    var t = ts || (global.performance ? performance.now() : Date.now());
    if (t <= this.lastTs) t = this.lastTs + 1;
    this.lastTs = t;

    var res;
    try {
      res = this.landmarker.detectForVideo(video, t);
    } catch (e) {
      return this.hands;
    }

    var lms = (res && res.landmarks) || [];
    var handedness = (res && res.handednesses) || [];
    var out = [];

    for (var i = 0; i < lms.length; i++) {
      var lm = lms[i];
      if (!lm || lm.length < 21) continue;

      var raw = (handedness[i] && handedness[i][0] && handedness[i][0].categoryName) || '';
      var label = raw === 'Left' ? 'L' : (raw === 'Right' ? 'R' : '');
      if (this.swap && label) label = label === 'L' ? 'R' : 'L';
      if (!label) label = i === 0 ? 'L' : 'R';

      var c = countOf(lm);
      var palm = {
        x: (lm[0].x * 0.2 + lm[5].x * 0.2 + lm[9].x * 0.25 + lm[13].x * 0.2 + lm[17].x * 0.15),
        y: (lm[0].y * 0.2 + lm[5].y * 0.2 + lm[9].y * 0.25 + lm[13].y * 0.2 + lm[17].y * 0.15)
      };
      var size = dist(lm[0], lm[9]);

      out.push({
        label: label,
        raw: raw,
        count: c.count,
        extended: c.extended,
        x: palm.x,
        y: palm.y,
        size: size,
        landmarks: lm
      });
    }

    /* 같은 라벨이 둘이면 화면 위치로 갈라 둔다 */
    if (out.length === 2 && out[0].label === out[1].label) {
      var a = out[0], b = out[1];
      if (a.x > b.x) { a.label = 'R'; b.label = 'L'; }
      else { a.label = 'L'; b.label = 'R'; }
    }

    this.hands = out.map(this._stabilize, this);
    return this.hands;
  };

  /* 손가락 개수 흔들림 제거 — 최근 5프레임 다수결(동률이면 직전 값) */
  HandTracker.prototype._stabilize = function (h) {
    var s = this._smooth[h.label] || (this._smooth[h.label] = { hist: [], count: 0, mx: 0, my: 0 });
    s.hist.push(h.count);
    if (s.hist.length > 5) s.hist.shift();

    var tally = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < s.hist.length; i++) tally[s.hist[i]]++;
    var best = s.count, bestN = 0;
    for (var v = 0; v <= 5; v++) {
      if (tally[v] > bestN) { bestN = tally[v]; best = v; }
      else if (tally[v] === bestN && v === s.count) { best = v; }
    }
    s.count = best;

    var a = 0.4;
    s.mx = s.mx ? s.mx + (h.x - s.mx) * a : h.x;
    s.my = s.my ? s.my + (h.y - s.my) * a : h.y;

    var copy = {};
    for (var k in h) copy[k] = h[k];
    copy.count = s.count;
    copy.fx = s.mx;
    copy.fy = s.my;
    copy.fingers = h.extended;
    return copy;
  };

  global.HB = global.HB || {};
  global.HB.HandTracker = HandTracker;
  global.HB.fingersOf = fingersOf;
  global.HB.HAND_TASKS_VERSION = VERSION;
})(window);
