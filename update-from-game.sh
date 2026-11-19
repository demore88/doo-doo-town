#!/bin/sh
# Copy the current game into the app and push: GitHub builds a new signed AAB + APK.
set -e
cd "$(dirname "$0")"
rm -rf www && mkdir www && cp -r /home/claude/drain-trail/menu/. www/ && rm -rf www/.git www/README.md
git add -A && git commit -qm "Update game files" && git push -q origin main
