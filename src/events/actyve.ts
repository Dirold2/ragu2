import { Discord, On } from "discordx";
import { Client, ActivityType } from 'discord.js';

import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

@Discord()
export class Example {
  private client = new Client({ intents: [] });

  @On()
  onReady(): void {
    logger.info(`Logged in as ${this.client.user?.tag}!`);
    
    this.client.user!.setActivity('activity', 
    {
      // name: "RAGU",
      type: ActivityType.Playing,
      url: "https://github.com/ragu2"
    } as const);
  }
}