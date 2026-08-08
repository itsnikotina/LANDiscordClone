import { useState, useCallback } from 'react';

export interface ScreenShareOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  cursor?: 'always' | 'motion' | 'never';
}

export async function startScreenCapture(options: ScreenShareOptions = {}): Promise<MediaStream> {
  const constraints: DisplayMediaStreamOptions = {
    video: {
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      frameRate: options.frameRate ?? 30,
      // cursor is valid for getDisplayMedia but not typed in standard DOM lib
      ...(options.cursor ? { cursor: options.cursor } : {}),
    } as MediaTrackConstraints,
    audio: true,
  };
  
  return await navigator.mediaDevices.getDisplayMedia(constraints);
}

export function stopScreenCapture(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

export function createScreenSharePreview(stream: MediaStream, container: HTMLElement): HTMLVideoElement {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true; // Mute preview so we don't hear ourselves
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'contain';
  
  container.appendChild(video);
  return video;
}

export function removeScreenSharePreview(container: HTMLElement): void {
  const video = container.querySelector('video');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
  }
}

export function useScreenShare() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (options?: ScreenShareOptions) => {
    try {
      setError(null);
      const mediaStream = await startScreenCapture(options);
      
      mediaStream.getVideoTracks()[0].onended = () => {
        setStream(null);
        setIsSharing(false);
      };
      
      setStream(mediaStream);
      setIsSharing(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start screen share');
      setIsSharing(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (stream) {
      stopScreenCapture(stream);
      setStream(null);
      setIsSharing(false);
    }
  }, [stream]);

  return {
    stream,
    isSharing,
    start,
    stop,
    error
  };
}
