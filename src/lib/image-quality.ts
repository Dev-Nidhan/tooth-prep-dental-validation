export type ImageQuality = {
  blurScore: number;
  meanLuma: number;
  clippedFraction: number;
  label: string;
  ok: boolean;
};

/** Sharpness and exposure of a chairside photo. This does not measure millimetres. */
export function assessImage(image: ImageData): ImageQuality {
  const { data, width, height } = image;
  if (width < 8 || height < 8) {
    return { blurScore: 0, meanLuma: 0, clippedFraction: 1, label: "Too small", ok: false };
  }
  let lumaSum = 0;
  let clipped = 0;
  const count = width * height;
  const luma = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = y;
    lumaSum += y;
    if (y < 8 || y > 247) clipped += 1;
  }
  const mean = lumaSum / count;
  const clippedFraction = clipped / count;
  let acc = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = luma[y * width + x];
      const lap =
        luma[(y - 1) * width + x] +
        luma[(y + 1) * width + x] +
        luma[y * width + x - 1] +
        luma[y * width + x + 1] -
        4 * center;
      acc += lap * lap;
      lapCount += 1;
    }
  }
  const blurScore = acc / Math.max(lapCount, 1);
  if (mean < 45) {
    return { blurScore, meanLuma: mean, clippedFraction, label: "Too dark", ok: false };
  }
  if (clippedFraction > 0.18) {
    return { blurScore, meanLuma: mean, clippedFraction, label: "Blown highlights", ok: false };
  }
  if (blurScore < 40) {
    return { blurScore, meanLuma: mean, clippedFraction, label: "Soft — retake if you can", ok: false };
  }
  return { blurScore, meanLuma: mean, clippedFraction, label: "Sharp enough", ok: true };
}

export function qualityFromUrl(url: string): Promise<ImageQuality> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longest > 240 ? 240 / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(8, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(8, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Could not read that image."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(assessImage(ctx.getImageData(0, 0, canvas.width, canvas.height)));
    };
    img.onerror = () => {
      reject(new Error("Could not read that image. Use JPEG, PNG, or WEBP. iPhone HEIC photos need Most Compatible turned on, or use the in-page camera."));
    };
    img.src = url;
  });
}
