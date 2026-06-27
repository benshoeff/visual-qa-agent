import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { BASELINES_DIR, CURRENT_DIR, DIFFS_DIR } from "./config.js";
import { initScheduler } from "./scheduler.js";

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

app.use("/api", router);

initScheduler();

app.listen(PORT, () => {
  console.log(`\n🌐 Visual QA API running on port ${PORT}`);
});