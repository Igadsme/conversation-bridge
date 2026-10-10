import { useEffect, useRef, useState } from 'react'
import './CameraView.css'

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const video = videoRef.current!
        video.srcObject = stream
        await video.play()

        // Make the canvas the exact pixel size of the camera image
        const canvas = canvasRef.current!
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // Test drawing: proves the overlay lines up. Delete in step 3.
        const ctx = canvas.getContext('2d')!
        ctx.strokeStyle = 'lime'
        ctx.lineWidth = 6
        ctx.strokeRect(40, 40, 300, 300)
      } catch (err) {
        console.error(err)
        setError('Could not open the camera. Check your browser permissions.')
      }
    }

    startCamera()

    // Turn the camera off when the component goes away
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div>
      <div className="camera">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>
      {error && <p className="camera-error">{error}</p>}
    </div>
  )
}

// Here's why some of these lines are there:
// - cancelled flag: in dev mode, React runs effects twice. Without this flag the first camera stream never gets stopped, and your webcam light stays on.
// - canvas.width = video.videoWidth: MediaPipe returns points as 0–1 fractions of the image. If the canvas matches the real camera resolution, you just multiply by width and height and the points land in the right place.
// - playsInline muted: without these, Safari and iPads won't autoplay the video.