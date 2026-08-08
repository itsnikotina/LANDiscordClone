import { useState, useEffect } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export async function getAudioDevices(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] }> {
  await navigator.mediaDevices.getUserMedia({ audio: true }); // request permissions first
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs: AudioDevice[] = [];
  const outputs: AudioDevice[] = [];
  
  for (const device of devices) {
    if (device.kind === 'audioinput') {
      inputs.push({ deviceId: device.deviceId, label: device.label || `Microphone ${inputs.length + 1}`, kind: device.kind });
    } else if (device.kind === 'audiooutput') {
      outputs.push({ deviceId: device.deviceId, label: device.label || `Speaker ${outputs.length + 1}`, kind: device.kind });
    }
  }
  
  return { inputs, outputs };
}

export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false
  });
}

export function applyNoiseGate(stream: MediaStream, threshold: number): MediaStream {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const gainNode = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  
  source.connect(analyser);
  analyser.connect(gainNode);
  gainNode.connect(dest);
  
  const data = new Float32Array(analyser.frequencyBinCount);
  
  const checkGate = () => {
    analyser.getFloatFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    
    if (avg > threshold) {
      gainNode.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    } else {
      gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
    
    requestAnimationFrame(checkGate);
  };
  
  checkGate();
  
  return dest.stream;
}

export function createVADProcessor(stream: MediaStream, onSpeak: () => void, onSilence: () => void): { start: () => void; stop: () => void } {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  
  const data = new Float32Array(analyser.frequencyBinCount);
  let isSpeaking = false;
  let active = false;
  let timeoutId: any;
  
  const checkVAD = () => {
    if (!active) return;
    analyser.getFloatFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    
    if (avg > -50) {
      if (!isSpeaking) {
        isSpeaking = true;
        onSpeak();
      }
    } else {
      if (isSpeaking) {
        isSpeaking = false;
        onSilence();
      }
    }
    
    timeoutId = setTimeout(checkVAD, 100);
  };
  
  return {
    start: () => {
      active = true;
      checkVAD();
    },
    stop: () => {
      active = false;
      clearTimeout(timeoutId);
      ctx.close();
    }
  };
}

export async function setOutputDevice(audioEl: HTMLAudioElement, deviceId: string): Promise<void> {
  if (typeof (audioEl as any).setSinkId !== 'undefined') {
    try {
      await (audioEl as any).setSinkId(deviceId);
    } catch (e) {
      console.error('Error setting output device', e);
    }
  } else {
    console.warn('setSinkId is not supported in this browser.');
  }
}

export function useSpeakingDetection(stream: MediaStream | null, threshold: number = -50): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  useEffect(() => {
    if (!stream) return;
    
    const vad = createVADProcessor(
      stream,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
    
    vad.start();
    
    return () => {
      vad.stop();
    };
  }, [stream, threshold]);
  
  return isSpeaking;
}
