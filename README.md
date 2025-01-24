# Project Ragu2

RAGU2 is a music bot for Discord that allows users to play, pause, and manage music tracks in voice channels. The bot supports integration with Yandex Music and provides various commands for controlling playback.

## Localization

[__English__](./README.md), [Русский](lang/ru/README.md)

## Plugins in RAGU2

RAGU2 uses a plugin system that allows adding new features and capabilities to the bot. Currently, plugins for music platforms available are:

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

3. Create a `.env` file in the root of the project and add your Discord token:

   ```env
   DISCORD_TOKEN=your_token
   DATABASE_URL=your_database_url
   ```

## Running

To run the bot, follow these steps:

1. Fill in the `.env` file

   ```env
   # discord
   DISCORD_TOKEN=your_token
   # local postgresql database or (https://supabase.com/)
   DATABASE_URL=""
   DIRECT_URL=""
   # yandex_api
   YM_USER_ID="" # https://mail.yandex.ru/
   YM_API_KEY="" # https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d
   ```

   For yandex_api:

   1. [YM_USER_ID](https://mail.yandex.ru/)
   2. [YM_API_KEY](https://oauth.yandex.ru/client/23cabbbdc6cd418abb4b39c32c41195d)

   ________________________

2. Install dependencies:

   ```bash
   pnpm i
   ```

   ________________________

3. Generate Prisma:

   ```bash
   pnpm prisma:generate
   ```

   ________________________

4. Build the project:

   ```bash
   pnpm build
   ```

5. Start the bot:

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
- `/queue` - Show the current track queue.
- `/other` - Show other commands.

## Project Structure

- `config/` - Bot configuration.
- `.env` - Environment variables.
- `src/` - Bot source code.
- `src/commands/` - Bot commands.
- `src/services/` - Services for managing bot logic.
- `src/utils/` - Utilities and helper functions.
- `src/locales/` - Localization files for multilingual support.
- `src/types/` - Data types.
- `src/interfaces/` - Interfaces.

## TODO

Workflow:

- [x] Add localization
- [ ] Add proxy
- [ ] Add API
- [ ] Add "wave" for continuous music playback

Plugins:

- [x] Add plugin for Yandex Music
- [ ] Add plugin for YouTube
- [ ] Add plugin for SoundCloud
- [ ] Add plugin for Apple Music
- [ ] Add plugin for Deezer
- [ ] Add plugin for Spotify
