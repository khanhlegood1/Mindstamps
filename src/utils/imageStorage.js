// Firestore rejects a single field value larger than 1,048,487 bytes
// (the error the app was throwing: "The value of property \"imageData\"
// is longer than 1048487 bytes."). Leave a safety margin under that hard
// cap for the rest of the document (title, story, location, timestamps).
export const MAX_IMAGE_DATA_URL_BYTES = 1000000;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// Longest-side pixel counts to try, largest first, and the JPEG quality
// levels to try at each size, highest first. We walk both from "biggest
// and best" down to "smallest and most compressed" and return as soon as
// something fits, so the result always uses as much of the allowed
// budget as it can for the sharpest image that still fits.
const DIMENSION_STEPS = [1920, 1600, 1280, 1024, 800, 640, 480];
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

/**
 * Reads an image file and returns a data URL guaranteed (barring a
 * pathological edge case) to be at or under maxBytes, resizing/
 * re-compressing only as much as needed. If the original file already
 * fits, it's returned untouched (no quality lost for small photos).
 */
export async function fileToStoredImageDataUrl(file, { maxBytes = MAX_IMAGE_DATA_URL_BYTES } = {}) {
  const original = await readFileAsDataURL(file);
  if (original.length <= maxBytes) return original;

  const img = await loadImageElement(file);
  let smallestSoFar = null;

  for (const maxDim of DIMENSION_STEPS) {
    const longestSide = Math.max(img.width, img.height);
    const scale = Math.min(1, maxDim / longestSide);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!smallestSoFar || dataUrl.length < smallestSoFar.length) {
        smallestSoFar = dataUrl;
      }
      if (dataUrl.length <= maxBytes) {
        return dataUrl;
      }
    }
  }

  // Extremely unlikely (would need a huge image with almost no
  // compressible detail) -- fall back to the smallest thing we made.
  return smallestSoFar || original;
}
