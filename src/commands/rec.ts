import { joinVoiceChannel, createAudioPlayer, VoiceConnectionStatus, createAudioResource, DiscordGatewayAdapterCreator } from "@discordjs/voice";
import sodium from "sodium-native";
import { Discord, Slash } from "discordx";
import fs from "fs/promises";
import { CommandInteraction, DiscordAPIError, GuildMember, PermissionFlagsBits } from "discord.js";
import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

@Discord()
export class RecCommand {

    @Slash({ description: "Запись", name: "rec" })
    async rec(interaction: CommandInteraction): Promise<void> {
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel || !voiceChannel.permissionsFor(member).has(PermissionFlagsBits.Connect)) {
            interaction.reply("Нет доступа к каналу");
            return;
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild?.id as string,
            adapterCreator: interaction.guild!.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        });

        logger.info("Подключение к голосовому каналу успешно");

        let audioBuffer = Buffer.alloc(0);
        let startTime = Date.now();
        const player = createAudioPlayer();

        connection.subscribe(player);

        // Записываем аудио в течение 30 секунд
        await new Promise<void>((resolve) => {
            const intervalId = setInterval(async () => {
                const resource = createAudioResource(`some-audio-source`);
                player.play(resource);

                const buffer = Buffer.alloc(20);
                sodium.randombytes_buf(buffer);

                if (!buffer.length) {
                    clearInterval(intervalId);
                    resolve();
                } else {
                    audioBuffer = Buffer.concat([audioBuffer, buffer]);

                    if ((Date.now() - startTime) / 1000 >= 5) {
                        await this.saveAudio(audioBuffer);
                        audioBuffer = Buffer.alloc(0);
                        startTime = Date.now();
                    }
                }
            }, 50);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            connection.destroy();
            logger.info("Закрытие соединения");
        });
    }

    async saveAudio(buffer: Buffer): Promise<void> {
        const now = Date.now();
        const fileName = `recording_${now}.mp3`;
        const filePath = `./recordings/${fileName}`;

        try {
            await fs.mkdir('./recordings', { recursive: true });
        } catch (error) {
            if ((error as DiscordAPIError).code !== 'EEXIST') throw error;
        }

        await fs.writeFile(filePath, buffer);
        logger.info(`Аудио записано как ${fileName}`);
    }
}