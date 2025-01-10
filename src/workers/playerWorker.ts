import { parentPort } from 'worker_threads';
import { StreamType } from '@discordjs/voice';
import { WorkerMessage, ResourceData } from '../types/index.js';

if (!parentPort) {
  throw new Error('This script must be run as a Worker thread');
}

function validateMessage(message: WorkerMessage): void {
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

function prepareResourceData(url: string, volume: number): ResourceData {
  return {
    url,
    volume: volume / 100,
    inputType: StreamType.Arbitrary,
  };
}

parentPort.on('message', (message: WorkerMessage) => {
  try {
    validateMessage(message);

    if (message.type === 'createAudioResource') {
      const resourceData = prepareResourceData(message.url, message.volume);
      parentPort!.postMessage({ type: 'resourceCreated', resourceData });
    } else {
      throw new Error(`Unsupported message type: ${message.type}`);
    }
  } catch (error) {
    parentPort!.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

parentPort.postMessage({ type: 'ready' });