const { literal } = require("sequelize");
const { sequelize, DataTypes } = require(".");
const FlowServiceElements = require("./FlowServiceElements");

const FlowServices = sequelize.define('FlowServices', {
    ServiceID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    ServiceName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ServiceType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ServiceDescription: DataTypes.STRING,
    ServiceProperties: {
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
    indexes: [
        {
            unique: true,
            fields: ['ServiceName', 'ServiceType']
        }
    ]
});
FlowServices.hasMany(FlowServiceElements, { foreignKey: 'ServiceID', as: 'ServiceElements' })

module.exports = FlowServices;