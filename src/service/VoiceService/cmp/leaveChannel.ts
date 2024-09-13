import { VoiceConnection } from "@discordjs/voice";

export class leaveChannel {
    private connection: VoiceConnection | null = null;
    
    async leaveChannel(): Promise<void> {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
    }

}