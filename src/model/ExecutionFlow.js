const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");
const ExecutionFlowSteps = require("./ExecutionFlowSteps");
const Flow = require("./Flow");

const ExecutionFlow = sequelize.define('ExecutionFlow', {
    ExecutionFlowID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    FlowID: {
        type: DataTypes.UUID,
        allowNull: false
    },
    FlowName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    StartDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    EndDate: {
        type: DataTypes.DATE
    },
    Status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ErrorMessage: {
        type: DataTypes.STRING
    },
    RetryCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    FlowVersion: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    Version: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    NodeEdgesDetails: DataTypes.JSON,
    NodePositionDetails: DataTypes.JSON,
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
ExecutionFlow.belongsTo(Flow, { foreignKey: 'FlowID', as: 'Flow' });
ExecutionFlow.hasMany(ExecutionFlowSteps, { foreignKey: 'ExecutionFlowID', as: 'Steps' });

module.exports = ExecutionFlow;