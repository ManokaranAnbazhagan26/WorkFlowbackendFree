const { literal, DataTypes } = require("sequelize");
const { sequelize } = require(".");

const FlowServiceElements = sequelize.define('FlowServiceElements', {
    FlowServiceElementID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    ServiceID: {
        type: DataTypes.UUID,
        allowNull: false
    },
    ServiceElementName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ServiceDescription: DataTypes.STRING,
    ServiceElementProperties: {
        type: DataTypes.JSON,
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
    timestamps: false,
    indexes:[{
            unique: true,
            fields:['ServiceID','ServiceElementName']
        }]
});

module.exports = FlowServiceElements;