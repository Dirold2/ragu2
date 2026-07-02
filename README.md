# RAGU2

Discord music bot with Yandex Music integration, audio processing, and localization.

[__English__](./README.md), [Русский](./lang/ru/README.md)

## Features

- **Playback** — play, pause, skip, shuffle, queue, loop
- **Equalizer** — bass (`-20`–`20`), treble (`-10`–`20`), compressor
- **Volume** — adjustable with smooth fade in/out
- **My Wave** — endless radio from the last track
- **History & Top** — recently played and most popular tracks
- **Queue management** — view, clear, auto-advance
- **Reconnect** — automatic reconnection on network drops
- **Localization** — English and Russian
- **Plugin system** — extensible music platform support

## Supported Platforms

| Platform | Status |
|----------|--------|
| Yandex Music | ✅ |
| Hitmo Music | ✅ |

## Installation

```bash
git clone https://github.com/dirold2/ragu2.git
cd ragu2
npm install
```

Create `.env`:

```env
DISCORD_TOKEN=""          # https://discord.com/developers/applications
BOT_LOCALE="en"           # en / ru
FFPROBE_PATH=""           # optional, path to ffprobe
YM_USER_ID=""             # https://mail.yandex.ru/
YM_API_KEY=""             # https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d
HM_SESSION_COOKIE=""      # optional, Hitmo Music session cookie
```

## Usage

```bash
# development
npm run dev

# production
npm run build && npm start

# with PM2
npm run pm2:start
```

## Commands

| Command | Description |
|---------|-------------|
| `/play <query>` | Search and play a track |
| `/pause` | Pause / resume |
| `/skip` | Skip to next track |
| `/volume <0–100>` | Set volume |
| `/eq <bass> <treble>` | Adjust equalizer (bass, treble) |
| `/loop` | Toggle queue loop |
| `/shuffle` | Shuffle queue |
| `/queue` | Show queue |
| `/wave` | Start My Wave radio |
| `/other history` | Recently played |
| `/other top` | Most popular tracks |
| `/other queuedel` | Clear queue |

## Project Structure

```
src/
├── commands/       # Slash command handlers
├── services/
│   ├── audio/      # FFmpeg audio pipeline
│   └── player/     # Playback, queue, effects
├── plugins/        # Music platform adapters
├── utils/          # Locale, config, monitoring
└── types/          # TypeScript definitions
```

## Configuration

`config.json` — audio settings (volume, equalizer, fade), playback start position.

`ecosystem.config.json` — PM2 process settings.

## TODO

- [x] Memory optimization (<270 MB — ~120 MB under load)
- [ ] YouTube plugin
- [ ] SoundCloud plugin
- [ ] Spotify plugin
- [ ] Apple Music plugin
- [ ] Deezer plugin
