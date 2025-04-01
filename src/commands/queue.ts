import {
	CommandInteraction,
	GuildMember,
	Message,
	PermissionsBitField,
	ReactionCollector,
} from "discord.js";
import { Discord, Slash } from "discordx";

import { bot } from "../bot.js";

interface Track {
	url: string;
	info: string;
	source: string;
	trackId?: string;
	addedAt?: bigint;
}

const MAX_PAGE_LENGTH = 1900;
const REACTIONS = {
	PREV: "⬅️",
	NEXT: "➡️",
	CLOSE: "❌",
} as const;

type ReactionEmoji = (typeof REACTIONS)[keyof typeof REACTIONS];

@Discord()
export class QueueCommand {
	private currentPage = 0;
	private pages: string[] = [];
	private message: Message | null = null;
	private currentCollector: ReactionCollector | null = null;

	@Slash({
		name: "queue",
		description: bot.locale.t("commands.queue.description"),
	})
	async queue(interaction: CommandInteraction): Promise<void> {
		try {
			await this.handleQueueCommand(interaction);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.unexpected", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				bot.locale.t("errors.unexpected", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	private async handleQueueCommand(
		interaction: CommandInteraction,
	): Promise<void> {
		const member = interaction.member;
		if (!(member instanceof GuildMember) || !member.voice.channelId) {
			await bot.commandService.reply(
				interaction,
				bot.locale.t("errors.voice.not_in_channel"),
			);
			return;
		}

		const queue = await bot.queueService.getQueue(member.voice.channelId);
		if (queue.tracks.length === 0) {
			await bot.commandService.reply(
				interaction,
				bot.locale.t("player.queue.empty"),
			);
			return;
		}

		this.pages = this.createPages(queue.tracks as Track[]);
		this.currentPage = 0;

		const message = (await interaction.reply({
			content: await this.createPageMessage(),
			fetchReply: true,
		})) as Message;

		this.message = message;

		if (
			this.pages.length > 1 &&
			message.guild?.members.me?.permissions.has(
				PermissionsBitField.Flags.ManageMessages,
			)
		) {
			await this.setupReactions(message, interaction);
		}
	}

	private async setupReactions(
		message: Message,
		interaction: CommandInteraction,
	): Promise<void> {
		try {
			for (const reaction of Object.values(REACTIONS)) {
				await message.react(reaction);
			}
			this.createReactionCollector(message, interaction);
		} catch (error) {
			bot.logger.error(
				bot.locale.t("errors.unexpected", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	}

	private async cleanupCollector(): Promise<void> {
		if (this.currentCollector) {
			this.currentCollector.stop();
			this.currentCollector = null;
		}
	}

	private async createReactionCollector(
		message: Message,
		interaction: CommandInteraction,
	): Promise<void> {
		await this.cleanupCollector();

		const collector = message.createReactionCollector({
			filter: (reaction, user) => {
				const emoji = reaction.emoji.name as string;
				return (
					Object.values(REACTIONS).includes(emoji as ReactionEmoji) &&
					user.id === interaction.user.id
				);
			},
			time: 300000,
		});

		this.currentCollector = collector;

		collector.on("collect", async (reaction, user) => {
			if (!this.message) {
				await this.cleanupCollector();
				return;
			}

			try {
				await reaction.users.remove(user.id).catch(() => {});

				const emoji = reaction.emoji.name as ReactionEmoji;
				switch (emoji) {
					case REACTIONS.PREV:
						if (this.currentPage > 0) {
							this.currentPage--;
							await this.updateMessage();
						}
						break;
					case REACTIONS.NEXT:
						if (this.currentPage < this.pages.length - 1) {
							this.currentPage++;
							await this.updateMessage();
						}
						break;
					case REACTIONS.CLOSE:
						await this.message.delete();
						this.message = null;
						collector.stop();
						break;
				}
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes(bot.locale.t("errors.message.unknown"))
				) {
					this.message = null;
					collector.stop();
				} else {
					bot.logger.error(
						bot.locale.t("errors.unexpected", {
							error: error instanceof Error ? error.message : String(error),
						}),
					);
				}
			}
		});

		collector.on("end", async () => {
			if (this.message?.reactions) {
				await this.message.reactions.removeAll().catch(() => {});
			}
			this.message = null;
			this.currentCollector = null;
		});
	}

	private async updateMessage(): Promise<void> {
		if (this.message) {
			await this.message.edit(await this.createPageMessage());
		}
	}

	private async createPageMessage(): Promise<string> {
		return this.pages.length > 1
			? bot.locale.t("player.queue.pages", {
					current: this.currentPage + 1,
					total: this.pages.length,
				})
			: this.pages[this.currentPage];
	}

	private createPages(tracks: Track[]): string[] {
		const pages: string[] = [];
		let currentPage = "";

		tracks.forEach((track, index) => {
			const entry = `${index + 1}. ${track.info}\n`;
			if ((currentPage + entry).length > MAX_PAGE_LENGTH) {
				pages.push(currentPage);
				currentPage = entry;
			} else {
				currentPage += entry;
			}
		});

		if (currentPage) pages.push(currentPage);
		return pages;
	}

	// Добавляем метод очистки при уничтожении команды
	public async destroy(): Promise<void> {
		await this.cleanupCollector();
		if (this.message) {
			await this.message.delete().catch(() => {});
			this.message = null;
		}
		this.pages = [];
		this.currentPage = 0;
	}
}
