import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";

import { bot } from "../bot.js";
import { VOLUME } from "../config.js";

@Discord()
export class VolumeCommand {
	@Slash({
		name: "volume",
		description: bot.locale.t("commands.volume.description"),
	})
	async volume(
		@SlashOption({
			name: "number",
			description: bot.locale.t("commands.volume.option_number", {
				max: VOLUME.MAX_PERCENT,
			}),
			type: ApplicationCommandOptionType.Number,
			required: true,
		})
		volume: number,
		interaction: CommandInteraction,
	): Promise<void> {
		if (volume < 0 || volume > VOLUME.MAX_PERCENT) {
			return bot.commandService.reply(
				interaction,
				"commands.volume.errors.error_max",
				{
					maxVolume: VOLUME.MAX_PERCENT,
				},
			);
		}

		try {
			await bot.playerManager.setVolume(interaction.guildId!, volume);
			await bot.commandService.reply(interaction, "commands.volume.set", {
				volume,
			});
		} catch (error) {
			bot.logger.error(
				bot.locale.t("commands.volume.errors.playback", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			await bot.commandService.reply(
				interaction,
				"commands.volume.errors.playback",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	@Slash({
		name: "lowpass",
		description:
			"Set low pass filter parameters (Cut-off frequency and Q factor)",
	})
	async lowpass(
		@SlashOption({
			name: "frequency",
			description: "Cut-off frequency in Hz (0 = off)",
			type: ApplicationCommandOptionType.Number,
			required: true,
		})
		frequency: number,
		@SlashOption({
			name: "q",
			description: "Q factor (0.1-10, default: 0.707)",
			type: ApplicationCommandOptionType.Number,
			required: false,
		})
		q: number = 0.707,
		interaction: CommandInteraction,
	): Promise<void> {
		if (frequency < 0 || frequency > 20000) {
			return void interaction.reply({
				content: "Недопустимая частота среза. Укажите от 0 до 20000 Гц.",
				ephemeral: true,
			});
		}

		if (q < 0.1 || q > 10) {
			return void interaction.reply({
				content: "Недопустимый Q фактор. Укажите от 0.1 до 10.",
				ephemeral: true,
			});
		}

		try {
			await bot.playerManager
				.getPlayer(interaction.guildId!)
				.setLowPassFilter(frequency, q);

			await interaction.reply({
				content:
					frequency === 0
						? "Low pass фильтр отключён."
						: `Low pass фильтр: ${frequency} Гц, Q=${q.toFixed(2)}`,
				ephemeral: true,
			});
		} catch (error) {
			bot.logger.error(`Lowpass command error: ${error}`);
			await interaction.reply({
				content: "Ошибка применения low pass фильтра.",
				ephemeral: true,
			});
		}
	}
}
