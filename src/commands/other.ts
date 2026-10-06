import { ApplicationCommandOptionType, CommandInteraction, GuildMember } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { getDeps } from "./commandDeps.js";

@Discord()
export class OtherCommand {
  @Slash({ name: "other", description: "Additional commands" })
  async other(
    @SlashOption({
      name: "command",
      description: "Select command",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    interaction: CommandInteraction,
  ): Promise<void> {
    const { queueService, commandService } = getDeps();
    const member = interaction.member as GuildMember;
    if (!member.voice?.channel) {
      await commandService.reply(interaction, "commands.queue.not_in_voice_channel");
      return;
    }

    const queue = await queueService.getQueue(member.voice.channel.id);
    if (queue.tracks.length === 0) {
      await commandService.reply(interaction, "commands.queue.empty");
      return;
    }

    await queueService.clearQueue(member.voice.channel.id);
    await commandService.reply(interaction, "commands.queue.cleared");
  }
}
