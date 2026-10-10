# ASL CITIZEN STEP A5 - Test the converted ASL Citizen model on Microsoft's own
# test-set videos for our vocabulary, through the same pipeline the browser uses:
#   video -> MediaPipe HolisticLandmarker (Tasks API, same model file as the app)
#         -> their preprocessing -> asl_citizen.onnx -> top guesses
#
# preprocess() below is the reference for the browser version (src/aslcitizenmodel.ts).
# It copies their asl_citizen_dataset_pose.py exactly, including its quirks.
#
# Run from the project root in the asl-ml env:
#   python scripts/check_asl_citizen.py

import csv
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import onnxruntime as ort
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision
from remotezip import RemoteZip

ROOT = Path('asl-citizen')
ZIP_URL = 'https://download.microsoft.com/download/b/8/8/b88c0bae-e6c1-43e1-8726-98cf5af36ca4/ASL_Citizen.zip'
HOLISTIC_MODEL = 'public/models/holistic_landmarker.task'
VIDEOS_PER_SIGN = 2
MAX_FRAMES = 128

# Our vocabulary -> ASL Citizen sign names (some signs have numbered variants)
VOCAB = {
    'HELLO': ['HELLO'], 'THANK-YOU': ['THANKYOU'], 'PLEASE': ['PLEASE'],
    'COFFEE': ['COFFEE'], 'TEA': ['TEA'], 'WATER': ['WATER'], 'MILK': ['MILK1', 'MILK2'],
    'SMALL': ['SMALL'], 'MEDIUM': ['MIDDLE', 'REGULAR'], 'LARGE': ['BIG'],
    'HOT': ['HOT'], 'COLD': ['COLD'], 'MORE': ['MORE'], 'LESS': ['LESS'], 'SUGAR': ['SWEET'],
    'WAIT': ['WAIT'], 'AGAIN': ['AGAIN'], 'YES': ['YES'], 'NO': ['NO'], 'HELP': ['HELP'],
}

# Their 27 points, picked from [pose 0-32, left hand 33-53, right hand 54-74]
KEYPOINTS = [0, 2, 5, 11, 12, 13, 14, 33, 37, 38, 41, 42, 45, 46, 49, 50, 53, 54,
             58, 59, 62, 63, 66, 67, 70, 71, 74]


def downsample(frames, max_frames):
    # Copied from their asl_citizen_dataset_pose.py
    length = frames.shape[0]
    increment = min(max_frames / length, 1.0)
    curr_increment, curr_frame, new_frames = 0, 0, []
    for f in frames:
        curr_increment += increment
        if curr_increment > curr_frame:
            curr_frame += 1
            new_frames.append(f)
    return np.array(new_frames[:max_frames])


def preprocess(stored):
    """stored: [frames, 75, 2] x/y in their saved order:
    pose 0-32, RIGHT hand 33-53, LEFT hand 54-74; missing points are 0.
    Returns the model input [1, 2, 128, 27], exactly like their dataset code."""
    data0 = stored.astype(np.float64)
    if len(data0) > MAX_FRAMES:
        data0 = downsample(data0, MAX_FRAMES)
    if len(data0) < MAX_FRAMES:
        data0 = np.pad(data0, ((0, MAX_FRAMES - len(data0)), (0, 0), (0, 0)))

    # Centre on the shoulders and scale by shoulder width (padding frames included, as they do)
    shoulder_l, shoulder_r = data0[:, 11, :], data0[:, 12, :]
    center = ((shoulder_l + shoulder_r) / 2).mean(axis=0)
    mean_dist = np.mean(np.sqrt(((shoulder_l - shoulder_r) ** 2).sum(-1)))
    if mean_dist != 0:
        data0 = (data0 - center) / mean_dist

    # Reorder to [pose, left hand, right hand] and keep their 27 points
    data = np.concatenate([data0[:, 0:33], data0[:, 54:75], data0[:, 33:54]], axis=1)
    data = data[:, KEYPOINTS, :]
    return np.transpose(data, (2, 0, 1))[None].astype(np.float32)


def as_list(landmarks):
    # The Python result may hold one person's points directly or a list per person
    if not landmarks:
        return None
    return landmarks[0] if isinstance(landmarks[0], list) else landmarks


def track_video(path, landmarker_options):
    """Run HolisticLandmarker over a video -> [frames, 75, 2] in their stored order."""
    video = cv2.VideoCapture(str(path))
    fps = video.get(cv2.CAP_PROP_FPS) or 30
    frames = []
    with vision.HolisticLandmarker.create_from_options(landmarker_options) as landmarker:
        i = 0
        while True:
            ok, image = video.read()
            if not ok:
                break
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
                                                 int(i * 1000 / fps))
            frame = np.zeros((75, 2), np.float32)
            for start, points in [(0, as_list(result.pose_landmarks)),
                                  (33, as_list(result.right_hand_landmarks)),
                                  (54, as_list(result.left_hand_landmarks))]:
                if points:
                    for j, p in enumerate(points[:21 if start else 33]):
                        frame[start + j] = (p.x, p.y)
            frames.append(frame)
            i += 1
    return np.array(frames)


def main():
    labels = json.load(open(ROOT / 'labels.json'))
    session = ort.InferenceSession(str(ROOT / 'asl_citizen.onnx'))
    vocab_glosses = {g for gs in VOCAB.values() for g in gs}
    vocab_index = [i for i, g in enumerate(labels) if g in vocab_glosses]
    gloss_to_ours = {g: ours for ours, gs in VOCAB.items() for g in gs}

    test_rows = list(csv.reader(open(ROOT / 'ASL_Citizen' / 'splits' / 'test.csv')))[1:]
    picks = []
    for glosses in VOCAB.values():
        rows = [r for r in test_rows if r[2].strip() == glosses[0]]
        picks += rows[:VIDEOS_PER_SIGN]

    video_dir = ROOT / 'videos'
    video_dir.mkdir(exist_ok=True)
    missing = [r for r in picks if not (video_dir / r[1]).exists()]
    if missing:
        print(f'Downloading {len(missing)} test videos from the ASL Citizen zip...')
        with RemoteZip(ZIP_URL) as z:
            for r in missing:
                (video_dir / r[1]).write_bytes(z.read(f'ASL_Citizen/videos/{r[1]}'))

    options = vision.HolisticLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=HOLISTIC_MODEL),
        running_mode=vision.RunningMode.VIDEO)

    top1 = top5 = vocab_top1 = 0
    for r in picks:
        gloss = r[2].strip()
        stored = track_video(video_dir / r[1], options)
        scores = session.run(None, {'inputs': preprocess(stored)})[0][0]
        order = np.argsort(scores)[::-1]
        ranked = [labels[i] for i in order[:5]]
        best_vocab = labels[max(vocab_index, key=lambda i: scores[i])]
        top1 += ranked[0] == gloss
        top5 += gloss in ranked
        same_sign = gloss_to_ours[best_vocab] == gloss_to_ours[gloss]
        vocab_top1 += same_sign
        print(f'  {"OK  " if ranked[0] == gloss else "    "}{gloss:9} ({len(stored):3} frames) '
              f'all 2731: {", ".join(ranked[:3]):32} | our vocab: {gloss_to_ours[best_vocab]:9} {"OK" if same_sign else "MISS"}')

    n = len(picks)
    print(f'\nOut of all 2731 signs: top-1 {top1}/{n}, top-5 {top5}/{n}')
    print(f'Out of our {len(VOCAB)} vocabulary signs: top-1 {vocab_top1}/{n}')


if __name__ == '__main__':
    main()
