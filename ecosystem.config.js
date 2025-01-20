module.exports = {
  apps : [{
    name: "solver",
    script: "./typescript/solver/dist/index.js",
    env: {
      NODE_ENV: "development",
    },
    env_production: {
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      LOG_FORMAT: "json",
    }
  }]
}
