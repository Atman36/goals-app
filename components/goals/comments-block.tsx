"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createSignedUpload } from "@/lib/actions/media";
import { addComment, deleteComment } from "@/lib/actions/comments";
import type { Comment } from "@/lib/db/schema";
import { MAX_UPLOAD_BYTES } from "@/lib/validators/media";

// BUCKET_MEDIA mirrors lib/storage.ts's bucket name — see cover-upload.tsx for
// why this client-side copy exists (that module imports the server-only
// Supabase client).
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

export interface CommentWithPhotoUrl extends Comment {
  photoUrl: string | null;
}

export function CommentsBlock({
  goalId,
  comments,
}: {
  goalId: string;
  comments: CommentWithPhotoUrl[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Mirrors pendingPhoto.previewUrl so the blob can be freed from callbacks
   *  without reading possibly-stale state. */
  const blobUrlRef = useRef<string | undefined>(undefined);

  /** Frees the staged preview's blob URL and clears it — the preview was
   *  previously dropped from state without ever being revoked (CR-032). */
  function clearPendingPhoto() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = undefined;
    }
    setPendingPhoto(null);
  }

  async function handleFile(file: File) {
    if (uploading) return;
    setError(undefined);
    setNotice(undefined);
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      setError("Файл больше 10 МБ");
      return;
    }
    const mimeType = await detectImageMime(file);
    if (!mimeType) {
      setError("Поддерживаются только JPG, PNG и WEBP");
      return;
    }

    setUploading(true);
    // finally clears "Загружаем…" even when a Server Action or the storage
    // upload throws — that state used to stick forever (CR-032).
    try {
      const signed = await createSignedUpload({
        goalId,
        fileName: `comment.${EXT_BY_MIME[mimeType]}`,
        fileSize: file.size,
        mimeType,
      });
      if (!signed.ok) {
        setError(signed.error);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_MEDIA)
        .uploadToSignedUrl(signed.path, signed.token, file);

      if (uploadError) {
        setError("Не удалось загрузить файл");
        return;
      }

      // Replacing an earlier staged photo must free that blob first.
      clearPendingPhoto();
      const previewUrl = URL.createObjectURL(file);
      blobUrlRef.current = previewUrl;
      setPendingPhoto({ path: signed.path, previewUrl });
    } catch {
      setError("Не удалось загрузить файл — проверьте соединение и попробуйте ещё раз");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Введите текст комментария");
      return;
    }
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      try {
        const result = await addComment({
          goalId,
          body: body.trim(),
          media: pendingPhoto ? { path: pendingPhoto.path } : undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // The comment saved; the photo may still have failed on its own — say
        // so instead of reporting a clean success (CR-019).
        if (result.warning) setNotice(result.warning);
        setBody("");
        clearPendingPhoto();
        router.refresh();
      } catch {
        setError("Не удалось отправить комментарий — попробуйте ещё раз");
      }
    });
  }

  function handleDelete(commentId: string) {
    if (typeof window !== "undefined" && !window.confirm("Удалить комментарий?")) return;
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      try {
        const result = await deleteComment(goalId, commentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Не удалось удалить комментарий — попробуйте ещё раз");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-base font-medium">Комментарии</h3>

      <ul className="flex flex-col gap-3">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет комментариев.</p>
        ) : (
          [...comments].reverse().map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 text-sm whitespace-pre-wrap">{c.body}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Удалить комментарий"
                  disabled={isPending}
                  onClick={() => handleDelete(c.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset
                <img src={c.photoUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
              ) : null}
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
        <textarea
          rows={3}
          placeholder="Написать комментарий…"
          aria-label="Текст комментария"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        {pendingPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset
          <img src={pendingPhoto.previewUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" /> {uploading ? "Загружаем…" : "Фото"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <Button type="submit" disabled={isPending || uploading}>
            {isPending ? "Отправляем…" : "Отправить"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </form>
    </div>
  );
}
