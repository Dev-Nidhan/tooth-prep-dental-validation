"use client";

import { CameraIcon, CameraRotateIcon, ImagesIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImageQuality } from "@/lib/image-quality";
import { nextView, VIEWS, type ViewId } from "@/lib/views";
import { cn } from "@/lib/utils";

export type PhotoShot = {
  id: string;
  view: ViewId;
  url: string;
  name: string;
  quality: ImageQuality | null;
  qualityError: string | null;
};

function cameraMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Camera permission was blocked. Allow the camera for this site, or choose a photo from the gallery.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found. Use the gallery, or the system camera if the phone has one.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The camera could not be opened. Choose a photo from the gallery.";
}

export function PhotoDesk({
  photos,
  activeView,
  onActiveView,
  onAddFiles,
  onRemove,
  selectedId,
  onSelect,
}: {
  photos: PhotoShot[];
  activeView: ViewId;
  onActiveView: (view: ViewId) => void;
  onAddFiles: (items: { view: ViewId; file: File }[]) => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const systemRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const active = VIEWS.find((view) => view.id === activeView) ?? VIEWS[0];

  function takeFiles(fileList: FileList | null, singleView: boolean) {
    const files = [...(fileList ?? [])];
    if (files.length === 0) return;
    const start = VIEWS.findIndex((view) => view.id === activeView);
    const items = files.map((file, index) => ({
      view: singleView ? activeView : VIEWS[(start + index) % VIEWS.length].id,
      file,
    }));
    onAddFiles(items);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="flex-1" data-testid="open-camera-button" onClick={() => setCameraOpen(true)}>
          <CameraIcon size={18} />
          Live camera
        </Button>
        <Button type="button" variant="outline" className="flex-1" data-testid="system-camera-button" onClick={() => systemRef.current?.click()}>
          <CameraIcon size={18} />
          System camera
        </Button>
        <Button type="button" variant="outline" className="flex-1" data-testid="open-gallery-button" onClick={() => galleryRef.current?.click()}>
          <ImagesIcon size={18} />
          Gallery
        </Button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="sr-only"
        data-testid="open-gallery-input"
        onChange={(event) => {
          takeFiles(event.target.files, false);
          event.target.value = "";
        }}
      />
      <input
        ref={systemRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid="system-camera-input"
        onChange={(event) => {
          takeFiles(event.target.files, true);
          event.target.value = "";
        }}
      />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Gallery opens the photo library. System camera opens the phone camera app. Live camera stays on this page so you can shoot all five views without leaving the check. Nothing is uploaded.
      </p>

      <div className="flex gap-1 overflow-x-auto">
        {VIEWS.map((view) => {
          const filled = photos.some((photo) => photo.view === view.id);
          return (
            <button
              key={view.id}
              type="button"
              data-testid={`view-${view.id}`}
              onClick={() => onActiveView(view.id)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors",
                activeView === view.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
              )}
            >
              {view.label}
              {filled ? " ·" : ""}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{active.hint}</p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {VIEWS.map((view) => {
          const photo = photos.find((item) => item.view === view.id);
          return (
            <li key={view.id}>
              <div
                className={cn(
                  "overflow-hidden rounded-lg border bg-card",
                  selectedId && photo?.id === selectedId ? "border-primary" : "border-border",
                )}
                data-testid={`photo-slot-${view.id}`}
              >
                {photo ? (
                  <button type="button" className="block w-full text-left" onClick={() => onSelect(photo.id)}>
                    {/* Blob URLs cannot go through next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`${view.label} view of the preparation`} className="aspect-[4/3] w-full object-cover" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onActiveView(view.id)}
                    className="grid aspect-[4/3] w-full place-items-center px-2 text-center text-xs text-muted-foreground hover:bg-muted"
                  >
                    Empty
                    <span className="mt-1 block">{view.label}</span>
                  </button>
                )}
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{view.label}</p>
                    {photo?.quality && (
                      <p className={cn("truncate text-[11px]", photo.quality.ok ? "text-optimal" : "text-warning")}>{photo.quality.label}</p>
                    )}
                    {photo?.qualityError && <p className="truncate text-[11px] text-critical">{photo.qualityError}</p>}
                  </div>
                  {photo && (
                    <button
                      type="button"
                      aria-label={`Remove ${view.label} photo`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      onClick={() => onRemove(photo.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {cameraOpen && (
        <CameraSheet
          view={activeView}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            onAddFiles([{ view: activeView, file }]);
            onActiveView(nextView(activeView));
          }}
        />
      )}
    </div>
  );
}

function CameraSheet({
  view,
  onCapture,
  onClose,
}: {
  view: ViewId;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const label = VIEWS.find((item) => item.id === view)?.label ?? view;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser has no in-page camera. Use System camera or Gallery.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(cameraMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `${view}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      setSaved(`Saved to ${label}. The next view is armed.`);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121820] text-[#fbf8f4]" role="dialog" aria-modal="true" aria-label="Live camera">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm">
          Next shot: <span className="font-medium">{label}</span>
        </p>
        <button type="button" onClick={onClose} data-testid="close-camera" className="rounded-md p-2 hover:bg-white/10" aria-label="Close camera">
          <XIcon size={20} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" onLoadedData={() => setReady(true)} />
        <div className="pointer-events-none absolute inset-6 border border-white/70" />
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/80">
          Include the finish line. Put a probe or a known bur in the frame if you will measure.
        </p>
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-[#121820] px-6 text-center">
            <p className="max-w-sm text-sm leading-relaxed">{error}</p>
          </div>
        )}
      </div>
      <div className="space-y-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {saved && <p className="text-center text-sm text-[#E3C27A]">{saved}</p>}
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            data-testid="flip-camera"
            className="rounded-full border border-white/30 p-3"
            onClick={() => setFacing((current) => (current === "environment" ? "user" : "environment"))}
            aria-label="Flip camera"
          >
            <CameraRotateIcon size={22} />
          </button>
          <button
            type="button"
            data-testid="capture-shutter"
            disabled={!ready || Boolean(error)}
            onClick={shoot}
            className="h-16 w-16 rounded-full border-4 border-white bg-white/90 disabled:opacity-40"
            aria-label="Capture photo"
          />
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
