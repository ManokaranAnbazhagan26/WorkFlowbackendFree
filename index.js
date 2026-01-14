const express = require("express");
const cors = require("cors");
const { swaggerSpec } = require("./src/utils/services/swagger");
const swaggerUI = require("swagger-ui-express");
const { dataRoutes } = require("./src/routers/data.routes");

const app = express();

app.use(
  express.json({ limit: "50mb" }),
  express.urlencoded({ extended: true, limit: "50mb" })
);
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerSpec));
app.use("/file", express.static("publics/shared"));
app.use("/logs", express.static("logs"));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use("/v1/C0IUj", dataRoutes);
app.get("/", (req, res) => {
  res.status(200).send({ message: "Welcome to Flow Diagram API" });
});
app.use((req, res) => {
  res
    .status(404)
    .send({ message: "Resource not found ! Please check the URL" });
});

// For local development only
if (process.env.NODE_ENV !== "production") {
  const http = require("http");
  const { Server } = require("socket.io");
  const cron = require("node-cron");
  const { socketIO } = require("./src/utils/services/socket");
  const { flowNotification } = require("./src/controller/flow.controller");

  const server = http.createServer(app);
  const io = new Server(server, {
    path: "/socket.io/",
    cors: {
      origin: "*",
    },
  });

  socketIO(io);

  cron.schedule("*/30 * * * *", () => {
    flowNotification();
  });

  const port = process.env.PORT || 4311;
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

// Export for Vercel
module.exports = app;
