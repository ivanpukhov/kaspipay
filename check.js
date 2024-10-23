const { exec } = require('child_process');
const fs = require('fs').promises;
const axios = require('axios');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();
const Order = require('./model');

async function adbCommand(command) {
    for (let attempts = 0; attempts < 3; attempts++) {
        try {
            return await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Ошибка выполнения команды: ${command}`, stderr);
                        reject(error);
                        return;
                    }
                    resolve(stdout.trim());
                });
            });
        } catch (error) {
            console.error('Ошибка при выполнении команды:', error);
            console.log('Перезапуск сервера ADB...');
            await restartADBServer();
        }
    }
    throw new Error('Не удалось выполнить команду после нескольких попыток');
}

async function restartADBServer() {
    return new Promise((resolve, reject) => {
        exec('adb kill-server && adb start-server', (error) => {
            if (error) {
                console.error('Ошибка при перезапуске сервера ADB:', error);
                reject(error);
            } else {
                console.log('Сервер ADB успешно перезапущен.');
                resolve();
            }
        });
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDevice() {
    const devices = await adbCommand('adb devices');
    if (!devices.includes('device')) {
        throw new Error('Устройство не обнаружено.');
    }
    console.log('Устройство обнаружено.');
}

async function scrollToTop() {
    console.log('Прокрутка до самого верха страницы...');
    await checkDevice();
    await adbCommand('adb shell input tap 281 1073');
    await adbCommand('adb shell input swipe 100 700 100 1000');
    await delay(500);
}

async function processUIDump() {
    await checkDevice();
    await adbCommand('adb shell uiautomator dump /sdcard/ui_dump.xml');
    await adbCommand('adb pull /sdcard/ui_dump.xml ./ui_dump.xml');
    const uiDump = await fs.readFile('ui_dump.xml', 'utf8');
    const result = await parser.parseStringPromise(uiDump);

    let collectedTexts = [];
    findTexts(result.hierarchy.node, collectedTexts, 'hr.asseco.android.kaspibusiness:id/sellerComment');

    for (const comment of collectedTexts) {
        const order = await Order.findOne({ where: { comment } });
        if (order && !order.isPaid) {
            const isSuccess = await updateOrderStatusOnFirstServer(order.serverId, 'success');
            if (isSuccess) {
                order.isPaid = true;
                await order.save();
                console.log(`Заказ с ID ${order.serverId} обновлен как 'оплачено'`);
            } else {
                console.log(`Не удалось обновить статус заказа с ID ${order.serverId}`);
            }
        }
    }
}

function findTexts(node, collectedTexts, resourceId) {
    if (node && Array.isArray(node)) {
        node.forEach((n) => {
            if (n.$['resource-id'] === resourceId && n.$.text) {
                collectedTexts.push(n.$.text);
            }
            if (n.node) {
                findTexts(n.node, collectedTexts, resourceId);
            }
        });
    }
}

async function updateOrderStatusOnFirstServer(serverId, newStatus) {
    try {
        const responseTendKz = await axios.patch(`https://tend.kz/api/transactions/${serverId}/status`, {
            status: newStatus
        }, {
            headers: {
                'Authorization': `Bearer jnfvkjsnjnvkerhfds`
            }
        });

        return responseTendKz.status === 200;
    } catch (error) {
        console.error(`Ошибка при обновлении статуса заказа на tend.kz: ${error}`);
        return false;
    }
}

async function scrollAndAnalyze() {
    await scrollToTop();
    let endReached = false;
    let previousDump = '';
    let attempts = 0;

    while (!endReached && attempts <= 30) {
        await processUIDump();
        await delay(3000);

        await checkDevice();
        await adbCommand('adb shell uiautomator dump /sdcard/ui_dump.xml');
        await adbCommand('adb pull /sdcard/ui_dump.xml ./ui_dump.xml');

        const currentDump = await fs.readFile('ui_dump.xml', 'utf8');

        if (currentDump === previousDump) {
            endReached = true;
            console.log('Конец страницы достигнут.');
        } else {
            await adbCommand('adb shell input swipe 100 850 100 500');
            previousDump = currentDump;
            attempts++;
        }
    }
}

module.exports = {
    scrollAndAnalyze
};
