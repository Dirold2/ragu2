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
import { ms } from "humanize-ms";
import type { Bot } from "../../bot.js";

export class ConnectionManager extends EventEmitter {
	private connection: VoiceConnection | null = null;
	private disconnectHandler: (() => Promise<void>) | null = null;
	private emptyChannelInterval: NodeJS.Timeout | null = null;
	private emptyChannelTimeout: NodeJS.Timeout | null = null;
	private idleTimeout: NodeJS.Timeout | null = null;
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

	private parseMs(value: string | number): number {
		const result = ms(value);
		if (typeof result !== "number")
			throw new Error(`Invalid time string: ${value}`);
		return result;
	}

	async joinChannel(interaction: CommandInteraction): Promise<VoiceConnection> {
		const member = interaction.member as GuildMember;
		const voiceChannelId = member.voice.channel?.id;

		if (!voiceChannelId || !this.hasVoiceAccess(member)) {
			throw new Error("User not in voice channel or no access");
		}

		const existingConnection = getVoiceConnection(this.guildId);
		if (existingConnection) {
			if (existingConnection.state.status === VoiceConnectionStatus.Destroyed) {
				this.forceCleanup();
			} else if (!(await this.verifyActualConnection())) {
				existingConnection.destroy();
				this.forceCleanup();
			} else {
				this.connection = existingConnection;
				this.setupConnectionHandlers();
				return existingConnection;
			}
		}

		this.connection = await this.establishConnection(
			voiceChannelId,
			interaction,
		);
		this.setupConnectionHandlers();
		this.startEmptyCheck();
		this.startIdleTimeout();
		return this.connection;
	}

	private async establishConnection(
		channelId: string,
		interaction: CommandInteraction,
	): Promise<VoiceConnection> {
		if (!interaction.guild) throw new Error("Guild not found");

		const connection = joinVoiceChannel({
			channelId,
			guildId: this.guildId,
			adapterCreator: interaction.guild
				.voiceAdapterCreator as DiscordGatewayAdapterCreator,
			selfDeaf: false,
			selfMute: false,
		});

		await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
		this.reconnectAttempts = 0;
		return connection;
	}

	private hasVoiceAccess(member: GuildMember): boolean {
		const voiceChannel = member.voice.channel;
		return Boolean(
			voiceChannel?.permissionsFor(member)?.has(PermissionFlagsBits.Connect) &&
				voiceChannel.id,
		);
	}

	private setupConnectionHandlers(): void {
		if (!this.connection || this.disconnectHandler) return;

		this.disconnectHandler = async () => {
			if (!this.connection || this.isDestroyed) return;

			if (!(await this.verifyActualConnection())) {
				this.emit("disconnected");
				this.forceCleanup();
				return;
			}

			if (this.reconnectAttempts < this.maxReconnectAttempts) {
				this.reconnectAttempts++;
				await Promise.race([
					entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
					entersState(this.connection, VoiceConnectionStatus.Connecting, 5000),
				]);
				this.emit("reconnected");
				this.reconnectAttempts = 0;
			} else {
				this.emit("disconnected");
				this.forceCleanup();
			}
		};

		const destroyHandler = () => {
			this.emit("disconnected");
			this.forceCleanup();
		};

		this.connection.on(
			VoiceConnectionStatus.Disconnected,
			this.disconnectHandler,
		);
		this.connection.on(VoiceConnectionStatus.Destroyed, destroyHandler);

		// FIX: Defensive checks to prevent accessing .state of null during recurring interval
		const statusCheckInterval = setInterval(async () => {
			// Prevent further checks if destroyed or connection lost
			if (this.isDestroyed || !this.connection) {
				clearInterval(statusCheckInterval);
				return;
			}

			let connection = this.connection;
			// Defensive: ensure we still have a connection object before dereferencing state/status
			if (
				!(await this.verifyActualConnection()) &&
				connection && 
				connection.state &&
				connection.state.status !== VoiceConnectionStatus.Destroyed
			) {
				try {
					connection.destroy();
				} catch (e) {
					this.bot?.logger?.debug?.("[ConnectionManager] Error during connection.destroy in statusCheckInterval:", e);
				}
			}
		}, 10_000);

		this.once("cleanup", () => clearInterval(statusCheckInterval));
	}

	private startEmptyCheck(): void {
		if (this.emptyChannelInterval) clearInterval(this.emptyChannelInterval);

		this.emptyChannelInterval = setInterval(
			() => this.checkEmpty(),
			this.parseMs("30s"),
		);
	}

	private async checkEmpty(): Promise<void> {
		if (!this.connection || this.isDestroyed) return;

		const channel = await this.getVoiceChannel();
		if (!channel) {
			this.emit("disconnected");
			this.forceCleanup();
			return;
		}

		const userId = this.bot.client.user?.id;
		const membersCount = channel.members.filter(
			(m) => !m.user.bot && m.id !== userId,
		).size;

		if (membersCount === 0) {
			if (!this.emptyChannelTimeout) {
				this.emptyChannelTimeout = setTimeout(() => {
					this.emit("empty");
					this.leaveChannel();
				}, this.parseMs("30s"));
			}
		} else if (this.emptyChannelTimeout) {
			clearTimeout(this.emptyChannelTimeout);
			this.emptyChannelTimeout = null;
		}
	}

	/** Автоотключение, если музыка не играет */
	startIdleTimeout(): void {
		if (this.idleTimeout) clearTimeout(this.idleTimeout);
		this.idleTimeout = setTimeout(() => {
			this.bot.logger.debug(
				"[ConnectionManager] Idle for 10 minutes, leaving channel",
			);
			this.leaveChannel();
		}, this.parseMs("10m"));
	}

	/** Сбрасываем таймер простоя (например, при начале нового трека) */
	resetIdleTimeout(): void {
		this.startIdleTimeout();
	}

	private async verifyActualConnection(): Promise<boolean> {
		const channel = await this.getVoiceChannel();
		const userId = this.bot.client.user?.id;
		return Boolean(channel && userId && channel.members.has(userId));
	}

	private async getVoiceChannel(): Promise<VoiceChannel | null> {
		try {
			const guild = await this.bot.client.guilds.fetch(this.guildId);
			const channels = await guild.channels.fetch();
			const userId = this.bot.client.user?.id;

			for (const [, channel] of channels) {
				if (channel?.type === 2 && this.connection && userId) {
					const voiceChannel = channel as VoiceChannel;
					if (voiceChannel.members.has(userId)) return voiceChannel;
				}
			}

			return null;
		} catch {
			return null;
		}
	}

	leaveChannel(): void {
		if (this.connection) this.connection.destroy();
		this.forceCleanup();
		this.emit("left");
	}

	getConnection(): VoiceConnection | null {
		// Defensive: only access state if this.connection is not null
		if (this.connection && this.connection.state?.status === VoiceConnectionStatus.Destroyed) {
			this.forceCleanup();
			return null;
		}
		return this.connection;
	}

	private forceCleanup(): void {
		if (this.connection && this.disconnectHandler) {
			this.connection.off(
				VoiceConnectionStatus.Disconnected,
				this.disconnectHandler,
			);
			// Defensive: make sure handler is removed only if handler was attached at this key
			this.connection.off(
				VoiceConnectionStatus.Destroyed,
				this.disconnectHandler,
			);
		}

		this.disconnectHandler = null;
		if (this.emptyChannelInterval) clearInterval(this.emptyChannelInterval);
		if (this.emptyChannelTimeout) clearTimeout(this.emptyChannelTimeout);
		if (this.idleTimeout) clearTimeout(this.idleTimeout);

		this.emptyChannelInterval = null;
		this.emptyChannelTimeout = null;
		this.idleTimeout = null;
		this.connection = null;
		this.reconnectAttempts = 0;

		this.emit("cleanup");
	}

	destroy(): void {
		this.isDestroyed = true;
		this.forceCleanup();
		this.removeAllListeners();
	}
}
