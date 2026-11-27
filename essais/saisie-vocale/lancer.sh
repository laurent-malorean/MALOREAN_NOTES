#!/usr/bin/env bash
# Compile, signe et lance l'essai isolé du pont de la saisie vocale (macOS 26 minimum).
# Usage : ./lancer.sh [langue, ex. fr-FR] [secondes d'écoute]
set -euo pipefail
cd "$(dirname "$0")"
sortie="${TMPDIR:-/tmp}/essai-saisie-vocale"
mkdir -p "$sortie"
swiftc -O -o "$sortie/essai-saisie-vocale" main.swift \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist
codesign --force --sign - --identifier fr.malorean.essai-saisie-vocale "$sortie/essai-saisie-vocale"
"$sortie/essai-saisie-vocale" "$@"
