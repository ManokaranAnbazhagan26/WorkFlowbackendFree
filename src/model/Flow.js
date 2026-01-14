const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");
const FlowDetails = require("./FlowDetails");

const Flow = sequelize.define('Flow', {
    FlowID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    FlowName: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    FlowDescription: DataTypes.STRING,
    FlowNodeEdgesDetails: DataTypes.JSON,
    FlowNodePositionDetails: DataTypes.JSON,
    StartNodeID: DataTypes.STRING(20),
    IsActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    IsAllowMultiUsers: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    ExecutionType: {
        type: DataTypes.STRING(10)
    },
    OwnerID: {
        type: DataTypes.UUID,
    },
    OwnerEmail: {
        type: DataTypes.STRING,
    },
    OwnerName: {
        type: DataTypes.STRING,
    },
    AccessStartDate: {
        type: DataTypes.DATE,
    },
    AccessEndDate: {
        type: DataTypes.DATE,
    },
    Version: {
        type: DataTypes.INTEGER,
        defaultValue: 0
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
Flow.hasMany(FlowDetails, { foreignKey: 'FlowID', as: 'Details' })
module.exports = Flow;