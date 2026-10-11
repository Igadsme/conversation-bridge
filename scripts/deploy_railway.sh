#!/bin/sh
# Deploy the password-protected demo to Railway (see README, Hosted demo).
#
# Uploads the committed code plus the git-ignored models from
# frontend/public/models/ (as deploy-models/, served only behind SORA_PASSWORD).
# The models never go into git. Uncommitted changes are NOT deployed.
#
# Run from the project root:  sh scripts/deploy_railway.sh
set -e

if [ ! -f frontend/public/models/asl_citizen.onnx ]; then
  echo "Models missing - run sh scripts/setup_model.sh first"
  exit 1
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

git archive HEAD | tar -x -C "$STAGE"
mkdir -p "$STAGE/deploy-models"
cp frontend/public/models/* "$STAGE/deploy-models/"

railway up "$STAGE" --path-as-root --detach
