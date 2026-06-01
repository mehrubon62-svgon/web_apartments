import { createContext, useContext, useState, useCallback } from 'react';

const DICT = {
  en: {
    'Каталог': 'Catalog', 'Карта': 'Map', 'ИИ-агент': 'AI Agent', 'Подбор': 'Recommendations',
    'Избранное': 'Favorites', 'Сообщения': 'Messages', 'Кабинет': 'Dashboard', 'Модерация': 'Moderation',
    'Войти': 'Sign in', 'Регистрация': 'Sign up', 'Профиль': 'Profile', 'Выйти': 'Log out',
    'История просмотров': 'Viewing history', 'Мои брони': 'My bookings', 'Трекеры цен': 'Price trackers',
    'Заявки': 'Requests', 'Уведомления': 'Notifications', 'Прочитать все': 'Mark all read',
    'Уведомлений пока нет': 'No notifications yet', 'Кабинет продавца': 'Seller dashboard',
    'Каталог недвижимости': 'Property catalog', 'Найдено объектов': 'Properties found',
    'Найдите дом, в который захочется вернуться': 'Find a home worth coming back to',
    'Иммерсивные 360°-туры, ответы ИИ про любую зону квартиры и честные сделки онлайн.':
      'Immersive 360° tours, AI answers about any zone, and fair deals online.',
    'Поиск: «двушка у метро», адрес, район...': 'Search: "2-bed near metro", address, area...',
    'Искать': 'Search', 'Виртуальные туры': 'Virtual tours', 'Spatial Q&A': 'Spatial Q&A',
    'Комиссия за просмотр': 'Viewing fee', 'Все': 'All', 'Любой тип': 'Any type', 'Комнаты': 'Rooms',
    'Цена от': 'Price from', 'до': 'to', 'Площадь от': 'Area from', 'Сбросить': 'Reset',
    'Ничего не найдено': 'Nothing found', 'Попробуйте изменить фильтры': 'Try changing the filters',
    'Показать ещё': 'Show more', 'Аренда': 'Rent', 'Продажа': 'Sale', 'Квартира': 'Apartment',
    'Дом': 'House', 'Коммерция': 'Commercial', 'Адрес не указан': 'Address not specified',
    'Все сделки': 'All deals', 'Все типы': 'All types', '360° тур': '360° tour', 'ночь': 'night',
    'Назад': 'Back', 'Объект не найден': 'Property not found', 'В каталог': 'To catalog',
    'Описание': 'Description', 'AI-оценка': 'AI review', 'История цен': 'Price history',
    'Ипотека': 'Mortgage', 'Отзывы': 'Reviews', 'Доступность': 'Availability', 'Похожие': 'Similar',
    'Открыть 360° тур': 'Open 360° tour', 'Забронировать': 'Book now', 'Заявка на просмотр': 'Request a viewing',
    'Связаться с риелтором': 'Contact realtor', 'В избранное': 'Add to favorites', 'В избранном': 'In favorites',
    'Отслеживать цену': 'Track price', 'Пожаловаться на продавца': 'Report seller',
    'Тип сделки': 'Deal type', 'Тип': 'Type', 'Площадь': 'Area', 'Комнат': 'Rooms', 'Цена за м²': 'Price per m²',
    'Просмотров': 'Views', 'Рейтинг': 'Rating', 'Продавец': 'Seller', 'Администратор': 'Administrator',
    'Покупатель': 'Buyer', 'Пользователь': 'User', 'Описание отсутствует.': 'No description.',
    'Правила дома': 'House rules', 'Похожих объектов пока нет.': 'No similar properties yet.',
    'Динамика цены': 'Price dynamics', 'Рыночный контекст': 'Market context', 'Медиана рынка': 'Market median',
    'Средняя по рынку': 'Market average', 'Похожих объектов': 'Comparables', 'Плюсы': 'Pros', 'Минусы': 'Cons',
    'Красные флаги': 'Red flags', 'Оценка ИИ': 'AI verdict', 'Эвристика': 'Heuristic',
    'Ипотечный калькулятор': 'Mortgage calculator', 'Первый взнос, $': 'Down payment, $', 'Ставка, %': 'Rate, %',
    'Срок, лет': 'Term, years', 'Рассчитать': 'Calculate', 'Сумма кредита': 'Loan amount',
    'Платёж / мес': 'Monthly payment', 'Всего выплат': 'Total paid', 'Переплата': 'Total interest',
    'Оставить отзыв': 'Write a review', 'Отзывов пока нет. Будьте первым!': 'No reviews yet. Be the first!',
    'Ваш отзыв': 'Your review', 'Оценка': 'Rating', 'Комментарий': 'Comment', 'Опубликовать': 'Publish',
    'Спасибо за отзыв!': 'Thanks for your review!', 'Доступные периоды': 'Available periods',
    'Заезд': 'Check-in', 'Выезд': 'Check-out', 'Выберите даты': 'Select dates', 'Оплата брони': 'Booking payment',
    'Перейти к оплате': 'Proceed to payment', 'Сообщение': 'Message', 'Начать диалог': 'Start chat',
    'Желаемая дата': 'Preferred date', 'Отправить заявку': 'Send request', 'Заявка отправлена!': 'Request sent!',
    'Целевая цена, $': 'Target price, $', 'Отслеживать': 'Track', 'Трекер добавлен': 'Tracker added',
    'Причина': 'Reason', 'Отправить жалобу': 'Submit complaint', 'Жалоба на продавца': 'Report a seller',
    'С возвращением': 'Welcome back', 'Пароль': 'Password', 'Забыли пароль?': 'Forgot password?',
    'Войти по коду из письма': 'Sign in with email code', 'или': 'or', 'Создайте аккаунт': 'Create an account',
    'Я хочу': 'I want to', 'Ищу жильё': 'Find a home', 'Размещаю объекты': 'List properties',
    'Создать аккаунт': 'Create account', 'Имя': 'Name', 'Телефон': 'Phone', 'Компания / агентство': 'Company / agency',
    'Минимум 6 символов': 'At least 6 characters', 'Сохранить': 'Save', 'Отмена': 'Cancel',
    'Подтвердить': 'Confirm', 'Удалить': 'Delete', 'Изменить': 'Edit', 'Ответить': 'Reply',
    'Сохранённые объекты': 'Saved properties', 'Очистить всё': 'Clear all', 'Избранное пусто': 'Favorites is empty',
    'Объекты, которые вы недавно открывали': 'Properties you recently opened', 'История пуста': 'History is empty',
    'Подбор для вас': 'Picked for you', 'Подобрать с ИИ': 'Pick with AI', 'По вашим интересам': 'Based on your interests',
    'Мои бронирования': 'My bookings', 'Броней пока нет': 'No bookings yet', 'Оплатить (тест)': 'Pay (test)',
    'Отменить': 'Cancel', 'Подтверждено': 'Confirmed', 'Отменено': 'Cancelled', 'Не оплачено': 'Unpaid',
    'Оплачено': 'Paid', 'Ожидает оплаты': 'Awaiting payment', 'Нет активных трекеров': 'No active trackers',
    'Убрать': 'Remove', 'Заявки на просмотр': 'Viewing requests', 'Заявок нет': 'No requests',
    'Управление аккаунтом': 'Account settings', 'Сменить фото': 'Change photo', 'Безопасность': 'Security',
    'Сменить пароль': 'Change password', 'Удалить аккаунт': 'Delete account', 'Опасная зона': 'Danger zone',
    'Новый объект': 'New property', 'Объектов': 'Properties', 'Активных': 'Active', 'С 360°-туром': 'With 360° tour',
    'Аналитика': 'Analytics', 'Тур': 'Tour', 'Пауза': 'Pause', 'Активировать': 'Activate',
    'Заголовок': 'Title', 'Сделка': 'Deal', 'Срок аренды': 'Rent term', 'Адрес': 'Address',
    'Сохранить тур': 'Save tour', 'Добавить комнату': 'Add room', 'Жалобы': 'Complaints',
    'Решения ИИ-модерации': 'AI moderation decisions', 'Без действий': 'No action', 'Предупреждение': 'Warning',
    'Блокировка': 'Ban', 'Разбанить': 'Unban', 'ИИ-агент Nestora': 'Nestora AI Agent',
    'Новый чат': 'New chat', 'Спросите что угодно про недвижимость...': 'Ask anything about real estate...',
    'Спросить ИИ': 'Ask AI', 'Спросить про зону': 'Ask about a zone', 'Ваш вопрос': 'Your question',
    'Поделиться': 'Share', 'Страница не найдена': 'Page not found', 'На главную': 'Go home',
    'Тема': 'Theme', 'Загрузка...': 'Loading...', 'Ошибка': 'Error', 'Без имени': 'No name',
    'Продукт': 'Product', 'Компания': 'Company', 'Поддержка': 'Support', 'О проекте': 'About',
    'Документация API': 'API docs', 'Связаться': 'Contact', 'Все права защищены': 'All rights reserved',
    'Иммерсивный AI-маркетплейс недвижимости': 'Immersive AI real estate marketplace',
    'низкий': 'low', 'средний': 'medium', 'высокий': 'high', 'неизвестно': 'unknown', 'Риск скама': 'Scam risk',
    'Выгодно': 'Great deal', 'Справедливо': 'Fair', 'Завышено': 'Overpriced', 'Подозрительно': 'Suspicious',
    'Вероятно скам': 'Likely scam', 'Мало данных': 'Insufficient data', 'Объекты на карте': 'Properties on map',
    'Слои на карте': 'Map layers', 'Метро': 'Metro', 'Школы': 'Schools', 'Магазины': 'Shops',
    'Подробнее': 'Details', 'Нет объектов по фильтрам': 'No properties match', 'Карта недоступна': 'Map unavailable',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(localStorage.getItem('nestora_lang') || 'ru');
  const setLang = useCallback((l) => {
    const v = l === 'en' ? 'en' : 'ru';
    localStorage.setItem('nestora_lang', v);
    document.documentElement.setAttribute('lang', v);
    setLangState(v);
  }, []);
  const t = useCallback((ru) => (lang === 'en' && DICT.en[ru] != null ? DICT.en[ru] : ru), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
