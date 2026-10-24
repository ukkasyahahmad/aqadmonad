"use client";

/** Downscales a photo in the browser (max 1200 px, WebP) so uploads stay small and fast. */
export async function compressImage(file: File, maxSide = 1200): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (!blob) throw new Error("Could not process this image.");
  return new File([blob], "photo.webp", { type: "image/webp" });
}

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", await compressImage(file));
  const res = await fetch("/api/upload", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== "string") throw new Error(data.error ?? "Upload failed.");
  return data.url;
}
