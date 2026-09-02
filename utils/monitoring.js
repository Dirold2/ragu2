"use strict";import e from"prom-client";const t=new e.Registry;t.setDefaultLabels({app:"discord-music-bot"}),e.collectDefaultMetrics({register:t});const r=new e.Counter({name:"track_plays_total",help:"Total number of tracks played",labelNames:["status"]});t.registerMetric(r);export{t as register,r as trackPlayCounter};
//# sourceMappingURL=monitoring.js.map
