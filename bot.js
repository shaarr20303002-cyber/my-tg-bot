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
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
      users: {}, 
      orders: {}, 
      promocodes: {},
      referrals: {}
    }, null, 2));
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
      subscriptionDays: 0,
      remindersSent: [],
      referralCode: generateReferralCode(),
      referredBy: null,
      referrals: [],
      discountUsed: false,
      lastSpin: null,
      discountAvailable: false,
      winCount: 0,
      totalSpins: 0
    };
    saveDB(db);
  }
  return db.users[userId];
}

function generateReferralCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function setUserSubscription(userId, days) {
  const db = loadDB();
  if (!db.users[userId]) db.users[userId] = {};
  
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  db.users[userId].paid = true;
  db.users[userId].subscriptionEnd = endDate.toISOString();
  db.users[userId].subscriptionDays = days;
  db.users[userId].remindersSent = [];
  saveDB(db);
}

function addSubscriptionDays(userId, days) {
  const db = loadDB();
  const user = db.users[userId];
  if (!user) return false;
  
  const hasValidSubscription = checkSubscription(userId);
  
  if (!hasValidSubscription) {
    user.discountAvailable = true;
    user.discountUsed = false;
    saveDB(db);
    return { 
      type: 'discount', 
      message: '🎉 Вы выиграли скидку 20% на следующую покупку!',
      discount: 20
    };
  }
  
  const currentEnd = new Date(user.subscriptionEnd);
  const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
  user.subscriptionEnd = newEnd.toISOString();
  user.subscriptionDays += days;
  saveDB(db);
  
  return { 
    type: 'subscription', 
    message: `🎉 Вы получили +${days} дней к подписке!`,
    days: days
  };
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
    user.remindersSent = [];
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
//  РЕФЕРАЛЬНАЯ СИСТЕМА
// ─────────────────────────────────────────────
function processReferral(userId, refCode) {
  const db = loadDB();
  const user = getUser(userId);
  
  if (user.referredBy) {
    return { success: false, message: '❌ Вы уже использовали реферальный код!' };
  }
  
  let referrerId = null;
  for (const [id, data] of Object.entries(db.users)) {
    if (data.referralCode === refCode && parseInt(id) !== userId) {
      referrerId = parseInt(id);
      break;
    }
  }
  
  if (!referrerId) {
    return { success: false, message: '❌ Неверный реферальный код!' };
  }
  
  user.referredBy = referrerId;
  db.users[userId] = user;
  
  if (!db.users[referrerId].referrals) {
    db.users[referrerId].referrals = [];
  }
  db.users[referrerId].referrals.push(userId);
  
  saveDB(db);
  
  const referrer = db.users[referrerId];
  let rewardMessage = '';
  
  const hasValidSubscription = checkSubscription(referrerId);
  if (hasValidSubscription) {
    const currentEnd = new Date(referrer.subscriptionEnd);
    const newEnd = new Date(currentEnd.getTime() + 3 * 24 * 60 * 60 * 1000);
    referrer.subscriptionEnd = newEnd.toISOString();
    referrer.subscriptionDays += 3;
    saveDB(db);
    rewardMessage = `🎉 Вы получили +3 дня к подписке за приглашенного друга!`;
  } else {
    referrer.discountAvailable = true;
    referrer.discountUsed = false;
    saveDB(db);
    rewardMessage = `🎉 Вы получили скидку 10% на следующую покупку за приглашенного друга!`;
  }
  
  bot.sendMessage(
    referrerId,
    `👥 *Новый реферал!*\n\n` +
    `Пользователь @${user.username || user.firstName} использовал ваш реферальный код!\n\n` +
    rewardMessage,
    { parse_mode: 'Markdown' }
  );
  
  return { 
    success: true, 
    message: '✅ Реферальный код активирован!',
    reward: rewardMessage
  };
}

function getReferralStats(userId) {
  const db = loadDB();
  const user = db.users[userId];
  if (!user) return null;
  
  const referrals = user.referrals || [];
  const total = referrals.length;
  
  return {
    total,
    code: user.referralCode,
    referrals: referrals,
    referredBy: user.referredBy
  };
}

function getTopReferrers(limit = 10) {
  const db = loadDB();
  const users = db.users;
  
  const stats = [];
  for (const [id, data] of Object.entries(users)) {
    const referrals = data.referrals || [];
    if (referrals.length > 0) {
      stats.push({
        userId: parseInt(id),
        username: data.username || 'Без имени',
        firstName: data.firstName || '',
        count: referrals.length,
        referrals: referrals
      });
    }
  }
  
  stats.sort((a, b) => b.count - a.count);
  return stats.slice(0, limit);
}

// ─────────────────────────────────────────────
//  КОЛЕСО ФОРТУНЫ
// ─────────────────────────────────────────────

function getLastSpinTime(userId) {
  const db = loadDB();
  const user = db.users[userId];
  if (!user) return null;
  return user.lastSpin || null;
}

function canSpin(userId) {
  const lastSpin = getLastSpinTime(userId);
  if (!lastSpin) return true;
  
  const now = new Date();
  const lastDate = new Date(lastSpin);
  const diff = now.getTime() - lastDate.getTime();
  const hoursDiff = diff / (1000 * 60 * 60);
  
  return hoursDiff >= 24;
}

function getTimeUntilNextSpin(userId) {
  const lastSpin = getLastSpinTime(userId);
  if (!lastSpin) return null;
  
  const now = new Date();
  const lastDate = new Date(lastSpin);
  const nextSpin = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);
  
  const diffMs = nextSpin.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes };
}

function spinWheel(userId) {
  const db = loadDB();
  const user = getUser(userId);
  
  user.lastSpin = new Date().toISOString();
  user.totalSpins = (user.totalSpins || 0) + 1;
  saveDB(db);
  
  const rand = Math.random() * 100;
  let result = {};
  
  if (rand < 50) {
    result = {
      type: 'lose',
      emoji: '😅',
      message: '😅 *Попробуй завтра!*\n\nСегодня не твой день, но завтра обязательно повезет! 🍀',
      reward: null
    };
  } else if (rand < 75) {
    result = {
      type: 'win',
      emoji: '🎁',
      message: '🎁 *Ты выиграл +1 день!*\n\nПоздравляю! Продолжай крутить колесо удачи! 🚀',
      reward: 1
    };
  } else if (rand < 92) {
    result = {
      type: 'win',
      emoji: '🎊',
      message: '🎊 *Ты выиграл +3 дня!*\n\nОтличный результат! Ты сегодня везунчик! 🌟',
      reward: 3
    };
  } else if (rand < 99) {
    result = {
      type: 'win',
      emoji: '🔥',
      message: '🔥 *Ты выиграл +7 дней!*\n\nВАУ! Это невероятно! Ты настоящий счастливчик! 💪',
      reward: 7
    };
  } else {
    result = {
      type: 'jackpot',
      emoji: '👑',
      message: '👑 *ДЖЕКПОТ! +100 ДНЕЙ!*\n\n🎉 ПОЗДРАВЛЯЮ! ТЫ ВЫИГРАЛ ГЛАВНЫЙ ПРИЗ! 🎉\n\nТы настоящая легенда! 🔥',
      reward: 100
    };
  }
  
  if (result.reward) {
    const rewardResult = addSubscriptionDays(userId, result.reward);
    if (rewardResult && rewardResult.type === 'discount') {
      result.message += `\n\n${rewardResult.message}`;
      result.discount = 20;
    } else if (rewardResult && rewardResult.type === 'subscription') {
      user.winCount = (user.winCount || 0) + 1;
      saveDB(db);
    }
  }
  
  return result;
}

// ─────────────────────────────────────────────
//  НАПОМИНАНИЯ О ПОДПИСКЕ
// ─────────────────────────────────────────────
function checkSubscriptionReminders() {
  const db = loadDB();
  const now = new Date();
  
  Object.keys(db.users).forEach(userId => {
    const user = db.users[userId];
    
    if (!user.paid || !user.subscriptionEnd) return;
    
    const endDate = new Date(user.subscriptionEnd);
    const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    if (daysLeft < 0) return;
    
    if (!user.remindersSent) {
      user.remindersSent = [];
    }
    
    function shouldSendReminder(days) {
      if (daysLeft <= days && !user.remindersSent.includes(days)) {
        user.remindersSent.push(days);
        saveDB(db);
        return true;
      }
      return false;
    }
    
    let reminderMessage = '';
    
    if (shouldSendReminder(20)) {
      reminderMessage = 
        `📅 *Напоминание о подписке*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Ваша подписка истекает через *20 дней*!\n\n` +
        `⏳ Осталось: *${daysLeft} дней*\n` +
        `📅 Дата окончания: ${endDate.toLocaleDateString('ru-RU')}\n\n` +
        `Не забудьте продлить подписку, чтобы не потерять доступ! 🔥\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Для продления нажмите кнопку ниже 👇`;
    } 
    else if (shouldSendReminder(14)) {
      reminderMessage = 
        `⚠️ *Подписка скоро закончится!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Осталось всего *${daysLeft} дней*!\n` +
        `📅 Дата окончания: ${endDate.toLocaleDateString('ru-RU')}\n\n` +
        `Продлите подписку сейчас, чтобы продолжать пользоваться! 🚀\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Для продления нажмите кнопку ниже 👇`;
    }
    else if (shouldSendReminder(7)) {
      reminderMessage = 
        `🚨 *СРОЧНО! Подписка заканчивается!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `До окончания подписки осталось *${daysLeft} дней*!\n` +
        `📅 Дата окончания: ${endDate.toLocaleDateString('ru-RU')}\n\n` +
        `Поторопитесь! Осталось совсем немного времени! ⏰\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Продлить подписку можно прямо сейчас 👇`;
    }
    else if (shouldSendReminder(3)) {
      reminderMessage = 
        `🔥 *ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `До окончания подписки осталось всего *${daysLeft} дня*!\n` +
        `📅 Дата окончания: ${endDate.toLocaleDateString('ru-RU')}\n\n` +
        `Если не продлить сейчас - доступ будет потерян! 😱\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `СРОЧНО продлите подписку! 👇`;
    }
    else if (shouldSendReminder(1)) {
      reminderMessage = 
        `💀 *ПОСЛЕДНИЙ ДЕНЬ!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Сегодня последний день подписки! Осталось *${daysLeft} день*!\n` +
        `📅 Завтра доступ будет закрыт!\n\n` +
        `Успейте продлить подписку прямо сейчас! ⚡\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `ПРОДЛИТЬ ПОДПИСКУ! 👇`;
    }
    
    if (reminderMessage) {
      bot.sendMessage(
        userId,
        reminderMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛍 Продлить подписку', callback_data: 'catalog' }],
              [{ text: '🎰 Крутить колесо', callback_data: 'spin_wheel' }],
              [{ text: '👤 Проверить профиль', callback_data: 'profile' }]
            ]
          }
        }
      ).catch(err => {
        console.log(`Не удалось отправить напоминание ${userId}:`, err.message);
      });
      
      console.log(`📨 Напоминание отправлено ${userId}, осталось ${daysLeft} дней`);
    }
  });
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
      '💰 Цена: 100 ⭐️ Telegram Stars\n' +
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
      [{ text: '🛍️ Каталог', callback_data: 'catalog' }],
      [{ text: '📩 Подать заявку', callback_data: 'submit_order' }],
      [{ text: '🎫 Промокод', callback_data: 'promocode' }],
      [{ text: '🎰 Колесо фортуны', callback_data: 'spin_wheel' }],
      [{ text: '👥 Пригласить друга', callback_data: 'referral' }],
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
      [{ text: '🏆 Топ рефералов', callback_data: 'admin_top_referrals' }],
      [{ text: '⏰ Проверить напоминания', callback_data: 'admin_check_reminders' }],
      [{ text: '🏠 Главное меню', callback_data: 'main' }],
    ],
  };
}

// ─────────────────────────────────────────────
//  ОБРАБОТЧИКИ СООБЩЕНИЙ
// ─────────────────────────────────────────────

// /start
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
  const name = msg.from.first_name || 'пользователь';
  const userId = msg.from.id;
  const refCode = match[1];

  const db = loadDB();
  if (!db.users[userId]) db.users[userId] = {};
  db.users[userId].username = msg.from.username || '';
  db.users[userId].firstName = msg.from.first_name || '';
  if (db.users[userId].paid === undefined) db.users[userId].paid = false;
  if (!db.users[userId].remindersSent) db.users[userId].remindersSent = [];
  if (!db.users[userId].referralCode) db.users[userId].referralCode = generateReferralCode();
  if (!db.users[userId].referrals) db.users[userId].referrals = [];
  if (!db.users[userId].lastSpin) db.users[userId].lastSpin = null;
  if (!db.users[userId].totalSpins) db.users[userId].totalSpins = 0;
  if (!db.users[userId].winCount) db.users[userId].winCount = 0;
  saveDB(db);

  if (refCode && !db.users[userId].referredBy) {
    const result = processReferral(userId, refCode);
    if (result.success) {
      bot.sendMessage(
        userId,
        result.message,
        { parse_mode: 'Markdown' }
      );
    }
  }

  bot.sendMessage(
    msg.chat.id,
    `👋 Привет, *${name}*!\n\nДобро пожаловать в наш магазин.\nВыбери раздел ниже 👇`,
    { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
  );
});

// Прием текста
bot.on('text', async (msg) => {
  const userId = msg.from.id;
  const text = msg.text;
  
  if (userStates[userId] === 'waiting_referral_code') {
    const result = processReferral(userId, text.toUpperCase());
    userStates[userId] = null;
    
    bot.sendMessage(
      msg.chat.id,
      result.message,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
    );
    return;
  }
  
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

// Прием фото
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
      '🛍️ *Каталог*\n\n━━━━━━━━━━━━━━━━━━━━━\nВыбери товар 👇',
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
          [{ 
            text: '⭐️ Купить за Stars', 
            url: 'https://t.me/BotFather?start=stars' 
          }],
          [{ text: '💰 Купить за USD', callback_data: `buy_${item.id}` }],
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
      '💰 *Оплата USD*\n\n' +
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

  // ── Колесо фортуны ────────────────────────
  else if (data === 'spin_wheel') {
    const userId = fromUser.id;
    
    if (!canSpin(userId)) {
      const timeLeft = getTimeUntilNextSpin(userId);
      if (timeLeft) {
        bot.answerCallbackQuery(query.id, { 
          text: `⏳ Подожди ${timeLeft.hours}ч ${timeLeft.minutes}м до следующего кручения!`, 
          show_alert: true 
        });
        return;
      }
    }
    
    const spinMessages = [
      '🎡 *Колесо крутится...*\n\nПодожди немного...',
      '🔄 *Колесо набирает обороты!*\n\nЕще немного...',
      '🌀 *Колесо замедляется...*\n\nПочти остановилось...',
      '🎉 *Останавливается...*\n\nСейчас узнаем результат!'
    ];
    
    for (let i = 0; i < spinMessages.length; i++) {
      await bot.editMessageText(
        spinMessages[i],
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
      );
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    const result = spinWheel(userId);
    
    let finalMessage = `${result.emoji} *РЕЗУЛЬТАТ!*\n\n${result.message}\n\n`;
    
    const user = getUser(userId);
    finalMessage += `━━━━━━━━━━━━━━━━━━━━━\n`;
    finalMessage += `📊 *Статистика*\n`;
    finalMessage += `🎡 Всего кручений: *${user.totalSpins || 0}*\n`;
    finalMessage += `🏆 Побед: *${user.winCount || 0}*\n`;
    
    if (result.discount) {
      finalMessage += `\n💳 Скидка *${result.discount}%* сохранена!\n`;
      finalMessage += `Используй её при следующей покупке!`;
    }
    
    const keyboard = [
      [{ text: '🎰 Крутить снова', callback_data: 'spin_wheel' }],
      [{ text: '🏠 Главное меню', callback_data: 'main' }]
    ];
    
    if (result.reward) {
      const hasValidSubscription = checkSubscription(userId);
      if (hasValidSubscription) {
        keyboard.unshift([{ text: '👤 Проверить профиль', callback_data: 'profile' }]);
      }
    }
    
    await bot.editMessageText(
      finalMessage,
      { 
        chat_id: chatId, 
        message_id: msgId, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  }

  // ── Реферальная система ────────────────────
  else if (data === 'referral') {
    const user = getUser(fromUser.id);
    const refCode = user.referralCode;
    const stats = getReferralStats(fromUser.id);
    
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    const link = `https://t.me/${botUsername}?start=${refCode}`;
    
    let message = 
      `👥 *Реферальная система*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Ваш реферальный код:*\n` +
      `\`${refCode}\`\n\n` +
      `🔗 *Ссылка для приглашения:*\n` +
      `\`${link}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Приглашено друзей:* ${stats.total}\n\n` +
      `🎁 *Награда за приглашение:*\n`;
    
    const hasValidSubscription = checkSubscription(fromUser.id);
    if (hasValidSubscription) {
      message += `• +3 дня к подписке за каждого друга\n`;
    } else {
      message += `• Скидка 10% на покупку за каждого друга\n`;
    }
    
    message += 
      `\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 *Как это работает?*\n` +
      `1️⃣ Отправь ссылку другу\n` +
      `2️⃣ Друг переходит по ссылке\n` +
      `3️⃣ Ты получаешь награду!\n` +
      `━━━━━━━━━━━━━━━━━━━━━`;
    
    bot.editMessageText(
      message,
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Скопировать код', callback_data: `copy_ref_${refCode}` }],
            [{ text: '📋 Скопировать ссылку', callback_data: `copy_link_${refCode}` }],
            [{ text: '🔗 Поделиться ссылкой', callback_data: `share_ref_${refCode}` }],
            [{ text: '🏠 Главное меню', callback_data: 'main' }]
          ]
        }
      }
    );
  }

  // ── Копировать реферальный код ────────────
  else if (data.startsWith('copy_ref_')) {
    const refCode = data.replace('copy_ref_', '');
    bot.answerCallbackQuery(query.id, { 
      text: `✅ Код скопирован: ${refCode}`, 
      show_alert: true 
    });
  }

  // ── Копировать ссылку ────────────────────
  else if (data.startsWith('copy_link_')) {
    const refCode = data.replace('copy_link_', '');
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    const link = `https://t.me/${botUsername}?start=${refCode}`;
    
    bot.answerCallbackQuery(query.id, { 
      text: `✅ Ссылка скопирована: ${link}`, 
      show_alert: true 
    });
  }

  // ── Поделиться ссылкой ────────────────────
  else if (data.startsWith('share_ref_')) {
    const refCode = data.replace('share_ref_', '');
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    const link = `https://t.me/${botUsername}?start=${refCode}`;
    
    bot.sendMessage(
      chatId,
      `🔗 *Пригласи друга!*\n\n` +
      `Отправь эту ссылку другу:\n` +
      `${link}\n\n` +
      `За каждого приглашенного друга ты получаешь награду! 🎁`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
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
    const stats = getReferralStats(fromUser.id);
    
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

    keyboard.push([{ text: '🎰 Колесо фортуны', callback_data: 'spin_wheel' }]);
    keyboard.push([{ text: '👥 Пригласить друга', callback_data: 'referral' }]);
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
        `👥 Рефералов: *${stats.total}*\n` +
        `🎡 Кручений колеса: *${user.totalSpins || 0}*\n` +
        `🏆 Побед: *${user.winCount || 0}*\n` +
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
    const db = loadDB();
    const totalUsers = Object.keys(db.users).length;
    const activeSubs = Object.values(db.users).filter(u => u.paid && u.subscriptionEnd && new Date(u.subscriptionEnd) > new Date()).length;
    
    bot.editMessageText(
      `🔧 *Админ панель*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 Всего пользователей: *${totalUsers}*\n` +
        `✅ Активных подписок: *${activeSubs}*\n` +
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

  // ── Проверить напоминания (админ) ────────
  else if (data === 'admin_check_reminders') {
    if (!isAdmin) return;
    
    bot.editMessageText(
      '🔄 *Проверка напоминаний*\n\nЗапускаю проверку всех подписок...',
      {
        chat_id: chatId,
        message_id: msgId,
        parse_mode: 'Markdown'
      }
    );
    
    checkSubscriptionReminders();
    
    bot.sendMessage(
      chatId,
      '✅ Проверка завершена! Все напоминания отправлены.',
      { reply_markup: adminKeyboard() }
    );
  }

  // ── Топ рефералов ─────────────────────────
  else if (data === 'admin_top_referrals') {
    if (!isAdmin) return;
    
    const top = getTopReferrers(10);
    
    if (top.length === 0) {
      bot.editMessageText(
        '🏆 *Топ рефералов*\n\nПока нет ни одного реферала.',
        {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin_panel' }]] }
        }
      );
      return;
    }
    
    let text = '🏆 *Топ рефералов*\n\n━━━━━━━━━━━━━━━━━━━━━\n';
    
    top.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const name = user.username ? `@${user.username}` : user.firstName;
      text += `${medal} ${name} — *${user.count}* рефералов\n`;
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
//  ЗАПУСК НАПОМИНАНИЙ
// ─────────────────────────────────────────────

setInterval(() => {
  console.log('🔄 Проверка подписок на напоминания...');
  checkSubscriptionReminders();
}, 12 * 60 * 60 * 1000);

setTimeout(() => {
  console.log('🔄 Первая проверка подписок...');
  checkSubscriptionReminders();
}, 60000);

console.log('✅ Бот запущен...');

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});