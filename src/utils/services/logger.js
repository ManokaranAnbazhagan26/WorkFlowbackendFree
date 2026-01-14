const winston = require("winston");

const { combine, timestamp, printf } = winston.format;

// Custom filter for each level
const levelFilter = (level) => {
  return winston.format((info) => {
    return info.level === level ? info : false;
  })();
};

exports.logger = winston.createLogger({
  level: "debug",
  format: combine(
    timestamp({
      format: "hh:mm:ss.SSS A",
    }),
    printf(
      ({ timestamp, ...rest }) => `[${timestamp}]: ${JSON.stringify(rest)}`
    )
  ),
  defaultMeta: { service: "flow-service" },
  transports: [
    new winston.transports.File({
      filename: `logs/${new Date().toISOString().slice(0, 10)}_error.log`,
      level: "error",
      format: combine(levelFilter("error")),
    }),
    new winston.transports.File({
      filename: `logs/${new Date().toISOString().slice(0, 10)}_info.log`,
      level: "info",
      format: combine(levelFilter("info")),
    }),
    new winston.transports.File({
      filename: `logs/${new Date().toISOString().slice(0, 10)}_debug.log`,
      level: "debug",
      format: combine(levelFilter("debug")),
    }),
  ],
});
