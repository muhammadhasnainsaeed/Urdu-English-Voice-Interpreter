#!/usr/bin/env bash
# Builds docs/demo/demo-v1.0.0.mp4 from the composed 2304x1296 frames.
#
#   Scene clips (1080p30)     25.0s      5.0s      9.0s   10.0s    9.0s   7.0s    6.0s
#   01 title      02 overview 03 live    04 arch  05 routing 06 hl 07 oss   (51s)
#   Slow-zoom via zoompan for the screenshot scenes, static for typographic ones.
#   Crossfade chain (0.5s) → ~48s final, silent, CRF 20.
#
# Usage: bash demo/video/build-video.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/demo/out"
CLIPS="$OUT/clips"
FINAL="$ROOT/docs/demo/demo-v1.0.0.mp4"
POSTER="$ROOT/docs/images/demo-poster.png"

FF="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
FPROBE="${FFPROBE:-/opt/homebrew/bin/ffprobe}"

TITLE="Urdu-English-Voice-Interpreter v1.0.0 demo"
KEYWORDS="demo product overview"
DESC="Real-time Urdu to English voice interpreter for macOS meetings (v1.0.0)."
COPYRIGHT="2026 Urdu-English-Voice-Interpreter"
SHOW="Urdu->English Interpreter"

[[ -f "$FF" ]] || { echo "ffmpeg not found at $FF"; exit 1; }
[[ -f "$OUT/frames.json" ]] || { echo "run compose-frames.mjs first"; exit 1; }

rm -rf "$CLIPS"
mkdir -p "$CLIPS" "$(dirname "$FINAL")"

# ---- durations + zoom rates from frames.json --------------------------------
while IFS= read -r line; do DURS+=("$line"); done < <(node -e 'const f=require("'"$OUT"'/frames.json"); process.stdout.write(f.map(x=>x.duration).join("\n")+"\n")')
while IFS= read -r line; do ZOOMS+=("$line"); done < <(node -e 'const f=require("'"$OUT"'/frames.json"); const z=f.map(x=>x.zoom||0); process.stdout.write(z.join("\n")+"\n")')
while IFS= read -r line; do FRAMES+=("$line"); done < <(node -e 'const f=require("'"$OUT"'/frames.json"); process.stdout.write(f.map(x=>x.frame).join("\n")+"\n")')

N="${#DURS[@]}"
FPS=30
FADE=0.5
step_scale=30 # zoompan operates per input frame at 30 fps

echo "[video] composing $N scenes from demo/out/frames.json"

# ---- per-scene clips --------------------------------------------------------
for ((i = 0; i < N; i++)); do
  dur="${DURS[$i]}"
  frames_n=$(( $(awk -v d="$dur" 'BEGIN{printf "%d", d*30}') ))
  clip="$CLIPS/clip-$(printf '%02d' "$i").mp4"
  zoom="${ZOOMS[$i]}"
  base="scale=2880:1620:force_original_aspect_ratio=increase,crop=2880:1620"

  if (( $(awk -v z="$zoom" 'BEGIN{print (z>0)?1:0}') == 1 )); then
    step=$(awk -v z="$zoom" 'BEGIN{printf "%.8f", z/30}')
    vf="$base,zoompan=z='min(zoom+${step},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30"
  else
    vf="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080"
  fi

  "$FF" -y -loglevel error -loop 1 -framerate "$FPS" -t "$dur" -i "$OUT/${FRAMES[$i]}" \
    -vf "$vf" -frames:v "$frames_n" -r "$FPS" -pix_fmt yuv420p -an "$clip"

  got=$("$FPROBE" -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "$clip")
  if awk -v a="$got" -v b="$dur" 'BEGIN{exit !(a < b-0.25 || a > b+0.25)}'; then
    echo "[video] zoompan clip sanitized → static (expected ${dur}s got ${got}s)"
    "$FF" -y -loglevel error -loop 1 -framerate "$FPS" -t "$dur" -i "$OUT/${FRAMES[$i]}" \
      -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" \
      -frames:v "$frames_n" -r "$FPS" -pix_fmt yuv420p -an "$clip"
  else
    echo "[video] clip-$(printf '%02d' "$i") ${FRAMES[$i]} ${dur}s (zoom ${zoom})"
  fi
done

# ---- xfade chain offsets ----------------------------------------------------
# O_i = sum(d_0..d_i-1) - i*0.5  → produces the filter graph via node
# Each input is normalized with settb=AVTB (zoompan clips use an odd timebase)
node -e '
const f=require(process.argv[1]);
const d=f.map(x=>x.duration);
const fade=0.5;
const fps=30;
const fs=[];
for(let i=0;i<d.length;i++){
  fs.push("["+i+":v]settb=AVTB,fps="+fps+",format=yuv420p[a"+i+"]");
}
fs.push("[a0]fade=t=in:st=0:d="+fade+",format=yuv420p[b0]");
let last="b0";
let total=d[0];
for(let i=1;i<d.length;i++){
  const off=(total - i*fade).toFixed(1);
  fs.push("["+last+"][a"+i+"]xfade=transition=fade:duration="+fade+":offset="+off+"[c"+i+"]");
  last="c"+i;
  total+=d[i];
}
const finalLen=(total-((d.length-1)*fade)).toFixed(1);
fs.push("["+last+"]fade=t=out:st="+(finalLen-fade).toFixed(1)+":d="+fade+",format=yuv420p[outv]");
process.stdout.write(fs.join(";\n")+"\n");
' "$OUT/frames.json" > "$OUT/filter.txt"

echo "[video] assembling ${N} clips → docs/demo/demo-v1.0.0.mp4"

# ---- assemble ---------------------------------------------------------------
INPUTS=()
for ((i = 0; i < N; i++)); do INPUTS+=("-i" "$CLIPS/clip-$(printf '%02d' "$i").mp4"); done

$FF -y -loglevel error "${INPUTS[@]}" \
  -filter_complex_script "$OUT/filter.txt" \
  -map "[outv]" -c:v libx264 -preset medium -crf 20 -r "$FPS" \
  -pix_fmt yuv420p -movflags +faststart -an \
  -metadata title="$TITLE" -metadata comment="$DESC" \
  -metadata copyright="$COPYRIGHT" \
  "$FINAL" 2>&1 || true

# ---- report -----------------------------------------------------------------
if [[ -f "$FINAL" ]]; then
  DUR=$("$FPROBE" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FINAL")
  SIZE=$("$FPROBE" -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$FINAL")
  echo "[video] OK  $FINAL"
  echo "[video]     duration=${DUR}s  ${SIZE}"
  "$FF" -y -loglevel error -ss 12 -i "$FINAL" -frames:v 1 "$POSTER"
  echo "[video] poster → $POSTER"
else
  echo "[video] assembly failed; try FALLBACK=1 to skip zoompan"
  exit 1
fi