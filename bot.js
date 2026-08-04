require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ─────────────────────────────────────────────
//  КОНФИГ
// ─────────────────────────────────────────────
const ADMIN_USERNAME = 'hardwareexploit';
const DB_FILE = path.join(__dirname, 'db.json');

// ─────────────────────────────────────────────
//  БАЗА ДАННЫХ
// ─────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: {}, promocodes: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = { 
      paid: false, 
      username: '', 
      firstName: '',
      subscriptionEnd: null,
      subscriptionDays: 0
    };
    saveDB(db);
  }
  return db.users[userId];
}

function setUserSubscription(userId, days) {
  const db = loadDB();
  if (!db.users[userId]) db.users[userId] = {};
  
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  db.users[userId].paid = true;
  db.users[userId].subscriptionEnd = endDate.toISOString();
  db.users[userId].subscriptionDays = days;
  saveDB(db);
}

function checkSubscription(userId) {
  const db = loadDB();
  const user = db.users[userId];
  if (!user || !user.paid || !user.subscriptionEnd) return false;
  
  const now = new Date();
  const endDate = new Date(user.subscriptionEnd);
  
  if (now > endDate) {
    user.paid = false;
    user.subscriptionEnd = null;
    user.subscriptionDays = 0;
    saveDB(db);
    return false;
  }
  
  return true;
}

function getSubscriptionInfo(userId) {
  const db = loadDB();
  const user = db.users[userId];
  if (!user || !user.subscriptionEnd) return null;
  
  const now = new Date();
  const endDate = new Date(user.subscriptionEnd);
  const remainingMs = endDate.getTime() - now.getTime();
  
  if (remainingMs <= 0) return null;
  
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  
  return { days, hours, minutes, endDate };
}

function saveOrder(userId, userData, photoFileId) {
  const db = loadDB();
  db.orders[userId] = {
    userId,
    username: userData.username || '',
    firstName: userData.firstName || '',
    photoFileId,
    status: 'pending',
    date: new Date().toISOString(),
  };
  saveDB(db);
}

function getOrder(userId) {
  const db = loadDB();
  return db.orders[userId] || null;
}

function getPendingOrders() {
  const db = loadDB();
  return Object.values(db.orders).filter((o) => o.status === 'pending');
}

function updateOrderStatus(userId, status) {
  const db = loadDB();
  if (db.orders[userId]) {
    db.orders[userId].status = status;
    saveDB(db);
  }
}

// ─────────────────────────────────────────────
//  ПРОМОКОДЫ
// ─────────────────────────────────────────────
function generatePromocode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createPromocode(type, value, description = '') {
  const db = loadDB();
  const code = generatePromocode();
  
  db.promocodes[code] = {
    type: type,
    value: value,
    description: description,
    used: false,
    usedBy: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  saveDB(db);
  return code;
}

function usePromocode(userId, code) {
  const db = loadDB();
  const promocode = db.promocodes[code];
  
  if (!promocode) return { success: false, message: '❌ Промокод не найден' };
  if (promocode.used) return { success: false, message: '❌ Промокод уже использован' };
  if (new Date() > new Date(promocode.expiresAt)) {
    return { success: false, message: '❌ Срок действия промокода истек' };
  }
  
  promocode.used = true;
  promocode.usedBy = userId;
  promocode.usedAt = new Date().toISOString();
  saveDB(db);
  
  if (promocode.type === 'free') {
    setUserSubscription(userId, promocode.value);
    return { 
      success: true, 
      message: `🎉 Промокод активирован! Вы получили подписку на ${promocode.value} дней!`,
      type: 'free',
      days: promocode.value
    };
  } else if (promocode.type === 'discount') {
    return { 
      success: true, 
      message: `🎉 Промокод активирован! Вы получили скидку ${promocode.value}% на следующую покупку!`,
      type: 'discount',
      discount: promocode.value
    };
  }
  
  return { success: false, message: '❌ Неизвестный тип промокода' };
}

function getAllPromocodes() {
  const db = loadDB();
  return db.promocodes;
}

// ─────────────────────────────────────────────
//  СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЕЙ
// ─────────────────────────────────────────────
const userStates = {};

// ─────────────────────────────────────────────
//  КАТАЛОГ
// ─────────────────────────────────────────────
const catalog = [
  {
    id: 'velocity_crack',
    name: '⚡️thorsteinar.pw',
    description:
      '⚡️ *thorsteinar.pw*\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      '📦 Продукт: ⚡️thorsteinar.pw\n' +
      '💎 Качество: Premium\n' +
      '🔄 Обновления: включены\n' +
      '⚡ Поставка: после подтверждения оплаты\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📝 Нажми *Buy* чтобы приобрести.',
  },
];

// ─────────────────────────────────────────────
//  КЛАВИАТУРЫ
// ─────────────────────────────────────────────
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛍 Каталог', callback_data: 'catalog' }],
      [{ text: '📩 Подать заявку', callback_data: 'submit_order' }],
      [{ text: '🎫 Промокод', callback_data: 'promocode' }],
      [{ text: '👤 Профиль', callback_data: 'profile' }],
      [{ text: '🤝 Реселлеры', callback_data: 'resellers' }],
    ],
  };
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Список заявок', callback_data: 'admin_orders' }],
      [{ text: '📤 Загрузить лоадер', callback_data: 'admin_upload_loader' }],
      [{ text: '🎫 Создать промокод', callback_data: 'admin_create_promocode' }],
      [{ text: '📊 Список промокодов', callback_data: 'admin_list_promocodes' }],
      [{ text: '🏠 Главное меню', callback_data: 'main' }],
    ],
  };
}

// ─────────────────────────────────────────────
//  ОБРАБОТЧИКИ СООБЩЕНИЙ
// ─────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'пользователь';

  const db = loadDB();
  if (!db.users[msg.from.id]) db.users[msg.from.id] = {};
  db.users[msg.from.id].username = msg.from.username || '';
  db.users[msg.from.id].firstName = msg.from.first_name || '';
  if (db.users[msg.from.id].paid === undefined) db.users[msg.from.id].paid = false;
  saveDB(db);

  bot.sendMessage(
    msg.chat.id,
    `👋 Привет, *${name}*!\n\nДобро пожаловать в наш магазин.\nВыбери раздел ниже 👇`,
    { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
  );
});

// Прием промокода
bot.on('text', async (msg) => {
  const userId = msg.from.id;
  const text = msg.text;
  
  // Проверяем, ждет ли пользователь ввод промокода
  if (userStates[userId] === 'waiting_promocode') {
    const result = usePromocode(userId, text.toUpperCase());
    userStates[userId] = null;
    
    bot.sendMessage(
      msg.chat.id,
      result.message,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
    return;
  }
  
  // Создание промокода админом
  if (userStates[userId] === 'promo_discount' || userStates[userId] === 'promo_free') {
    const value = parseInt(text);
    if (isNaN(value) || value <= 0) {
      bot.sendMessage(msg.chat.id, '❌ Введите корректное число!');
      return;
    }
    
    const type = userStates[userId] === 'promo_discount' ? 'discount' : 'free';
    const typeName = type === 'discount' ? 'скидку' : 'подписку';
    const code = createPromocode(type, value);
    
    userStates[userId] = null;
    
    bot.sendMessage(
      msg.chat.id,
      `✅ *Промокод создан!*\n\n` +
      `🎫 Код: \`${code}\`\n` +
      `📌 Тип: ${typeName}\n` +
      `📊 Значение: ${value}${type === 'discount' ? '%' : ' дней'}\n\n` +
      `Промокод действителен 30 дней.`,
      { parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }
});

// Прием фото (скриншот оплаты)
bot.on('photo', async (msg) => {
  const userId = msg.from.id;

  if (userStates[userId] !== 'waiting_payment_proof') return;

  const photoFileId = msg.photo[msg.photo.length - 1].file_id;

  saveOrder(userId, {
    username: msg.from.username || '',
    firstName: msg.from.first_name || '',
  }, photoFileId);

  userStates[userId] = null;

  bot.sendMessage(
    msg.chat.id,
    '✅ *Скриншот оплаты получен!*\n\n⏳ Ожидайте подтверждения от администратора.',
    { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
  );

  await notifyAdmin(userId, msg.from, photoFileId);
});

// Прием файла лоадера
bot.on('document', async (msg) => {
  const userId = msg.from.id;
  if (userStates[userId] !== 'waiting_loader_file') return;
  if ((msg.from.username || '') !== ADMIN_USERNAME) return;

  const fileId = msg.document.file_id;

  const db = loadDB();
  db.loaderFileId = fileId;
  db.loaderFileName = msg.document.file_name || 'loader.exe';
  saveDB(db);

  userStates[userId] = null;

  bot.sendMessage(msg.chat.id, '✅ Файл лоадера сохранён!', {
    reply_markup: adminKeyboard(),
  });
});

// ─────────────────────────────────────────────
//  УВЕДОМЛЕНИЕ АДМИНУ
// ─────────────────────────────────────────────
async function notifyAdmin(userId, fromUser, photoFileId) {
  const db = loadDB();

  const adminEntry = Object.entries(db.users).find(
    ([, u]) => u.username === ADMIN_USERNAME
  );
  if (!adminEntry) return;

  const adminChatId = adminEntry[0];
  const uname = fromUser.username ? `@${fromUser.username}` : fromUser.first_name;

  await bot.sendPhoto(adminChatId, photoFileId, {
    caption:
      `🔔 *Новая заявка!*\n\n` +
      `👤 Пользователь: ${uname}\n` +
      `🆔 ID: \`${userId}\``,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Одобрить', callback_data: `approve_${userId}` },
          { text: '❌ Отклонить', callback_data: `reject_${userId}` },
        ],
      ],
    },
  });
}

// ─────────────────────────────────────────────
//  CALLBACK QUERY
// ─────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const fromUser = query.from;
  const isAdmin = (fromUser.username || '') === ADMIN_USERNAME;

  bot.answerCallbackQuery(query.id);

  // ── Главное меню ──────────────────────────
  if (data === 'main') {
    const name = fromUser.first_name || 'пользователь';
    bot.editMessageText(
      `👋 Привет, *${name}*!\n\nДобро пожаловать в наш магазин.\nВыбери раздел ниже 👇`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
  }

  // ── Каталог ───────────────────────────────
  else if (data === 'catalog') {
    const keyboard = catalog.map((item) => [
      { text: `⚡️ ${item.name}`, callback_data: `item_${item.id}` },
    ]);
    keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main' }]);

    bot.editMessageText(
      '🛍 *Каталог*\n\n━━━━━━━━━━━━━━━━━━━━━\nВыбери товар 👇',
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
  }

  // ── Карточка товара ───────────────────────
  else if (data.startsWith('item_')) {
    const itemId = data.replace('item_', '');
    const item = catalog.find((i) => i.id === itemId);
    if (!item) return;

    bot.editMessageText(item.description, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Buy', callback_data: `buy_${item.id}` }],
          [{ text: '⬅️ Назад', callback_data: 'catalog' }],
          [{ text: '🏠 Главное меню', callback_data: 'main' }],
        ],
      },
    });
  }

  // ── Buy ───────────────────────────────────
  else if (data.startsWith('buy_')) {
    const order = getOrder(fromUser.id);
    const hasValidSubscription = checkSubscription(fromUser.id);

    if (hasValidSubscription) {
      bot.editMessageText(
        '✅ У тебя уже есть активная подписка!\n\nПерейди в 👤 Профиль чтобы скачать лоадер.',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '👤 Профиль', callback_data: 'profile' }]] },
        }
      );
      return;
    }

    if (order && order.status === 'pending') {
      bot.editMessageText(
        '⏳ Твоя заявка уже на проверке.',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'main' }]] },
        }
      );
      return;
    }

    userStates[fromUser.id] = 'waiting_payment_proof';

    bot.editMessageText(
      '💳 *Оплата*\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '1️⃣ Напишите менеджеру для уточнения цены:\n' +
        '👤 @hardwareexploit\n\n' +
        '2️⃣ После оплаты — отправьте скриншот прямо сюда в чат.\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📸 Жду скриншот оплаты...',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Написать @hardwareexploit', url: 'https://t.me/hardwareexploit' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_payment' }],
          ],
        },
      }
    );
  }

  // ── Подать заявку ─────────────────────────
  else if (data === 'submit_order') {
    const order = getOrder(fromUser.id);
    const hasValidSubscription = checkSubscription(fromUser.id);

    if (hasValidSubscription) {
      bot.editMessageText(
        '✅ У тебя уже есть активная подписка!',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '👤 Профиль', callback_data: 'profile' }], [{ text: '🏠 Главное меню', callback_data: 'main' }]] },
        }
      );
      return;
    }

    if (order && order.status === 'pending') {
      bot.editMessageText(
        '⏳ *Твоя заявка уже на проверке.*',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'main' }]] },
        }
      );
      return;
    }

    userStates[fromUser.id] = 'waiting_payment_proof';

    bot.editMessageText(
      '📩 *Подача заявки*\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '1️⃣ Оплатите товар через реселлера:\n' +
        '👤 @hardwareexploit\n\n' +
        '2️⃣ После оплаты отправьте скриншот.\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📸 Жду скриншот оплаты...',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Написать @hardwareexploit', url: 'https://t.me/hardwareexploit' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_payment' }],
          ],
        },
      }
    );
  }

  // ── Промокод ──────────────────────────────
  else if (data === 'promocode') {
    userStates[fromUser.id] = 'waiting_promocode';
    
    bot.editMessageText(
      '🎫 *Введите промокод*\n\nОтправьте код текстом в этот чат.',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'main' }]
          ]
        }
      }
    );
  }

  // ── Отмена ────────────────────────────────
  else if (data === 'cancel_payment') {
    userStates[fromUser.id] = null;
    bot.editMessageText(
      '❌ Отменено.',
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
  }

  // ── Профиль ───────────────────────────────
  else if (data === 'profile') {
    const user = getUser(fromUser.id);
    const uname = fromUser.username ? `@${fromUser.username}` : 'не указан';
    const fullName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ');
    const order = getOrder(fromUser.id);
    
    const hasValidSubscription = checkSubscription(fromUser.id);
    const subInfo = getSubscriptionInfo(fromUser.id);

    let statusText = '❌ Нет активной подписки';
    let subscriptionInfo = '';
    
    if (hasValidSubscription && subInfo) {
      statusText = '✅ Подписка активна';
      subscriptionInfo = `\n⏱ Осталось: *${subInfo.days}д ${subInfo.hours}ч ${subInfo.minutes}м*`;
    } else if (order && order.status === 'pending') {
      statusText = '⏳ Заявка на проверке';
    } else if (order && order.status === 'rejected') {
      statusText = '❌ Оплата отклонена';
    }

    const keyboard = [];

    if (hasValidSubscription) {
      keyboard.push([{ text: '⬇️ Скачать лоадер', callback_data: 'download_loader' }]);
    }

    keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main' }]);

    if (isAdmin) {
      keyboard.push([{ text: '🔧 Админ панель', callback_data: 'admin_panel' }]);
    }

    bot.editMessageText(
      `👤 *Профиль*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔖 Имя: *${fullName}*\n` +
        `📛 Username: ${uname}\n` +
        `🆔 ID: \`${fromUser.id}\`\n` +
        `💳 Статус: ${statusText}${subscriptionInfo}\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
  }

  // ── Скачать лоадер ────────────────────────
  else if (data === 'download_loader') {
    const hasValidSubscription = checkSubscription(fromUser.id);
    
    if (!hasValidSubscription) {
      bot.answerCallbackQuery(query.id, { text: '❌ Нет активной подписки!', show_alert: true });
      return;
    }

    const db = loadDB();
    if (!db.loaderFileId) {
      bot.sendMessage(chatId, '⚠️ Файл лоадера ещё не загружен.');
      return;
    }

    bot.sendDocument(chatId, db.loaderFileId, {
      caption: '⚡️ *thorsteinar.pw*\n\nТвой лоадер готов! 🚀',
      parse_mode: 'Markdown',
    });
  }

  // ── Реселлеры ─────────────────────────────
  else if (data === 'resellers') {
    bot.editMessageText(
      `🤝 *Реселлеры*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `1. 👤 @hardwareexploit\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 @hardwareexploit', url: 'https://t.me/hardwareexploit' }],
            [{ text: '🏠 Главное меню', callback_data: 'main' }],
          ],
        },
      }
    );
  }

  // ══════════════════════════════════════════
  //  АДМИН ПАНЕЛЬ
  // ══════════════════════════════════════════

  else if (data === 'admin_panel') {
    if (!isAdmin) return;

    const pending = getPendingOrders();
    bot.editMessageText(
      `🔧 *Админ панель*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Ожидают проверки: *${pending.length}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
  }

  else if (data === 'admin_orders') {
    if (!isAdmin) return;

    const pending = getPendingOrders();
    if (pending.length === 0) {
      bot.editMessageText(
        '📋 *Заявки*\n\nНет новых заявок.',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_panel' }]] },
        }
      );
      return;
    }

    const order = pending[0];
    const uname = order.username ? `@${order.username}` : order.firstName;

    bot.editMessageText(
      `📋 *Заявки* (${pending.length} шт.)\n\n` +
        `👤 Пользователь: ${uname}\n` +
        `🆔 ID: \`${order.userId}\`\n` +
        `📅 Дата: ${new Date(order.date).toLocaleString('ru-RU')}`,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `approve_${order.userId}` },
              { text: '❌ Отклонить', callback_data: `reject_${order.userId}` },
            ],
            [{ text: '⬅️ Назад', callback_data: 'admin_panel' }],
          ],
        },
      }
    );

    bot.sendPhoto(chatId, order.photoFileId, {
      caption: `Скриншот от ${uname}`,
    });
  }

  // ── Одобрить заявку ───────────────────────
  else if (data.startsWith('approve_')) {
    if (!isAdmin) return;

    const targetUserId = data.replace('approve_', '');
    updateOrderStatus(targetUserId, 'approved');
    
    bot.editMessageText(
      `✅ *Выдача подписки*\n\nВыберите период:`,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📅 30 дней', callback_data: `sub_${targetUserId}_30` }],
            [{ text: '📅 60 дней', callback_data: `sub_${targetUserId}_60` }],
            [{ text: '📅 100 дней', callback_data: `sub_${targetUserId}_100` }],
            [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
          ]
        }
      }
    );
  }

  // ── Выдача подписки ──────────────────────
  else if (data.startsWith('sub_')) {
    if (!isAdmin) return;
    
    const parts = data.split('_');
    const targetUserId = parts[1];
    const days = parseInt(parts[2]);
    
    setUserSubscription(targetUserId, days);
    
    bot.sendMessage(
      targetUserId,
      `🎉 *Подписка активирована!*\n\n📅 Период: *${days} дней*\n\nСкачай лоадер в 👤 Профиль.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '👤 Профиль', callback_data: 'profile' }]],
        },
      }
    );

    bot.editMessageText(
      `✅ Пользователю \`${targetUserId}\` выдана подписка на *${days} дней*.`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
  }

  // ── Отклонить заявку ──────────────────────
  else if (data.startsWith('reject_')) {
    if (!isAdmin) return;

    const targetUserId = data.replace('reject_', '');
    updateOrderStatus(targetUserId, 'rejected');

    bot.sendMessage(
      targetUserId,
      '❌ *Оплата отклонена.*\n\nНапиши @hardwareexploit если ошибка.',
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );

    bot.editMessageText(
      `❌ Заявка \`${targetUserId}\` *отклонена*.`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
  }

  // ── Загрузить лоадер ──────────────────────
  else if (data === 'admin_upload_loader') {
    if (!isAdmin) return;

    userStates[fromUser.id] = 'waiting_loader_file';

    bot.editMessageText(
      '📤 *Загрузка лоадера*\n\nОтправь файл лоадера в этот чат.',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'admin_panel' }]] },
      }
    );
  }

  // ── Создать промокод ──────────────────────
  else if (data === 'admin_create_promocode') {
    if (!isAdmin) return;
    
    bot.editMessageText(
      '🎫 *Создание промокода*\n\nВыберите тип:',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Скидка (%)', callback_data: 'promo_type_discount' }],
            [{ text: '🎁 Бесплатная подписка', callback_data: 'promo_type_free' }],
            [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
          ]
        }
      }
    );
  }
  
  // ── Выбор типа промокода ──────────────────
  else if (data === 'promo_type_discount' || data === 'promo_type_free') {
    if (!isAdmin) return;
    
    userStates[fromUser.id] = data === 'promo_type_discount' ? 'promo_discount' : 'promo_free';
    
    const typeName = data === 'promo_type_discount' ? 'скидку (%)' : 'количество дней';
    
    bot.editMessageText(
      `🎫 *Создание промокода*\n\nВведите ${typeName}:\n\nНапример: \`${data === 'promo_type_discount' ? '20' : '30'}\``,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'admin_panel' }]
          ]
        }
      }
    );
  }
  
  // ── Список промокодов ─────────────────────
  else if (data === 'admin_list_promocodes') {
    if (!isAdmin) return;
    
    const promocodes = getAllPromocodes();
    const codes = Object.keys(promocodes);
    
    if (codes.length === 0) {
      bot.editMessageText(
        '📊 *Промокоды*\n\nНет созданных промокодов.',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_panel' }]] }
        }
      );
      return;
    }
    
    let text = '📊 *Список промокодов*\n\n━━━━━━━━━━━━━━━━━━━━━\n';
    
    codes.forEach((code) => {
      const promo = promocodes[code];
      const status = promo.used ? '❌ Использован' : '✅ Активен';
      const type = promo.type === 'discount' ? `💰 ${promo.value}%` : `🎁 ${promo.value} дней`;
      const usedBy = promo.usedBy ? `\n👤 ID: \`${promo.usedBy}\`` : '';
      
      text += `🎫 \`${code}\`\n📌 ${type}\n📊 ${status}${usedBy}\n\n`;
    });
    
    text += '━━━━━━━━━━━━━━━━━━━━━';
    
    bot.editMessageText(
      text,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_panel' }]] }
      }
    );
  }
});

// ─────────────────────────────────────────────
//  ЗАПУСК
// ─────────────────────────────────────────────
console.log('✅ Бот запущен...');

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});