import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/**
 * Files shared to the Android app from another app (Share → Scam Check): MainActivity copies them into the app's cache
 * and opens /share?files=a,b&mimes=x,y. Pictures, PDFs and recordings go to Check, a video to 🎬 Video.
 */
export interface SharedFile { name: string; mime: string }

const NAME = /^shared-\d+-\d+\.[a-z0-9]{2,5}$/;
export function sharedFiles(q: URLSearchParams): SharedFile[] {
  const names = (q.get('files') ?? q.get('file') ?? '').split(',');
  const mimes = (q.get('mimes') ?? q.get('mime') ?? '').split(',');
  return names.map((name, i) => ({ name, mime: mimes[i] || 'image/jpeg' })).filter((f) => NAME.test(f.name) || /^shared-\d+\.(jpg|pdf)$/.test(f.name));
}

/** Read a shared file straight from the cache (no copy in memory as text, so big videos are fine), then remove it. */
export async function openShared(f: SharedFile): Promise<File> {
  const { uri } = await Filesystem.getUri({ path: f.name, directory: Directory.Cache });
  const res = await fetch(Capacitor.convertFileSrc(uri));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  void Filesystem.deleteFile({ path: f.name, directory: Directory.Cache }).catch(() => undefined);
  return new File([blob], f.name, { type: f.mime });
}
