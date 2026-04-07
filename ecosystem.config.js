module.exports = {
  apps: [
    {
      name: "stakeholdersim",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      instances: 1, // SQLite requires single instance
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/stakeholdersim/error.log",
      out_file: "/var/log/stakeholdersim/out.log",
      merge_logs: true,
    },
  ],
};
