import { Discord, On } from "discordx";
import { Client, ActivityType } from 'discord.js';

@Discord()
export class Example {
  private client = new Client({ intents: [] });

  @On()
  onReady(): void {
    console.log(`Logged in as ${this.client.user?.tag}!`);
    
    this.client.user!.setActivity('activity', 
    {
      // name: "RAGU",
      type: ActivityType.Playing,
      url: "https://github.com/ragu2"
    } as const);
  }
}