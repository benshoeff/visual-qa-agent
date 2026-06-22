import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
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

const clientDist = path.join(process.cwd(), "client", "dist");
console.log("clientDist path:", clientDist);
console.log("clientDist exists:", fs.existsSync(clientDist));

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  console.error("❌ client/dist not found!");
}

initScheduler();

app.listen(PORT, () => {
  console.log(`\n🌐 Visual QA Dashboard: http://localhost:${PORT}`);
  console.log(`   📦 API: http://localhost:${PORT}/api`);
});