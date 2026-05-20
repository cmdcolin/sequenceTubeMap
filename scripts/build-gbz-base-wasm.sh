#!/usr/bin/env bash
# Build the gbz-base WASMs that the in-browser LocalAPI loads.
#
# Why this script exists:
#
#   The npm package `gbz-base@0.1.0-alpha.1` we currently depend on bundles
#   WASMs from a mid-2024 source snapshot. It rejects:
#     - GBZ graphs written by current `vg gbwt --gbz-format`
#       ("Bit length / word length mismatch" from gbz2db.wasm)
#     - GBZ-base databases produced by `cargo install gbz-base` (v0.5)
#       ("Unsupported database version: GBZ-base version 4 (expected 0.2.0)"
#        from query.wasm)
#
#   Until upstream republishes the npm package, this script builds matching
#   WASMs from a pinned gbz-base source and drops them in vendor/gbz-base/.
#
# Usage:
#   ./scripts/build-gbz-base-wasm.sh [version]   # version defaults to v0.5
#
# Requires: rustup (script installs target + WASI SDK 20 locally).
#
# KNOWN LIMITATION (as of this writing):
#
#   gbz-base v0.2..v0.5 use Rust edition 2024 (needs rustc >= 1.85), which
#   only ships the `wasm32-wasip1` target — but transitive deps (`simple-sds`,
#   `gbz`) call `libc::mmap` which the wasm-libc crate does not expose under
#   wasip1. Building requires either:
#     (a) patching `simple-sds` to compile without the `libc` feature, or
#     (b) a forked toolchain where wasm-libc exposes mmap symbols.
#
#   The build invocation below is correct; whether it succeeds depends on
#   upstream getting (a) sorted out. Track:
#     https://github.com/jltsiren/gbz-base/issues  (request npm republish)
#     https://github.com/jltsiren/simple-sds/      (wasi build path)

set -euo pipefail

VERSION="${1:-v0.5}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="${REPO_ROOT}/tmp/gbz-base-build"
VENDOR_DIR="${REPO_ROOT}/vendor/gbz-base"
WASI_SDK_VERSION="20"
RUST_TARGET="wasm32-wasip1"

mkdir -p "${WORK_DIR}"
cd "${WORK_DIR}"

if [[ ! -d "gbz-base-${VERSION#v}" ]]; then
  echo "Fetching gbz-base ${VERSION}..."
  curl -sL "https://github.com/jltsiren/gbz-base/archive/refs/tags/${VERSION}.tar.gz" \
    -o "src-${VERSION}.tar.gz"
  tar -xf "src-${VERSION}.tar.gz"
fi

SRC_DIR="${WORK_DIR}/gbz-base-${VERSION#v}"

if ! rustup target list --installed | grep -q "^${RUST_TARGET}$"; then
  rustup target add "${RUST_TARGET}"
fi

SDK_DIR="${WORK_DIR}/wasi-sdk-${WASI_SDK_VERSION}.0"
if [[ ! -d "${SDK_DIR}" ]]; then
  echo "Installing WASI SDK ${WASI_SDK_VERSION}..."
  case "$(uname)" in
    Darwin) SDK_TARBALL="wasi-sdk-${WASI_SDK_VERSION}.0-macos.tar.gz" ;;
    *)      SDK_TARBALL="wasi-sdk-${WASI_SDK_VERSION}.0-linux.tar.gz" ;;
  esac
  curl -sL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/${SDK_TARBALL}" \
    -o "${SDK_TARBALL}"
  tar -xf "${SDK_TARBALL}"
fi

export CC_wasm32_wasi="${SDK_DIR}/bin/clang"
# Drop sqlite features that the wasi-libc doesn't support (long double, pthreads).
export LIBSQLITE3_FLAGS="-DLONGDOUBLE_TYPE=double -DSQLITE_THREADSAFE=0"
# upstream's .cargo/config.toml sets `-C target-cpu=native`, which is wrong
# for the wasm target. Suppress with an empty RUSTFLAGS.
export CARGO_BUILD_RUSTFLAGS=""

cd "${SRC_DIR}"
cargo build --release --target="${RUST_TARGET}"

OUT_DIR="${SRC_DIR}/target/${RUST_TARGET}/release"
mkdir -p "${VENDOR_DIR}"
for wasm in query gbz2db; do
  cp "${OUT_DIR}/${wasm}.wasm" "${VENDOR_DIR}/${wasm}.wasm"
  echo "Wrote ${VENDOR_DIR}/${wasm}.wasm ($(stat -c%s "${VENDOR_DIR}/${wasm}.wasm" 2>/dev/null || stat -f%z "${VENDOR_DIR}/${wasm}.wasm") bytes)"
done

echo "Done. Update src/api/wasm/loader.{browser,node}.ts to import from"
echo "vendor/gbz-base/ instead of the npm package."
