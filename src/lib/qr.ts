import jsQR from 'jsqr';

/**
 * Reads a QR code in a picture, on the phone itself (free, nothing is sent anywhere): the phone's own reader when
 * it has one, else jsQR. Returns what the QR code says (usually a link), or '' when there is none.
 */
export async function readQr(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('picture'));
    i.src = dataUrl;
  });
  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Detector) {
    try {
      const found = await new Detector({ formats: ['qr_code'] }).detect(img);
      if (found[0]?.rawValue) return found[0].rawValue.slice(0, 2000);
    } catch { /* fall back to jsQR */ }
  }
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  return jsQR(data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' })?.data.slice(0, 2000) ?? '';
}
