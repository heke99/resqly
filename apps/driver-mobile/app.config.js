// apps/driver-mobile/app.config.js
const base = require("./app.json");

const easProjectId =
  process.env.EXPO_PUBLIC_PROJECT_ID ||
  "1ab3212c-fd1a-41df-8df3-ce2625ccfb6c";

module.exports = ({ config }) => ({
  ...base.expo,
  ...config,
  extra: {
    ...(base.expo.extra || {}),
    ...(config && config.extra ? config.extra : {}),
    eas: {
      ...(base.expo.extra && base.expo.extra.eas ? base.expo.extra.eas : {}),
      ...(config && config.extra && config.extra.eas ? config.extra.eas : {}),
      projectId: easProjectId,
    },
  },
});