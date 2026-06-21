# Visual QA Agent 🔍

סוכן Visual Regression Testing – משווה צילומי מסך של דפי אינטרנט מול בייסליין ומזהה שינויים ויזואליים.

## התקנה

```bash
npm install
npx playwright install chromium
```

## הגדרה

ערוך את `config.json` או השתמש ב-Dashboard.

### CLI (מסוף)

```bash
npm run baseline    # צילום בייסליין ראשוני
npm run test        # הרצת בדיקה מול הבייסליין
```

### Web Dashboard (ממשק גרפי)

```bash
# בניית הממשק (פעם ראשונה)
npm run build:client

# הפעלת השרת
npm run server
# => http://localhost:3456

# או במצב פיתוח (server + client יחד)
npm run dev
```

## Dashboard Features

| מסך | תיאור |
|-----|--------|
| **Dashboard** | תצוגת סיכום: כמות דפים, viewport, threshold, כמות דוחות |
| **Pages** | ניהול דפים לבדיקה – הוספה, עריכה, מחיקה |
| **Test Runner** | הרצת baseline או test, תצוגת תוצאות בזמן אמת |
| **Reports** | צפייה בדוחות קודמים, השוואת תמונות עם Slider |

## Diff Slider

ב-Report Viewer ניתן ללחוץ על Compare כדי לפתוח את **Diff Slider** – משווה תמונות Baseline מול Current ע"י גרירה ימינה/שמאלה.

## REST API

| Method | Endpoint | תפקיד |
|--------|----------|-------|
| `GET` | `/api/config` | קבלת הגדרות |
| `PATCH` | `/api/config` | עדכון הגדרות |
| `GET` | `/api/pages` | רשימת דפים |
| `POST` | `/api/pages` | הוספת דף |
| `PUT` | `/api/pages/:name` | עדכון דף |
| `DELETE` | `/api/pages/:name` | מחיקת דף |
| `POST` | `/api/run/baseline` | צילום בייסליין |
| `POST` | `/api/run/test` | הרצת בדיקה |
| `GET` | `/api/reports` | רשימת דוחות |
| `GET` | `/api/reports/:filename` | צפייה בדוח |

## פלט

- `baselines/` – צילומי המסך הבסיסיים
- `current/` – צילומי המסך הנוכחיים
- `diffs/` – תמונות הבדלים
- `reports/` – דוחות HTML
