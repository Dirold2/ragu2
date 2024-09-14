import type { ArgsOf } from "discordx";
import { Discord, On } from "discordx";

import { ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

@Discord()
export class Example {
  @On()
  messageCreate([message]: ArgsOf<"messageCreate">): void {
    logger.info(message.author.username, "said:", message.content);
  }
}
