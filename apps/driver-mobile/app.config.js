const base = require("./app.json");

module.exports = ({ config }) => ({
  ...base.expo,
  ...config,
  extra: {
    ...(config && config.extra ? config.extra : {}),
    eas: {
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    },
  },
});
