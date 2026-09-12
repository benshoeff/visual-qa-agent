# Visual QA Agent 🔍

סוכן Visual Regression Testing – משווה צילומי מסך של דפי אינטרנט מול בייסליין ומזהה שינויים ויזואליים.

ארכיטקטורה **ענן חינמי, ללא שרת תמיד-פועל**:

- **Vercel** – ממשק ה-Web Dashboard (הרצה ללא עלות)
- **GitHub Actions** – הרצת בדיקות Playwright (ללא דקות על חשבון ב-repo ציבורי)
- **Git** – שכבת האחסון (קובצי config, schedules, baselines, דוחות)

## התקנה מקומית (פיתוח)

```bash
npm install
npx playwright install chromium
```

### CLI (מסוף)

```bash
npm run baseline            # צילום בייסליין ראשוני
npm run test                # הרצת בדיקה מול הבייסליין
npm run crawl               # גילוי עמודים + צילום בייסליין (CRAWL_URL...)
npm run run:scheduled       # הרצת לוחות זמנים שהגיע זמנם (מ-schedules.yml)
```

### Web Dashboard (מקומי)

```bash
npm run build:client
npm run server              # => http://localhost:3456
```

## הגדרה

ערוך את `config.json` או השתמש ב-Dashboard (מקומי או דרך Vercel).

## Dashboard Features

| מסך | תיאור |
|-----|--------|
| **Dashboard** | תצוגת סיכום: כמות דפים, viewport, threshold, כמות דוחות |
| **Pages** | ניהול דפים לבדיקה – הוספה, עריכה, מחיקה (עדכון baseline מוחק את ה-current/diffs של הדף) |
| **Test Runner** | הרצת baseline / test / crawl – מופעלת כ-Job אסינכרוני ב-GitHub Actions ומעודכן מעצמו |
| **Reports** | צפייה בדוחות קודמים, השוואת תמונות עם Slider |
| **Schedules** | תצוגה בלבד – לוח הזמנים מוגדר ב-`schedules.yml` ב-repo (טיק שעתי של GitHub Actions מפעיל את ה-crons) |

## איך זה עובד

1. ממשק ה-Vercel קורא קבצים (config.json, schedules.yml, schedules-status.json, baselines, דוחות) ישירות ב-repo דרך GitHub API. לוח הזמנים לקריאה בלבד.
2. הבדיקות אוטומטיות רצות ע"י טיק שעתי ב-GitHub Actions (`0 * * * *` ב-`.github/workflows/visual-qa.yml`); `run-scheduled` מריץ כל schedule שזמנו הגיע לפי `schedules.yml` (UTC), וריצות ידניות נקראות ע"י `workflow_dispatch` מהדאשבורד.
3. ה-Workflow מריץ את Playwright ומחזיר את התוצאות (baselines / current / diffs / reports) בחזרה ל-git – כך הדוחות זמינים בממשק.
4. **Cleanup** – כל יום ראשון 03:00 UTC מנקה קבצים זמניים (reports, current, diffs, crawl-results).

## REST API (Vercel Functions)

| Method | Endpoint | תפקיד |
|--------|----------|-------|
| `GET/PATCH` | `/api/config` | קבלת/עדכון הגדרות |
| `GET/POST` | `/api/pages` | רשימת/הוספת דפים |
| `PUT/DELETE` | `/api/pages?name=` | עדכון/מחיקת דף |
| `POST` | `/api/dispatch` | שליחת job (test/baseline/crawl) ל-GitHub Actions |
| `GET` | `/api/status` | מצב ריצות אחרונות |
| `GET/POST` | `/api/schedules` | ניהול לוחות זמנים |
| `GET` | `/api/reports` | רשימת דוחות |
| `GET` | `/api/files?type=&name=` | תמונות / דוחות מה-git |
| `POST/GET` | `/api/crawl` | גילוי עמודים + אישור baselines |

## פלט (בתוך ה-repo)

- `baselines/` – צילומי המסך הבסיסיים (נשמרים – לא נמחקים)
- `current/` – צילומי המסך הנוכחיים (מתנקים שבועית)
- `diffs/` – תמונות הבדלים (מתנקים שבועית)
- `reports/` – דוחות HTML (מתנקים שבועית)
- `crawl-results/` – תוצאות גלישה (מתנקים שבועית)

## הגדרות סביבה (Vercel)

| Variable | תיאור |
|----------|--------|
| `GITHUB_TOKEN` | Token עם הרשאות repo (קריאה/כתיבה `contents:write`) |
| `GITHUB_REPO` | שם ה-repo, כברירת מחדל `benshoeff/visual-qa-agent` |
| `GITHUB_BRANCH` | ענף ברירת מחדל, כברירת מחדל `main` |
