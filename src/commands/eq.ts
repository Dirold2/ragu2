import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { bot } from "../bot.js";
import config from "../../config.json" with { type: "json" };

@Discord()
export class EqualizerCommand {
  @Slash({
    name: "eq",
    description: bot.locale.t("commands.equalizer.description"),
  })
  async equalizer(
    @SlashOption({
      name: "bass",
      description: bot.locale.t("commands.bass.option_number", {
        min: config.audio.effects.bass.range.min,
        max: config.audio.effects.bass.range.max,
      }),
      type: ApplicationCommandOptionType.Number,
      required: false,
    })
    bass: number | null,
    @SlashOption({
      name: "treble",
      description: bot.locale.t("commands.treble.option_number", {
        min: config.audio.effects.treble.range.min,
        max: config.audio.effects.treble.range.max,
      }),
      type: ApplicationCommandOptionType.Number,
      required: false,
    })
    treble: number | null,
    interaction: CommandInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId!;
    try {
      const params = [
        { name: "bass", value: bass },
        { name: "treble", value: treble },
      ];

      const results: string[] = [];

      for (const param of params) {
        if (param.value === null || param.value === undefined) continue;

        switch (param.name) {
          case "bass":
            if (typeof param.value !== "number") break;
            if (
              param.value < config.audio.effects.bass.range.min ||
              param.value > config.audio.effects.bass.range.max
            ) {
              return bot.commandService.reply(
                interaction,
                "commands.bass.errors.error_max",
                {
                  minBass: config.audio.effects.bass.range.min,
                  maxBass: config.audio.effects.bass.range.max,
                },
              );
            }
            await bot.playerManager.setBass(guildId, param.value);
            results.push(
              bot.locale.t("commands.bass.set", { bass: param.value }),
            );
            break;

          case "treble":
            if (typeof param.value !== "number") break;
            if (
              param.value < config.audio.effects.treble.range.min ||
              param.value > config.audio.effects.treble.range.max
            ) {
              return bot.commandService.reply(
                interaction,
                "commands.treble.errors.error_max",
                {
                  minTreble: config.audio.effects.treble.range.min,
                  maxTreble: config.audio.effects.treble.range.max,
                },
              );
            }
            await bot.playerManager.setTreble(guildId, param.value);
            results.push(
              bot.locale.t("commands.treble.set", { treble: param.value }),
            );
            break;
        }
      }

      if (results.length === 0) {
        await bot.commandService.reply(
          interaction,
          "commands.equalizer.errors.nothing_provided",
        );
      } else {
        await interaction.reply({
          content: results.join("\n"),
          flags: "Ephemeral",
        });
      }
    } catch (error) {
      bot.logger.error(
        bot.locale.t("commands.equalizer.errors.playback", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await bot.commandService.reply(
        interaction,
        "commands.equalizer.errors.playback",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
