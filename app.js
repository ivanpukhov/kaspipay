const express = require('express');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const Order = require('./model');
const sequelize = require('./database');
const {scrollAndAnalyze} = require("./check");

const token = '8104835409:AAEcMWZLCTbrDHGDwb6XZllenx77ip95kEs';
const bot = new TelegramBot(token, {polling: true});
const app = express();
const port = 3030;
let isProcessing = false;
const axios = require('axios');
const { log } = require('console');



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
    if (msg.chat.id === -1002309879116) {
        const regex = /Сумма: (\d+) Тенге\nТелефон: (\d+)\nКомментарий: (\d+)\nТранзакция ID: (\d+)/;
        const matches = msg.text.match(regex);

        if (matches) {
            const [, price, number, comment, serverId] = matches; // Правильный порядок переменных
            const fullComment = comment + generateRandomString(5); // Допустим, generateRandomString определена

            await Order.create({
                serverId,
                price,
                number,
                comment: fullComment,
                isProcessed: false,
                isPaid: false,
                isSend: false
            });

            console.log('Сообщение обработано и заказ сохранен.');
            console.log(price)
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
        const response = await axios.put(`http://localhost:3001/transactions//${orderId}/status`, {
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
        }

    });
    if (orderToProcess) {
        const commands = [
            {cmd: `adb shell input tap 200 1555`, delay: 1500},
            {cmd: `adb shell input swipe 300 500 300 900 200`, delay: 1000},
            {cmd: `adb shell input tap 150 600`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.price}'`, delay: 1500},
            {cmd: `adb shell input tap 460 775`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.number}'`, delay: 1500},
            {cmd: `adb shell input tap 512 1067`, delay: 1500},
            {cmd: `adb shell input text '${orderToProcess.comment}'`, delay: 1500},
            {cmd: `adb shell input tap 70 1573`, delay: 1500},
            {cmd: `adb shell input swipe 300 500 300 900 200`, delay: 1000},
            {cmd: `adb shell input tap 381 1372`, delay: 1500},
            {cmd: `adb shell input tap 400 1549`, delay: 1500},
            {cmd: `adb shell input tap 200 1555`, delay: 1500},
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
        await updateOrderStatusOnFirstServer(orderToProcess.serverId, 'waiting_for_payment');
        console.log(`Заказ ID: ${orderToProcess.id} обработан`);
    }

    isProcessing = false;
    setTimeout(processOrders, 1000);
}

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});
