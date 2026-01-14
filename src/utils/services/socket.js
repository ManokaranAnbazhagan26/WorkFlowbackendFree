let io,
    flowSocketsIds = []

const socketIO = (paramIO) => {
    io = paramIO;
    io.on("connection", (socket) => {
        console.log(`User Connected: ${socket.id}`);

        socket.on("register", (flowID) => {
            console.log("Socket register for flow " + flowID);
            flowSocketsIds[flowID] = socket.id;
        });

        // Handle disconnection
        socket.on("disconnect", () => {
            console.log(`User Disconnected: ${socket.id}`);
        });
    });
}
const flowExecutionUpdate = (FlowID) => {
    console.log("Flow Execution Update Triggered");
    io.to(flowSocketsIds[FlowID]).emit("flowExecutionUpdate", 'Success');
}
module.exports = {
    socketIO, flowExecutionUpdate
}