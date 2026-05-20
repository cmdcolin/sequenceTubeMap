#!/usr/bin/env bash
# Build the gbz-base WASMs that the in-browser LocalAPI loads.
#
# Why this script exists:
#
#   The npm package `gbz-base@0.1.0-alpha.1` bundles WASMs from a mid-2024
#   source snapshot and rejects both modern .gbz inputs and modern .gbz.db
#   outputs. This script builds matching WASMs from a pinned gbz-base source
#   and drops them in vendor/gbz-base/.
#
# Usage:
#   ./scripts/build-gbz-base-wasm.sh [version]   # version defaults to v0.5
#
# Requires: rustup (script installs target + WASI SDK 20 locally).
#
# Vendor patches applied at build time (see vendor/simple-sds-patch and
# vendor/gbz-patch):
#
#   - simple-sds: default `libc` feature dropped (no mmap on wasi); `usize`
#     serialized as platform-stable 8 bytes; `binaries.rs` 1024^4 constants
#     use saturating arithmetic so they don't overflow 32-bit usize.
#   - gbz: `usize` fields in `#[repr(C)]` Payload structs (GBWTPayload,
#     MetadataPayload, SequencesPayload) changed to `u64` so the in-memory
#     layout matches the on-disk 64-bit format on wasm32 (4-byte usize).
#     Without this patch every header field after the first usize is read
#     from wrong bytes.
#
# These patches are local-only; upstream issues/PRs would let us drop them.

set -euo pipefail

VERSION="${1:-v0.5}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="${REPO_ROOT}/tmp/gbz-base-build"
VENDOR_DIR="${REPO_ROOT}/vendor/gbz-base"
SIMPLE_SDS_PATCH="${REPO_ROOT}/vendor/simple-sds-patch"
GBZ_PATCH="${REPO_ROOT}/vendor/gbz-patch"
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

# Upstream's .cargo/config.toml sets `-C target-cpu=native`, which is wrong
# for the wasm target. Replace it (idempotent).
mkdir -p "${SRC_DIR}/.cargo"
cat >"${SRC_DIR}/.cargo/config.toml" <<EOF
[build]
rustflags = ""
EOF

# Patch simple-sds (drops libc default + fixes 32-bit usize overflow in
# binaries.rs SUFFIXES table). See vendor/simple-sds-patch/README.md.
if ! grep -q "patch.crates-io" "${SRC_DIR}/Cargo.toml"; then
  cat >>"${SRC_DIR}/Cargo.toml" <<EOF

[patch.crates-io]
simple-sds = { path = "${SIMPLE_SDS_PATCH}" }
gbz = { path = "${GBZ_PATCH}" }
EOF
fi

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

export WASI_SDK_PATH="${SDK_DIR}"
# cc-rs reads CC_<target> with `-` replaced by `_`. Our target is wasm32-wasip1
# (rustc renamed wasm32-wasi -> wasm32-wasip1 in 1.84+). Keep both names so
# the build works with older/newer toolchains.
export CC_wasm32_wasi="${SDK_DIR}/bin/clang"
export CC_wasm32_wasip1="${SDK_DIR}/bin/clang"
export AR_wasm32_wasip1="${SDK_DIR}/bin/llvm-ar"
export CFLAGS_wasm32_wasip1="--sysroot=${SDK_DIR}/share/wasi-sysroot"
# Drop sqlite features that the wasi-libc doesn't support (long double, pthreads).
export LIBSQLITE3_FLAGS="-DLONGDOUBLE_TYPE=double -DSQLITE_THREADSAFE=0"

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
