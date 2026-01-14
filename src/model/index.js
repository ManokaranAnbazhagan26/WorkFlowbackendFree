const { Sequelize, DataTypes } = require("sequelize");
    const sequelize = new Sequelize('pluto-new', 'appuser', 'welcome$321', {
        host: '3.15.137.150',
        port: 5432,
        dialect: 'postgres',
        // logging: false,
        dialectOptions: {
            charset: 'utf8mb4',
        },
        define: {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
        },
        pool: {
            max: 5,
            min: 0,
            acquire: 60000,
            idle: 60000,
        },
    });
    (async () => {
        try {
            await sequelize.authenticate();
            // await sequelize.sync();
            console.log("Connection has been established successfully.");
        } catch (error) {
            console.log("Error: " + error)
        }
    })()

module.exports = { sequelize, DataTypes };