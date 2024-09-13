import { VoiceConnection } from "@discordjs/voice";

export class isConnected {
    private connection: VoiceConnection | null = null;
    
    public isConnected(): boolean {
        return !!this.connection;
    }
}