export class UserNotInVoiceChannelError extends Error {
	constructor() {
		super("User is not in a voice channel");
		this.name = "UserNotInVoiceChannelError";
	}
}

export class TrackNotFoundError extends Error {
	constructor(trackId: string) {
		super(`Track not found: ${trackId}`);
		this.name = "TrackNotFoundError";
	}
}

export class VoiceConnectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VoiceConnectionError";
	}
}

export class PluginNotFoundError extends Error {
	constructor(source: string) {
		super(`Plugin not found for source: ${source}`);
		this.name = "PluginNotFoundError";
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}
