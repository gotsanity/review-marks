#!/bin/sh
# PROTOTYPE: rebuild and copy the plugin into the PROTOTYPE vault (the one from the selection prototype).
set -e
cd "$(dirname "$0")"
npm run build
cp main.js manifest.json styles.css ../review-marks-proto-selection/PROTOTYPE-vault/.obsidian/plugins/review-marks/
