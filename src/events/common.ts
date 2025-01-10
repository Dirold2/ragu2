import type { ArgsOf } from "discordx";
import { Discord, On } from 'discordx';

import logger from '../utils/logger.js';

@Discord()
export class Example {
  @On()
  messageCreate([message]: ArgsOf<"messageCreate">): void {
    logger.info(message.author.username, "said:", message.content);
  }
}
