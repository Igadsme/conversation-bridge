#!/bin/sh
# Put the on-device models into frontend/public/models/ so the app can load them.
# All of them are git-ignored (size and licenses), so each teammate runs this once.
#
# Before running, download the Kaggle model and sign list (see README):
#   kaggle competitions download -c asl-signs -f sign_to_prediction_index_map.json -p kaggle
#   kaggle kernels output hoyso48/1st-place-solution-inference -p kaggle/model-1st
#
# Run from the project root:  sh scripts/setup_model.sh
set -e

MODELS=frontend/public/models
mkdir -p "$MODELS"

# MediaPipe face + body + hands tracking (Apache 2.0, downloaded from Google)
if [ ! -f "$MODELS/holistic_landmarker.task" ]; then
  curl -fL -o "$MODELS/holistic_landmarker.task" \
    https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task
fi

cp kaggle/model-1st/model.tflite "$MODELS/sign_model.tflite"
cp kaggle/sign_to_prediction_index_map.json "$MODELS/sign_labels.json"

# ASL Citizen (Microsoft Research License: local use only, never commit these)
cp asl-citizen/asl_citizen.onnx "$MODELS/asl_citizen.onnx"
cp asl-citizen/labels.json "$MODELS/asl_citizen_labels.json"

# Personal calibration model, if it has been trained (python scripts/train_personal.py)
if [ -f data/personal/personal_model.json ]; then
  cp data/personal/personal_model.json "$MODELS/personal_model.json"
  echo "Copied personal model"
fi

echo "Models ready in $MODELS/"
ls -la "$MODELS"
