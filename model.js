const { DataTypes } = require('sequelize');
const sequelize = require('./database');

// Определение модели данных для заказа
const Order = sequelize.define('Order', {
    serverId: DataTypes.STRING,
    price: DataTypes.STRING,
    number: DataTypes.STRING,
    comment: DataTypes.STRING,
    isProcessed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    isSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, { timestamps: false });


module.exports = Order;
