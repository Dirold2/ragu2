import type { Track } from "./index.js";

export interface AudioProcessingOptions {
  volume: number;
  bass: number;
  treble: number;
  compressor: boolean;
  normalize: boolean;
  headers?: Record<string, string>;
  fade?: {
    fadein: number;
    fadeout: number;
  };
}

export interface PlayerState {
  connection: unknown;
  isPlaying: boolean;
  channelId: string | null;
  volume: number;
  currentTrack: Track | null;
  nextTrack: Track | null;
  lastUserTrack: Track | null;
  loop: boolean;
  pause: boolean;
  compressor: boolean;
  normalize: boolean;
  bass: number;
}

export enum PlayerStatus {
  IDLE = "idle",
  PLAYING = "playing",
  PAUSED = "paused",
  TRANSITIONING = "transitioning",
  DESTROYED = "destroyed",
}

export enum PlayerServiceEvents {
  PLAYING = "playing",
  PAUSED = "paused",
  TRACK_STARTED = "trackStarted",
  TRACK_ENDED = "trackEnded",
  QUEUE_EMPTY = "queueEmpty",
  VOLUME_CHANGED = "volumeChanged",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  TRACK_QUEUED = "trackQueued",
}
