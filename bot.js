require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ─────────────────────────────────────────────
//  ДАННЫЕ КАТАЛОГА
// ─────────────────────────────────────────────
const catalog = [
  {
    id: 'velocity_crack',
    name: '🐱 velocity.cat crack',
    description:
      '✨ *velocity.cat crack*\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      '📦 Продукт: velocity.cat crack\n' +
      '💎 Качество: Premium\n' +
      '🔄 Обновления: включены\n' +
      '⚡ Поставка: моментальная\n' +
      '━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '📝 Для уточнения цены и деталей нажмите *Buy* ниже.',
  },
];

// ─────────────────────────────────────────────
//  РЕСЕЛЛЕРЫ
// ─────────────────────────────────────────────
const resellers = [
  { name: 'hardwareexploit', username: '@hardwareexploit' },
];

// ─────────────────────────────────────────────
//  ГЛАВНОЕ МЕНЮ
// ─────────────────────────────────────────────
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍 Каталог', callback_data: 'catalog' }],
        [{ text: '👤 Профиль', callback_data: 'profile' }],
        [{ text: '🤝 Реселлеры', callback_data: 'resellers' }],
      ],
    },
    parse_mode: 'Markdown',
  };
}

// ─────────────────────────────────────────────
//  /start
// ─────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'пользователь';
  bot.sendMessage(
    msg.chat.id,
    `👋 Привет, *${name}*!\n\n` +
      `Добро пожаловать в наш магазин.\n` +
      `Выбери раздел ниже 👇`,
    mainMenu()
  );
});

// ─────────────────────────────────────────────
//  ОБРАБОТКА КНОПОК
// ─────────────────────────────────────────────
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;

  // ── Каталог (список товаров) ──────────────
  if (data === 'catalog') {
    const keyboard = catalog.map((item) => [
      { text: `🐱 ${item.name}`, callback_data: `item_${item.id}` },
    ]);
    keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main' }]);

    bot.editMessageText(
      '🛍 *Каталог*\n\n━━━━━━━━━━━━━━━━━━━━━\nВыбери товар 👇',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      }
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

  // ── Покупка ───────────────────────────────
  else if (data.startsWith('buy_')) {
    bot.editMessageText(
      '✅ *Отлично! Ты выбрал товар.*\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '📩 Для оформления покупки напишите сюда:\n\n' +
        '👤 @hardwareexploit\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '_Менеджер ответит вам в ближайшее время._',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💬 Написать @hardwareexploit',
                url: 'https://t.me/hardwareexploit',
              },
            ],
            [{ text: '⬅️ Назад', callback_data: `item_${data.replace('buy_', '')}` }],
            [{ text: '🏠 Главное меню', callback_data: 'main' }],
          ],
        },
      }
    );
  }

  // ── Профиль ───────────────────────────────
  else if (data === 'profile') {
    const user = query.from;
    const username = user.username ? `@${user.username}` : 'не указан';
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

    bot.editMessageText(
      `👤 *Профиль*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔖 Имя: *${fullName}*\n` +
        `📛 Username: ${username}\n` +
        `🆔 ID: \`${user.id}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━`,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Главное меню', callback_data: 'main' }],
          ],
        },
      }
    );
  }

  // ── Реселлеры ─────────────────────────────
  else if (data === 'resellers') {
    const list = resellers
      .map((r, i) => `${i + 1}. 👤 ${r.username}`)
      .join('\n');

    bot.editMessageText(
      `🤝 *Реселлеры*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${list}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `_Официальные реселлеры нашего магазина._`,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💬 @hardwareexploit',
                url: 'https://t.me/hardwareexploit',
              },
            ],
            [{ text: '🏠 Главное меню', callback_data: 'main' }],
          ],
        },
      }
    );
  }

  // ── Главное меню ──────────────────────────
  else if (data === 'main') {
    const name = query.from.first_name || 'пользователь';
    bot.editMessageText(
      `👋 Привет, *${name}*!\n\n` +
        `Добро пожаловать в наш магазин.\n` +
        `Выбери раздел ниже 👇`,
      {
        chat_id: chatId,
        message_id: msgId,
        ...mainMenu(),
      }
    );
  }

  // Убираем "часики" на кнопке
  bot.answerCallbackQuery(query.id);
});

// ─────────────────────────────────────────────
//  ОШИБКИ
// ─────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[Polling error]', err.message);
});

console.log('✅ Бот запущен...');
