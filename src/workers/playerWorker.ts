import { parentPort } from 'worker_threads';
import { validateMessage, prepareResourceData, WorkerMessage, ResourceData } from './workerUtils.js';

if (!parentPort) {
  throw new Error('This script must be run as a Worker thread');
}

parentPort.on('message', (message: WorkerMessage) => {
  try {
    validateMessage(message);

    if (message.type === 'createAudioResource') {
      const resourceData: ResourceData = prepareResourceData(message.url, message.volume);
      
      parentPort!.postMessage({ 
        type: 'resourceCreated' as const, 
        resourceData
      });
    } else {
      throw new Error(`Unsupported message type: ${message.type}`);
    }
  } catch (error) {
    parentPort!.postMessage({ 
      type: 'error' as const, 
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
    });
  }
});

parentPort.postMessage({ type: 'ready' as const });