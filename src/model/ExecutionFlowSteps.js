const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");

const ExecutionFlowSteps = sequelize.define('ExecutionFlowSteps', {
    ExecutionFlowStepID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    ExecutionFlowID: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    ShapeID: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ShapeType: {
        type: DataTypes.STRING,
    },
    StepNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    StepName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ServiceID: {
        type: DataTypes.UUID,
    },
    StepProperties: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    StepValues: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    StepStartDate: { type: DataTypes.DATE },
    StepEndDate: { type: DataTypes.DATE },
    OwnerID: { type: DataTypes.UUID },
    StepStatus: {
        type: DataTypes.ENUM('Pending', 'ActionRequired', 'EmailActionRequired', 'Success', 'Failed', 'WaitForEmailResponse', 'LinkActionRequired'),
        allowNull: false,
    },
    IsActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    IsDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    CreatedBy: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    CreatedDate: {
        type: DataTypes.DATE,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
    ModifiedBy: DataTypes.UUID,
    ModifiedDate: DataTypes.DATE,
    DeletedBy: DataTypes.UUID,
    DeletedDate: DataTypes.DATE,
}, {
    timestamps: false,
});

module.exports = ExecutionFlowSteps;