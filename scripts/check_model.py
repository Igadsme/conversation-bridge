# STEP 5 - Check the 1st place Kaggle model before using it in the browser.
#
# 1. Prints the model's inputs and outputs (we expect [frames, 543, 3] -> [250]).
# 2. Downloads a few real Kaggle examples for each of our signs that Kaggle has.
# 3. Runs them through the model and shows the top 3 guesses for each.
#
# Run from the project root, in the asl-ml conda env (see steps.txt):
#   python scripts/check_model.py

import json
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

KAGGLE = Path('kaggle')
MODEL = KAGGLE / 'model-1st' / 'model.tflite'
EXAMPLES_PER_SIGN = 2
ROWS_PER_FRAME = 543  # face 0-467, left hand 468-488, pose 489-521, right hand 522-542

# Our signs that the Kaggle vocabulary covers (Kaggle spells them lowercase, no dashes)
OUR_SIGNS = ['hello', 'thankyou', 'please', 'water', 'milk', 'hot', 'wait', 'yes', 'no']


def load_interpreter():
    # Prefer the small LiteRT runtime; fall back to full TensorFlow
    try:
        from ai_edge_litert.interpreter import Interpreter
    except ImportError:
        from tensorflow.lite.python.interpreter import Interpreter
    return Interpreter(model_path=str(MODEL))


def load_landmarks(path):
    # Same loader the competition used: every frame is 543 rows of x, y, z
    data = pd.read_parquet(path, columns=['x', 'y', 'z'])
    n_frames = len(data) // ROWS_PER_FRAME
    return data.values.reshape(n_frames, ROWS_PER_FRAME, 3).astype(np.float32)


def ensure_downloaded(rel_path):
    # Download one example parquet with the Kaggle CLI if we don't have it yet
    local = KAGGLE / rel_path
    if local.exists():
        return local
    local.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['kaggle', 'competitions', 'download', '-c', 'asl-signs', '-f', rel_path, '-p', str(local.parent)],
        check=True, capture_output=True,
    )
    # Kaggle sometimes zips single files
    zipped = local.parent / (local.name + '.zip')
    if zipped.exists():
        with zipfile.ZipFile(zipped) as z:
            z.extractall(local.parent)
        zipped.unlink()
    return local


def main():
    interpreter = load_interpreter()

    print('== Model signature')
    for name, sig in interpreter.get_signature_list().items():
        print(f'  {name}: inputs={sig["inputs"]} outputs={sig["outputs"]}')
    for d in interpreter.get_input_details():
        print(f'  input  {d["name"]}: shape={list(d["shape_signature"])} dtype={d["dtype"].__name__}')
    for d in interpreter.get_output_details():
        print(f'  output {d["name"]}: shape={list(d["shape_signature"])} dtype={d["dtype"].__name__}')

    runner = interpreter.get_signature_runner('serving_default')
    sign_to_index = json.load(open(KAGGLE / 'sign_to_prediction_index_map.json'))
    index_to_sign = {i: s for s, i in sign_to_index.items()}
    train = pd.read_csv(KAGGLE / 'train.csv')

    print(f'\n== Testing {EXAMPLES_PER_SIGN} real examples of each of our {len(OUR_SIGNS)} signs')
    correct = total = 0
    for sign in OUR_SIGNS:
        rows = train[train.sign == sign].sample(EXAMPLES_PER_SIGN, random_state=0)
        for _, row in rows.iterrows():
            frames = load_landmarks(ensure_downloaded(row.path))
            scores = runner(inputs=frames)['outputs']
            top3 = np.argsort(scores)[::-1][:3]
            guesses = ', '.join(f'{index_to_sign[i]} {scores[i]:.2f}' for i in top3)
            ok = index_to_sign[top3[0]] == sign
            correct += ok
            total += 1
            print(f'  {"OK  " if ok else "MISS"} {sign:9} ({len(frames):3} frames) -> {guesses}')

    print(f'\n== Top-1 correct: {correct}/{total}')


if __name__ == '__main__':
    main()
