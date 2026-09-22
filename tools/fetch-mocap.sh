#!/usr/bin/env bash
# Descarga los clips del CMU Motion Capture Database que usa el juego.
# Solo se necesita para regenerar src/data/anims.js (tools/build-anim.mjs).
#
#   MOCAP_DIR=/tmp/mocap bash tools/fetch-mocap.sh
#
# Los BVH pesan ~38 MB y NO se versionan: al repo solo va el resultado horneado.
# Los ficheros de más de 1 MB se piden por la API de blobs (la de contenidos limita).
set -e
REPO=una-dinosauria/cmu-mocap
OUT=${MOCAP_DIR:-/tmp/mocap}
mkdir -p "$OUT"

get() { # get <sujeto> <clip>
  local s=$1 f=$2 out="$OUT/$2.bvh"
  if [ -s "$out" ]; then echo "  = $f"; return; fi
  local sha
  sha=$(gh api "repos/$REPO/contents/data/$s/$f.bvh" --jq '.sha' 2>/dev/null)
  if [ -z "$sha" ]; then echo "  ! $f no encontrado"; return 1; fi
  gh api "repos/$REPO/git/blobs/$sha" --jq '.content' | base64 -d > "$out"
  echo "  + $f  $(du -h "$out" | cut -f1)"
}

echo "Ataques"
get 144 144_20; get 144 144_13; get 144 144_05; get 144 144_09
get 144 144_28; get 144 144_17
get 074 74_03;  get 074 74_04;  get 074 74_05;  get 074 74_06
get 076 76_01;  get 002 02_05;  get 111 111_19; get 141 141_14; get 075 75_16
echo "Defensa"
get 144 144_07; get 144 144_26
echo "Reposo y locomoción"
get 077 77_03
get 144 144_33; get 111 111_01; get 111 111_26
get 140 140_06; get 141 141_04; get 111 111_23
echo "Reacciones y ceremonia"
get 111 111_12; get 140 140_08; get 090 90_16; get 111 111_02; get 144 144_30

echo
echo "Listo en $OUT — ahora: node tools/build-anim.mjs"
