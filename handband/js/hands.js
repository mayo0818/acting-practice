/* =========================================================
   hands.js — MediaPipe HandLandmarker 래퍼
   CDN 로드 실패 · 카메라 없음 → 조용히 포인터 모드로
   ========================================================= */
(function (global) {
  'use strict';

  var VERSION = '0.10.14';
  var BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION;
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  function HandTracker() {
    this.ready = false;
    this.loading = false;
    this.failed = false;
    this.landmarker = null;
    this.lastTs = 0;
    this.raw = null;       // 21 랜드마크 (영상 좌표 0~1)
    this._smooth = null;
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
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
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

  function dist2(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* 매 프레임 호출. 반환: {x,y,tipX,tipY,fingers,pinch,scale,landmarks} 또는 null */
  HandTracker.prototype.detect = function (video, ts) {
    if (!this.ready || !this.landmarker || !video) return null;
    if (!video.videoWidth || video.readyState < 2) return null;

    var t = ts || (global.performance ? performance.now() : Date.now());
    if (t <= this.lastTs) t = this.lastTs + 1;
    this.lastTs = t;

    var res;
    try {
      res = this.landmarker.detectForVideo(video, t);
    } catch (e) {
      return null;
    }
    var lm = res && res.landmarks && res.landmarks[0];
    if (!lm || lm.length < 21) {
      this.raw = null;
      return null;
    }

    // 손 크기 기준 정규화 (0: 손목, 9: 중지 MCP)
    var dx = lm[9].x - lm[0].x, dy = lm[9].y - lm[0].y;
    var scale = Math.sqrt(dx * dx + dy * dy) || 0.001;

    var palm = {
      x: (lm[0].x * 0.18 + lm[5].x * 0.22 + lm[9].x * 0.24 + lm[13].x * 0.18 + lm[17].x * 0.18),
      y: (lm[0].y * 0.18 + lm[5].y * 0.22 + lm[9].y * 0.24 + lm[13].y * 0.18 + lm[17].y * 0.18)
    };

    var px = lm[4].x - lm[8].x, py = lm[4].y - lm[8].y;
    var pinchRaw = Math.sqrt(px * px + py * py) / scale;

    // 스무딩 (떨림 완화)
    if (!this._smooth) this._smooth = { x: palm.x, y: palm.y, p: pinchRaw };
    var a = 0.42;
    this._smooth.x += (palm.x - this._smooth.x) * a;
    this._smooth.y += (palm.y - this._smooth.y) * a;
    this._smooth.p += (pinchRaw - this._smooth.p) * 0.3;

    /* 검지 끝(랜드마커 8) — 조준 포인터용.
       떨림은 줄이되 움직임이 크면 빨리 따라가도록 적응형 스무딩 */
    var tipRaw = { x: lm[8].x, y: lm[8].y };
    if (!this._tip) this._tip = { x: tipRaw.x, y: tipRaw.y };
    var tdx = tipRaw.x - this._tip.x, tdy = tipRaw.y - this._tip.y;
    var tmove = Math.sqrt(tdx * tdx + tdy * tdy);
    var aTip = tmove > 0.035 ? 0.8 : (tmove > 0.012 ? 0.5 : 0.3);
    this._tip.x += tdx * aTip;
    this._tip.y += tdy * aTip;

    /* 편 손가락 개수 (엄지~새끼) — 손목에서 먼 쪽으로 판정 */
    var fingers = 0;
    var wrist = lm[0];
    var pairs = [[8, 6], [12, 10], [16, 14], [20, 18]];
    for (var f = 0; f < pairs.length; f++) {
      if (dist2(lm[pairs[f][0]], wrist) > dist2(lm[pairs[f][1]], wrist) * 1.12) fingers++;
    }
    if (dist2(lm[4], wrist) > dist2(lm[2], wrist) * 1.15) fingers++;

    this.raw = lm;
    return {
      x: this._smooth.x,
      y: this._smooth.y,
      tipX: this._tip.x,
      tipY: this._tip.y,
      fingers: fingers,
      pinch: this._smooth.p,
      scale: scale,
      landmarks: lm,
      handedness: (res.handedness && res.handedness[0] && res.handedness[0][0]) ? res.handedness[0][0].categoryName : ''
    };
  };

  HandTracker.prototype.reset = function () {
    this._smooth = null;
    this._tip = null;
    this.raw = null;
  };

  global.HB = global.HB || {};
  global.HB.HandTracker = HandTracker;
  global.HB.HAND_TASKS_VERSION = VERSION;
})(window);
