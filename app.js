const express = require('express');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const Order = require('./model');
const sequelize = require('./database');
const {scrollAndAnalyze} = require("./check");

const token = '6515597075:AAHwpV7yxqCa7ilXrP6bwOJp65xdlWCUHW4';
const bot = new TelegramBot(token, {polling: true});
const app = express();
const port = 3030;
let isProcessing = false;
const axios = require('axios');



async function initializeDatabase() {
    await sequelize.sync();
    console.log('База данных инициализирована');
    processOrders();
}

initializeDatabase();

const generateRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

bot.on('message', async (msg) => {
    if (msg.chat.id === -1002037248488) {
        const regex = /ID: (\d+)\nНомер: (\d+)\nКомментарий: (.+)\nЦена: (\d+)\nИмя клиента: (.+)\nИндекс: (.+)\nГород: (.+)\nУлица: (.+)\nДом: (.+)\nСпособ доставки: (.+)\nСпособ оплаты: (.+)/;
        const matches = msg.text.match(regex);

        if (matches) {
            const [, id, number, comment, price, customerName, addressIndex, city, street, houseNumber, deliveryMethod, paymentMethod] = matches;
            const fullStreet = `${city} ${street} ${houseNumber}`;
            const fullComment = comment + generateRandomString(5);  // Предполагается, что функция generateRandomString уже определена

            await Order.create({
                serverId: id,
                price,
                number,
                comment: fullComment,
                kot: customerName,
                user_input: addressIndex,
                street: fullStreet,
                deliveryMethod,
                paymentMethod,
                isProcessed: false,
                isPaid: false,
                isSend: false
            });

            console.log('Заказ сохранен в базе данных');
        } else {
            console.error('Сообщение не соответствует ожидаемому формату');
        }
    }
});

async function updateOrderStatusOnFirstServer(orderId, newStatus) {
    const config = {
        headers: {
            'Authorization': `Bearer 56j48P2jHy38uvzrjtFNNkjlwdfkjbvwlkejgbUMqKhTzRjyIRj7xcmChhTYuF1VZuLLcGIsR4egG`
        }
    };

    try {
        const response = await axios.put(`http://localhost:3001/orders/${orderId}/status`, {
            status: newStatus
        }, config);

        console.log(`Статус заказа ID: ${orderId} обновлен на первом сервере: ${newStatus}`);

    } catch (error) {
        console.error(`Ошибка при обновлении статуса заказа на первом сервере: ${error}`);
    }
}

async function processOrders() {
    if (isProcessing) return;
    isProcessing = true;
    await scrollAndAnalyze();
    const orderToProcess = await Order.findOne({
        where: {
            isProcessed: false,
            paymentMethod: 'kaspi'
        }

    });
    if (orderToProcess) {
        const commands = [
            {cmd: `adb shell input tap 163 1083`, delay: 1500},
            {cmd: `adb shell input swipe 300 500 300 900 200`, delay: 1000},
            {cmd: `adb shell input tap 150 400`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.price}'`, delay: 1500},
            {cmd: `adb shell input tap 50 570`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.number}'`, delay: 1500},
            {cmd: `adb shell input tap 50 910`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.comment}'`, delay: 1500},
            {cmd: `adb shell input swipe 300 500 300 900 200`, delay: 1000},
            {cmd: `adb shell input tap 50 1165`, delay: 1500},
            {cmd: `adb shell input tap 150 1150`, delay: 1500},
            {cmd: `adb shell input tap 150 1010`, delay: 1500},
            {cmd: `adb shell input tap 150 965`, delay: 1500},
            {cmd: `adb shell input tap 150 1100`, delay: 1500},
        ];

        for (const {cmd, delay} of commands) {
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                }
            });
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        orderToProcess.isProcessed = true;
        await orderToProcess.save();
        await updateOrderStatusOnFirstServer(orderToProcess.serverId, 'Ожидает оплаты');
        console.log(`Заказ ID: ${orderToProcess.id} обработан`);
    }

    isProcessing = false;
    setTimeout(processOrders, 1000);
}

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
