# Changelog

## 0.2.0 (2026-07-02)

### Added
- `/eq` slash command — equalizer as a proper Discord command (replaces standalone `equalizer.ts`)
- `Mutex` utility class — shared async mutex in `utils/mutex.ts`
- `getErrorMessage()` utility — standardized error string extraction (`utils/error.ts`)
- Plugin `getApiHeaders()` method — per-stream headers for platform-specific anti-bot bypass
- `hcacher` cache manager — replaces `lru-cache` for queue and metadata caching

### Changed
- **PlayerService refactored**: `isDestroyed`, `skipInProgress`, `isHandlingError` boolean flags replaced with `PlayerStatus` enum (`IDLE`, `PLAYING`, `PAUSED`, `TRANSITIONING`, `DESTROYED`)
- `PlayerEffects.ts` merged into `PlayerService` — all effect methods (`setVolume`, `fadeIn`, `scheduleFadeOut`) are now directly on `PlayerService`
- `PlayerQueue.ts` merged into `PlayerService` — queue logic (`queueTrack`, `loadNextTrack`, `peekNextTrack`, `getNextTrack`, `getRecommendation`) is now inline
- `CacheQueueService` → `player/QueueService.ts` with `hcacher.CacheManager` backend
- **Commands migrated to DI pattern**: All commands use `getDeps()` from `commandDeps.ts` instead of importing `bot` singleton directly
- **Error handling standardized**: All `error instanceof Error ? error.message : String(error)` replaced with `getErrorMessage(error)`
- `config.json` restructured under `audio.*` and `playback.*` namespaces; all code references updated
- `AudioService` — busy-wait (`while(_isCreating||_isStopping)`) replaced with `Mutex`; hardcoded User-Agent headers moved to per-stream via plugin `getApiHeaders()`
- `ConnectionManager` — `humanize-ms` → `ms` package; removed inline `parseMs()` wrapper
- `YandexMusicPlugin` — inline `Mutex` and `CacheWrapper` replaced with shared `utils/mutex.ts` and `hcacher.CacheManager`
- Updated `@dotenvx/dotenvx@^2.0.0`, `oxfmt@^0.57.0`, `oxlint@^1.72.0`

### Removed
- `PlayerEffects.ts` — functionality merged into `PlayerService`
- `PlayerQueue.ts` — functionality merged into `PlayerService`
- `equalizer.ts` standalone command — replaced by `/eq`
- `logger.ts`, `audioFormat.ts`, `youtubeConfig.ts` — dead code eliminated
- `humanize-ms` dependency — replaced by `ms`
- `lru-cache` dependency — replaced by `hcacher`

### Fixed
- Volume range reads `config.audio.volume.range.max` instead of flat `config.volume.max`
- Audio service race conditions eliminated via `Mutex` (was busy-wait loop)
- Player state management race conditions via `PlayerStatus` enum transitions

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
