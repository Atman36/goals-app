"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { createSignedUpload } from "@/lib/actions/media";
import { MAX_UPLOAD_BYTES } from "@/lib/validators/media";

// BUCKET_MEDIA mirrors lib/storage.ts's bucket name. That module also imports
// the Supabase *server* client (next/headers), so it can't be imported here —
// this is the client-side UX-only copy; the Server Action re-checks size/type
// before minting the signed upload URL, which is the real gate (same
// client-schema/domain-schema split as goal-form).
const BUCKET_MEDIA = "media";

/** Client-side type check by magic bytes, not extension/mime — PRD §7. The
 *  Server Action re-validates before minting the signed upload URL. */
async function detectImageMime(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = (start: number, len: number) =>
    Array.from(head.slice(start, start + len))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  if (hex(0, 3) === "ffd8ff") return "image/jpeg";
  if (hex(0, 4) === "89504e47") return "image/png";
  if (hex(0, 4) === "52494646" && hex(8, 4) === "57454250") return "image/webp";
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type CoverUploadResult = { path: string; mimeType: string };

export function CoverUpload({
  goalId,
  initialPreviewUrl,
  onFileReady,
}: {
  /** undefined while creating a goal — it doesn't exist yet, so the signed
   *  upload path falls back to "unassigned"; registerMedia (called by the
   *  parent once the goal exists) is what actually attaches the media row. */
  goalId?: string;
  initialPreviewUrl?: string;
  onFileReady: (result: CoverUploadResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(initialPreviewUrl);
  const [status, setStatus] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    if (status === "uploading") return;
    setError(undefined);

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      setError("Файл больше 10 МБ");
      return;
    }

    const mimeType = await detectImageMime(file);
    if (!mimeType) {
      setError("Поддерживаются только JPG, PNG и WEBP");
      return;
    }

    setStatus("uploading");
    setPreviewUrl(URL.createObjectURL(file));

    const signed = await createSignedUpload({
      goalId,
      fileName: `cover.${EXT_BY_MIME[mimeType]}`,
      fileSize: file.size,
      mimeType,
    });

    if (!signed.ok) {
      setStatus("error");
      setError(signed.error);
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_MEDIA)
      .uploadToSignedUrl(signed.path, signed.token, file);

    if (uploadError) {
      setStatus("error");
      setError("Не удалось загрузить файл");
      return;
    }

    setStatus("ready");
    onFileReady({ path: signed.path, mimeType });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed border-foreground/18 transition",
          dragActive && "border-primary",
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob:/signed url preview, not an optimizable asset
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-primary-foreground"
            style={{ backgroundImage: "var(--gradient-tile)" }}
          >
            <ImageUp className="size-6" />
            <span>Перетащите изображение сюда или нажмите, чтобы выбрать файл</span>
            <span className="text-xs opacity-80">JPG, PNG, WEBP — до 10 МБ</span>
          </div>
        )}
        {status === "uploading" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm">
            <Loader2 className="size-4 animate-spin" /> Загружаем…
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
