"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createSignedUpload, registerMedia, setGoalCover } from "@/lib/actions/media";
import { trackGalleryOpened } from "@/lib/actions/analytics";
import { Lightbox, type LightboxItem } from "@/components/gallery/lightbox";
import { cn } from "@/lib/utils";

// Mirrors lib/storage.ts's MAX_UPLOAD_BYTES/BUCKET_MEDIA — see cover-upload.tsx
// for why this client-side copy exists (that module imports the server-only
// Supabase client). The Server Action re-validates before minting the URL.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const BUCKET_MEDIA = "media";

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

export interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
}

/** Hero cover + thumbnail strip + upload tile + lightbox — the goal page's
 *  left column and its only gallery surface ("gallery = the left column
 *  thumbs, no separate section" per T8 layout). `images[0]` is expected to
 *  be the current cover (page.tsx sorts it to the front). */
export function GoalGallery({
  goalId,
  images,
  coverMediaId,
}: {
  goalId: string;
  images: GalleryImage[];
  coverMediaId: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const lightboxItems: LightboxItem[] = images.map((img) => ({
    url: img.url,
    caption: img.caption ?? undefined,
  }));

  function openLightbox(index: number) {
    setOpenIndex(index);
    void trackGalleryOpened(goalId);
  }

  async function handleFiles(files: FileList) {
    setError(undefined);
    setUploading(true);

    for (const file of Array.from(files)) {
      if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        setError("Файл больше 10 МБ — пропущен");
        continue;
      }
      const mimeType = await detectImageMime(file);
      if (!mimeType) {
        setError("Поддерживаются только JPG, PNG и WEBP");
        continue;
      }

      const signed = await createSignedUpload({
        goalId,
        fileName: `gallery.${EXT_BY_MIME[mimeType]}`,
        fileSize: file.size,
        mimeType,
      });
      if (!signed.ok) {
        setError(signed.error);
        continue;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_MEDIA)
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (uploadError) {
        setError("Не удалось загрузить файл");
        continue;
      }

      await registerMedia({ goalId, path: signed.path });
    }

    setUploading(false);
    router.refresh();
  }

  async function handleSetCover(mediaId: string) {
    const result = await setGoalCover(goalId, mediaId);
    if (result.ok) router.refresh();
  }

  const hero = images[0];
  const thumbnails = images.slice(1);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[360px] w-full overflow-hidden rounded-[20px] bg-muted">
        {hero ? (
          <button type="button" className="block size-full" onClick={() => openLightbox(0)}>
            <Image src={hero.url} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </button>
        ) : (
          <div aria-hidden className="size-full [background-image:var(--gradient-tile)]" />
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {thumbnails.map((img, i) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl">
            <button type="button" className="block size-full" onClick={() => openLightbox(i + 1)}>
              <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
            </button>
            {img.id !== coverMediaId ? (
              <button
                type="button"
                title="Сделать обложкой"
                onClick={() => handleSetCover(img.id)}
                className="absolute top-1 right-1 hidden rounded-full bg-background/85 p-1 text-foreground group-hover:block"
              >
                <Star className="size-3.5" />
              </button>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-foreground/18 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground",
          )}
        >
          <ImagePlus className="size-5" />
          {uploading ? "Загрузка…" : "Добавить"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = "";
            if (files && files.length > 0) void handleFiles(files);
          }}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Lightbox items={lightboxItems} openIndex={openIndex} onClose={() => setOpenIndex(null)} />
    </div>
  );
}
