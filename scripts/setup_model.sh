#!/bin/sh
# STEP 7 - Copy the Kaggle sign model into public/models/ so the app can load it.
#
# The model and sign list are git-ignored (license not confirmed yet), so each
# teammate runs this once after downloading them from Kaggle (see README):
#   kaggle competitions download -c asl-signs -f sign_to_prediction_index_map.json -p kaggle
#   kaggle kernels output hoyso48/1st-place-solution-inference -p kaggle/model-1st
#
# Run from the project root:  sh scripts/setup_model.sh
set -e

cp kaggle/model-1st/model.tflite public/models/sign_model.tflite
cp kaggle/sign_to_prediction_index_map.json public/models/sign_labels.json




# ASL Citizen (Microsoft Research License: local use only, never commit these)
cp asl-citizen/asl_citizen.onnx public/models/asl_citizen.onnx
cp asl-citizen/labels.json public/models/asl_citizen_labels.json


echo "Copied sign model and labels into public/models/"
ls -la public/models/sign_model.tflite public/models/sign_labels.json public/models/asl_citizen.onnx public/models/asl_citizen_labels.json