// Объявляем интерфейс VoiceService

interface VoiceServiceInterface {
    clearQueue(): Promise<void>;
    isConnected(): boolean;
    isPlaying(): boolean;
    joinChannel(interaction: CommandInteraction): Promise<void>;
    leaveChannel(): Promise<void>;
    pause(): void;
    playNextTrack(track: TrackInterface): Promise<void>;
    resume(): Promise<void>;
    stopPlayer(): void;
    unpause(): void;
}

import { CommandInteraction } from 'discord.js';
// Импортируем необходимые модули
import { clearQueue } from './cmp/clearQueue.ts';
import { isConnected } from './cmp/isConnected.ts';
import { isPlaying } from './cmp/isPlaying.ts';
import { joinChannel } from './cmp/joinChannel.ts';
import { leaveChannel } from './cmp/leaveChannel.ts';
import { pause } from './cmp/pause.ts';
import { playNextTrack, TrackInterface } from './cmp/playNextTrack.ts';
import { resume } from './cmp/resume.ts';
import { stopPlayer } from './cmp/stopPlayer.ts';
import { unpause } from './cmp/unpause.ts';

// Создаем объект voiceService с функциями
const voiceService: VoiceServiceInterface = {
    clearQueue: clearQueue as unknown as () => Promise<void>,
    isConnected: isConnected as unknown as () => boolean,
    isPlaying: isPlaying as unknown as () => boolean,
    joinChannel: joinChannel as unknown as () => Promise<void>,
    leaveChannel: leaveChannel as unknown as () => Promise<void>,
    pause: pause as unknown as () => void,
    playNextTrack: playNextTrack as unknown as () => Promise<void>,
    resume: resume as unknown as () => Promise<void>,
    stopPlayer: stopPlayer as unknown as () => void,
    unpause: unpause as unknown as () => void,
};

export const VoiceService = voiceService;
// Экспортируем voiceService


// this.voiceService.clearQueue()