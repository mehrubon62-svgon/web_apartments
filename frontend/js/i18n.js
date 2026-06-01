// ============================================================
// i18n — RU (source) -> EN dictionary + helpers
// Russian is the source language used in code; EN is translated
// at render-time by the DOM enhancer.
// ============================================================

export const EN = {
  // nav / shell
  'Каталог': 'Catalog', 'Карта': 'Map', 'ИИ-агент': 'AI Agent', 'Подбор': 'Recommendations',
  'Избранное': 'Favorites', 'Сообщения': 'Messages', 'Кабинет': 'Dashboard', 'Модерация': 'Moderation',
  'Войти': 'Sign in', 'Регистрация': 'Sign up', 'Тема': 'Theme', 'Уведомления': 'Notifications',
  'Профиль': 'Profile', 'История просмотров': 'Viewing history', 'Мои брони': 'My bookings',
  'Трекеры цен': 'Price trackers', 'Заявки': 'Requests', 'Кабинет продавца': 'Seller dashboard',
  'Выйти': 'Log out', 'Прочитать все': 'Mark all read', 'Уведомлений пока нет': 'No notifications yet',
  'Агент': 'Agent', 'Вход': 'Login',

  // catalog / home
  'Каталог недвижимости': 'Property catalog', 'Загрузка...': 'Loading...',
  'Найдите дом, в который захочется вернуться': 'Find a home worth coming back to',
  'Иммерсивные 360°-туры, ответы ИИ про любую зону квартиры и честные сделки онлайн.':
    'Immersive 360° tours, AI answers about any zone of the home, and fair deals online.',
  'Поиск: «двушка у метро», адрес, район...': 'Search: "2-bed near metro", address, area...',
  'Искать': 'Search', 'Виртуальные туры': 'Virtual tours', 'Комиссия за просмотр': 'Viewing fee',
  'Все': 'All', 'Любой тип': 'Any type', 'Комнаты': 'Rooms', 'Цена от': 'Price from', 'до': 'to',
  'Площадь от': 'Area from', 'Сбросить': 'Reset', 'Ничего не найдено': 'Nothing found',
  'Попробуйте изменить фильтры': 'Try changing the filters', 'Показать ещё': 'Show more',
  'Не удалось загрузить': 'Failed to load', 'Результаты поиска': 'Search results',
  'Ошибка поиска': 'Search error', 'Аренда': 'Rent', 'Продажа': 'Sale',
  'Квартира': 'Apartment', 'Дом': 'House', 'Коммерция': 'Commercial',
  'Адрес не указан': 'Address not specified', 'Все сделки': 'All deals', 'Все типы': 'All types',
  '/ ночь': '/ night', '360° тур': '360° tour',

  // property detail
  'Назад': 'Back', 'Объект не найден': 'Property not found', 'В каталог': 'To catalog',
  'Описание': 'Description', 'AI-оценка': 'AI review', 'История цен': 'Price history',
  'Ипотека': 'Mortgage', 'Отзывы': 'Reviews', 'Доступность': 'Availability', 'Похожие': 'Similar',
  'Краткосрочно': 'Short-term', 'Долгосрочно': 'Long-term', 'Описание отсутствует.': 'No description.',
  'Правила дома': 'House rules', 'Динамика цены': 'Price dynamics',
  'История цен пока недоступна.': 'Price history is not available yet.',
  'Рыночный контекст': 'Market context', 'Медиана рынка': 'Market median',
  'Средняя по рынку': 'Market average', 'Цена за м² (этот)': 'Price/m² (this)',
  'Средняя за м²': 'Average per m²', 'Похожих объектов': 'Comparables',
  'Выгодно': 'Great deal', 'Справедливо': 'Fair', 'Завышено': 'Overpriced',
  'Подозрительно': 'Suspicious', 'Вероятно скам': 'Likely scam', 'Мало данных': 'Insufficient data',
  'Оценка ИИ': 'AI verdict', 'Эвристика': 'Heuristic', 'Плюсы': 'Pros', 'Минусы': 'Cons',
  'Красные флаги': 'Red flags', 'Ипотечный калькулятор': 'Mortgage calculator',
  'Первый взнос, $': 'Down payment, $', 'Ставка, %': 'Rate, %', 'Срок, лет': 'Term, years',
  'Рассчитать': 'Calculate', 'Сумма кредита': 'Loan amount', 'Платёж / мес': 'Monthly payment',
  'Всего выплат': 'Total paid', 'Переплата': 'Total interest', 'Оставить отзыв': 'Write a review',
  'Отзывов пока нет. Будьте первым!': 'No reviews yet. Be the first!', 'Ваш отзыв': 'Your review',
  'Оценка': 'Rating', 'Комментарий': 'Comment', 'Опубликовать': 'Publish',
  'Поделитесь впечатлениями...': 'Share your impressions...', 'Спасибо за отзыв!': 'Thanks for your review!',
  'Доступные периоды': 'Available periods',
  'Владелец пока не указал доступные даты. Можно попробовать забронировать напрямую.':
    'The owner has not set available dates yet. You can try booking directly.',
  'Похожих объектов пока нет.': 'No similar properties yet.', 'Тип сделки': 'Deal type',
  'Тип': 'Type', 'Площадь': 'Area', 'Комнат': 'Rooms', 'Цена за м²': 'Price per m²',
  'Просмотров': 'Views', 'Рейтинг': 'Rating', 'Открыть 360° тур': 'Open 360° tour',
  'Забронировать': 'Book now', 'Заявка на просмотр': 'Request a viewing',
  'Связаться с риелтором': 'Contact realtor', 'В избранное': 'Add to favorites',
  'В избранном': 'In favorites', 'Отслеживать цену': 'Track price',
  'Пожаловаться на продавца': 'Report seller', 'Управлять (в кабинете)': 'Manage (in dashboard)',
  'Продавец': 'Seller', 'Администратор': 'Administrator', 'Покупатель': 'Buyer', 'Пользователь': 'User',
  'Бронирование — ': 'Booking — ', 'Заезд': 'Check-in', 'Выезд': 'Check-out',
  'Перейти к оплате': 'Proceed to payment', 'Выберите даты': 'Select dates',
  'Оплата брони': 'Booking payment',
  'Тестовая карта 4242 4242 4242 4242 — оплата пройдёт успешно.':
    'Test card 4242 4242 4242 4242 — payment will succeed.',
  'Оплачено! Бронь подтверждена.': 'Paid! Booking confirmed.',
  'Здравствуйте! Хочу посмотреть объект...': 'Hello! I would like to view this property...',
  'Желаемая дата': 'Preferred date', 'Отправить заявку': 'Send request', 'Заявка отправлена!': 'Request sent!',
  'Сообщение': 'Message', 'Здравствуйте! Интересует ваш объект...': 'Hello! I am interested in your property...',
  'Начать диалог': 'Start chat', 'Диалог создан': 'Chat created', 'Здравствуйте!': 'Hello!',
  'Трекер цены': 'Price tracker',
  'Уведомим, когда цена упадёт. Можно указать целевую цену (необязательно).':
    'We will notify you when the price drops. You can set a target price (optional).',
  'Целевая цена, $': 'Target price, $', 'Отслеживать': 'Track', 'Трекер добавлен': 'Tracker added',
  'Жалоба на продавца': 'Report a seller', 'Причина': 'Reason',
  'Опишите проблему: недостоверное описание, не отвечает, и т.д.':
    'Describe the issue: inaccurate listing, no response, etc.',
  'Отправить жалобу': 'Submit complaint', 'Опишите причину': 'Describe the reason',
  'Жалоба отправлена на рассмотрение': 'Complaint submitted for review',

  // tour
  'Тур недоступен': 'Tour unavailable', 'Спросить про зону': 'Ask about a zone',
  'Отменить выбор': 'Cancel selection', 'Выделите прямоугольную зону на панораме': 'Draw a rectangular zone on the panorama',
  'Поделиться': 'Share', 'Перейти': 'Go',
  'Не удалось загрузить просмотрщик 360°': 'Failed to load the 360° viewer',
  'Вопрос про выделенную зону панорамы. Ответит ИИ (vision), это займёт несколько секунд.':
    'A question about the selected zone. The AI (vision) will answer in a few seconds.',
  'Ваш вопрос': 'Your question',
  'Например: из какого материала эта стена? Какие примерные размеры окна?':
    'E.g.: what material is this wall? What are the approximate window dimensions?',
  'Спросить ИИ': 'Ask AI', 'Введите вопрос': 'Enter a question', 'ИИ анализирует зону...': 'AI is analyzing the zone...',
  'Ответ ИИ': 'AI answer', 'Не удалось получить ответ. Проверьте, что ИИ настроен.':
    'Could not get an answer. Check that the AI is configured.',
  'Превышено время ожидания.': 'Request timed out.', 'Ссылка скопирована': 'Link copied',
  'Не удалось поделиться': 'Could not share', 'К объекту': 'To property',

  // messages
  'Выберите диалог': 'Select a chat', 'Начните общение с риелтором со страницы объекта':
    'Start chatting with a realtor from a property page', 'Диалогов пока нет': 'No chats yet',
  'Нет сообщений': 'No messages', 'Напишите сообщение...': 'Type a message...',
  'Прикрепить файл': 'Attach file', 'Ответить': 'Reply', 'Изменить': 'Edit', 'Удалить': 'Delete',
  'Изменить сообщение': 'Edit message', 'Сохранить': 'Save', 'Удалить сообщение?': 'Delete message?',
  'Сообщение будет помечено как удалённое.': 'The message will be marked as deleted.',
  'Сообщение удалено': 'Message deleted', 'Загрузка файла...': 'Uploading file...', 'Файл': 'File',
  'изменено': 'edited', 'вложение': 'attachment',

  // agent
  'ИИ-агент Nestora': 'Nestora AI Agent',
  'Ищет, сравнивает и управляет объектами за вас через реальные инструменты':
    'Searches, compares and manages properties for you via real tools',
  'Новый чат': 'New chat', 'Спросите что угодно про недвижимость...': 'Ask anything about real estate...',
  'Войдите, чтобы общаться с ИИ-агентом': 'Sign in to chat with the AI agent',
  'ИИ не настроен на сервере (нет AI_API_KEY). Агент будет недоступен, но остальные функции работают.':
    'AI is not configured on the server (no AI_API_KEY). The agent is unavailable, other features work.',
  'Привет! Я ИИ-агент Nestora. Могу найти объекты по описанию, сравнить их, добавить в избранное, поставить трекер цены или дать совет. С чего начнём?':
    'Hi! I am the Nestora AI agent. I can find properties, compare them, add favorites, set price trackers or give advice. Where do we start?',
  'Найди квартиру в аренду до $300 за ночь': 'Find an apartment to rent under $300 a night',
  'Покажи дома на продажу до $800k': 'Show houses for sale under $800k',
  'Что у меня в избранном?': 'What is in my favorites?', 'Сравни объекты 1 и 2': 'Compare properties 1 and 2',
  'Посоветуй по ипотеке на 20 лет': 'Advise on a 20-year mortgage',
  'ИИ не настроен на сервере': 'AI is not configured on the server', '(пустой ответ)': '(empty reply)',

  // personal
  'Сохранённые объекты': 'Saved properties', 'Очистить всё': 'Clear all', 'Очистить избранное?': 'Clear favorites?',
  'Все объекты будут удалены из избранного.': 'All properties will be removed from favorites.',
  'Избранное очищено': 'Favorites cleared', 'Избранное пусто': 'Favorites is empty',
  'Добавляйте понравившиеся объекты сердечком': 'Add properties you like with the heart',
  'Объекты, которые вы недавно открывали': 'Properties you recently opened', 'Очистить': 'Clear',
  'Очистить историю?': 'Clear history?', 'История просмотров будет удалена.': 'Viewing history will be deleted.',
  'История очищена': 'History cleared', 'История пуста': 'History is empty',
  'Открывайте объекты, и они появятся здесь': 'Open properties and they will appear here',
  'Подбор для вас': 'Picked for you',
  'Рекомендации на основе вашей истории и избранного': 'Recommendations based on your history and favorites',
  'Подсказка ИИ: например «для семьи с детьми»': 'AI hint: e.g. "for a family with kids"',
  'Подобрать с ИИ': 'Pick with AI',
  'Контентный алгоритм отбирает кандидатов, а ИИ (DeepSeek) переранжирует и объясняет выбор.':
    'A content algorithm selects candidates, then AI (DeepSeek) re-ranks and explains the picks.',
  'С объяснением от ИИ': 'With AI explanation', 'По вашим интересам': 'Based on your interests',
  'Пока нет рекомендаций': 'No recommendations yet',
  'Посмотрите несколько объектов, чтобы ИИ понял ваши вкусы': 'View a few properties so the AI learns your taste',
  'ИИ недоступен — показан алгоритмический порядок.': 'AI unavailable — showing algorithmic order.',
  'Нет данных': 'No data', 'Скоро здесь появятся подборки': 'Picks will appear here soon',
  'Мои бронирования': 'My bookings', 'Аренда и статусы оплаты': 'Rentals and payment status',
  'Броней пока нет': 'No bookings yet', 'Забронируйте жильё из каталога аренды': 'Book a place from the rental catalog',
  'Ожидает оплаты': 'Awaiting payment', 'Подтверждено': 'Confirmed', 'Отменено': 'Cancelled',
  'Не оплачено': 'Unpaid', 'Оплачено': 'Paid', 'Возврат': 'Refunded',
  'Оплатить (тест)': 'Pay (test)', 'Отменить': 'Cancel', 'Отменить бронь?': 'Cancel booking?',
  'Действие необратимо.': 'This action is irreversible.', 'Бронь отменена': 'Booking cancelled',
  'Уведомим, когда цена упадёт': 'We will notify you when the price drops',
  'Нет активных трекеров': 'No active trackers', 'Добавьте трекер со страницы объекта': 'Add a tracker from a property page',
  'Текущая': 'Current', 'Цель': 'Target', 'любое падение': 'any drop', 'Убрать': 'Remove',
  'Трекер удалён': 'Tracker removed', 'Заявки на просмотр': 'Viewing requests',
  'Заявки на просмотр ваших объектов': 'Viewing requests for your properties',
  'Ваши заявки на просмотр': 'Your viewing requests', 'Заявок нет': 'No requests',
  'Покупатели ещё не оставляли заявок': 'No buyer requests yet',
  'Оставьте заявку на странице объекта продажи': 'Submit a request on a sale property page',
  'Управление аккаунтом': 'Account settings', 'Без имени': 'No name',
  'Email подтверждён': 'Email verified', 'Email не подтверждён': 'Email not verified',
  'Сменить фото': 'Change photo', 'Имя': 'Name', 'Телефон': 'Phone', 'Компания / агентство': 'Company / agency',
  'Профиль сохранён': 'Profile saved', 'Безопасность': 'Security', 'Сменить пароль': 'Change password',
  'Подтвердить email': 'Verify email', 'Опасная зона': 'Danger zone',
  'Удаление аккаунта необратимо — все данные будут стёрты.': 'Account deletion is irreversible — all data will be erased.',
  'Удалить аккаунт': 'Delete account', 'Удалить аккаунт?': 'Delete account?',
  'Это действие нельзя отменить.': 'This action cannot be undone.', 'Удалить навсегда': 'Delete forever',
  'Аккаунт удалён': 'Account deleted', 'Аватар обновлён': 'Avatar updated',
  'Смена пароля': 'Change password', 'Текущий пароль': 'Current password', 'Новый пароль': 'New password',
  'Сменить': 'Change', 'Пароль изменён. Войдите заново.': 'Password changed. Please sign in again.',
  'Подтверждение email': 'Email verification', 'Код из письма': 'Code from email',
  'Отправить код': 'Send code', 'Подтвердить': 'Confirm', 'Код отправлен': 'Code sent',
  'Email подтверждён': 'Email verified', 'Войдите в аккаунт': 'Sign in to your account',

  // dashboard
  'Ваши объекты и аналитика': 'Your properties and analytics', 'Новый объект': 'New property',
  'Объектов': 'Properties', 'Активных': 'Active', 'С 360°-туром': 'With 360° tour',
  'Объектов пока нет': 'No properties yet', 'Создайте первое объявление': 'Create your first listing',
  'Активно': 'Active', 'На паузе': 'Paused', 'Удалено': 'Deleted', 'Аналитика': 'Analytics',
  'Тур': 'Tour', 'Удалить объект?': 'Delete property?', 'Пауза': 'Pause', 'Активировать': 'Activate',
  'Самые обсуждаемые зоны (Spatial Q&A)': 'Most discussed zones (Spatial Q&A)', 'Без комнаты': 'No room',
  'Редактировать объект': 'Edit property', 'Заголовок': 'Title', 'Сделка': 'Deal',
  'Срок аренды': 'Rent term', 'Цена/ночь, $': 'Price/night, $', 'Цена, $': 'Price, $',
  'Площадь, м²': 'Area, m²', 'Адрес': 'Address', 'Широта (необязательно)': 'Latitude (optional)',
  'Долгота (необязательно)': 'Longitude (optional)',
  'Координаты можно не указывать — мы определим их по адресу (Mapbox).':
    'Coordinates are optional — we geocode the address (Mapbox).',
  'Правила дома (для аренды)': 'House rules (for rentals)', 'Фото и 360°-панорамы': 'Photos and 360° panoramas',
  'Добавить фото': 'Add photo', 'Добавить 360°': 'Add 360°', 'Сохранить тур': 'Save tour',
  'Объект опубликован': 'Property published', 'Объект обновлён': 'Property updated',
  'Введите заголовок (мин. 3 символа)': 'Enter a title (min. 3 chars)', 'Укажите цену': 'Enter a price',
  'Укажите площадь': 'Enter an area', 'Тур сохранён': 'Tour saved',
  'Добавьте комнаты с панорамами.': 'Add rooms with panoramas.', 'Стартовая': 'Start',
  'Панорама (URL или загрузка)': 'Panorama (URL or upload)', 'URL панорамы': 'Panorama URL',
  'Переходы (стрелки в др. комнаты)': 'Transitions (arrows to other rooms)', 'переход': 'transition',
  'Добавить комнату': 'Add room', 'Гостиная': 'Living room',
  'Каждая комната — панорама. Переходы между комнатами работают как стрелки в Google Street View.':
    'Each room is a panorama. Transitions work like Street View arrows.',
  'Добавьте хотя бы одну комнату': 'Add at least one room',
  'У каждой комнаты должны быть ID и панорама': 'Each room needs an ID and a panorama',
  'Панорама загружена': 'Panorama uploaded', 'метка': 'label', 'Название': 'Name',

  // admin
  'Жалобы на продавцов и автоматические решения ИИ': 'Seller complaints and automatic AI decisions',
  'Жалобы': 'Complaints', 'Решения ИИ-модерации': 'AI moderation decisions', 'Жалоб нет': 'No complaints',
  'Пока никто не жаловался на продавцов': 'No one has reported sellers yet', 'жалоб': 'complaints',
  'Снять обвинения': 'Dismiss', 'Предупредить': 'Warn', 'Заблокировать': 'Ban',
  'Разбанить': 'Unban', 'Разбан': 'Unban', 'Подтвердите решение': 'Confirm decision',
  'Решение применено': 'Decision applied', 'Пользователь разбанен': 'User unbanned', 'Разбанен': 'Unbanned',
  'Решений нет': 'No decisions', 'ИИ ещё не выносил решений по модерации': 'AI has not made moderation decisions yet',
  'Без действий': 'No action', 'Предупреждение': 'Warning', 'Блокировка': 'Ban',
  'Обоснование ИИ': 'AI reasoning', 'Источник': 'Source', 'Дата': 'Date', 'админ': 'admin',

  // auth
  'С возвращением': 'Welcome back', 'Войдите, чтобы продолжить поиск жилья': 'Sign in to continue your home search',
  'Пароль': 'Password', 'Забыли пароль?': 'Forgot password?', 'Войти по коду из письма': 'Sign in with email code',
  'или': 'or', 'Создайте аккаунт': 'Create an account',
  'Продавцы публикуют объекты сразу, без модерации': 'Sellers publish instantly, no moderation',
  'Я хочу': 'I want to', 'Ищу жильё': 'Find a home', 'Размещаю объекты': 'List properties',
  'Создать аккаунт': 'Create account', 'Название (необязательно)': 'Name (optional)',
  'Аккаунт создан! Код подтверждения отправлен на почту.': 'Account created! A confirmation code was emailed.',
  'Вход по коду': 'Code sign-in', 'Сброс пароля': 'Reset password', 'Сбросить пароль': 'Reset password',
  'Код отправлен на почту.': 'The code was sent to your email.', 'Сбросить': 'Reset',
  'Не просто список квартир — решение, где жить': 'Not just listings — deciding where to live',
  'Ходите по квартире в 360°, спрашивайте ИИ прямо про зону на панораме, бронируйте онлайн и доверяйте честным отзывам.':
    'Walk through a home in 360°, ask the AI about any zone, book online and trust honest reviews.',
  '360°-туры с навигацией между комнатами': '360° tours with room-to-room navigation',
  'Spatial Q&A — вопросы про конкретную зону': 'Spatial Q&A — questions about a specific zone',
  'ИИ-агент сам ищет и сравнивает объекты': 'The AI agent searches and compares for you',
  'Бронь и оплата онлайн за пару кликов': 'Booking and payment online in a couple clicks',
  'Минимум 6 символов': 'At least 6 characters', 'Иван Петров': 'John Smith',

  // misc / errors / toasts
  'Подтвердите': 'Confirm', 'Отмена': 'Cancel', 'Сеть недоступна. Проверьте подключение.': 'Network unavailable. Check your connection.',
  'Ошибка запроса': 'Request error', 'Ошибка': 'Error', 'Удалено': 'Deleted',
  'Добавлено в избранное': 'Added to favorites', 'Удалено из избранного': 'Removed from favorites',
  'Войдите, чтобы продолжить': 'Sign in to continue', 'Войдите, чтобы задавать вопросы': 'Sign in to ask questions',
  'Доступ только для администратора': 'Administrators only', 'Доступ только для продавцов': 'Sellers only',
  'Страница не найдена': 'Page not found', 'Возможно, ссылка устарела': 'The link may be outdated',
  'На главную': 'Go home', 'Загрузка...': 'Loading...',
  'Падение цены': 'Price drop', 'Новое сообщение': 'New message', 'Бронь подтверждена': 'Booking confirmed',
  'Новая рекомендация': 'New recommendation', 'Решение по жалобе': 'Complaint decision',
  'Уведомление': 'Notification', 'Ответ на ваш Spatial Q&A готов': 'Your Spatial Q&A answer is ready',
  'Объекты на карте': 'Properties on map', 'Карта недоступна': 'Map unavailable',
  'Mapbox-токен не настроен. Маркеры отображаются списком слева.':
    'Mapbox token is not set. Markers are shown as a list on the left.',
  'Нет объектов по фильтрам': 'No properties match the filters', 'Объект': 'Property',

  // verdict risk
  'низкий': 'low', 'средний': 'medium', 'высокий': 'high', 'неизвестно': 'unknown',
  'Риск скама': 'Scam risk',

  // footer
  'Иммерсивный AI-маркетплейс недвижимости': 'Immersive AI real estate marketplace',
  'Продукт': 'Product', 'Компания': 'Company', 'Поддержка': 'Support',
  'О проекте': 'About', 'Документация API': 'API docs', 'Связаться': 'Contact',
  'Все права защищены': 'All rights reserved',
  'только что': 'just now',
};

let current = localStorage.getItem('nestora_lang') || 'ru';

// Pattern rules for dynamic/interpolated strings (applied when EN active).
const RULES = [
  [/^Найдено объектов: (.+)$/, 'Properties found: $1'],
  [/^Отзывы \((.+)\)$/, 'Reviews ($1)'],
  [/^Отзывов \((.+)\)$/, 'Reviews ($1)'],
  [/^(.+) жалоб$/, '$1 complaints'],
  [/^(.+) вопросов$/, '$1 questions'],
  [/^Объект #(.+)$/, 'Property #$1'],
  [/^Продавец #(.+)$/, 'Seller #$1'],
  [/^Комната (.+)$/, 'Room $1'],
  [/^По запросу: «(.+)»$/, 'For query: "$1"'],
  [/^(\d+) мин назад$/, '$1 min ago'],
  [/^(\d+) ч назад$/, '$1 h ago'],
  [/^(\d+) дн назад$/, '$1 d ago'],
  [/^(\d+) мин$/, '$1 min'],
  [/^(\d+) ч$/, '$1 h'],
  [/^(\d+) дн$/, '$1 d'],
  [/^(.+) комн\.$/, '$1 rooms'],
  [/^DEV-код: (.+)$/, 'DEV code: $1'],
  [/^Бронирование — (.+)$/, 'Booking — $1'],
  [/^Аналитика — (.+)$/, 'Analytics — $1'],
  [/^Редактор 360°-тура — (.+)$/, '360° tour editor — $1'],
  [/^Риск скама: (.+)$/, 'Scam risk: $1'],
  [/^(.+) для продавца #(.+)\?$/, '$1 for seller #$2?'],
];

export function getLang() { return current; }

export function setLang(lang) {
  current = lang === 'en' ? 'en' : 'ru';
  localStorage.setItem('nestora_lang', current);
  document.documentElement.setAttribute('lang', current);
}

// Translate a single plain string (used in code where convenient).
export function t(ru) {
  if (current === 'ru') return ru;
  return EN[ru] != null ? EN[ru] : ru;
}

// Translate text that may contain a known phrase; tries exact, then trimmed, then rules.
export function translateText(text) {
  if (current === 'ru' || !text) return text;
  const exact = EN[text];
  if (exact != null) return exact;
  const trimmed = text.trim();
  if (trimmed !== text && EN[trimmed] != null) {
    return text.replace(trimmed, EN[trimmed]);
  }
  for (const [rx, repl] of RULES) {
    if (rx.test(trimmed)) {
      const out = trimmed.replace(rx, repl);
      return trimmed === text ? out : text.replace(trimmed, out);
    }
  }
  return text;
}
