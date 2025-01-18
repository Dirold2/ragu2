import dotenv from 'dotenv';

dotenv.config();

export const apps = [
  {
    name: "ragu2",
    script: "./build/main.js",
    cwd: "./",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      BOT_TOKEN: process.env.BOT_TOKEN,
      YM_USER_ID: process.env.YM_USER_ID,
      YM_API_KEY: process.env.YM_API_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
    },
    env_production: {
      NODE_ENV: "production",
    },
    env_development: {
      NODE_ENV: "development",
    },
    watch: false,
    ignore_watch: ["node_modules", "logs"],
    max_memory_restart: "1G",
    exp_backoff_restart_delay: 100,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 10,
    restart_delay: 4000,
    kill_timeout: 5000,
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    error_file: "./logs/pm2/error.log",
    out_file: "./logs/pm2/out.log",
    time: true,
    source_map_support: true,
    node_args: [
      "--enable-source-maps",
      "--experimental-specifier-resolution=node"
    ]
  }
];