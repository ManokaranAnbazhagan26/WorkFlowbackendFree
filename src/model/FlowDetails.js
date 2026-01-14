const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");
const FlowServiceElements = require("./FlowServiceElements");

const FlowDetails = sequelize.define('FlowDetails', {
    FlowDetailID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    Title: {
        type: DataTypes.STRING,
    },
    FlowID: {
        type: DataTypes.UUID,
        allowNull: false
    },
    ServiceID: {
        type: DataTypes.UUID,
    },
    StepNumber: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ShapeType:{
        type:DataTypes.STRING(50),
    },
    ShapeID:DataTypes.STRING(50),
    DetailsProperties: {
        type: DataTypes.JSON,
        allowNull: false,
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
FlowDetails.belongsTo(FlowServiceElements, { foreignKey: 'ServiceID',targetKey:'FlowServiceElementID', as: 'ServiceElements' })
module.exports = FlowDetails;