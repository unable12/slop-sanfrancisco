#!/bin/bash
# Usage: bash tools/dev/export-showcase.sh raw.webm output-name
# Writes a full 14-second MP4 under ignored shots/ and a compact README loop.
set -euo pipefail
input=$1
name=$2
case "$name" in waymo-market|helicopter-salesforce) ;; *) echo 'Use waymo-market or helicopter-salesforce' >&2; exit 1;; esac
mkdir -p shots/showcase docs/media
ffmpeg -y -v error -i "$input" -t 14 -vf 'fps=30,format=yuv420p' -c:v libx264 -preset slow -crf 20 -movflags +faststart -an "shots/showcase/slop-sf-$name.mp4"
ffmpeg -y -v error -ss 2 -i "$input" -t 5 -filter_complex '[0:v]fps=10,scale=576:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=96[p];[b][p]paletteuse=dither=none' -loop 0 "docs/media/$name.gif"
