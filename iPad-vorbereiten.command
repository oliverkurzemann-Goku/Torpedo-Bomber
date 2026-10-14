#!/bin/bash
set -euo pipefail
cd -- "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Bitte Node.js 22 oder neuer auf dem Mac installieren. Danach erneut starten."
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Bitte Node.js 22 oder neuer installieren.");process.exit(1)}'
node scripts/ipad-doctor.mjs --project-only
npm ci
npm run app:doctor
npm run app:sync
npm run app:open
echo "In Xcode: App > Signing & Capabilities > Personal Team; verbundenes iPad auswählen und Run drücken."
