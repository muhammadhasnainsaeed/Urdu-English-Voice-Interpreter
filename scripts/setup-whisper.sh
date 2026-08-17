#!/usr/bin/env bash
#
# Builds the local whisper.cpp engine and downloads a Whisper model for the
# Local Whisper speech-to-text provider (STT_PROVIDER=whisper).
#
# Everything is written outside the repository, under:
#   ~/.cache/urdu-english-interpreter/
# Nothing here is committed to git.
#
# Requirements:
#   - macOS Apple Silicon (M1/M2/M3/M4)
#   - Xcode Command Line Tools  (xcode-select --install)
#   - Homebrew  (brew install cmake)
#   - git, curl
#
# Usage:
#   npm run setup:whisper
#
# Environment overrides (optional):
#   WHISPER_MODEL=base          Whisper model size (tiny|base|small|medium|large-v3)
#   WHISPER_MODEL_PATH=...      Download the model to a custom location
set -euo pipefail

BASE_DIR="${HOME}/.cache/urdu-english-interpreter"
SRC_DIR="${BASE_DIR}/whisper.cpp"
BIN_PATH="${SRC_DIR}/build/bin/whisper-cli"
MODEL_NAME="${WHISPER_MODEL:-base}"
MODEL_PATH="${WHISPER_MODEL_PATH:-${BASE_DIR}/models/ggml-${MODEL_NAME}.bin}"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL_NAME}.bin"

log() { printf "\033[1;34m[setup:whisper]\033[0m %s\n" "$1"; }
die() { printf "\033[1;31m[setup:whisper] ERROR:\033[0m %s\n" "$1" >&2; exit 1; }

command -v cc >/dev/null 2>&1 || die "Xcode Command Line Tools are missing. Run: xcode-select --install"
command -v cmake >/dev/null 2>&1 || die "cmake is missing. Run: brew install cmake"
command -v curl >/dev/null 2>&1 || die "curl is missing."

ARCH="$(uname -m)"
if [ "${ARCH}" != "arm64" ]; then
  die "Apple Silicon required. Detected: ${ARCH}"
fi

mkdir -p "${BASE_DIR}/models"

# 1. Fetch whisper.cpp (shallow).
if [ ! -d "${SRC_DIR}/.git" ]; then
  log "Cloning whisper.cpp into ${SRC_DIR} ..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "${SRC_DIR}"
else
  log "whisper.cpp already present at ${SRC_DIR}"
fi

# 2. Configure with Apple Silicon settings.
#    - GGML_NATIVE=OFF + GGML_CPU_ARM_ARCH=armv8.2-a skips whisper.cpp's
#      CPU-feature probe. The probe executes ARM i8mm/SVE instructions that the
#      M1 does not support and that hang the configure step on macOS.
#    - GGML_ACCELERATE=ON uses the Accelerate framework (CPU); Metal is left
#      off to keep memory usage predictable on 8 GB machines.
log "Configuring whisper.cpp (CPU + Accelerate, armv8.2-a) ..."
cmake -S "${SRC_DIR}" -B "${SRC_DIR}/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_NATIVE=OFF \
  -DGGML_CPU_ARM_ARCH=armv8.2-a \
  -DGGML_ACCELERATE=ON \
  -DGGML_METAL=OFF

# 3. Build the whisper-cli executable.
log "Building whisper-cli (this takes a few minutes) ..."
cmake --build "${SRC_DIR}/build" --config Release -j "$(sysctl -n hw.ncpu)" --target whisper-cli
[ -x "${BIN_PATH}" ] || die "Build finished but ${BIN_PATH} is missing."

# 4. Download the model.
if [ ! -f "${MODEL_PATH}" ]; then
  log "Downloading model ggml-${MODEL_NAME}.bin ..."
  curl -L --fail --progress-bar -o "${MODEL_PATH}" "${MODEL_URL}"
else
  log "Model already present at ${MODEL_PATH}"
fi

log "Done."
log "Engine:   ${BIN_PATH}"
log "Model:    ${MODEL_PATH}"
log ""
log "To use the local Whisper provider, set in .env:"
log "  STT_PROVIDER=whisper"
log "Then launch the app and press Start Listening."
