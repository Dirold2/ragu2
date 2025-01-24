import type { LocaleMessages, LoggerMessages } from "../types/localization.js";

export const MESSAGES: LocaleMessages = {
	// bot.ts
	BOT_INITIALIZED: "Bot successfully initialized",
	BOT_INITIALIZATION_FAILED: "Failed to initialize the bot:",
	BOT_STARTED_SUCCESSFULLY: "Bot started successfully",
	BOT_START_ERROR: "Error starting the bot:",
	BOT_TOKEN_ERROR: "Bot token is missing or invalid.",
	API_SERVER_STARTED_SUCCESSFULLY: "API server started successfully",
	ERROR_INITIALIZATION: "Error initializing the bot:",

	NOT_CONNECTED_TO_VOICE: "You are not connected to a voice channel.",
	ERROR_OCCURRED_WHILE_CONNECTING_TO_CHANNEL:
		"Error occurred while connecting to channel:",

	// dev.ts
	RELOAD_SUCCESS: "Reload completed successfully",
	RELOAD_ERROR: "Error during reload:",

	// Cache messages
	CACHE_HIT: (url: string) => `Cache: found for URL "${url}"`,

	// Voice channel messages
	NOT_CONNECTED_TO_VOICE_CHANNEL: "You are not connected to a voice channel.",
	NO_ACCESS_TO_VOICE_CHANNEL:
		"No access to the voice channel or invalid channel ID.",
	NOT_IN_VOICE_CHANNEL: "You must be in a voice channel to use this command.",
	FAILED_TO_INITIALIZE_SERVICES: "Failed to initialize services",

	// Playback messages
	PLAYBACK_PAUSED: "Playback paused.",
	PLAYBACK_RESUMED: "Playback resumed.",
	NO_TRACK_PLAYING: "Nothing is currently playing.",
	SKIPPED_TO_NEXT_TRACK: (trackInfo: string) =>
		`Skipped to the next track: ${trackInfo}`,
	EMPTY_PLAYLIST: "The playlist is empty or cannot be loaded.",
	PLAYLIST_ADDED: (count: number) =>
		`${count} tracks from the playlist added to the queue.`,
	UNSUPPORTED_TRACK_SOURCE: "The selected track source is not supported.",
	ADDED_TO_QUEUE: (trackInfo: string) =>
		`Track added to the queue: ${trackInfo}`,
	UNSUPPORTED_PLAYLIST_URL: "The playlist URL is not supported",
	ERROR_PROCESSING_PLAYLIST_URL: (pluginName: string, error: string) =>
		`Error processing playlist URL with plugin ${pluginName}: ${error}`,

	// Plugin messages
	PLUGIN_REGISTERED: (name: string) =>
		`Plugin "${name}" registered successfully`,
	PLUGIN_REGISTRATION_FAILED: (name: string) =>
		`Failed to register plugin "${name}"`,
	PLUGIN_REGISTRATION_FAILED_FATAL: "Critical error during plugin registration",
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) =>
		`Plugin for URL "${url}" found: ${name}`,
	PLUGIN_NOT_FOUND: (pluginName: string) => `Plugin "${pluginName}" not found.`,
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) =>
		`Failed to initialize plugin "${pluginName}":`,
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) =>
		`Error executing plugin "${pluginName}": ${error}`,

	// Message management messages
	MESSAGE_CANNOT_BE_DELETED: (messageId: string) =>
		`Message with ID "${messageId}" cannot be deleted or does not exist.`,
	MESSAGE_DELETED: (messageId: string) =>
		`Message with ID "${messageId}" successfully deleted.`,
	UNEXPECTED_ERROR: "Unexpected error",
	UNKNOWN_ERROR_DELETING_MESSAGE: (messageId: string) =>
		`Unknown error deleting message with ID "${messageId}":`,
	MESSAGE_NO_LONGER_EXISTS: (messageId: string) =>
		`Message with ID "${messageId}" no longer exists.`,

	// Discord API messages
	DISCORD_API_ERROR: (code: number, context: string, message: string) =>
		`Discord API error (${code}) for "${context}": ${message}`,
	UNKNOWN_ERROR_INTERACTION: (interactionId: string) =>
		`Unknown error interacting with ID "${interactionId}":`,
	INTERACTION_NO_LONGER_EXISTS: (interactionId: string) =>
		`Interaction with ID "${interactionId}" no longer exists.`,

	// Play command messages
	PROVIDE_TRACK: "Please provide the track name or URL",
	PLAY_TRACK: "Play track",
	NAME_TRACK: "Track name or URL",
	STARTED_PLAYING: "Starting playback",
	NO_TRACKS_FOUND: (query: string) => `No tracks found for "${query}"`,
	PLAYLIST_ADDED_SUCCESS: "Playlist added successfully",
	PLAY_ERROR: "Failed to play the track. Please try again.",
	AUTOCOMPLETE_ERROR: "Autocomplete error",
	ERROR_PLAYING_TRACK: "Error playing track:",
	PLAYLIST_ADDED_ERROR: "Error adding playlist",
	PLAYLIST_ADDED_ERROR_FATAL: "Critical error adding playlist",
	PLAYLIST_ADDED_ERROR_NO_PLUGIN: "No plugin found for the playlist",

	// Loop command messages
	LOOP_TRACK: "Toggle track loop",
	LOOP_TRACK_ON: (trackInfo: string | undefined) =>
		`Track loop enabled: ${trackInfo}`,
	LOOP_TRACK_OFF: "Track loop disabled",
	PLAYER_NOT_FOUND: "Player not found",
	LOOP_TRACK_ERROR: "Error toggling track loop",

	// Volume command messages
	VOLUME_COMMAND: "Adjust volume",
	VOLUME_SET: (volume: number) => `Volume set to ${volume}%`,
	VOLUME_ERROR: "Error adjusting volume",
	VOLUME_ERROR_MAX_VOLUME: (MAX_VOLUME: number) =>
		`Volume must be between 0 and ${MAX_VOLUME}`,

	// Pause command messages
	PAUSE_COMMAND: "Pause or resume the current track",
	PAUSE_TRACK: "Current track paused",
	RESUME_TRACK: "Current track resumed",

	// Queue command messages
	QUEUE_COMMAND: "View queue",
	QUEUE_EMPTY: "Queue is empty",
	QUEUE_PAGES: (pages: string) => `Page: ${pages}`,
	QUEUE_TRACKS_ERROR: "Error retrieving queue",
	QUEUE_TRACKS_ERROR_FATAL: "Critical error retrieving queue",
	QUEUE_ERROR_NOT_IN_VOICE_CHANNEL: "You must be in a voice channel.",
	UNKNOWN_MESSAGE: "Unknown message",

	// Skip command messages
	SKIP_COMMAND: "Skip the current song",
	SKIP_TRACK: "Current song skipped",
	SKIP_NO_TRACK: "No track to skip",
	SKIP_ERROR: "Error skipping track",

	// Server messages
	PORT_IN_USE: (port: number) => `Port ${port} is in use, please try another`,
	SERVER_ERROR: "Server error:",
	SERVER_START_ERROR: "Error starting server:",
	SERVER_RUNNING_ON_PORT: (port: number) => `Server running on port: ${port}`,

	// Other messages
	NO_RECENTLY_PLAYED_TRACKS: "You have no recently played tracks.",
	RECENTLY_PLAYED_TRACKS: "Your recently played tracks:",
	NO_POPULAR_TRACKS: "No popular tracks.",
	POPULAR_TRACKS: "Popular tracks:",
	QUEUE_CLEARED: "Queue successfully cleared",
};

export const LOGGER_MESSAGES: LoggerMessages = {
	CACHE_HIT: (url: string) => `Cache: found for URL "${url}"`,
	PLUGIN_REGISTERED: (name: string) =>
		`Plugin "${name}" registered successfully`,
	PLUGIN_REGISTRATION_FAILED: (name: string) =>
		`Failed to register plugin "${name}"`,
	PLUGIN_REGISTRATION_FAILED_FATAL: "Critical error during plugin registration",
	PLUGIN_FOUND_FOR_URL: (url: string, name: string) =>
		`Plugin for URL "${url}" found: ${name}`,
	PLUGIN_NOT_FOUND: (pluginName: string) => `Plugin "${pluginName}" not found.`,
	PLUGIN_INITIALIZATION_FAILED: (pluginName: string) =>
		`Failed to initialize plugin "${pluginName}":`,
	PLUGIN_EXECUTION_ERROR: (pluginName: string, error: string) =>
		`Error executing plugin "${pluginName}": ${error}`,

	BOT_FAILED_INITIALIZATION_SERVICES: "Failed to initialize services",
	BOT_STARTED_SUCCESSFULLY: "Bot started successfully",
	BOT_START_ERROR: "Error starting the bot:",
	API_SERVER_STARTED_SUCCESSFULLY: "API server started successfully",
	BOT_INITIALIZED: "Bot successfully initialized",
	BOT_INITIALIZATION_FAILED: "Failed to initialize the bot:",

	DEV_FAILDE_TO_IMPORT_FILE: (file: string) => `Failed to import ${file}:`,
	DEV_FAILDE_TO_LOAD_FILE_FROM: (src: string) =>
		`Failed to load files from ${src}:`,

	RELOAD_SUCCESS: "Reload completed successfully",
	RELOAD_ERROR: "Error during reload:",
	BOT_NOT_ENV_TOKEN: "Could not find DISCORD_TOKEN in your environment",

	PORT_IN_USE: (port: number) => `Port ${port} is in use, please try another`,
	SERVER_ERROR: "Server error:",
	SERVER_START_ERROR: "Error starting server:",
	SERVER_RUNNING_ON_PORT: (port: number) => `Server running on port: ${port}`,

	EDITING_REPLY_FOR_INTERACTION_ID: (interactionId: string) =>
		`Editing reply for interaction ID: ${interactionId}`,
	SENDING_NEW_REPLY_FOR_INTERACTION_ID: (interactionId: string) =>
		`Sending new reply for interaction ID: ${interactionId}`,
	MESSAGE_NOT_DELETABLE: (messageId: string) =>
		`Message with ID "${messageId}" cannot be deleted or does not exist.`,
	MESSAGE_DELETED: (messageId: string) =>
		`Message with ID "${messageId}" successfully deleted.`,
	INTERACTION_NOT_REPLIABLE: (interactionId: string) =>
		`Interaction with ID "${interactionId}" is not repliable`,
	INTERACTION_ALREADY_REPLIED_TO: (interactionId: string) =>
		`Interaction with ID "${interactionId}" has already been replied to`,
	INTERACTION_EXPIRED: (interactionId: string) =>
		`Interaction with ID "${interactionId}" expired: Unknown interaction`,
	REPLY_ERROR: "Reply error:",
	UNKNOWN_ERROR_INTERACTING_WITH_ID: (interactionId: string) =>
		`Unknown error interacting with ID "${interactionId}":`,
	UNKNOWN_ERROR_DELETING_MESSAGE_WITH_ID: (messageId: string) =>
		`Unknown error deleting message with ID "${messageId}":`,
	DISCORD_API_ERROR: (errorCode: number, context: string) =>
		`Discord API error (${errorCode}) for "${context}"`,

	SEARCHING_FOR_TRACK_OR_URL: (trackName: string) =>
		`Searching for track or URL "${trackName}"...`,
	ERROR_SEARCHING_IN_PLUGIN: (pluginName: string) =>
		`Error searching in plugin "${pluginName}":`,
	ERROR_PROCESSING_URL_WITH_PLUGIN: (pluginName: string) =>
		`Error processing URL with plugin "${pluginName}":`,
	FAILED_TO_ADD_TRACK: (trackId: string, MAX_RETRIES: number) =>
		`Failed to add track ${trackId} after ${MAX_RETRIES} attempts:`,
	ERROR_PROCESSING_TRACK: "Error processing track:",

	CREATING_NEW_PLAYER_SERVICE_FOR_GUILD: (guildId: string) =>
		`Creating new PlayerService for guild ${guildId}`,
	ATTEMPTED_TO_LEAVE_CHANNEL_FOR_NON_EXISTENT_PLAYER_IN_GUILD: (
		guildId: string,
	) => `Attempted to leave channel for non-existent player in guild ${guildId}`,

	PLAYER_ERROR: "Player error:",
	FAILED_TO_PLAY_QUEUE_TRACK: "Failed to play/queue track:",
	ERROR_CONNECTING_TO_CHANNEL: "Error connecting to channel:",
	FAILED_TO_GET_URL_FOR_TRACK: "Failed to get URL for track:",
	PLAYBACK_ERROR: "Playback error:",
	CLEARED_EXISTING_FADEOUT_TIMEOUT: "Cleared existing fadeOutTimeout",
	SET_NEW_FADEOUT_TIMEOUT_FOR_DURATION: (duration: number) =>
		`Set new fadeOutTimeout for ${duration} ms`,
	EMPTY_CHECK_ERROR: "Empty check error:",
	CHANNEL_ID_IS_NULL: "Channel ID is null",
	GUILD_NOT_FOUND: "Guild not found",

	PLUGIN_NOT_FOUND_FOR_URL: (url: string) =>
		`Plugin not found for URL "${url}"`,
	FAILED_TO_REGISTER_PLUGIN: (name: string) =>
		`Failed to register plugin "${name}"`,
	PLUGIN_REGISTERED_SUCCESSFULLY: (name: string) =>
		`Plugin "${name}" registered successfully`,
	CACHE_HIT_FOR_URL: (url: string) => `Cache: found for URL "${url}"`,

	PROXY_INITIALIZED_SUCCESSFULLY: "Proxy initialized successfully",
	ERROR_INITIALIZING_PROXY: "Error initializing proxy:",

	ADDED_BATCH_OF_TRACKS: (count: number) => `Added ${count} tracks`,
	ERROR_ADDING_TRACK_TO_QUEUE: (trackId: string) =>
		`Error adding track ${trackId} to queue`,
	ADDED_BATCH_OF_TRACKS_GUILD: (count: number, guildId: string) =>
		`Added ${count} tracks to guild ${guildId}`,
	MISSING_REQUIRED_PARAMETERS: "Missing required parameters",
	GUILD_ID_IS_REQUIRED: "Guild ID is required",
	ERROR_FETCHING_QUEUE_FOR_GUILD: (guildId: string) =>
		`Error fetching queue for guild ${guildId}`,
	ERROR_RETRIEVING_TRACK_FROM_QUEUE: (guildId: string) =>
		`Error retrieving track from queue for guild ${guildId}`,
	ERROR_CLEARING_QUEUE_FOR_GUILD: (guildId: string) =>
		`Error clearing queue for guild ${guildId}`,
	ERROR_REMOVING_TRACK_FROM_QUEUE: (trackId: string) =>
		`Error removing track ${trackId} from queue`,
	ERROR_LOGGING_PLAY_FOR_TRACK: (trackId: string, userId: string) =>
		`Error logging play for track ${trackId} by user ${userId}`,
	ERROR_FETCHING_LAST_PLAYED_TRACKS_FOR_USER: (userId: string) =>
		`Error fetching last played tracks for user ${userId}`,
	ERROR_FETCHING_TOP_PLAYED_TRACKS: "Error fetching top played tracks",
	TRACKS_ARRAY_CANNOT_BE_EMPTY: "Tracks array cannot be empty",
	ERROR_ADDING_TRACKS_TO_QUEUE: "Error adding tracks to queue",

	ERROR_TRACK_SEARCH: (trackName: string) =>
		`Error searching track "${trackName}":`,
	ERROR_PROCESSING_URL: (url: string) => `Error processing URL "${url}":`,
	ERROR_GETTING_TRACK_URL: (trackId: string) =>
		`Error getting URL for track ${trackId}:`,
	ERROR_FETCHING_PLAYLIST_TRACKS: (playlistId: string) =>
		`Error fetching tracks for playlist ${playlistId}:`,
	ERROR_FETCHING_ALBUM_TRACKS: (albumId: string) =>
		`Error fetching tracks for album ${albumId}:`,
	PLAYLIST_NOT_FOUND_OR_EMPTY: (playlistId: string) =>
		`Playlist ${playlistId} not found or empty`,
	NO_SIMILAR_TRACKS_FOUND: (trackId: string) =>
		`No similar tracks found for ${trackId}`,
	ERROR_FETCHING_SIMILAR_TRACKS: (trackId: string) =>
		`Error fetching similar tracks for ${trackId}:`,
	INVALID_TRACK_DATA: (error: string) => `Invalid track data: ${error}`,
	INVALID_CONFIGURATION: (error: string) => `Invalid configuration: ${error}`,
	RETRYING_SEARCH_FOR_TRACK: (trackName: string) =>
		`Retrying search for track "${trackName}":`,
	ERROR_INITIALIZING_YANDEX_SERVICE: "Error initializing YandexService",
	FAILED_TO_INITIALIZE_YANDEX_SERVICE: "Failed to initialize YandexService",

	ERROR_PARSING_URL: "Error parsing URL:",

	ERROR_UNHANDLED_REJECTION: "Unhandled rejection",

	ERROR_AUTOCOMPLETE: "Error autocomplete",
	ERROR_PLAYING_TRACK: "Error playing track:",

	ERROR_RETRIEVING_QUEUE: "Error retrieving queue:",
	CRITICAL_ERROR_RETRIEVING_QUEUE: "Critical error retrieving queue",
	ERROR_SETTING_UP_REACTIONS: "Error setting up reactions:",

	ERROR_SKIPPING_TRACK: "Error skipping track:",

	ERROR_ADJUSTING_VOLUME: "Error adjusting volume:",

	PROXY_AGENT_SUCCESSFULLY_RECEIVED: "Proxy-agent successfully received:",
	PROXY_NOT_ENABLED: "Proxy not enabled.",
};
