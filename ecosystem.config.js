// pm2 进程配置：pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "scm-academy",
      script: "./node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
