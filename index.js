const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { swaggerSpec } = require("./src/utils/services/swagger");
const swaggerUI = require("swagger-ui-express");
const { dataRoutes } = require("./src/routers/data.routes");
const { flowNotification } = require("./src/controller/flow.controller");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const { socketIO } = require("./src/utils/services/socket");

const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});
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
socketIO(io);
app.use("/v1/C0IUj", dataRoutes);
app.get("/", (req, res) => {
  res.status(200).send({ message: "Welcome to Flow Diagram API" });
});
app.use((req, res) => {
  res
    .status(404)
    .send({ message: "Resource not found ! Please check the URL" });
});
const port = process.env.PORT || 4311;
cron.schedule("*/30 * * * *", () => {
  flowNotification();
});
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// At the end of your file, add this export
module.exports = app;

// Keep your existing app.listen() but wrap it in a condition
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
