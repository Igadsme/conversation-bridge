// CameraView - webcam feed with body tracking drawn on top.
// STEP 2: <video> shows the webcam, a <canvas> sits on top (both mirrored in CSS).
// STEP 3: MediaPipe tracked up to 2 hands each frame and drew them.
// STEP 4: onFrame passes each frame's data out (used by the recorder).
// STEP 6: switched from HandLandmarker to HolisticLandmarker, which tracks the
//         face, body and both hands - the 543 points the Kaggle model needs.
//         onFrame now also gets the frame already converted to the model's format.

import { useEffect, useRef, useState } from 'react'
import {
  DrawingUtils,
  FilesetResolver,
  HolisticLandmarker,
  type HolisticLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { toModelFrame } from './landmarks'
import './cameraview.css'

// Keep this version in sync with @mediapipe/tasks-vision in package.json
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'
const MODEL_URL = '/models/holistic_landmarker.task'

type Props = {
  // Called for every new video frame with MediaPipe's result and the same
  // frame as 543 x 3 numbers in the Kaggle model's order (see landmarks.ts)
  onFrame?: (result: HolisticLandmarkerResult, modelFrame: Float32Array) => void
}

// STEP 6: try the GPU first; some laptops can't run it, so fall back to the CPU
// The loaded MediaPipe runtime (the package doesn't export a name for this type)
type VisionFiles = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

async function createLandmarker(vision: VisionFiles) {
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      return await HolisticLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
      })
    } catch (err) {
      if (delegate === 'CPU') throw err
      console.warn('GPU not available for tracking, falling back to CPU', err)
    }
  }
  throw new Error('unreachable')
}

export default function CameraView({ onFrame }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Starting camera…')
  // Which body parts are tracked in the latest frame, once tracking runs
  const [tracked, setTracked] = useState<Record<string, boolean> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // STEP 4: the loop below starts once, so it reads onFrame through this ref
  // to always call the latest version without restarting the camera
  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  })

  useEffect(() => {
    let stream: MediaStream | null = null
    let landmarker: HolisticLandmarker | null = null
    let frameId = 0
    let cancelled = false

    // Turn off the camera, the render loop and the model
    function stopAll() {
      cancelAnimationFrame(frameId)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      stream = null
      landmarker = null
    }

    async function start() {
      try {
        // 1. Camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) return stopAll()

        const video = videoRef.current!
        video.srcObject = stream
        await video.play()

        const canvas = canvasRef.current!
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // 2. Holistic model (face + body + hands)
        setStatus('Loading tracking model…')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await createLandmarker(vision)
        if (cancelled) return stopAll()
        setStatus('')

        // 3. Render loop: track each new video frame and draw it
        const ctx = canvas.getContext('2d')!
        const drawing = new DrawingUtils(ctx)
        let lastVideoTime = -1
        let lastStatus = ''

        function loop() {
          if (!landmarker) return

          // Only run the model when the camera has produced a new frame
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const result = landmarker.detectForVideo(video, performance.now())
            // Only build the 543-point frame when someone is listening
            if (onFrameRef.current) onFrameRef.current(result, toModelFrame(result))

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            // Body: thin grey lines, so you can see the shoulders and arms are tracked
            for (const pose of result.poseLandmarks) {
              drawing.drawConnectors(pose, HolisticLandmarker.POSE_CONNECTIONS, {
                color: 'rgba(255, 255, 255, 0.5)',
                lineWidth: 2,
              })
            }
            // Hands: same cyan skeleton and red dots as before
            for (const hand of [...result.leftHandLandmarks, ...result.rightHandLandmarks]) {
              drawing.drawConnectors(hand, HolisticLandmarker.HAND_CONNECTIONS, {
                color: '#00e5ff',
                lineWidth: 4,
              })
              drawing.drawLandmarks(hand, { color: '#ff2d55', radius: 4 })
            }

            // Show which parts are tracked; only re-render when it changes
            const parts = {
              Face: result.faceLandmarks.length > 0,
              Body: result.poseLandmarks.length > 0,
              'Left hand': result.leftHandLandmarks.length > 0,
              'Right hand': result.rightHandLandmarks.length > 0,
            }
            const nextStatus = JSON.stringify(parts)
            if (nextStatus !== lastStatus) {
              lastStatus = nextStatus
              setTracked(parts)
            }
          }

          frameId = requestAnimationFrame(loop)
        }
        loop()
      } catch (err) {
        console.error(err)
        setError('Could not start the camera or tracking model. Check the console for details.')
      }
    }

    start()

    return () => {
      cancelled = true
      stopAll()
    }
  }, [])

  return (
    <div>
      <div className="camera-wrap">
        <div className="camera">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
        </div>
        {/* Outside the mirrored .camera box, so the text reads normally */}
        {!error && tracked && (
          <ul className="camera-parts" aria-label="Tracking">
            {Object.entries(tracked).map(([part, found]) => (
              <li key={part} className={found ? 'found' : ''}>
                <span aria-hidden />
                {part}
                <span className="sr-only">{found ? ' tracked' : ' not tracked'}</span>
              </li>
            ))}
          </ul>
        )}
        {!error && !tracked && status && <p className="camera-loading">{status}</p>}
      </div>
      {error && <p className="camera-error">{error}</p>}
    </div>
  )
}
