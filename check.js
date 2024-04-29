const {exec} = require('child_process');
const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();
const Order = require('./model');

async function adbCommand(command) {
    while (true) {
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
            exec('adb kill-server && adb start-server', (killError) => {
                if (killError) {
                    console.error('Ошибка при перезапуске сервера ADB:', killError);
                } else {
                    console.log('Сервер ADB успешно перезапущен.');
                }
            });
        }
    }
}


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDevice() {
    let deviceFound = false;
    while (!deviceFound) {
        try {
            const devices = await adbCommand('adb devices');
            if (devices.includes('device')) {
                deviceFound = true;
                console.log('Устройство обнаружено.');
            } else {
                console.log('Устройство не обнаружено. Повторная попытка через 5 секунд.');
                await delay(5000);
            }
        } catch (error) {
            console.error('Ошибка при проверке устройства:', error);
            console.log('Повторная попытка через 5 секунд.');
            await delay(5000);
        }
    }
}

async function scrollToTop() {
    console.log('Прокрутка до самого верха страницы...');
    await checkDevice();
    await adbCommand('adb shell input tap 281 1073');
    for (let i = 0; i < 5; i++) {
        await checkDevice();
        await adbCommand('adb shell input swipe 100 700 100 1000');
        await delay(100);
    }
}

async function processUIDump() {
    await checkDevice();
    await adbCommand('adb shell uiautomator dump /sdcard/ui_dump.xml');
    await checkDevice();
    await adbCommand('adb pull /sdcard/ui_dump.xml ./ui_dump.xml');
    const uiDump = fs.readFileSync('ui_dump.xml', 'utf8');
    parser.parseString(uiDump, async (err, result) => {
        if (err) {
            console.error('Ошибка при разборе XML:', err);
            return;
        }
        let collectedTexts = [];
        findTexts(result.hierarchy.node, collectedTexts, 'hr.asseco.android.kaspibusiness:id/sellerComment');
        for (const comment of collectedTexts) {
            const order = await Order.findOne({where: {comment}});
            if (order && !order.isPaid) {
                const isSuccess = await updateOrderStatusOnFirstServer(order.serverId, 'Оплачено');
                if (isSuccess) {
                    order.isPaid = true;
                    await order.save();
                    console.log(`Заказ с ID ${order.serverId} обновлен как 'оплачено'`);
                    await sendPostRequest(order);
                } else {
                    console.log(`Не удалось обновить статус заказа с ID ${order.serverId}`);
                }
            }
        }
    });
}

async function sendPostRequest(order) {
    try {
        const response = await axios.post('http://localhost:5000/process', {
            kot: order.kot,
            user_input: order.user_input,
            street: order.street,
            number: order.number,
            serverId: order.serverId
        });
        console.log('POST-запрос успешно отправлен:', response.data);
    } catch (error) {
        console.error('Ошибка при отправке POST-запроса:', error);
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
        const response = await axios.put(`http://45.12.73.68:3000/orders/${serverId}/status`, {
            status: newStatus
        }, {
            headers: {
                'Authorization': `Bearer 56j48P2jHy38uvzrjtFNNkjlwdfkjbvwlkejgbUMqKhTzRjyIRj7xcmChhTYuF1VZuLLcGIsR4egG`
            }
        });
        return response.status === 200;
    } catch (error) {
        console.error(`Ошибка при обновлении статуса заказа на первом сервере: ${error}`);
        return false;
    }
}

async function scrollAndAnalyze() {
    await scrollToTop();
    let endReached = false;
    let previousDump = '';
    let currentDump = '';
    let attempts = 0;
    while (!endReached) {
        await processUIDump();
        await delay(1000);
        await delay(1000);
        await delay(1000);

        await checkDevice();
        await adbCommand('adb shell uiautomator dump /sdcard/ui_dump.xml');

        await checkDevice();
        await adbCommand('adb pull /sdcard/ui_dump.xml');
        currentDump = fs.readFileSync('ui_dump.xml', 'utf8');
        if (currentDump === previousDump || attempts > 30) {
            endReached = true;
            console.log('Конец страницы достигнут или превышен лимит попыток.');
        } else {
            await checkDevice();
            await adbCommand('adb shell input swipe 100 850 100 500');
            previousDump = currentDump;
            attempts++;
        }
    }
}

module.exports = {
    scrollAndAnalyze
};
