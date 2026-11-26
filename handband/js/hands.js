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

  /* 매 프레임 호출. 반환: {x,y,pinch,scale,landmarks} 또는 null */
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

    this.raw = lm;
    return {
      x: this._smooth.x,
      y: this._smooth.y,
      pinch: this._smooth.p,
      scale: scale,
      landmarks: lm,
      handedness: (res.handedness && res.handedness[0] && res.handedness[0][0]) ? res.handedness[0][0].categoryName : ''
    };
  };

  HandTracker.prototype.reset = function () {
    this._smooth = null;
    this.raw = null;
  };

  global.HB = global.HB || {};
  global.HB.HandTracker = HandTracker;
  global.HB.HAND_TASKS_VERSION = VERSION;
})(window);
