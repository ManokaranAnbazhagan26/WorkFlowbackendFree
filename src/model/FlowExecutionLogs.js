const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");

const FlowExecutionLogs = sequelize.define('FlowExecutionLogs', {
    FlowExecutionID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    FlowID: {
        type: DataTypes.UUID,
        allowNull: false
    },
    TerminatedFlowDetailsID: {
        type: DataTypes.UUID,
        allowNull: false
    },
    FlowExecutionStatus: {
        type: DataTypes.ENUM(['Success', 'Failed', 'Terminated']),
    },
    UserID:{
        type: DataTypes.UUID,
        allowNull: false
    },
    IsActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    IsDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    CreatedBy: {
        type: DataTypes.UUID,
        allowNull: false
    },
    CreatedDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP')
    },
    ModifiedBy: DataTypes.UUID,
    ModifiedDate: DataTypes.DATE,
    DeletedBy: DataTypes.UUID,
    DeletedDate: DataTypes.DATE
}, {
    timestamps: false
});

module.exports = FlowExecutionLogs;