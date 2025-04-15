# Ragu2 Project

RAGU2 is a Discord music bot that allows users to play, pause, and manage music tracks in voice channels. The bot supports integration with Yandex Music and provides various commands for playback control.

## Localization

[__English__](../../README.md), [Русский](./README.md)

## Plugins in RAGU2

RAGU2 uses a plugin system that allows adding new features and capabilities to the bot. Currently, the following music platform plugins are available:

- Yandex Music

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/dirold2/ragu2.git
   cd ragu2
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and add your Discord token:

   ```env
   # discord_token
   DISCORD_TOKEN="" #https://discord.com/developers/applications

   # bot locale
   BOT_LOCALE="" # default en

   # ffprobe path
   FFPROBE_PATH="" 

   # yandex_api
   YM_USER_ID="" # https://mail.yandex.ru/
   YM_API_KEY="" # https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d
   ```

## Launching the Bot

To launch the bot, follow these steps:

1. Build the project:

   ```bash
   pnpm build
   ```

2. Start the bot:

   ```bash
   pnpm start
   ```

   ________________________

   For development:

   ```bash
   pnpm dev
   ```

## Commands

The bot supports the following commands:

- `/play <track_name>` - Play a track.
- `/pause` - Pause playback.
- `/skip` - Skip the current track.
- `/volume <level>` - Set the volume level.
- `/shuffle` - Shuffle the queue.
- `/wave` - Enable "My Wave" based on the last track.
- `/queue` - Show the current track queue.
- `/other` - Show other commands.

## Project Structure

- `.env` - Environment variables.
- `src/` - Bot source code.
- `src/config/` - Bot configuration.
- `src/commands/` - Bot commands.
- `src/services/` - Services for managing bot logic.
- `src/utils/` - Utilities and helper functions.
- `src/locales/` - Localization files for multilingual support.
- `src/types/` - Data types.
- `src/interfaces/` - Interfaces.

## TODO

Work in progress:

- [x] Add localization
- [x] Add "wave" for continuous music playback
- [ ] Fix memory (Max 270MB)

Plugins:

- [x] Add Yandex Music plugin
- [ ] Add YouTube plugin
- [ ] Add SoundCloud plugin
- [ ] Add Apple Music plugin
- [ ] Add Deezer plugin
- [ ] Add Spotify plugin