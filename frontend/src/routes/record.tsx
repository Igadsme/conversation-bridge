import { createFileRoute } from "@tanstack/react-router";
import { PrototypeNote, Shell } from "@/components/sora-ui";
import Recorder from "@/recorder";
import "@/sora-tools.css";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "Personal Training — Sora" },
      { name: "description", content: "Record your own signs to calibrate the on-device recognizer." },
      { property: "og:title", content: "Personal Training — Sora" },
      { property: "og:description", content: "Record your own signs for a personal calibration model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Camera and on-device models are browser-only.
  ssr: false,
  component: PersonalTraining,
});

function PersonalTraining() {
  return (
    <Shell title="Personal Training">
      <p className="mt-2 text-sm text-muted-foreground">
        Record your own signs (and everyday movements as "not a sign") so the
        personal model recognizes your signing. Only landmark points are saved —
        never video.
      </p>
      <div className="sora-tools">
        <Recorder />
      </div>
      <PrototypeNote>
        Your recordings stay in this browser. Ask permission before recording anyone else.
      </PrototypeNote>
    </Shell>
  );
}
