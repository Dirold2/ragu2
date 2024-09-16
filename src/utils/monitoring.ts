import client from 'prom-client';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'discord-music-bot'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Create a custom counter for track plays
const trackPlayCounter = new client.Counter({
    name: 'track_plays_total',
    help: 'Total number of tracks played',
    labelNames: ['status']
});

register.registerMetric(trackPlayCounter);

export { register, trackPlayCounter };