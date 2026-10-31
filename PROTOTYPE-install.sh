#!/bin/sh
# PROTOTYPE: rebuild and copy the plugin into PROTOTYPE-vault. Open that folder as a vault in Obsidian.
set -e
cd "$(dirname "$0")"
npm run build
cp main.js manifest.json styles.css PROTOTYPE-vault/.obsidian/plugins/review-marks/
