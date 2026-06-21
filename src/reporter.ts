import fs from "fs";
import path from "path";
import { CompareResult } from "./compare.js";

export function generateReport(
  results: CompareResult[],
  reportPath: string
): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const timestamp = new Date().toLocaleString("en-US");

  const toBase64 = (filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
  };

  const rows = results
    .map((r) => {
      const statusClass = r.passed ? "pass" : "fail";
      const statusText = r.passed ? "✅ Pass" : "❌ Fail";

      const baselineImg = toBase64(r.baselinePath);
      const currentImg = toBase64(r.currentPath);
      const diffImg = r.diffPath ? toBase64(r.diffPath) : "";

      const errorRow = r.error
        ? `<tr><td colspan="4" class="error-msg">⚠️ ${r.error}</td></tr>`
        : "";

      return `
      <tr class="${statusClass}-row">
        <td><strong>${r.pageName}</strong></td>
        <td class="${statusClass}">${statusText}</td>
        <td>${r.diffPercent}%</td>
        <td>${r.diffPixels.toLocaleString()} px</td>
      </tr>
      ${errorRow}
      ${
        !r.error
          ? `
      <tr class="images-row">
        <td colspan="4">
          <div class="images-grid">
            <div class="img-box">
              <span class="img-label">Baseline</span>
              ${baselineImg ? `<img src="${baselineImg}" alt="baseline" class="clickable-img" />` : '<p class="no-img">No image</p>'}
            </div>
            <div class="img-box">
              <span class="img-label">Current</span>
              ${currentImg ? `<img src="${currentImg}" alt="current" class="clickable-img" />` : '<p class="no-img">No image</p>'}
            </div>
            <div class="img-box ${!diffImg ? "no-diff" : ""}">
              <span class="img-label">Diff</span>
              ${diffImg ? `<img src="${diffImg}" alt="diff" class="clickable-img" />` : '<p class="no-img">No differences 🎉</p>'}
            </div>
          </div>
        </td>
      </tr>
      `
          : ""
      }
    `;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Visual QA Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      padding: 2rem;
    }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; color: #fff; }
    .meta { color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }
    .summary {
      display: flex;
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .stat {
      background: #1e2433;
      border-radius: 12px;
      padding: 1.25rem 1.75rem;
      min-width: 140px;
      flex: 1;
      text-align: center;
      border: 1px solid #2d3748;
    }
    .stat .num {
      font-size: 2.5rem;
      font-weight: 800;
      line-height: 1;
    }
    .stat .lbl {
      font-size: 0.85rem;
      color: #94a3b8;
      margin-top: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .stat-total .num { color: #60a5fa; }
    .stat-pass .num { color: #4ade80; }
    .stat-fail .num { color: #f87171; }
    .stat-total { border-top: 3px solid #60a5fa; }
    .stat-pass { border-top: 3px solid #4ade80; }
    .stat-fail { border-top: 3px solid #f87171; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e2433;
      border-radius: 12px;
      overflow: hidden;
    }
    th {
      background: #2d3748;
      padding: 0.75rem 1rem;
      text-align: left;
      font-size: 0.85rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 0.75rem 1rem;
      border-top: 1px solid #2d3748;
      font-size: 0.95rem;
    }
    .pass { color: #4ade80; }
    .fail { color: #f87171; }
    .pass-row td:first-child { border-left: 3px solid #4ade80; }
    .fail-row td:first-child { border-left: 3px solid #f87171; }
    .error-msg {
      background: #2d1f1f;
      color: #fca5a5;
      font-size: 0.85rem;
      padding: 0.5rem 1rem;
    }
    .images-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      padding: 0.75rem 0;
    }
    .img-box {
      background: #151821;
      border-radius: 8px;
      padding: 0.75rem;
      text-align: center;
    }
    .img-box img {
      width: 100%;
      border-radius: 4px;
      margin-top: 0.5rem;
      border: 1px solid #2d3748;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .img-box img:hover {
      opacity: 0.8;
    }
    .img-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .no-img { color: #4b5563; font-size: 0.85rem; margin-top: 0.5rem; }
    .no-diff { border: 1px dashed #2d3748; }
    .images-row td { background: #161b27; }

    /* Lightbox */
    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .lightbox-overlay.open {
      display: flex;
    }
    .lightbox-overlay img {
      max-width: 90vw;
      max-height: 90vh;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      cursor: default;
    }
    .lightbox-close {
      position: fixed;
      top: 1rem;
      right: 1.5rem;
      color: #fff;
      font-size: 2.5rem;
      cursor: pointer;
      line-height: 1;
      opacity: 0.7;
      transition: opacity 0.15s;
      background: none;
      border: none;
    }
    .lightbox-close:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div id="lightbox" class="lightbox-overlay" onclick="closeLightbox()">
    <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
    <img id="lightbox-img" src="" alt="enlarged" onclick="event.stopPropagation()" />
  </div>

  <h1>🔍 Visual QA Report</h1>
  <p class="meta">Generated: ${timestamp}</p>

  <div class="summary">
    <div class="stat stat-total">
      <div class="num">${results.length}</div>
      <div class="lbl">Total Pages</div>
    </div>
    <div class="stat stat-pass">
      <div class="num">${passed}</div>
      <div class="lbl">Passed</div>
    </div>
    <div class="stat stat-fail">
      <div class="num">${failed}</div>
      <div class="lbl">Failed</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Page</th>
        <th>Status</th>
        <th>Diff %</th>
        <th>Diff Pixels</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <script>
    function openLightbox(src) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('open');
    }
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('open');
    }
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('clickable-img')) {
        openLightbox(e.target.src);
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, html, "utf-8");
  console.log(`\n📄 Report saved: ${reportPath}`);
}
