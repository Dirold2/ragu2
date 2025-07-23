export interface VoiceConnectionOptions {
	guildId: string;
	channelId: string;
	userId: string;
	sessionId: string;
	token: string;
	endpoint: string;
}

export interface VoiceConnectionData {
	guildId: string;
	channelId: string;
	userId: string;
	sessionId?: string;
	token?: string;
	endpoint?: string;
}

export interface VoiceServerUpdate {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface VoiceStateUpdate {
	guild_id: string;
	channel_id: string | null;
	user_id: string;
	session_id: string;
}

export enum VoiceConnectionState {
	Disconnected = "disconnected",
	Connecting = "connecting",
	Connected = "connected",
	Ready = "ready",
	Destroyed = "destroyed",
}

export interface VolumeControl {
	setVolume(volume: number, duration?: number): Promise<void>;
	setVolumeFast(volume: number): Promise<void>;
	getVolume(): number;
}

export interface EqualizerControl {
	bass: number;
	treble: number;
	setEqualizer(bass: number, treble: number): Promise<void>;
}

export interface CompressorControl {
	compressor: boolean;
	setCompressor(enabled: boolean): Promise<void>;
}

export interface LowPassFilterControl {
	lowPassFrequency: number; // Гц, например 0 (выкл) или 20-20000
	setLowPassFilter(frequency: number, q?: number): Promise<void>;
}
