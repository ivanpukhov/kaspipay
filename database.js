const { Sequelize } = require('sequelize');

// Подключение к базе данных SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite'
});

module.exports = sequelize;
