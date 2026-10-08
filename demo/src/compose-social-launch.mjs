/*
 * Creates portrait launch-video frames from real captured product screenshots.
 * Usage: ./node_modules/.bin/electron demo/src/compose-social-launch.mjs
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'demo', 'out', 'social-launch');
const WIDTH = 1080;
const HEIGHT = 1920;

app.commandLine.appendSwitch('force-device-scale-factor', '1');

function imageDataUri(filePath) {
  const data = fs.readFileSync(filePath);
  return `data:image/png;base64,${data.toString('base64')}`;
}

function socialImage(screenshotName, fallbackRelativePath) {
  const suppliedDirectory = process.env.SOCIAL_SCREENSHOTS_DIR;
  const suppliedPath = suppliedDirectory
    ? path.join(suppliedDirectory, screenshotName)
    : null;
  const sourcePath = suppliedPath && fs.existsSync(suppliedPath)
    ? suppliedPath
    : path.join(ROOT, fallbackRelativePath);
  return imageDataUri(sourcePath);
}

// Current release screenshots can be supplied at build time without committing them.
const SETUP = socialImage(
  'Screenshot 2026-10-08 at 11.33.32 AM.png',
  'docs/images/app-overview.png',
);
const LIVE = socialImage(
  'Screenshot 2026-10-08 at 11.33.47 AM.png',
  'docs/images/live-translation.png',
);
const CAPTIONS = socialImage(
  'Screenshot 2026-10-08 at 11.34.25 AM.png',
  'docs/images/live-translation.png',
);

const scenes = [
  { id: 'title', duration: 5, frame: '01-title.png' },
  { id: 'overview', duration: 6, frame: '02-overview.png' },
  { id: 'live', duration: 7, frame: '03-live.png' },
  { id: 'features', duration: 6, frame: '04-features.png' },
  { id: 'cta', duration: 6, frame: '05-cta.png' },
];

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
* { box-sizing: border-box; }
html, body { margin:0; width:100%; height:100%; overflow:hidden; background:#07111f; }
body { color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.scene { display:none; position:absolute; inset:0; overflow:hidden; padding:100px 76px; }
.scene.active { display:flex; flex-direction:column; align-items:center; }
.bg { position:absolute; inset:0; background:
 radial-gradient(900px 640px at 50% -80px, rgba(59,130,246,.35), transparent 68%),
 radial-gradient(760px 560px at 96% 88%, rgba(34,197,94,.22), transparent 63%),
 linear-gradient(145deg,#07111f 0%,#111b35 58%,#07111f 100%); }
.grid { position:absolute; inset:0; opacity:.25; background-image:linear-gradient(rgba(255,255,255,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.10) 1px,transparent 1px); background-size:54px 54px; mask-image:linear-gradient(to bottom,black,transparent 82%); }
.content { position:relative; z-index:1; width:100%; display:flex; flex:1; flex-direction:column; align-items:center; }
.brand { display:flex; align-items:center; gap:16px; color:#dbeafe; letter-spacing:.16em; font-size:25px; font-weight:700; text-transform:uppercase; }
.mark { display:grid; place-items:center; width:58px; height:58px; border-radius:18px; background:linear-gradient(135deg,#2563eb,#22c55e); color:white; font-size:29px; letter-spacing:-.05em; box-shadow:0 18px 40px rgba(37,99,235,.4); }
.eyebrow { margin-top:130px; color:#86efac; font-size:27px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }
h1 { margin:27px 0 0; max-width:850px; font-size:94px; line-height:1.02; letter-spacing:-.055em; text-align:center; }
.gradient { background:linear-gradient(90deg,#7dd3fc,#86efac); -webkit-background-clip:text; color:transparent; }
.lead { margin:38px 0 0; max-width:810px; color:#cbd5e1; font-size:36px; line-height:1.35; text-align:center; }
.pills { display:flex; flex-wrap:wrap; justify-content:center; gap:14px; margin-top:52px; }
.pill { padding:13px 20px; border:1px solid rgba(148,163,184,.45); border-radius:999px; background:rgba(15,23,42,.7); color:#e2e8f0; font-size:23px; font-weight:700; }
.pill.green { border-color:rgba(74,222,128,.6); color:#bbf7d0; }
.scene-heading { margin-top:76px; font-size:66px; line-height:1.08; letter-spacing:-.045em; text-align:center; }
.scene-copy { margin:24px 0 42px; max-width:790px; color:#cbd5e1; text-align:center; font-size:31px; line-height:1.34; }
.card { border:1px solid rgba(148,163,184,.3); border-radius:36px; overflow:hidden; background:#0f172a; box-shadow:0 40px 90px rgba(0,0,0,.45); }
.browser { display:flex; gap:10px; align-items:center; padding:17px 22px; border-bottom:1px solid rgba(148,163,184,.2); background:#111c31; }
.dot { width:13px; height:13px; border-radius:50%; background:#fb7185; } .dot.y { background:#fbbf24; } .dot.g { background:#4ade80; }
.browser span:last-child { margin-left:12px; color:#94a3b8; font-size:19px; }
.overview-card { width:520px; } .overview-card img { display:block; width:520px; height:auto; }
.live-card { width:574px; } .live-card img { display:block; width:574px; height:auto; }
.feature-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; width:100%; margin-top:36px; }
.feature { min-height:205px; padding:28px; border:1px solid rgba(148,163,184,.28); border-radius:28px; background:rgba(15,23,42,.78); }
.feature .icon { font-size:38px; } .feature h3 { margin:13px 0 8px; font-size:29px; letter-spacing:-.03em; } .feature p { margin:0; color:#cbd5e1; font-size:20px; line-height:1.35; }
.metric { margin-top:36px; width:100%; padding:20px 24px; border:1px solid rgba(96,165,250,.42); border-radius:24px; background:rgba(30,58,138,.26); color:#dbeafe; text-align:center; font-size:23px; }
.captions-preview { margin-top:32px; width:100%; padding:14px; border:1px solid rgba(148,163,184,.28); border-radius:28px; background:#020617; }
.captions-preview img { display:block; width:100%; border-radius:17px; }
.cta h1 { margin-top:150px; } .repo { margin-top:56px; padding:22px 28px; border-radius:22px; border:1px solid rgba(134,239,172,.5); background:rgba(20,83,45,.25); color:#dcfce7; font-size:24px; font-weight:700; text-align:center; word-break:break-word; }
.footer { position:absolute; left:76px; right:76px; bottom:65px; color:#94a3b8; font-size:20px; text-align:center; }
</style></head><body>
<section class="scene" id="title"><div class="bg"></div><div class="grid"></div><div class="content"><div class="brand"><div class="mark">Ur</div> Urdu-English Voice Interpreter</div><div class="eyebrow">Now available · v1.1.0</div><h1>Speak <span class="gradient">Urdu.</span><br/>Be understood<br/>in English.</h1><p class="lead">Real-time voice interpretation for macOS meetings.</p><div class="pills"><span class="pill green">Open source</span><span class="pill">macOS</span><span class="pill">Live captions</span></div></div><div class="footer">Built with Electron · React · TypeScript</div></section>
<section class="scene" id="overview"><div class="bg"></div><div class="grid"></div><div class="content"><div class="brand"><div class="mark">Ur</div> Meeting mode</div><h2 class="scene-heading">Ready before<br/><span class="gradient">your meeting starts.</span></h2><p class="scene-copy">Choose your microphone and audio route, then start with confidence.</p><div class="card overview-card"><div class="browser"><i class="dot"></i><i class="dot y"></i><i class="dot g"></i><span>Urdu-English Interpreter</span></div><img src="${SETUP}" /></div></div></section>
<section class="scene" id="live"><div class="bg"></div><div class="grid"></div><div class="content"><h2 class="scene-heading">Live Urdu in.<br/><span class="gradient">English out.</span></h2><p class="scene-copy">Follow the Urdu transcript and English translation as you speak.</p><div class="card live-card"><div class="browser"><i class="dot"></i><i class="dot y"></i><i class="dot g"></i><span>Live translation</span></div><img src="${LIVE}" /></div></div></section>
<section class="scene" id="features"><div class="bg"></div><div class="grid"></div><div class="content"><div class="brand"><div class="mark">Ur</div> Designed for meetings</div><h2 class="scene-heading">More than a<br/><span class="gradient">translator.</span></h2><div class="feature-grid"><article class="feature"><div class="icon">💬</div><h3>Live captions</h3><p>Keep reading while you speak.</p></article><article class="feature"><div class="icon">🎙️</div><h3>Streaming voice</h3><p>Translated speech starts early.</p></article><article class="feature"><div class="icon">📝</div><h3>Export transcripts</h3><p>Save your session as TXT or JSON.</p></article><article class="feature"><div class="icon">🎧</div><h3>Meeting routing</h3><p>Send English audio through BlackHole.</p></article></div><div class="captions-preview"><img src="${CAPTIONS}" /></div><div class="metric">Tested with Google Meet and Zoom using BlackHole routing.</div></div></section>
<section class="scene cta" id="cta"><div class="bg"></div><div class="grid"></div><div class="content"><div class="brand"><div class="mark">Ur</div> Urdu-English Voice Interpreter</div><h1>Make every<br/><span class="gradient">meeting clearer.</span></h1><p class="lead">Download the macOS app, explore the code, and help build better language access.</p><div class="pills"><span class="pill green">GPL-3.0</span><span class="pill">Free & open source</span></div><div class="repo">github.com/muhammadhasnainsaeed/urdu-english-interpreter</div></div><div class="footer">Urdu → English · macOS · v1.1.0</div></section>
</body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const htmlPath = path.join(OUT, 'frames.html');
fs.writeFileSync(htmlPath, html);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    show: false,
    backgroundColor: '#07111f',
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setBackgroundThrottling(false);
  await win.loadFile(htmlPath);
  await new Promise((resolve) => setTimeout(resolve, 400));

  for (const scene of scenes) {
    await win.webContents.executeJavaScript(`
      document.querySelectorAll('.scene').forEach((node) => node.classList.remove('active'));
      document.getElementById('${scene.id}').classList.add('active');
    `);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, scene.frame), image.toPNG());
    console.log(`[social-launch] rendered ${scene.frame}`);
  }

  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(scenes, null, 2));
  win.destroy();
  app.exit(0);
});
