import { EventEmitter } from "eventemitter3";
import {
	type CommandInteraction,
	type GuildMember,
	PermissionFlagsBits,
	type VoiceChannel,
} from "discord.js";
import {
	type DiscordGatewayAdapterCreator,
	entersState,
	getVoiceConnection,
	joinVoiceChannel,
	type VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import ms from "ms";
import type { Bot } from "../../bot.js";

export class ConnectionManager extends EventEmitter {
	private connection: VoiceConnection | null = null;
	private disconnectHandler: (() => Promise<void>) | null = null;
	private emptyChannelInterval: NodeJS.Timeout | null = null;
	private emptyChannelTimeout: NodeJS.Timeout | null = null;
	private bot: Bot;
	private isDestroyed = false;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 3;

	constructor(
		private guildId: string,
		bot: Bot,
	) {
		super();
		this.bot = bot;
	}

	async joinChannel(interaction: CommandInteraction): Promise<VoiceConnection> {
		const member = interaction.member as GuildMember;
		const voiceChannelId = member.voice.channel?.id;

		this.bot.logger.debug(`[joinChannel] Member: ${member?.id}`);
		this.bot.logger.debug(
			`[joinChannel] Voice channel ID: ${member?.voice.channelId}`,
		);

		if (!voiceChannelId || !this.hasVoiceAccess(member)) {
			this.bot.logger.debug("[joinChannel] No voice channel or access denied");
			throw new Error("User not in voice channel or no access");
		}

		// Проверяем существующее подключение
		const existingConnection = getVoiceConnection(this.guildId);
		if (existingConnection) {
			this.bot.logger.debug(
				"[joinChannel] Found existing connection, checking status",
			);

			// Проверяем, действительно ли подключение активно
			if (existingConnection.state.status === VoiceConnectionStatus.Destroyed) {
				this.bot.logger.debug(
					"[joinChannel] Existing connection is destroyed, cleaning up",
				);
				this.forceCleanup();
			} else {
				// Проверяем, находится ли бот действительно в канале
				const isActuallyConnected = await this.verifyActualConnection();
				if (!isActuallyConnected) {
					this.bot.logger.debug(
						"[joinChannel] Bot not actually in voice channel, destroying connection",
					);
					existingConnection.destroy();
					this.forceCleanup();
				} else {
					this.bot.logger.debug("[joinChannel] Reusing existing connection");
					this.connection = existingConnection;
					this.setupConnectionHandlers();
					return existingConnection;
				}
			}
		}

		try {
			this.bot.logger.debug("[joinChannel] Establishing new connection...");
			this.connection = await this.establishConnection(
				voiceChannelId,
				interaction,
			);
			this.bot.logger.debug("[joinChannel] Connection established");

			this.setupConnectionHandlers();
			this.startEmptyCheck();
			this.emit("connected", voiceChannelId);
			this.bot.logger.debug("[joinChannel] Emit connected");

			return this.connection;
		} catch (error) {
			this.bot.logger.debug("[joinChannel] Error during connection:", error);
			this.forceCleanup();
			throw error;
		}
	}

	private async verifyActualConnection(): Promise<boolean> {
		try {
			const channel = await this.getVoiceChannel();
			const userId = this.bot?.client.user?.id;
			return (
				channel !== null && userId !== undefined && channel.members.has(userId)
			);
		} catch (error) {
			this.bot.logger.debug("[verifyActualConnection] Error:", error);
			return false;
		}
	}

	private async establishConnection(
		channelId: string,
		interaction: CommandInteraction,
	): Promise<VoiceConnection> {
		if (!interaction.guild) {
			throw new Error("Guild not found");
		}

		const connection = joinVoiceChannel({
			channelId,
			guildId: this.guildId,
			adapterCreator: interaction.guild
				.voiceAdapterCreator as DiscordGatewayAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		try {
			await entersState(connection, VoiceConnectionStatus.Ready, 30000);
			this.reconnectAttempts = 0; // Сбрасываем счетчик при успешном подключении
			return connection;
		} catch (error) {
			connection.destroy();
			throw error;
		}
	}

	private hasVoiceAccess(member: GuildMember): boolean {
		const voiceChannel = member.voice.channel;
		return !!(
			voiceChannel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) &&
			voiceChannel.id
		);
	}

	private setupConnectionHandlers(): void {
		if (!this.connection || this.disconnectHandler) return;

		// Обработчик отключения
		this.disconnectHandler = async () => {
			if (this.isDestroyed) return;

			this.bot.logger.debug(
				"[ConnectionManager] Connection disconnected, attempting recovery",
			);

			try {
				if (!this.connection) return;

				// Проверяем, действительно ли бот был выкинут из канала
				const isActuallyConnected = await this.verifyActualConnection();
				if (!isActuallyConnected) {
					this.bot.logger.debug(
						"[ConnectionManager] Bot was kicked from channel",
					);
					this.emit("disconnected");
					this.forceCleanup();
					return;
				}

				// Пытаемся переподключиться
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.reconnectAttempts++;
					this.bot.logger.debug(
						`[ConnectionManager] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
					);

					await Promise.race([
						entersState(
							this.connection,
							VoiceConnectionStatus.Signalling,
							5000,
						),
						entersState(
							this.connection,
							VoiceConnectionStatus.Connecting,
							5000,
						),
					]);

					this.emit("reconnected");
					this.reconnectAttempts = 0;
				} else {
					this.bot.logger.debug(
						"[ConnectionManager] Max reconnect attempts reached",
					);
					this.emit("disconnected");
					this.forceCleanup();
				}
			} catch (error) {
				this.bot.logger.debug(
					"[ConnectionManager] Reconnection failed:",
					error,
				);
				this.emit("disconnected");
				this.forceCleanup();
			}
		};

		// Обработчик уничтожения подключения
		const destroyHandler = () => {
			this.bot.logger.debug("[ConnectionManager] Connection destroyed");
			this.emit("disconnected");
			this.forceCleanup();
		};

		this.connection?.on(
			VoiceConnectionStatus.Disconnected,
			this.disconnectHandler,
		);
		this.connection?.on(VoiceConnectionStatus.Destroyed, destroyHandler);

		// Дополнительная проверка состояния каждые 10 секунд
		const statusCheckInterval = setInterval(async () => {
			if (this.isDestroyed || !this.connection) {
				clearInterval(statusCheckInterval);
				return;
			}

			const isActuallyConnected = await this.verifyActualConnection();
			if (
				!isActuallyConnected &&
				this.connection?.state?.status !== VoiceConnectionStatus.Destroyed
			) {
				this.bot.logger.debug(
					"[ConnectionManager] Status check: Bot not in channel, cleaning up",
				);
				this.connection?.destroy();
			}
		}, 10000);

		// Очищаем интервал при уничтожении
		this.once("cleanup", () => {
			clearInterval(statusCheckInterval);
		});
	}

	private startEmptyCheck(): void {
		if (this.emptyChannelInterval) {
			clearInterval(this.emptyChannelInterval);
		}

		this.emptyChannelInterval = setInterval(() => {
			this.checkEmpty();
		}, ms("30s"));
	}

	private async checkEmpty(): Promise<void> {
		if (!this.connection || this.isDestroyed) return;

		try {
			const channel = await this.getVoiceChannel();
			if (!channel) {
				this.bot.logger.debug(
					"[ConnectionManager] Channel not found during empty check",
				);
				this.emit("disconnected");
				this.forceCleanup();
				return;
			}

			const userId = this.bot?.client.user?.id;
			const membersCount = channel.members.filter(
				(m) => !m.user.bot && m.id !== userId,
			).size;

			if (membersCount === 0) {
				if (!this.emptyChannelTimeout) {
					this.bot.logger.debug(
						"[ConnectionManager] Channel is empty, starting timeout",
					);
					this.emptyChannelTimeout = setTimeout(() => {
						this.emit("empty");
						this.leaveChannel();
					}, ms("30s"));
				}
			} else if (this.emptyChannelTimeout) {
				this.bot.logger.debug(
					"[ConnectionManager] Channel no longer empty, clearing timeout",
				);
				clearTimeout(this.emptyChannelTimeout);
				this.emptyChannelTimeout = null;
			}
		} catch (error) {
			this.bot.logger.debug(
				"[ConnectionManager] Error during empty check:",
				error,
			);
			this.emit("disconnected");
			this.forceCleanup();
		}
	}

	private async getVoiceChannel(): Promise<VoiceChannel | null> {
		try {
			const guild = await this.bot?.client.guilds.fetch(this.guildId);
			const channels = await guild.channels.fetch();
			const userId = this.bot?.client.user?.id;

			for (const [, channel] of channels) {
				if (channel?.type === 2 && this.connection && userId) {
					const voiceChannel = channel as VoiceChannel;
					if (voiceChannel.members.has(userId)) {
						return voiceChannel;
					}
				}
			}

			return null;
		} catch (error) {
			this.bot.logger.debug("[getVoiceChannel] Error:", error);
			return null;
		}
	}

	leaveChannel(): void {
		this.bot.logger.debug("[ConnectionManager] Leaving channel");
		if (this.connection) {
			this.connection?.destroy();
		}
		this.forceCleanup();
		this.emit("left");
	}

	getConnection(): VoiceConnection | null {
		// Дополнительная проверка состояния подключения
		if (
			this.connection &&
			this.connection?.state?.status === VoiceConnectionStatus.Destroyed
		) {
			this.bot.logger.debug(
				"[getConnection] Connection is destroyed, cleaning up",
			);
			this.forceCleanup();
			return null;
		}
		return this.connection;
	}

	private forceCleanup(): void {
		this.bot.logger.debug("[ConnectionManager] Force cleanup");

		if (this.disconnectHandler && this.connection) {
			this.connection?.off(
				VoiceConnectionStatus.Disconnected,
				this.disconnectHandler,
			);
			this.connection?.off(
				VoiceConnectionStatus.Destroyed,
				this.disconnectHandler,
			);
			this.disconnectHandler = null;
		}

		if (this.emptyChannelInterval) {
			clearInterval(this.emptyChannelInterval);
			this.emptyChannelInterval = null;
		}

		if (this.emptyChannelTimeout) {
			clearTimeout(this.emptyChannelTimeout);
			this.emptyChannelTimeout = null;
		}

		this.connection = null;
		this.reconnectAttempts = 0;
		this.emit("cleanup");
	}

	destroy(): void {
		this.bot.logger.debug("[ConnectionManager] Destroying");
		this.isDestroyed = true;
		this.forceCleanup();
		this.removeAllListeners();
	}
}
