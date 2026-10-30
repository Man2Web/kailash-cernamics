"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Scan input for godown phones and counters: USB/Bluetooth scanners type the code and press Enter
 * (keyboard wedge); the camera button uses the browser's BarcodeDetector where available
 * (Chrome on Android). Calls onScan with the decoded text.
 */
export function ScanBox({ onScan, placeholder = "Scan or type a code / SKU", autoFocus, className }: { onScan: (code: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  return (
    <div className={cn("space-y-2", className)}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (v) onScan(v);
          setValue("");
        }}
      >
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="h-12 pl-10 text-[16px]" aria-label="Scan code" autoComplete="off" />
        </div>
        {supported && (
          <Button type="button" variant="secondary" className="h-12 px-4" onClick={() => setCamera((c) => !c)} aria-label="Scan with camera">
            {camera ? <X className="size-5" /> : <Camera className="size-5" />}
          </Button>
        )}
        <Button type="submit" className="h-12 px-4">
          Go
        </Button>
      </form>
      {camera && (
        <CameraScanner
          onCode={(c) => {
            setCamera(false);
            onScan(c);
          }}
        />
      )}
    </div>
  );
}

function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) return onCode(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Camera not available. Allow camera access or use a scanner.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="overflow-hidden rounded-xl bg-black">
      {error ? <p className="p-4 text-[13px] text-white">{error}</p> : <video ref={video} className="aspect-video w-full object-cover" muted playsInline />}
    </div>
  );
}
