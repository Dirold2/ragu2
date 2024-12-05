import dotenv from 'dotenv';

dotenv.config();

export const apps = [
  {
    name: "ragu2",
    script: "./build/main.js",
    cwd: "/app",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: "production",
    },
    watch: false,
    ignore_watch: ["node_modules"],
    max_memory_restart: "1G",
    env_development: {
      NODE_ENV: "development",
    },
    env_test: {
      NODE_ENV: "test",
    },
  }
];