export interface LocaleMessages {
	// bot.ts
	BOT_INITIALIZED: string;
	BOT_INITIALIZATION_FAILED: string;
	BOT_STARTED_SUCCESSFULLY: string;
	BOT_START_ERROR: string;
	BOT_TOKEN_ERROR: string;
	API_SERVER_STARTED_SUCCESSFULLY: string;
	ERROR_INITIALIZATION: string;

	NOT_CONNECTED_TO_VOICE: string;
	ERROR_OCCURRED_WHILE_CONNECTING_TO_CHANNEL: string;

	// dev.ts
	RELOAD_SUCCESS: string;
	RELOAD_ERROR: string;

	// Cache messages
	CACHE_HIT: (url: string) => string;

	// Voice channel messages
	NOT_CONNECTED_TO_VOICE_CHANNEL: string;
	NO_ACCESS_TO_VOICE_CHANNEL: string;
	NOT_IN_VOICE_CHANNEL: string;
	FAILED_TO_INITIALIZE_SERVICES: string;

	// Playback messages
	PLAYBACK_PAUSED: string;
	PLAYBACK_RESUMED: string;
	NO_TRACK_PLAYING: string;
	SKIPPED_TO_NEXT_TRACK: (trackInfo: string) => string;
	EMPTY_PLAYLIST: string;
	PLAYLIST_ADDED: (count: number) => string;
	UNSUPPORTED_TRACK_SOURCE: string;
	ADDED_TO_QUEUE: (trackInfo: string) => string;
	UNSUPPORTED_PLAYLIST_URL: string;
	ERROR_PROCESSING_PLAYLIST_URL: (pluginName: string, error: string) => string;

	// Plugin messages
	PLUGIN_REGISTERED: (name: string) => string;
	PLUGIN_REGISTRATION_FAILED: (name: string) => string;
	PLUGIN_REGISTRATION_FAILED_FATAL: string;
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) => string;
	PLUGIN_NOT_FOUND: (pluginName: string) => string;
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) => string;
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) => string;

	// Message management messages
	MESSAGE_CANNOT_BE_DELETED: (messageId: string) => string;
	MESSAGE_DELETED: (messageId: string) => string;
	UNEXPECTED_ERROR: string;
	UNKNOWN_ERROR_DELETING_MESSAGE: (messageId: string) => string;
	MESSAGE_NO_LONGER_EXISTS: (messageId: string) => string;

	// Discord API messages
	DISCORD_API_ERROR: (code: number, context: string, message: string) => string;
	UNKNOWN_ERROR_INTERACTION: (interactionId: string) => string;
	INTERACTION_NO_LONGER_EXISTS: (interactionId: string) => string;

	// Play command messages
	PROVIDE_TRACK: string;
	PLAY_TRACK: string;
	NAME_TRACK: string;
	STARTED_PLAYING: string;
	NO_TRACKS_FOUND: (query: string) => string;
	PLAYLIST_ADDED_SUCCESS: string;
	PLAY_ERROR: string;
	AUTOCOMPLETE_ERROR: string;
	ERROR_PLAYING_TRACK: string;
	PLAYLIST_ADDED_ERROR: string;
	PLAYLIST_ADDED_ERROR_FATAL: string;
	PLAYLIST_ADDED_ERROR_NO_PLUGIN: string;

	// Loop command messages
	LOOP_TRACK: string;
	LOOP_TRACK_ON: (trackInfo: string | undefined) => string;
	LOOP_TRACK_OFF: string;
	PLAYER_NOT_FOUND: string;
	LOOP_TRACK_ERROR: string;

	// Volume command messages
	VOLUME_COMMAND: string;
	VOLUME_SET: (volume: number) => string;
	VOLUME_ERROR: string;
	VOLUME_ERROR_MAX_VOLUME: (MAX_VOLUME: number) => string;

	// Pause command messages
	PAUSE_COMMAND: string;
	PAUSE_TRACK: string;
	RESUME_TRACK: string;

	// Queue command messages
	QUEUE_COMMAND: string;
	QUEUE_EMPTY: string;
	QUEUE_PAGES: (pages: string) => string;
	QUEUE_TRACKS_ERROR: string;
	QUEUE_TRACKS_ERROR_FATAL: string;
	QUEUE_ERROR_NOT_IN_VOICE_CHANNEL: string;
	UNKNOWN_MESSAGE: string;

	// Skip command messages
	SKIP_COMMAND: string;
	SKIP_TRACK: string;
	SKIP_NO_TRACK: string;
	SKIP_ERROR: string;

	// Server messages
	PORT_IN_USE: (port: number) => string;
	SERVER_ERROR: string;
	SERVER_START_ERROR: string;
	SERVER_RUNNING_ON_PORT: (port: number) => string;

	// Other messages
	NO_RECENTLY_PLAYED_TRACKS: string;
	RECENTLY_PLAYED_TRACKS: string;
	NO_POPULAR_TRACKS: string;
	POPULAR_TRACKS: string;
	QUEUE_CLEARED: string;
}

export interface LoggerMessages {
	CACHE_HIT: (url: string) => string;
	PLUGIN_REGISTERED: (name: string) => string;
	PLUGIN_REGISTRATION_FAILED: (name: string) => string;
	PLUGIN_REGISTRATION_FAILED_FATAL: string;
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) => string;
	PLUGIN_NOT_FOUND: (pluginName: string) => string;
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) => string;
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) => string;

	BOT_FAILED_INITIALIZATION_SERVICES: string;
	BOT_STARTED_SUCCESSFULLY: string;
	BOT_START_ERROR: string;
	API_SERVER_STARTED_SUCCESSFULLY: string;
	BOT_INITIALIZED: string;
	BOT_INITIALIZATION_FAILED: string;

	DEV_FAILDE_TO_IMPORT_FILE: (file: string) => string;
	DEV_FAILDE_TO_LOAD_FILE_FROM: (src: string) => string;

	RELOAD_SUCCESS: string;
	RELOAD_ERROR: string;
	BOT_NOT_ENV_TOKEN: string;

	PORT_IN_USE: (port: number) => string;
	SERVER_ERROR: string;
	SERVER_START_ERROR: string;
	SERVER_RUNNING_ON_PORT: (port: number) => string;

	EDITING_REPLY_FOR_INTERACTION_ID: (interactionId: string) => string;
	SENDING_NEW_REPLY_FOR_INTERACTION_ID: (interactionId: string) => string;
	MESSAGE_NOT_DELETABLE: (messageId: string) => string;
	MESSAGE_DELETED: (messageId: string) => string;
	INTERACTION_NOT_REPLIABLE: (interactionId: string) => string;
	INTERACTION_ALREADY_REPLIED_TO: (interactionId: string) => string;
	INTERACTION_EXPIRED: (interactionId: string) => string;
	REPLY_ERROR: string;
	UNKNOWN_ERROR_INTERACTING_WITH_ID: (interactionId: string) => string;
	UNKNOWN_ERROR_DELETING_MESSAGE_WITH_ID: (messageId: string) => string;
	DISCORD_API_ERROR: (errorCode: number, context: string) => string;

	SEARCHING_FOR_TRACK_OR_URL: (trackName: string) => string;
	ERROR_SEARCHING_IN_PLUGIN: (pluginName: string) => string;
	ERROR_PROCESSING_URL_WITH_PLUGIN: (pluginName: string) => string;
	FAILED_TO_ADD_TRACK: (trackId: string, MAX_RETRIES: number) => string;
	ERROR_PROCESSING_TRACK: string;

	CREATING_NEW_PLAYER_SERVICE_FOR_GUILD: (guildId: string) => string;
	ATTEMPTED_TO_LEAVE_CHANNEL_FOR_NON_EXISTENT_PLAYER_IN_GUILD: (
		guildId: string,
	) => string;

	PLAYER_ERROR: string;
	FAILED_TO_PLAY_QUEUE_TRACK: string;
	ERROR_CONNECTING_TO_CHANNEL: string;
	FAILED_TO_GET_URL_FOR_TRACK: string;
	PLAYBACK_ERROR: string;
	CLEARED_EXISTING_FADEOUT_TIMEOUT: string;
	SET_NEW_FADEOUT_TIMEOUT_FOR_DURATION: (duration: number) => string;
	EMPTY_CHECK_ERROR: string;
	CHANNEL_ID_IS_NULL: string;
	GUILD_NOT_FOUND: string;

	PLUGIN_NOT_FOUND_FOR_URL: (url: string) => string;
	FAILED_TO_REGISTER_PLUGIN: (name: string) => string;
	PLUGIN_REGISTERED_SUCCESSFULLY: (name: string) => string;
	CACHE_HIT_FOR_URL: (url: string) => string;

	PROXY_INITIALIZED_SUCCESSFULLY: string;
	ERROR_INITIALIZING_PROXY: string;

	ADDED_BATCH_OF_TRACKS: (count: number) => string;
	ERROR_ADDING_TRACK_TO_QUEUE: (trackId: string) => string;
	ADDED_BATCH_OF_TRACKS_GUILD: (count: number, guildId: string) => string;
	MISSING_REQUIRED_PARAMETERS: string;
	GUILD_ID_IS_REQUIRED: string;
	ERROR_FETCHING_QUEUE_FOR_GUILD: (guildId: string) => string;
	ERROR_RETRIEVING_TRACK_FROM_QUEUE: (guildId: string) => string;
	ERROR_CLEARING_QUEUE_FOR_GUILD: (guildId: string) => string;
	ERROR_REMOVING_TRACK_FROM_QUEUE: (trackId: string) => string;
	ERROR_LOGGING_PLAY_FOR_TRACK: (trackId: string, userId: string) => string;
	ERROR_FETCHING_LAST_PLAYED_TRACKS_FOR_USER: (userId: string) => string;
	ERROR_FETCHING_TOP_PLAYED_TRACKS: string;
	TRACKS_ARRAY_CANNOT_BE_EMPTY: string;
	ERROR_ADDING_TRACKS_TO_QUEUE: string;

	ERROR_TRACK_SEARCH: (trackName: string) => string;
	ERROR_PROCESSING_URL: (url: string) => string;
	ERROR_GETTING_TRACK_URL: (trackId: string) => string;
	ERROR_FETCHING_PLAYLIST_TRACKS: (playlistId: string) => string;
	ERROR_FETCHING_ALBUM_TRACKS: (albumId: string) => string;
	PLAYLIST_NOT_FOUND_OR_EMPTY: (playlistId: string) => string;
	NO_SIMILAR_TRACKS_FOUND: (trackId: string) => string;
	ERROR_FETCHING_SIMILAR_TRACKS: (trackId: string) => string;
	INVALID_TRACK_DATA: (error: string) => string;
	INVALID_CONFIGURATION: (error: string) => string;
	RETRYING_SEARCH_FOR_TRACK: (trackName: string) => string;
	ERROR_INITIALIZING_YANDEX_SERVICE: string;
	FAILED_TO_INITIALIZE_YANDEX_SERVICE: string;

	ERROR_PARSING_URL: string;

	ERROR_UNHANDLED_REJECTION: string;

	ERROR_AUTOCOMPLETE: string;
	ERROR_PLAYING_TRACK: string;

	ERROR_RETRIEVING_QUEUE: string;
	CRITICAL_ERROR_RETRIEVING_QUEUE: string;
	ERROR_SETTING_UP_REACTIONS: string;

	ERROR_SKIPPING_TRACK: string;

	ERROR_ADJUSTING_VOLUME: string;

	PROXY_AGENT_SUCCESSFULLY_RECEIVED: string;
	PROXY_NOT_ENABLED: string;
}

export type SupportedLocale = "ru" | "en";
