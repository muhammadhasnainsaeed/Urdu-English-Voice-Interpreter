#!/usr/bin/env bash
# Builds a silent, captions-first 9:16 launch video for social platforms.
# Usage: bash demo/video/build-social-launch.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/demo/out/social-launch"
FINAL="$ROOT/docs/demo/launch-v1.1.0-social.mp4"
POSTER="$ROOT/docs/images/launch-v1.1.0-social-poster.png"
FF="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
FPROBE="${FFPROBE:-/opt/homebrew/bin/ffprobe}"

[[ -x "$FF" ]] || { echo "ffmpeg not found at $FF"; exit 1; }
[[ -f "$OUT/frames.json" ]] || { echo "Run compose-social-launch.mjs first"; exit 1; }

rm -rf "$OUT/clips"
mkdir -p "$OUT/clips" "$(dirname "$FINAL")"

DURATIONS=()
FRAMES=()
while IFS= read -r value; do DURATIONS+=("$value"); done < <(
  node -e 'const f=require(process.argv[1]); process.stdout.write(f.map(x=>x.duration).join("\n")+"\n")' "$OUT/frames.json"
)
while IFS= read -r value; do FRAMES+=("$value"); done < <(
  node -e 'const f=require(process.argv[1]); process.stdout.write(f.map(x=>x.frame).join("\n")+"\n")' "$OUT/frames.json"
)

FPS=30
FADE=0.45
INPUTS=()

for ((i = 0; i < ${#FRAMES[@]}; i++)); do
  duration="${DURATIONS[$i]}"
  clip="$OUT/clips/clip-$(printf '%02d' "$i").mp4"
  # Subtle slow zoom keeps static product screenshots lively while preserving legibility.
  vf="zoompan=z='min(zoom+0.00032,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}"
  "$FF" -y -loglevel error -loop 1 -framerate "$FPS" -t "$duration" -i "$OUT/${FRAMES[$i]}" \
    -vf "$vf" -r "$FPS" -pix_fmt yuv420p -an "$clip"
  INPUTS+=("-i" "$clip")
done

FILTERS=()
for ((i = 0; i < ${#FRAMES[@]}; i++)); do
  FILTERS+=("[$i:v]settb=AVTB,fps=$FPS,format=yuv420p[v$i]")
done
last="v0"
total="${DURATIONS[0]}"
for ((i = 1; i < ${#FRAMES[@]}; i++)); do
  offset=$(awk -v sum="$total" -v fade="$FADE" -v step="$i" 'BEGIN { printf "%.2f", sum - (step * fade) }')
  FILTERS+=("[$last][v$i]xfade=transition=fade:duration=$FADE:offset=$offset[x$i]")
  last="x$i"
  total=$(awk -v sum="$total" -v duration="${DURATIONS[$i]}" 'BEGIN { printf "%.2f", sum + duration }')
done
final_duration=$(awk -v sum="$total" -v fade="$FADE" -v n="${#FRAMES[@]}" 'BEGIN { printf "%.2f", sum - ((n - 1) * fade) }')
FILTERS+=("[$last]fade=t=in:st=0:d=$FADE,fade=t=out:st=$(awk -v duration="$final_duration" -v fade="$FADE" 'BEGIN { printf "%.2f", duration - fade }'):d=$FADE,format=yuv420p[outv]")

IFS=';'; filter_complex="${FILTERS[*]}"; unset IFS
"$FF" -y -loglevel error "${INPUTS[@]}" -filter_complex "$filter_complex" \
  -map '[outv]' -c:v libx264 -preset medium -crf 20 -r "$FPS" -pix_fmt yuv420p \
  -movflags +faststart -an \
  -metadata title="Urdu-English Voice Interpreter v1.1.0" \
  -metadata comment="Caption-led social launch video for the Urdu-English Voice Interpreter." \
  "$FINAL"

"$FF" -y -loglevel error -ss 2 -i "$FINAL" -frames:v 1 "$POSTER"
echo "[social-launch] $("$FPROBE" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FINAL")s → $FINAL"
echo "[social-launch] poster → $POSTER"
