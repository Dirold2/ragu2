import {
  CommandInteraction,
  GuildMember,
  Message,
  PermissionsBitField,
  ReactionCollector,
} from "discord.js";
import { Discord, Slash } from "discordx";

import { getDeps, t } from "./commandDeps.js";
import { getErrorMessage } from "../utils/error.js";

interface Track {
  info: string;
  source: string;
  trackId?: string;
  addedAt?: bigint;
}

interface QueueState {
  currentPage: number;
  pages: string[];
  message: Message | null;
  currentCollector: ReactionCollector | null;
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
  private readonly sessions = new Map<string, QueueState>();

  @Slash({
    name: "queue",
    description: t("commands.queue.description"),
  })
  async queue(interaction: CommandInteraction): Promise<void> {
    try {
      await this.handleQueueCommand(interaction);
    } catch (error) {
      const { logger, commandService } = getDeps();
      logger.error(
        t("commands.queue.errors.unexpected", {
          error: getErrorMessage(error),
        }),
      );
      await commandService.reply(interaction, "commands.queue.errors.unexpected", {
        error: getErrorMessage(error),
      });
    }
  }

  private getOrCreateState(interactionId: string): QueueState {
    let state = this.sessions.get(interactionId);
    if (!state) {
      state = {
        currentPage: 0,
        pages: [],
        message: null,
        currentCollector: null,
      };
      this.sessions.set(interactionId, state);
    }
    return state;
  }

  private async handleQueueCommand(interaction: CommandInteraction): Promise<void> {
    const { commandService, queueService } = getDeps();
    const member = interaction.member;
    if (!(member instanceof GuildMember) || !member.voice.channelId) {
      await commandService.reply(interaction, "commands.queue.errors.not_in_channel");
      return;
    }

    const queue = await queueService.getQueue(interaction.guildId!);
    if (queue.tracks.length === 0) {
      await commandService.reply(interaction, "commands.queue.empty");
      return;
    }

    const state = this.getOrCreateState(interaction.id);
    state.pages = this.createPages(queue.tracks as Track[]);
    state.currentPage = 0;

    const message = (await interaction.reply({
      content: this.createPageMessage(state),
      fetchReply: true,
    })) as Message;

    state.message = message;

    if (
      state.pages.length > 1 &&
      message.guild?.members.me?.permissions.has(PermissionsBitField.Flags.ManageMessages)
    ) {
      await this.setupReactions(state, message, interaction);
    }
  }

  private async setupReactions(
    state: QueueState,
    message: Message,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      for (const reaction of Object.values(REACTIONS)) {
        await message.react(reaction);
      }
      this.createReactionCollector(state, message, interaction);
    } catch (error) {
      const { logger } = getDeps();
      logger.error(
        t(
          "commands.queue.errors.unexpected",
          {
            error: getErrorMessage(error),
          },
          interaction.guild?.preferredLocale || "en",
        ),
      );
    }
  }

  private async cleanupCollector(state: QueueState): Promise<void> {
    if (state.currentCollector) {
      state.currentCollector.stop();
      state.currentCollector = null;
    }
  }

  private createReactionCollector(
    state: QueueState,
    message: Message,
    interaction: CommandInteraction,
  ): void {
    this.cleanupCollector(state);

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

    state.currentCollector = collector;

    collector.on("collect", async (reaction, user) => {
      if (!state.message) {
        this.cleanupCollector(state);
        return;
      }

      try {
        await reaction.users.remove(user.id).catch(() => {});

        const emoji = reaction.emoji.name as ReactionEmoji;
        switch (emoji) {
          case REACTIONS.PREV:
            if (state.currentPage > 0) {
              state.currentPage--;
              await this.updateMessage(state);
            }
            break;
          case REACTIONS.NEXT:
            if (state.currentPage < state.pages.length - 1) {
              state.currentPage++;
              await this.updateMessage(state);
            }
            break;
          case REACTIONS.CLOSE:
            await state.message.delete();
            state.message = null;
            collector.stop();
            break;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            t(
              "commands.queue.errors.unknown",
              undefined,
              interaction.guild?.preferredLocale || "en",
            ),
          )
        ) {
          state.message = null;
          collector.stop();
        } else {
          const { logger } = getDeps();
          logger.error(
            t(
              "commands.queue.errors.unexpected",
              {
                error: getErrorMessage(error),
              },
              interaction.guild?.preferredLocale || "en",
            ),
          );
        }
      }
    });

    collector.on("end", async () => {
      if (state.message?.reactions) {
        await state.message.reactions.removeAll().catch(() => {});
      }
      state.message = null;
      state.currentCollector = null;
      this.sessions.delete(interaction.id);
    });
  }

  private async updateMessage(state: QueueState): Promise<void> {
    if (state.message) {
      await state.message.edit(this.createPageMessage(state));
    }
  }

  private createPageMessage(state: QueueState): string {
    return state.pages.length > 1
      ? t("commands.queue.pages", {
          current: state.currentPage + 1,
          total: state.pages.length,
        })
      : state.pages[state.currentPage];
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

  public async destroy(): Promise<void> {
    for (const [_id, state] of this.sessions) {
      if (state.currentCollector) {
        state.currentCollector.stop();
      }
      if (state.message) {
        await state.message.delete().catch(() => {});
      }
    }
    this.sessions.clear();
  }
}
