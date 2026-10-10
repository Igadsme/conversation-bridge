import { createFileRoute } from "@tanstack/react-router";
import { PrototypeNote, Shell } from "@/components/sora-ui";
import Recognizer from "@/recognizer";
import "@/sora-tools.css";

export const Route = createFileRoute("/sign")({
  head: () => ({
    meta: [
      { title: "Sign to Speech — Sora" },
      { name: "description", content: "Sign, review the possible message, then have Sora speak it aloud." },
      { property: "og:title", content: "Sign to Speech — Sora" },
      { property: "og:description", content: "Review every sign suggestion before it's spoken." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Camera, MediaPipe and the on-device models are browser-only.
  ssr: false,
  component: SignToSpeech,
});

function SignToSpeech() {
  return (
    <Shell title="Sign to Speech">
      {/* Real pipeline: camera → on-device recognition → sentence
          builder → Gemini translation → signer approval → speech */}
      <div className="sora-tools">
        <Recognizer />
      </div>
      <PrototypeNote>
        Camera video stays in this browser — only the recognized sign words
        leave the device, and only after you press Done.
      </PrototypeNote>
    </Shell>
  );
}
