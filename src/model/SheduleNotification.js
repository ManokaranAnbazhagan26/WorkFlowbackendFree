const { sequelize, DataTypes } = require(".");

const SheduleNotification = sequelize.define('SheduleNotification', {
    SheduleNotificationID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    FlowID:DataTypes.UUID,
    ExecutionFlowID:DataTypes.UUID,
    ShapeID:DataTypes.STRING(20),
    Email:{
        type: DataTypes.STRING(50),
        allowNull: false
    },
    Subject:{
        type: DataTypes.STRING,
        allowNull: false
    },
    ScheduleDateAndTime: {
        type: DataTypes.DATE,
        allowNull: false
    },
    NotificationContent: {
        type: DataTypes.TEXT,
        allowNull: false
    },
},{
    timestamps: false
});

module.exports = SheduleNotification;