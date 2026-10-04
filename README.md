# Ютуб / VibeTube

Вертикальная лента коротких видео. Один код на три платформы:

| Платформа | Технология | Артефакт |
|---|---|---|
| Веб | Next.js 16, статический экспорт | [dimacultasov6-star.github.io/yutub](https://dimacultasov6-star.github.io/yutub/) |
| Android | Capacitor 8 | [`Ютуб-1.0.0-release.apk`](https://github.com/dimacultasov6-star/yutub/releases) |
| Windows | Electron 44 | [`Ютуб-1.0.0-x64.exe`](https://github.com/dimacultasov6-star/yutub/releases) |

Приложение **не хранит видеофайлы**. Оно хранит только метаданные (ссылка,
автор, заголовок, лайки, комментарии), а видео подгружается напрямую с CDN.

---

## Быстрый старт

```bash
npm install
npm run dev          # http://localhost:3000
```

Без Supabase приложение сразу работает на локальных данных из `lib/seed.json`
и `localStorage` — подключать базу не обязательно.

---

## Публикация сайта на GitHub Pages

```bash
npm run deploy:pages
node scripts/verify-live.mjs https://dimacultasov6-star.github.io/yutub/
```

Скрипт сам соберёт статику, проверит её и зальёт в ветку `gh-pages`.

Две детали, на которых обычно спотыкаются:

**1. Префикс `/yutub/`.** Сайт лежит не в корне домена, а по адресу
`github.io/yutub/`. Статический экспорт Next.js по умолчанию пишет
абсолютные пути (`/_next/...`), и без префикса страница отдаёт белый экран.
Поэтому при публикации сборка идёт с `NEXT_PUBLIC_BASE_PATH=/yutub`
(см. `next.config.mjs`). Сборки для Electron и Android префикса не получают
и остаются в корне.

**2. Файл `.nojekyll`.** Pages по умолчанию прогоняет сайт через Jekyll, а
Jekyll выбрасывает всё, что начинается с подчёркивания. Наш каталог ассетов —
`/_next/`, то есть без `.nojekyll` главная открывается, а каждый ассет отдаёт
404. Скрипт создаёт этот файл автоматически.

Проверки, которые ловят обе проблемы: `scripts/verify-export.mjs` (по
собранным файлам) и `scripts/verify-live.mjs` (по живому сайту).

---

## Команды

### Общее

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер Next.js |
| `npm run build` | статический экспорт в `out/` |
| `npm run start` | локальный просмотр собранного `out/` |
| `npm test` | typecheck + lint + проверка иконок + тесты статического сервера |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify:export` | проверить, что `out/` собран под нужный basePath |
| `npm run deploy:pages` | собрать и опубликовать сайт на GitHub Pages |

### Веб (Vercel)

```bash
npm run build
```

Проект настроен на `output: 'export'` (`next.config.mjs`), поэтому Vercel
подхватит `out/` автоматически. Настройки сборки указывать не нужно.

Приложение полностью статическое: нет SSR, API-роутов и серверных функций.

### Windows (.EXE)

```bash
npm run build:exe            # установщик + portable (release\)
npm run build:exe:portable   # только portable
```

Готовые файлы:

- `release\Ютуб-1.0.0-x64.exe` — установщик (NSIS, ~167 MB)
- `release\Ютуб-1.0.0-portable.exe` — portable, ничего не устанавливает

Как это работает: приложение **не** открывает `file://`, а поднимает
локальный HTTP-сервер на `127.0.0.1` со случайным портом и открывает его.
Причина: статический экспорт Next.js собран с абсолютными путями
(`/_next/...`), которые через `file://` не разрешаются. Плюс появляется
нормальный origin — работают `localStorage`, `clipboard` и запросы к Supabase
без CORS-костылей.

### Android (.APK)

```bash
npm run build:apk            # release -> dist\Ютуб-1.0.0-release.apk
npm run build:apk:debug      # debug
npm run apk:sync             # только пересобрать веб и скопировать в android/
npm run apk:open             # открыть проект в Android Studio
```

Скрипт `scripts/build-apk.mjs` сам находит Android SDK и подходящий JDK,
поэтому `npm run build:apk` работает без ручной настройки переменных.

> **Важно про JDK.** Нужен JDK **17–24**. Обычная системная Java может не
> подойти: JDK 8 не запускает Gradle 8.x, а JDK 25 (например, встроенный JBR
> свежего Android Studio) роняет Android Gradle Plugin 8.x с ошибкой
> `Unsupported class file major version 69`. Скрипт проверяет версию и
> подсказывает, что поставить.

Если подходящего JDK нет, положите его в папку `.jdk\` внутри проекта —
скрипт подхватит автоматически (папка в `.gitignore`). Либо задайте
`JAVA_HOME`, либо в Android Studio: `Settings → Build Tools → Gradle → Gradle JDK`.

#### Свой ключ подписи (для Google Play)

По умолчанию release подписывается отладочным ключом Android — APK
устанавливается, но в Play его не примут. Для публикации создайте
`android/keystore.properties`:

```properties
storeFile=my-release-key.jks
storePassword=ВАШ_ПАРОЛЬ
keyAlias=my-alias
keyPassword=ВАШ_ПАРОЛЬ
```

```bash
keytool -genkey -v -keystore android/my-release-key.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias my-alias
```

Файл уже добавлен в `android/.gitignore` — **не коммитьте его**.
После создания файла `npm run build:apk` подпишет APK вашим ключом.

---

## Supabase

Опционально. Нужен, чтобы лайки и комментарии синхронизировались между
устройствами; без него всё живёт в `localStorage`.

1. Создайте проект на [supabase.com](https://supabase.com).
2. В SQL Editor выполните `supabase/schema.sql` — он создаёт таблицы
   `videos`, `video_likes`, `video_comments`, индексы, RLS-политики и RPC.
3. Скопируйте `.env.example` в `.env.local` и заполните:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

4. Загрузите ролики:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run seed
```

`service_role` ключ нужен только для первичного сидирования и намеренно
читается из переменной окружения, а не попадает в клиентский бакл.

### Как устроена схема

- Аутентификации нет. «Личность» пользователя — случайный `device_id`,
  который генерируется в браузоне и хранится в `localStorage`.
- Лайк: строка в `video_likes` с `device_id`, уникальный индекс не даёт
  лайкнуть дважды. Переключение идёт через RPC `toggle_like` — гонок нет.
- Просмотры и лайки пользователя читаются RPC `my_likes` / `bump_view`.
- RLS включён везде; анонимный ключ не может ничего, кроме чтения ленты,
  добавления своих лайков и комментариев.

---

## Структура

```
app/                 страница и глобальные стили
components/          UI ленты
lib/                 типы, seed, валидация, работа с Supabase
electron/            main process, preload, статический сервер
android/             сгенерированная Android-платформа Capacitor
supabase/schema.sql  таблицы, RLS, RPC
scripts/             генератор иконок, тесты, сборка APK, сид
assets/              icon.ico и PNG для сборщиков
lib/seed.json        10 демо-роликов
```

---

## Добавление своих видео

Кнопка «+» в шапке открывает модальное окно:

1. Вставить прямую ссылку на файл (`https://.../video.mp4`).
2. Приложение проверит её через `<video>` и покажет превью с
   разрешением и длительностью. Если файл недоступен — сообщит об этом
   на этом же шаге.
3. Заполнить заголовок и автора, нажать «Добавить».

Поддерживаемые форматы: `.mp4`, `.m4v`, `.webm`, `.mov`.
Проверка специально делается **без** `crossOrigin`: чтение метаданных не
требует CORS, а с anonymous-режимом браузер отклоняет любой CDN, который не
отдаёт `Access-Control-Allow-Origin`.

Источник должен отдавать сам файл по прямой ссылке и разрешать
воспроизведение — открытые видео с CDN (например, Wikimedia Commons)
работают, закрытые нет.

---

## Про seed-данные

`lib/seed.json` содержит 10 роликов, проверенных на доступность
(`npm run media:check`).

Это **WebM (VP9+Opus)**, а не MP4. Причина: Wikimedia Commons не отдаёт
H.264/MP4-транскоды для этих файлов, а доступные MP4 оказались
альбомными, что для вертикальной ленты не подходит. Приложение играет WebM
на всех целевых платформах нативно. Свои видео можно добавлять в любом из
поддерживаемых форматов, включая MP4.

Если нужен именно вертикальный MP4, замените значения `src` в
`lib/seed.json` (и проверьте их командой `npm run media:check`).

---

## Иконки и splash

Иконки рисуются процедурно из того же логотипа, что и в интерфейсе, —
никаких бинарников из Figma:

```bash
npm run icons          # assets/*.png, assets/icon.ico, Android mipmap + splash
npm run icons:verify   # проверка, что PNG/ICO валидны
```

Скрипт перегенерирует и Android splash-экраны: `npx cap add android` кладёт
туда логотип Capacitor, и мы заменяем его фирменным тёмным.

---

## Проверка

```bash
npm test                      # typecheck, lint, иконки, тесты сервера
node scripts/verify-export.mjs /yutub    # что out/ собран под префикс Pages
node scripts/verify-live.mjs https://dimacultasov6-star.github.io/yutub/
node scripts/smoke-exe.mjs     # запуск собранного .exe и проверка отдачи HTML
```

`scripts/test-server.mjs` проверяет то, что обычно ломается у пользователей:
Content-Type ассетов, кэш, SPA-фолбэк и защиту от path traversal.

---

## Особенности платформы

Путь к проекту содержит кириллицу (`Ютуб`). Android Gradle Plugin по
умолчанию отказывается собирать такие пути на Windows, поэтому в
`android/gradle.properties` включён штатный флаг:

```properties
android.overridePathCheck=true
```

Сборка при этом проходит успешно.
