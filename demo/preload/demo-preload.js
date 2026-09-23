/*
 * Demo preload for the deterministic demo / screenshot / video harness.
 *
 * Loaded ONLY by the demo BrowserWindows in demo/src/*.mjs. It implements the
 * exact production `window.electron` surface (see packages/shared/index.ts) with
 * deterministic stubs, plus shims for `navigator.mediaDevices` (a synthetic
 * microphone tone so the real useMicrophone analyser + level meter animate).
 *
 * URLs:
 *   index.html?demo=overview   → idle Home (meeting mode ready)
 *   index.html?demo=live       → active meeting with Urdu transcript + English
 *   index.html?demo=telemetry  → Settings → Performance PIPELINE_DEBUG panel
 *
 * The demo-Home UI is reached by faking an already-completed onboarding
 * (getPreferences → onboardingCompleted:true) and the current UI is driven with
 * stable `data-demo` anchors added to HomeScreen / PipelinePanel.
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

  /* ---------- window.electron contract (exact production surface) ---------- */
  const prefs = { onboardingCompleted: true, ttsVoiceId: null };

  const api = {
    getAppStatus: async () => 'idle',

    getPreferences: async () => ({ ok: true, preferences: { ...prefs } }),
    setPreferences: async (patch) => {
      Object.assign(prefs, patch);
      return { ok: true, preferences: { ...prefs } };
    },
    openExternal: async () => ({ ok: true }),

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

    getTtsVoices: async () => ({
      ok: true,
      voices: [
        { id: 'en-US-JennyNeural', name: 'Jenny — Natural', gender: 'female', source: 'azure', country: 'US' },
        { id: 'en-GB-SoniaNeural', name: 'Sonia — Natural', gender: 'female', source: 'azure', country: 'GB' },
        { id: 'en-IN-PrabhatNeural', name: 'Prabhat — Natural', gender: 'male', source: 'azure', country: 'IN' },
      ],
      development: false,
      provider: 'mock',
    }),
    testTtsVoice: async () => ({ ok: true, provider: 'mock' }),

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
    return {
      docHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      meeting: rectFor('[data-demo="meeting-card"]'),
      stt: rectFor('[data-demo="stt-card"]'),
      translation: rectFor('[data-demo="translation-card"]'),
      pipeline: rectFor('[data-demo="pipeline-panel"]'),
    };
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

  /* ---------- UI helpers ---------- */
  function buttonByText(text, selector = 'button') {
    return [...document.querySelectorAll(selector)].find(
      (el) => (el.textContent || '').trim() === text,
    );
  }

  async function waitFor(cond, timeoutMs = 25000) {
    const started = Date.now();
    for (;;) {
      if (cond()) return true;
      if (Date.now() - started > timeoutMs) return false;
      await delay(120);
    }
  }

  /** Wait for the Home view (onboarding is faked as already completed). */
  async function waitForHome() {
    return waitFor(
      () => document.querySelector('[data-demo="meeting-card"]') && document.querySelector('.home-screen'),
    );
  }

  /* ---------- scenarios ---------- */

  async function overviewScenario() {
    // Idle Home: meeting mode ready, STT/Translation cards empty.
    await waitForHome();
    await delay(450);
    publishReady();
  }

  async function liveScenario() {
    const SCENARIO = [
      { at: 300, fn: () => sttBus.emit({ type: 'partial', text: 'السلام علیکم' }) },
      { at: 900, fn: () => sttBus.emit({ type: 'partial', text: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید' }) },
      { at: 1000, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید', english: 'Welcome,', interim: true }) },
      { at: 1600, fn: () => sttBus.emit({ type: 'final', text: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید' }) },
      { at: 1750, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'السلام علیکم، آج کی میٹنگ میں خوش آمدید', english: 'Welcome, thank you for joining today\'s meeting.' }) },
      { at: 1900, fn: () => ttsBus.emit({ type: 'tts:speaking', text: 'Welcome, thank you for joining today\'s meeting.' }) },
      { at: 2300, fn: () => sttBus.emit({ type: 'partial', text: 'ہم اس پروڈکٹ کے لیے' }) },
      { at: 2900, fn: () => sttBus.emit({ type: 'partial', text: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں' }) },
      { at: 3000, fn: () => translationBus.emit({ type: 'translation:text', urdu: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں', english: 'We are working on new features for this product.' }) },
      { at: 3500, fn: () => sttBus.emit({ type: 'final', text: 'ہم اس پروڈکٹ کے لیے نئی فیچرز پر کام کر رہے ہیں' }) },
      { at: 3600, fn: () => ttsBus.emit({ type: 'tts:speaking', text: 'We are working on new features for this product.' }) },
      { at: 4000, fn: () => sttBus.emit({ type: 'partial', text: 'براہ کرم اپنی رائے شیئر کریں' }) },
      { at: 4500, fn: () => publishReady() },
    ];

    await waitForHome();
    const startBtn = buttonByText('Start Meeting');
    if (!startBtn) {
      console.warn('[demo-preload] Start Meeting button not found');
      return publishReady();
    }
    startBtn.click();

    await waitFor(() => (document.querySelector('[data-demo="meeting-card"]')?.innerText || '').includes('Active'));

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
      urdu: 'آج کی میٹنگ بہت اہم ہے',
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

    // Open Settings, then the Performance section with the pipeline panel.
    await waitForHome();
    const gear = document.querySelector('button[aria-label="Settings"]');
    if (!gear) {
      console.warn('[demo-preload] Settings button not found');
      return publishReady();
    }
    gear.click();
    await waitFor(() => document.querySelector('main[aria-label*="settings"], main[aria-label]'));

    const performanceBtn = buttonByText('Performance', 'button');
    if (performanceBtn) performanceBtn.click();
    await waitFor(() => document.querySelector('[data-demo="pipeline-panel"]'));

    // Simulate an active session so the panel's "Current Stage" is meaningful.
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

    await delay(500);
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