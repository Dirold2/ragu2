# Changelog

## 0.1.5 (2026-06-28)

### Added
- Audio reconnect flags (`-reconnect`, `-reconnect_streamed`, `-reconnect_delay_max`, `-reconnect_at_eof`) for network drop recovery
- Browser User-Agent mask for Yandex Music anti-bot bypass
- `-probesize` and `-analyzeduration` tuning for stream stability
- `verbose` mode in `FluentStream` for debug logging

### Fixed
- `CommandDeps not initialized` crash on volume/play commands
- FFmpeg `Option re cannot be applied to output url pipe:1` — pass `-i <url>` inside `inputOptions()` to work around `fluent-streamer@0.5.3` arg ordering issue
- Stream creation — use `ReadableStream.tee()` with a peek-then-drain pattern instead of Node `Transform` + `once("data")`
- Multiple race conditions in `stop()` / `createAudioStreamForDiscord()` (back-to-back `_isCreating`/`_isStopping` guards)
- Type errors in `PlayerManager` constructor (6 params)

### Changed
- `output("pipe:1")` → `output({ pipe: "pipe:1" })`
- Removed `.input(url)` call (merged into `inputOptions()`)
- Removed `ffmpeg.removeAllListeners()` from `.destroy()`
- Updated Russian locale keys: `bass.option_boolean` → `option_number`, `treble.option_boolean` → `option_number`

### Removed
- Delay, reverb, distortion, normalize effect code (no fluent-streamer support yet)
- `equalizer.ts` standalone command (merged into `/equalizer` slash command)
- Dead imports and unused config constants

## 0.1.4 (2026-05-15)

### Added
- Yandex Music plugin integration
- My Wave mode for endless radio
- History and top tracks tracking
- LRU cache (replaced node-cache)
- Localization system (EN/RU)
- PM2 process management
- Health metrics endpoint (prom-client)

### Fixed
- Empty track bug on Yandex Music side

### Changed
- Replaced `node-cache` with `lru-cache` for better memory usage
