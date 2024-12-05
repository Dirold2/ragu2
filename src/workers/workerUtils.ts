import { StreamType } from '@discordjs/voice';

export interface WorkerMessage {
  type: string;
  url: string;
  volume: number;
}

export interface ResourceData {
  url: string;
  volume: number;
  inputType: StreamType;
}

export function validateMessage(message: WorkerMessage): void {
  if (!message || typeof message !== 'object' || !message.type) {
    throw new Error('Invalid message format');
  }

  if (message.type === 'createAudioResource') {
    if (!message.url || typeof message.url !== 'string') {
      throw new Error('Invalid or missing URL in message');
    }

    if (typeof message.volume !== 'number' || message.volume < 0 || message.volume > 100) {
      throw new Error('Volume must be a number between 0 and 100');
    }
  }
}

export function prepareResourceData(url: string, volume: number): ResourceData {
  return {
    url,
    volume: volume / 100,
    inputType: StreamType.Arbitrary,
  };
}