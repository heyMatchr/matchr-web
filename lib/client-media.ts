"use client";

export async function compressImageFile(
  file: File,
  {
    maxBytes = 1_500_000,
    maxSide = 1280,
    quality = 0.82,
  }: {
    maxBytes?: number;
    maxSide?: number;
    quality?: number;
  } = {},
) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  try {
    const imageUrl = URL.createObjectURL(file);
    const image = document.createElement("img");

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read this image."));
      image.src = imageUrl;
    });

    URL.revokeObjectURL(imageUrl);

    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);

    if (largestSide <= maxSide && file.size <= maxBytes) {
      return file;
    }

    const scale = Math.min(1, maxSide / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "matchr-media"}.jpg`,
      {
        lastModified: Date.now(),
        type: "image/jpeg",
      },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Media] image compression fallback", error);
    }

    return file;
  }
}
