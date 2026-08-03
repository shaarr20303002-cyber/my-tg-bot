require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ─────────────────────────────────────────────
//  КОНФИГ
// ─────────────────────────────────────────────
const ADMIN_USERNAME = 'hardwareexploit'; // без @
const DB_FILE = path.join(__dirname, 'db.json');
const LOADER_FILE = path.join(__dirname, 'loader.exe'); // файл лоадера

// ─────────────────────────────────────────────
//  БАЗА ДАННЫХ (простой JSON)
// ─────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = { paid: false, username: '', firstName: '' };
    saveDB(db);
  }
  return db.users[userId];
}

function setUserPaid(userId, status) {
  const db = loadDB();
  if (!db.users[userId]) db.users[userId] = {};
  db.users[userId].paid = status;
  saveDB(db);
}

function saveOrder(userId, userData, photoFileId) {
  const db = loadDB();
  db.orders[userId] = {
    userId,
    username: userData.username || '',
    firstName: userData.firstName || '',
    photoFileId,
    status: 'pending', // pending | approved | rejected
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
//  СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЕЙ
// ─────────────────────────────────────────────
const userStates = {}; // userId -> state

// ─────────────────────────────────────────────
//  КАТАЛОГ
// ─────────────────────────────────────────────
const catalog = [
  {
    id: 'velocity_crack',
    name: 'velocity.cat crack',
    description:
      '🐱 *velocity.cat crack*\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      '📦 Продукт: velocity.cat crack\n' +
      '💎 Качество: Premium\n' +
      '🔄 Обновления: включены\n' +
      '⚡ Поставка: после подтверждения оплаты\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📝 Нажми *Buy* чтобы приобрести.',
  },
];

// ─────────────────────────────────────────────
//  ГЛАВНОЕ МЕНЮ
// ─────────────────────────────────────────────
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛍 Каталог', callback_data: 'catalog' }],
      [{ text: '📩 Подать заявку', callback_data: 'submit_order' }],
      [{ text: '👤 Профиль', callback_data: 'profile' }],
      [{ text: '🤝 Реселлеры', callback_data: 'resellers' }],
    ],
  };
}

// ─────────────────────────────────────────────
//  /start
// ─────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'пользователь';

  // Сохраняем данные пользователя
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

// ─────────────────────────────────────────────
//  ПРИЁМ ФОТО (скриншот оплаты)
// ─────────────────────────────────────────────
bot.on('photo', async (msg) => {
  const userId = msg.from.id;

  if (userStates[userId] !== 'waiting_payment_proof') return;

  // Берём фото наилучшего качества
  const photoFileId = msg.photo[msg.photo.length - 1].file_id;

  // Сохраняем заявку
  saveOrder(userId, {
    username: msg.from.username || '',
    firstName: msg.from.first_name || '',
  }, photoFileId);

  userStates[userId] = null;

  bot.sendMessage(
    msg.chat.id,
    '✅ *Скриншот оплаты получен!*\n\n⏳ Ожидайте подтверждения от администратора.\nКак только оплата будет одобрена — вы получите доступ к лоадеру.',
    { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
  );

  // Уведомляем админа
  await notifyAdmin(userId, msg.from, photoFileId);
});

// ─────────────────────────────────────────────
//  УВЕДОМЛЕНИЕ АДМИНУ
// ─────────────────────────────────────────────
async function notifyAdmin(userId, fromUser, photoFileId) {
  const db = loadDB();

  // Ищем chat_id админа
  const adminEntry = Object.entries(db.users).find(
    ([, u]) => u.username === ADMIN_USERNAME
  );
  if (!adminEntry) return;

  const adminChatId = adminEntry[0];
  const uname = fromUser.username ? `@${fromUser.username}` : fromUser.first_name;

  await bot.sendPhoto(adminChatId, photoFileId, {
    caption:
      `🔔 *Новая заявка на покупку!*\n\n` +
      `👤 Пользователь: ${uname}\n` +
      `🆔 ID: \`${userId}\`\n\n` +
      `Подтвердите или отклоните оплату:`,
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
//  ПРИЁМ ФАЙЛА ЛОАДЕРА ОТ АДМИНА
// ─────────────────────────────────────────────
bot.on('document', async (msg) => {
  const userId = msg.from.id;
  if (userStates[userId] !== 'waiting_loader_file') return;
  if ((msg.from.username || '') !== ADMIN_USERNAME) return;

  const fileId = msg.document.file_id;

  // Сохраняем file_id лоадера в БД
  const db = loadDB();
  db.loaderFileId = fileId;
  db.loaderFileName = msg.document.file_name || 'loader.exe';
  saveDB(db);

  userStates[userId] = null;

  bot.sendMessage(msg.chat.id, '✅ Файл лоадера сохранён! Теперь одобренные пользователи смогут его скачать.', {
    reply_markup: adminKeyboard(),
  });
});

// ─────────────────────────────────────────────
//  КЛАВИАТУРА АДМИНА
// ─────────────────────────────────────────────
function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Список заявок', callback_data: 'admin_orders' }],
      [{ text: '📤 Загрузить лоадер', callback_data: 'admin_upload_loader' }],
      [{ text: '🏠 Главное меню', callback_data: 'main' }],
    ],
  };
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
      { text: `🐱 ${item.name}`, callback_data: `item_${item.id}` },
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
    const user = getUser(fromUser.id);

    if (user.paid) {
      bot.editMessageText(
        '✅ У тебя уже есть доступ к лоадеру!\n\nПерейди в 👤 Профиль чтобы скачать.',
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
        '⏳ Твоя заявка уже на проверке. Ожидай подтверждения от администратора.',
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

  // ── Подать заявку (из главного меню) ─────
  else if (data === 'submit_order') {
    const user = getUser(fromUser.id);
    const order = getOrder(fromUser.id);

    if (user.paid) {
      bot.editMessageText(
        '✅ У тебя уже есть доступ к лоадеру!\n\nПерейди в 👤 Профиль чтобы скачать.',
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
        '⏳ *Твоя заявка уже на проверке.*\n\nОжидай подтверждения от администратора.',
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
        '2️⃣ После оплаты отправьте скриншот прямо сюда в чат.\n' +
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

  // ── Отмена оплаты ─────────────────────────
  else if (data === 'cancel_payment') {
    userStates[fromUser.id] = null;
    bot.editMessageText(
      '❌ Покупка отменена.',
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
  }

  // ── Профиль ───────────────────────────────
  else if (data === 'profile') {
    const user = getUser(fromUser.id);
    const uname = fromUser.username ? `@${fromUser.username}` : 'не указан';
    const fullName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ');
    const order = getOrder(fromUser.id);

    let statusText = '❌ Нет активной подписки';
    if (user.paid) statusText = '✅ Оплата подтверждена';
    else if (order && order.status === 'pending') statusText = '⏳ Заявка на проверке';
    else if (order && order.status === 'rejected') statusText = '❌ Оплата отклонена';

    const keyboard = [];

    if (user.paid) {
      keyboard.push([{ text: '⬇️ Скачать лоадер', callback_data: 'download_loader' }]);
    }

    keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main' }]);

    // Кнопка админки только для @hardwareexploit
    if (isAdmin) {
      keyboard.push([{ text: '🔧 Админ панель', callback_data: 'admin_panel' }]);
    }

    bot.editMessageText(
      `👤 *Профиль*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔖 Имя: *${fullName}*\n` +
        `📛 Username: ${uname}\n` +
        `🆔 ID: \`${fromUser.id}\`\n` +
        `💳 Статус: ${statusText}\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
  }

  // ── Скачать лоадер ────────────────────────
  else if (data === 'download_loader') {
    const user = getUser(fromUser.id);
    if (!user.paid) {
      bot.answerCallbackQuery(query.id, { text: '❌ У тебя нет доступа!', show_alert: true });
      return;
    }

    const db = loadDB();
    if (!db.loaderFileId) {
      bot.sendMessage(chatId, '⚠️ Файл лоадера ещё не загружен администратором. Попробуй позже.');
      return;
    }

    bot.sendDocument(chatId, db.loaderFileId, {
      caption: '🐱 *velocity.cat crack*\n\nТвой лоадер готов! Удачи 🚀',
      parse_mode: 'Markdown',
    });
  }

  // ── Реселлеры ─────────────────────────────
  else if (data === 'resellers') {
    bot.editMessageText(
      `🤝 *Реселлеры*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `1. 👤 @hardwareexploit\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `_Официальные реселлеры нашего магазина._`,
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

    // Показываем первую заявку
    const order = pending[0];
    const uname = order.username ? `@${order.username}` : order.firstName;

    bot.editMessageText(
      `📋 *Заявки* (${pending.length} шт.)\n\n` +
        `👤 Пользователь: ${uname}\n` +
        `🆔 ID: \`${order.userId}\`\n` +
        `📅 Дата: ${new Date(order.date).toLocaleString('ru-RU')}\n\n` +
        `Скриншот оплаты отправлен ниже. Выберите действие:`,
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

    // Отправляем скриншот отдельным сообщением
    bot.sendPhoto(chatId, order.photoFileId, {
      caption: `Скриншот оплаты от ${uname}`,
    });
  }

  // ── Одобрить заявку ───────────────────────
  else if (data.startsWith('approve_')) {
    if (!isAdmin) return;

    const targetUserId = data.replace('approve_', '');
    updateOrderStatus(targetUserId, 'approved');
    setUserPaid(targetUserId, true);

    // Уведомляем пользователя
    bot.sendMessage(
      targetUserId,
      '🎉 *Оплата подтверждена!*\n\n' +
        'Теперь ты можешь скачать лоадер в разделе 👤 *Профиль*.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '👤 Профиль', callback_data: 'profile' }]],
        },
      }
    );

    bot.editMessageText(
      `✅ Заявка пользователя \`${targetUserId}\` *одобрена*.`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
  }

  // ── Отклонить заявку ──────────────────────
  else if (data.startsWith('reject_')) {
    if (!isAdmin) return;

    const targetUserId = data.replace('reject_', '');
    updateOrderStatus(targetUserId, 'rejected');

    // Уведомляем пользователя
    bot.sendMessage(
      targetUserId,
      '❌ *Оплата отклонена.*\n\n' +
        'Если произошла ошибка — напиши @hardwareexploit.',
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );

    bot.editMessageText(
      `❌ Заявка пользователя \`${targetUserId}\` *отклонена*.`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
  }

  // ── Загрузить лоадер (админ) ──────────────
  else if (data === 'admin_upload_loader') {
    if (!isAdmin) return;

    userStates[fromUser.id] = 'waiting_loader_file';

    bot.editMessageText(
      '📤 *Загрузка лоадера*\n\n' +
        'Отправь файл лоадера прямо в этот чат.\n' +
        'Он будет сохранён и доступен всем одобренным пользователям.',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'admin_panel' }]] },
      }
    );
  }
});

// ─────────────────────────────────────────────
//  ОШИБКИ
// ─────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[Polling error]', err.message);
});

console.log('✅ Бот запущен...');
