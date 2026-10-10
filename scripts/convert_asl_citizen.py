# ASL CITIZEN STEP A4 - Convert Microsoft's ASL Citizen pose model (PyTorch) to ONNX.
#
# Builds the ST-GCN model exactly like their stgcn_testing.py, loads the released
# weights, switches from float64 to float32 (better supported in the browser),
# exports asl-citizen/asl_citizen.onnx and checks ONNX gives the same scores as PyTorch.
#
# Needs (see README): asl-citizen/code (their repo), asl-citizen/weights/*.pt,
# asl-citizen/labels.json. Run from the project root in the asl-ml env:
#   python scripts/convert_asl_citizen.py

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

ROOT = Path('asl-citizen')
sys.path.insert(0, str(ROOT / 'code' / 'ST-GCN'))
from architecture.fc import FC  # noqa: E402  (their code)
from architecture.network import Network  # noqa: E402
from architecture.st_gcn import STGCN  # noqa: E402

WEIGHTS = ROOT / 'weights' / 'ASL_citizen_stgcn_weights.pt'
OUT = ROOT / 'asl_citizen.onnx'
MAX_FRAMES = 128  # their clips are always stretched or padded to 128 frames
NUM_POINTS = 27  # their subset of MediaPipe Holistic points

labels = json.load(open(ROOT / 'labels.json'))

# Same settings as their stgcn_testing.py
graph_args = {'num_nodes': NUM_POINTS, 'center': 0,
              'inward_edges': [[2, 0], [1, 0], [0, 3], [0, 4], [3, 5],
                               [4, 6], [5, 7], [6, 17], [7, 8], [7, 9],
                               [9, 10], [7, 11], [11, 12], [7, 13], [13, 14],
                               [7, 15], [15, 16], [17, 18], [17, 19], [19, 20],
                               [17, 21], [21, 22], [17, 23], [23, 24], [17, 25], [25, 26]]}
stgcn = STGCN(in_channels=2, graph_args=graph_args, edge_importance_weighting=True)
fc = FC(n_features=256, num_class=len(labels), dropout_ratio=0.05)
model = Network(encoder=stgcn, decoder=fc)
model.load_state_dict(torch.load(WEIGHTS, map_location='cpu'))
model = model.float().eval()

# Input: one clip of x/y for 27 points over 128 frames -> [1, 2, 128, 27]
example = torch.randn(1, 2, MAX_FRAMES, NUM_POINTS)
torch.onnx.export(model, example, OUT, input_names=['inputs'], output_names=['outputs'],
                  opset_version=17, dynamo=False)
print(f'Exported {OUT} ({OUT.stat().st_size / 1e6:.1f} MB), {len(labels)} signs')

# Same scores from PyTorch and ONNX?
session = ort.InferenceSession(str(OUT))
worst = 0.0
for _ in range(5):
    x = torch.randn(1, 2, MAX_FRAMES, NUM_POINTS)
    with torch.no_grad():
        expected = model(x).numpy()
    got = session.run(None, {'inputs': x.numpy()})[0]
    worst = max(worst, float(np.abs(expected - got).max()))
    assert expected.argmax() == got.argmax()
print(f'ONNX matches PyTorch: largest score difference {worst:.6f}, same top sign every time')
