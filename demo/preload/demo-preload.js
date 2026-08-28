/*
 * Demo preload for the deterministic demo / screenshot / video harness.
 *
 * Loaded ONLY by the demo BrowserWindows in demo/src/*.mjs. It implements the
 * exact production `window.electron` surface (see packages/shared/index.ts) with
 * deterministic stubs, plus shims for `navigator.mediaDevices` (a synthetic
 * microphone tone so the real useMicrophone analyser + level meter animate).
 *
 * URLs:
 *   index.html?demo=overview   → idle product state
 *   index.html?demo=live       → active meeting with Urdu transcript + English
 *   index.html?demo=telemetry  → PIPELINE_DEBUG dev panel (real M10 Phase 2 data)
 *
 * contextIsolation:false, sandbox:false, nodeIntegration:false (dev tooling only).
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const DEMO_MODE = params.get('demo') || 'overview';
  const PIPELINE_DEBUG = DEMO_MODE === 'telemetry';

  /* ---------- tiny event bus ---------- */
  function makeBus() {
    const subs = new Set();
    return {
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      emit(payload) {
        for (const fn of [...subs]) {
          try {
            fn(payload);
          } catch (err) {
            console.warn('[demo-preload] subscriber error', err);
          }
        }
      },
    };
  }

  const sttBus = makeBus();
  const translationBus = makeBus();
  const ttsBus = makeBus();
  const audioOutputBus = makeBus();
  const sessionBus = makeBus();
  const pipelineBus = makeBus();
  const audioDataSubs = new Set();
  const audioCancelSubs = new Set();

  /* ---------- window.electron contract ---------- */
  const api = {
    getAppStatus: async () => 'idle',

    getMicPermission: async () => 'granted',
    requestMicPermission: async () => 'granted',

    startStt: async () => {
      sttBus.emit({ type: 'started' });
      return { ok: true, provider: 'mock' };
    },
    sendSttAudio: () => {},
    stopStt: async () => {
      sttBus.emit({ type: 'stopped' });
    },
    onSttEvent: (h) => sttBus.subscribe(h),

    startTranslation: async () => {
      translationBus.emit({ type: 'translation:started', provider: 'mock' });
      return { ok: true, provider: 'mock' };
    },
    stopTranslation: async () => {
      translationBus.emit({ type: 'translation:stopped' });
    },
    onTranslationEvent: (h) => translationBus.subscribe(h),

    startTts: async () => {
      ttsBus.emit({ type: 'tts:started', provider: 'mock' });
      return { ok: true, provider: 'mock' };
    },
    stopTts: async () => {
      ttsBus.emit({ type: 'tts:stopped' });
    },
    onTtsEvent: (h) => ttsBus.subscribe(h),

    getAudioOutputDevices: async () => [
      { id: 'default', label: 'System Default', isDefault: true },
      { id: 'blackhole', label: 'BlackHole', isDefault: false },
    ],
    selectAudioOutput: async () => {},
    startAudioOutput: async () => {
      audioOutputBus.emit({ type: 'audio-output:started' });
      return { ok: true, provider: 'speaker' };
    },
    stopAudioOutput: async () => {
      audioOutputBus.emit({ type: 'audio-output:stopped' });
    },
    onAudioOutputEvent: (h) => audioOutputBus.subscribe(h),
    onAudioData: (h) => {
      audioDataSubs.add(h);
      return () => audioDataSubs.delete(h);
    },
    onAudioCancel: (h) => {
      audioCancelSubs.add(h);
      return () => audioCancelSubs.delete(h);
    },
    detectBlackHole: async () => true,

    startSession: async () => {
      sessionBus.emit({ type: 'session:started' });
      sessionBus.emit({
        type: 'session:status',
        stages: { stt: 'listening', translation: 'active', tts: 'active', audioOutput: 'active' },
      });
      translationBus.emit({ type: 'translation:started', provider: 'mock' });
      ttsBus.emit({ type: 'tts:started', provider: 'mock' });
      audioOutputBus.emit({ type: 'audio-output:started' });
      return { ok: true, sttProvider: 'mock', translationProvider: 'mock', ttsProvider: 'mock' };
    },
    stopSession: async () => {
      sessionBus.emit({ type: 'session:stopped' });
    },
    onSessionEvent: (h) => sessionBus.subscribe(h),

    pipelineDebugEnabled: PIPELINE_DEBUG,
    onPipelineEvent: (h) => pipelineBus.subscribe(h),
    reportPlaybackEvent: () => {},
  };

  Object.defineProperty(window, 'electron', { value: api, configurable: true });

  /* ---------- navigator.mediaDevices shims ---------- */
  const mediaDevices = navigator.mediaDevices || {};
  const devChange = new Set();

  const inputDevices = [
    { deviceId: 'demo-mic-main', kind: 'audioinput', label: 'MacBook Air Microphone' },
    { deviceId: 'demo-mic-blackhole', kind: 'audioinput', label: 'BlackHole 2ch' },
  ];
  const outputDevices = [
    { deviceId: 'default', kind: 'audiooutput', label: 'System Default' },
    { deviceId: 'demo-out-blackhole', kind: 'audiooutput', label: 'BlackHole 2ch' },
  ];

  function toneStream() {
    // A live synthetic mic stream so the real microphone analyser (RMS level
    // meter) and the STT ScriptProcessor path receive actual audio frames.
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctor();
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] =
        0.5 * Math.sin((2 * Math.PI * 180 * i) / ctx.sampleRate) +
        0.14 * Math.sin((2 * Math.PI * 220 * i) / ctx.sampleRate);
    }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = true;
    const dest = ctx.createMediaStreamDestination();
    node.connect(dest);
    node.start();
    if (ctx.state === 'suspended') ctx.resume();
    return dest.stream;
  }

  mediaDevices.enumerateDevices = () =>
    Promise.resolve([...inputDevices, ...outputDevices]);
  mediaDevices.getUserMedia = () => Promise.resolve(toneStream());
  mediaDevices.addEventListener = (type, h) => {
    if (type === 'devicechange' && h) devChange.add(h);
  };
  mediaDevices.removeEventListener = (type, h) => {
    if (type === 'devicechange') devChange.delete(h);
  };
  mediaDevices.getDisplayMedia = mediaDevices.getDisplayMedia || (() => Promise.reject(new Error('n/a')));

  if (mediaDevices !== navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
  }

  /* AudioContext.setSinkId is required by useAudioOutput feature detection. */
  if (typeof AudioContext !== 'undefined' && !AudioContext.prototype.setSinkId) {
    AudioContext.prototype.setSinkId = function () {
      return Promise.resolve();
    };
  }

  /* ---------- helpers ---------- */
  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function rectFor(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.max(0, Math.round(r.top)),
      bottom: Math.max(0, Math.round(r.bottom)),
      left: Math.max(0, Math.round(r.left)),
      right: Math.round(r.right),
    };
  }

  function collectRects() {
    const pipeline = rectFor('.pipeline-panel');
    return {
      docHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      meeting: rectFor('.meeting-section'),
      mic: rectFor('.mic-panel'),
      stt: rectFor('.stt-panel'),
      translation: rectFor('.translation-section'),
      tts: rectFor('.tts-section'),
      audioOutput: rectFor('.audio-output-section'),
      pipeline,
    };
  }

  function setAudioOutputToBlackHole() {
    const select = document.querySelector('.audio-output-section .device-select');
    if (!select) return false;
    const option = [...select.options].find((o) => /blackhole/i.test(o.textContent || ''));
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clickStartMeeting() {
    const btn = document.querySelector('.start-meeting-btn');
    if (btn) btn.click();
    return !!btn;
  }

  function hasMockProvider() {
    return /Mock \(dev\)/.test(document.body.innerText);
  }

  function publishReady() {
    window.__demo.rects = collectRects();
    window.__demo.ready = true;
  }

  const state = {
    mode: DEMO_MODE,
    ready: false,
    rects: null,
  };
  Object.defineProperty(window, '__demo', {
    value: state,
    configurable: true,
    enumerable: true,
  });

  /* ---------- scenarios ---------- */

  async function waitFor(cond, timeoutMs = 15000) {
    const started = Date.now();
    for (;;) {
      if (cond()) return true;
      if (Date.now() - started > timeoutMs) return false;
      await delay(120);
    }
  }

  async function overviewScenario() {
    // Idle product state: ready mic, BlackHole preselected as the target output device.
    await waitFor(() => document.querySelector('.mic-panel') && document.querySelector('.meeting-section'));
    await delay(350);
    setAudioOutputToBlackHole();
    await delay(450);
    publishReady();
  }

  async function liveScenario() {
    const SCENARIO = [
      { at: 0, fn: () => setAudioOutputToBlackHole() },
      { at: 400, fn: () => sttBus.emit({ type: 'partial', text: 'السلام علیکم' }) },
      { at: 1000, fn: () => sttBus.emit({ type: 'partial', text: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید' }) },
      { at: 1100, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید', english: 'Welcome,', interim: true }) },
      { at: 1700, fn: () => sttBus.emit({ type: 'final', text: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید' }) },
      { at: 1850, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید', english: 'Welcome, thank you for joining today\'s meeting.' }) },
      { at: 2000, fn: () => ttsBus.emit({ type: 'tts:speaking', text: 'Welcome, thank you for joining today\'s meeting.' }) },
      { at: 2400, fn: () => sttBus.emit({ type: 'partial', text: 'ہم اس پروڈکٹ کے لیے' }) },
      { at: 3000, fn: () => sttBus.emit({ type: 'partial', text: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں' }) },
      { at: 3100, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں', english: 'We are working on new features for this product.' }) },
      { at: 3600, fn: () => sttBus.emit({ type: 'final', text: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں' }) },
      { at: 3700, fn: () => ttsBus.emit({ type: 'tts:speaking', text: 'We are working on new features for this product.' }) },
      { at: 4100, fn: () => sttBus.emit({ type: 'partial', text: 'براہ کرم اپنی رائے شیئر کریں' }) },
      { at: 4600, fn: () => publishReady() },
    ];

    await waitFor(() => document.querySelector('.start-meeting-btn'));
    clickStartMeeting();

    if (!(await waitFor(hasMockProvider, 20000))) {
      console.warn('[demo-preload] provider rows never became visible (STT/mic did not start)');
    }

    const t0 = Date.now();
    for (const step of SCENARIO) {
      const waitMs = Math.max(0, t0 + step.at - Date.now());
      await delay(waitMs);
      step.fn();
    }
  }

  async function telemetryScenario() {
    const utterance = {
      id: 1,
      outcome: 'completed',
      speechStartApprox: false,
      urdu: "آج کی میٹنگ بہت اہم ہے",
      english: "Today's meeting is very important.",
      t: {
        speechStart: 1750000000000,
        firstPartial: null,
        sttFinal: 1750000001919,
        translationStart: 1750000001919,
        translationComplete: 1750000002331,
        ttsStart: 1750000002400,
        ttsFirstChunk: 1750000002899,
        ttsReady: 1750000003064,
        audioOutputStart: 1750000003200,
        audioOutputComplete: 1750000006137,
      },
      ms: {
        sttFirstPartialMs: null,
        sttFinalMs: 1919,
        translationMs: 412,
        ttsMs: 664,
        ttsFirstChunkMs: 499,
        audioOutputMs: 2937,
        endToEndMs: 5771,
        sttFinalToTranslationMs: 412,
        translationToTtsReadyMs: 664,
        ttsReadyToAudioOutMs: null,
        firstAudioMs: 2035,
        interimFirstAudioMs: null,
      },
    };

    const summary = {
      windowSize: 8,
      windowCap: 20,
      completedCount: 8,
      e2e: { lastMs: 5771, avgMs: 5771, minMs: null, maxMs: null },
    };

    await waitFor(() => document.querySelector('.meeting-section'));
    await delay(400);

    sessionBus.emit({ type: 'session:started' });
    sessionBus.emit({
      type: 'session:status',
      stages: { stt: 'listening', translation: 'active', tts: 'active', audioOutput: 'active' },
    });
    translationBus.emit({ type: 'translation:started', provider: 'mock' });
    ttsBus.emit({ type: 'tts:started', provider: 'mock' });
    audioOutputBus.emit({ type: 'audio-output:started' });
    ttsBus.emit({ type: 'tts:speaking', text: "Today's meeting is very important." });

    await delay(120);
    pipelineBus.emit({ type: 'pipeline:utterance', utterance });
    pipelineBus.emit({ type: 'pipeline:summary', summary });

    await delay(350);
    publishReady();
  }

  const runners = { overview: overviewScenario, live: liveScenario, telemetry: telemetryScenario };

  function boot() {
    const runner = runners[DEMO_MODE] || runners.overview;
    setTimeout(() => {
      runner().catch((err) => {
        console.warn('[demo-preload] scenario failed', err);
        publishReady();
      });
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();