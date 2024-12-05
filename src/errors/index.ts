export class UserNotInVoiceChannelError extends Error {
    constructor() {
        super("User is not in a voice channel");
        this.name = "UserNotInVoiceChannelError";
    }
}

export class PluginNotFoundError extends Error {
    constructor(source: string) {
        super(`Plugin not found for source: ${source}`);
        this.name = "PluginNotFoundError";
    }
}