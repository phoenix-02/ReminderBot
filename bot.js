const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');

const token = process.env.TG_TOKEN;
const defaultGroupId = process.env.DEFAULT_GROUP_ID;
const botTag = process.env.BOT_TAG;
const groupIds = process.env.GROUP_IDS.split(', ');
const allowedUsers = process.env.ALLOWED_USERS.split(', ');

const botTagRegExp = new RegExp(`${ botTag }`, 'g');
const bot = new TelegramBot(token, { polling: true });

let messageText = 'Время отправить фото показателей в группу "Контроль CTE"';
let interval = 60 * 1000;
let intervalId = null;
let startTime = null;

bot.sendMessage(defaultGroupId, 'Я родился');

const sendMessage = (messageTextToSend) => {
    groupIds.forEach(groupId => bot.sendMessage(groupId, messageTextToSend));
};

const startSendingMessages = () => {
    sendMessage(messageText);
    intervalId = setInterval(() => sendMessage(messageText), interval);
};

const stopSendingMessages = () => {
    clearInterval(intervalId);
};

const scheduleSendingMessages = (startHour, startMinute) => {
    const now = moment().tz('Europe/Moscow');
    const scheduledTime = moment()
    .tz('Europe/Moscow')
    .set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });

    if(scheduledTime.isBefore(now)) {
        scheduledTime.add(1, 'day');
    }

    const delay = scheduledTime.diff(now);
    setTimeout(() => {
        startSendingMessages();
        bot.sendMessage(defaultGroupId, 'Рассылка сообщений начата.');
    }, delay);
};

const checkPermission = (msg, handler) => {
    try {
        if(!allowedUsers.includes(String(msg.from.id))) {
            bot.sendMessage(msg.chat.id, 'У вас нет доступа к выполнению этой команды.');
            return;
        }
        handler(msg);
    } catch(error) {
        console.error(`Ошибка при выполнении команды ${ msg.text }:`, error);
        bot.sendMessage(msg.chat.id, `Произошла ошибка при выполнении команды ${ msg.text }.`);
    }
};

const botStart = (msg) => {

    if(startTime === null) {
        startSendingMessages();
        sendMessage('Рассылка сообщений начата. \n /help - для меню комманд \n /info - для информации по боту');
    } else {
        scheduleSendingMessages(startTime.hour(), startTime.minute());
        sendMessage(msg.chat.id, `Рассылка сообщений запланирована на ${ startTime.format('HH:mm') }.`);
    }
};

const botStop = (msg) => {

    stopSendingMessages();
    sendMessage(msg.chat.id, 'Рассылка сообщений остановлена.');
};

const botInterval = (msg, args) => {

    const newInterval = 60 * 1000 * parseInt(args);
    if(!isNaN(newInterval)) {
        interval = newInterval;
        if(intervalId !== null) {
            stopSendingMessages();
            startSendingMessages();
            bot.sendMessage(msg.chat.id, `Интервал успешно изменен на ${ newInterval / (60 * 1000) } минут.`);
        } else {
            bot.sendMessage(msg.chat.id, 'Интервал изменен, но рассылка сообщений остановлена. Используйте команду /start для возобновления.');
        }
    } else {
        bot.sendMessage(msg.chat.id, 'Неверный формат интервала.');
    }
};

const botMessage = (msg, args) => {

    messageText = args;
    bot.sendMessage(msg.chat.id, 'Текст сообщения успешно изменен.');

};

const botSetTime = (msg, args) => {

    const timeRegex = /(\d{1,2}):(\d{2})/;
    const timeMatch = args.match(timeRegex);

    if(!timeMatch) {
        bot.sendMessage(msg.chat.id, 'Неверный формат времени. Используйте формат ЧЧ:ММ (например, 09:30).');
        return;
    }

    const startHour = parseInt(timeMatch[1]); // Получение часов
    const startMinute = parseInt(timeMatch[2]); // Получение минут

    if(!isNaN(startHour) && !isNaN(startMinute) && startHour >= 0 && startHour < 24 && startMinute >= 0 && startMinute < 60) {
        startTime = moment().tz('Europe/Moscow').set({ hour: startHour, minute: startMinute });
        bot.sendMessage(msg.chat.id, `Время начала рассылки установлено на ${ startTime.format('HH:mm') }.`);
        if(intervalId === null) {
            stopSendingMessages();
            startSendingMessages();
            scheduleSendingMessages(startHour, startMinute);
        }
    } else {
        bot.sendMessage(msg.chat.id, 'Неверный формат времени. Используйте формат ЧЧ:ММ (например, 09:30).');
    }
};

const botInfo = (msg) => {

    const infoMessage = `Рассылка ${intervalId ?'':'НЕ'} запущена! \nТекущий интервал: ${ interval / (60 * 1000) } минут\n` + `Время начала рассылки: ${ startTime ? startTime.format('HH:mm') : 'не задано' }\n` + `Текст сообщения: ${ messageText }`;
    bot.sendMessage(msg.chat.id, infoMessage);
};

const botHelp = (msg) => {

    const helpMessage = `
            Доступные команды:\n
            /start - начать рассылку сообщений\n
            /stop - остановить рассылку сообщений\n
            /interval <интервал в минутах> - изменить интервал рассылки\n
            /message <текст сообщения> - изменить текст сообщения\n
            /time <часы:минуты> - установить время начала рассылки по таймзоне Moscow \n
            /info - получить информацию о текущей конфигурации\n
            /help - получить список доступных команд
        `;
    bot.sendMessage(msg.chat.id, helpMessage);
};

const commands = [
    { command: '/message', handler: botMessage },
    { command: '/info', handler: botInfo },
    { command: '/help', handler: botHelp },
    { command: '/start', handler: botStart },
    { command: '/stop', handler: botStop },
    { command: '/time', handler: botSetTime },
    { command: '/interval', handler: botInterval }
];

const handleCommands = (msg) => {
    const commandEntity = msg.entities.find(entity => entity.type === 'bot_command');
    const commandString = msg.text.slice(commandEntity.offset, commandEntity.offset + commandEntity.length);
    const args = msg.text.replaceAll(botTag, '').replace(commandString, '').trim();
    const actualCommand = commands.find(c => c.command === commandString);

    if(actualCommand) {
        checkPermission(msg, () => {
            actualCommand.handler(msg, args);
        })
    } else {
        bot.sendMessage(msg.chat.id, 'Неизвестная команда.');
    }
};

bot.onText(botTagRegExp, (msg) => {
    if(msg.entities) {
        const mentionEntities = msg.entities.filter(entity => entity.type === 'mention');
        if(!mentionEntities.length) return;
        const botMention = mentionEntities.map(entity => msg.text.slice(entity.offset, entity.offset + entity.length))[0];
        if(botMention === botTag) {
            handleCommands(msg);
        }
    }
});

bot.onText(/\/id/, (msg) => {
    const chatId = msg.chat.id;
    console.log(chatId, `Привет! ID этой группы: ${ chatId }`);
    console.log(msg.text, `текст сообщения`);
});
