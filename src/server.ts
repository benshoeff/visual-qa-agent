import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { BASELINES_DIR, CURRENT_DIR, DIFFS_DIR } from "./config.js";
import { initScheduler } from "./scheduler.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tsx runs from project root, client/dist is at project root
const CLIENT_DIST = path.join(process.cwd(), "client/dist");

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3456;

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

app.use(cors());
app.use(express.json());

app.use("/images/baseline", express.static(BASELINES_DIR));
app.use("/images/current", express.static(CURRENT_DIR));
app.use("/images/diff", express.static(DIFFS_DIR));
app.use(express.static(CLIENT_DIST));

app.use("/api", router);

// SPA fallback for React Router
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/images")) {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  }
});

initScheduler();

app.listen(PORT, () => {
  console.log(`\n🌐 Visual QA running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   UI:  http://localhost:${PORT}`);
});