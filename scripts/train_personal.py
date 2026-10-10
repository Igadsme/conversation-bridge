# PERSONAL CALIBRATION 2 - Train a small classifier on the signer's own recordings.
#
# Every recorded clip (data/personal/*.json, from the app's Record mode) goes
# through the same pipeline as the live app: ASL Citizen's preprocessing ->
# asl_citizen.onnx -> its 256-number "features". A logistic regression then
# learns which features mean which of OUR signs, for THIS signer.
#
# It reports:
#   - ASL Citizen on its own vs the personal classifier, on clips held back
#     from training (repeated 20 times with different splits)
#   - which signs get mixed up
# and saves the final classifier (trained on every clip) as
# data/personal/personal_model.json for the browser.
#
# Run from the project root in the asl-ml env:
#   python scripts/train_personal.py

import collections
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, 'scripts')
from check_asl_citizen import VOCAB, preprocess  # noqa: E402  (same preprocessing as the app)

DATA = Path('data/personal')
OUT = DATA / 'personal_model.json'
MIN_EXAMPLES = 8  # signs with fewer recordings are skipped
TEST_PER_SIGN = 3  # held back from training in each evaluation round
ROUNDS = 20


def to_stored(frames):
    """Recorder frames (150 numbers: x/y of pose 0-32, LEFT hand 33-53, RIGHT hand 54-74,
    null = not seen) -> ASL Citizen's saved layout [frames, 75, 2]:
    pose 0-32, RIGHT hand 33-53, LEFT hand 54-74, missing = 0."""
    a = np.array([[np.nan if v is None else v for v in f] for f in frames], np.float32).reshape(-1, 75, 2)
    a = np.nan_to_num(a, nan=0.0)
    return np.concatenate([a[:, 0:33], a[:, 54:75], a[:, 33:54]], axis=1)


def main():
    # Download in the recorder saves every clip from that browser session, so the
    # same clip can be in several files. Keep each one once (same sign + same time),
    # or it would count twice and could land in both training and test clips.
    clips, seen, duplicates = [], set(), 0
    for path in sorted(DATA.glob('*.json')):
        if path.name == OUT.name:
            continue
        for c in json.load(open(path)):
            key = (c['sign'], c['recordedAt'])
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            clips.append(c)
    if duplicates:
        print(f'Skipped {duplicates} duplicate clips (saved in more than one file)')
    counts = collections.Counter(c['sign'] for c in clips)
    signs = sorted(s for s, n in counts.items() if n >= MIN_EXAMPLES)
    skipped = {s: n for s, n in counts.items() if n < MIN_EXAMPLES}
    print(f'{len(clips)} clips: ' + ', '.join(f'{s} {counts[s]}' for s in signs))
    if skipped:
        print(f'Skipped (fewer than {MIN_EXAMPLES} clips): {skipped}')
    if 'NOT-A-SIGN' not in signs:
        print('Note: no NOT-A-SIGN clips yet, so the personal model will always pick one of the signs above.')
    clips = [c for c in clips if c['sign'] in signs]

    # Run every clip through ASL Citizen once: features + its own scores
    session = ort.InferenceSession('asl-citizen/asl_citizen.onnx')
    labels = json.load(open('asl-citizen/labels.json'))
    ours_for = {g: ours for ours, gs in VOCAB.items() for g in gs}
    vocab_index = [i for i, g in enumerate(labels) if ours_for.get(g) in signs]
    features, citizen_guess = [], []
    for c in clips:
        scores, feats = session.run(['outputs', 'features'], {'inputs': preprocess(to_stored(c['frames']))})
        features.append(feats[0])
        best = max(vocab_index, key=lambda i: scores[0][i])
        citizen_guess.append(ours_for[labels[best]])
    X = np.array(features)
    y = np.array([c['sign'] for c in clips])
    citizen_guess = np.array(citizen_guess)

    def make_classifier():
        return LogisticRegression(C=1.0, max_iter=5000)

    # Evaluate on held-back clips, many random splits
    splitter = StratifiedShuffleSplit(n_splits=ROUNDS, test_size=TEST_PER_SIGN * len(signs), random_state=0)
    personal_correct = citizen_correct = total = 0
    mixups = collections.Counter()
    for train, test in splitter.split(X, y):
        scaler = StandardScaler().fit(X[train])
        clf = make_classifier().fit(scaler.transform(X[train]), y[train])
        predicted = clf.predict(scaler.transform(X[test]))
        personal_correct += (predicted == y[test]).sum()
        citizen_correct += (citizen_guess[test] == y[test]).sum()
        total += len(test)
        for truth, guess in zip(y[test], predicted):
            if truth != guess:
                mixups[(truth, guess)] += 1

    print(f'\nOn clips held back from training ({ROUNDS} rounds, {TEST_PER_SIGN} per sign each):')
    print(f'  ASL Citizen alone (choosing among these {len(signs)} signs): {citizen_correct / total:.0%}')
    print(f'  Personal classifier:                                {personal_correct / total:.0%}')
    if mixups:
        print('  Most common mix-ups (sign -> guessed as):')
        for (truth, guess), n in mixups.most_common(5):
            print(f'    {truth} -> {guess}: {n} times')

    # Final classifier on every clip, saved for the browser
    scaler = StandardScaler().fit(X)
    clf = make_classifier().fit(scaler.transform(X), y)
    model = {
        'signs': list(clf.classes_),
        'mean': scaler.mean_.round(6).tolist(),
        'scale': scaler.scale_.round(6).tolist(),
        'weights': clf.coef_.round(6).tolist(),  # one row of 256 per sign
        'bias': clf.intercept_.round(6).tolist(),
        'trainedOn': dict(counts),
    }
    json.dump(model, open(OUT, 'w'))
    print(f'\nSaved {OUT} ({OUT.stat().st_size / 1024:.0f} KB), {len(signs)} signs')


if __name__ == '__main__':
    main()
