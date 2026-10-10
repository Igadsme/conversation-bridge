import { useEffect, useRef, useState } from 'react'
import { DrawingUtils, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import './CameraView.css'

// Keep this version in sync with @mediapipe/tasks-vision in package.json
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'
const MODEL_URL = '/models/hand_landmarker.task'

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Starting camera…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null
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

        // 2. Hand model
        setStatus('Loading hand model…')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        if (cancelled) return stopAll()
        setStatus('Tracking hands')

        // 3. Render loop: detect hands on each new video frame and draw them
        const ctx = canvas.getContext('2d')!
        const drawing = new DrawingUtils(ctx)
        let lastVideoTime = -1

        function loop() {
          if (!landmarker) return

          // Only run the model when the camera has produced a new frame
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const result = landmarker.detectForVideo(video, performance.now())

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            for (const hand of result.landmarks) {
              drawing.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
                color: '#00e5ff',
                lineWidth: 4,
              })
              drawing.drawLandmarks(hand, { color: '#ff2d55', radius: 4 })
            }
          }

          frameId = requestAnimationFrame(loop)
        }
        loop()
      } catch (err) {
        console.error(err)
        setError('Could not start the camera or hand model. Check the console for details.')
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
      <div className="camera">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>
      <p className="camera-status">{error ?? status}</p>
    </div>
  )
}

