/** Remotion-compatible MovieMode timeline contract (v1). */

export type MovieModeTimeline = {
  version: 1;
  renderer: 'remotion' | 'moviepy' | 'ffmpeg' | 'hybrid';
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  brand: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    logoR2Key?: string;
  };
  tracks: Array<{
    id: string;
    type: 'video' | 'image' | 'audio' | 'text' | 'shape' | 'overlay';
    clips: Array<{
      id: string;
      assetId?: string;
      sceneId?: string;
      r2?: { bucket: string; key: string };
      startFrame: number;
      durationFrames: number;
      sourceStartMs?: number;
      sourceEndMs?: number;
      fit?: 'cover' | 'contain';
      volume?: number;
      text?: string;
      style?: Record<string, unknown>;
      transitionIn?: Record<string, unknown>;
      transitionOut?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  exportVariants: Array<{
    type:
      | 'master_music'
      | 'master_silent'
      | 'hero_loop'
      | 'reel'
      | 'short'
      | 'vertical'
      | 'thumbnail'
      | 'poster'
      | 'custom';
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
    loop: boolean;
  }>;
};
