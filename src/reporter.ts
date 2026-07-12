import fs from "fs";
import path from "path";
import { CompareResult } from "./compare.js";

export interface EnhancedCompareResult extends CompareResult {
  aiAnalysis?: VisionAnalysis;
  aiMetadata?: AIAnalysisMetadata;
}

export interface VisionAnalysis {
  semanticPassed: boolean;
  classification: "VISUAL_ONLY" | "FUNCTIONAL" | "ACCESSIBILITY" | "DYNAMIC_CONTENT" | "UNKNOWN";
  confidence: number;
  reasoning: string;
  suggestions: string[];
  changedElements: Array<{
    selector: string;
    changeType: "added" | "removed" | "moved" | "styled" | "text_changed" | "attribute_changed";
    impact: "none" | "low" | "medium" | "high" | "critical";
    description: string;
  }>;
  accessibilityIssues: Array<{
    rule: string;
    severity: "minor" | "moderate" | "serious" | "critical";
    element: string;
    description: string;
  }>;
  functionalImpact: "none" | "low" | "medium" | "high" | "critical";
}

export interface AIAnalysisMetadata {
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  tokensUsed?: number;
}

export function generateReport(
  results: EnhancedCompareResult[],
  reportPath: string
): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const timestamp = new Date().toLocaleString("en-US");

  const toBase64 = (filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
  };

  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case "FUNCTIONAL": return "#f87171"; // red
      case "ACCESSIBILITY": return "#fbbf24"; // amber
      case "DYNAMIC_CONTENT": return "#60a5fa"; // blue
      case "VISUAL_ONLY": return "#4ade80"; // green
      default: return "#94a3b8"; // gray
    }
  };

  const getClassificationIcon = (classification: string) => {
    switch (classification) {
      case "FUNCTIONAL": return "⚠️";
      case "ACCESSIBILITY": return "♿";
      case "DYNAMIC_CONTENT": return "🔄";
      case "VISUAL_ONLY": return "🎨";
      default: return "❓";
    }
  };

  const rows = results
    .map((r) => {
      const statusClass = r.passed ? "pass" : "fail";
      const statusText = r.passed ? "✅ Pass" : "❌ Fail";

      const baselineImg = toBase64(r.baselinePath);
      const currentImg = toBase64(r.currentPath);
      const diffImg = r.diffPath ? toBase64(r.diffPath) : "";

      const errorRow = r.error
        ? `<tr><td colspan="5" class="error-msg">⚠️ ${r.error}</td></tr>`
        : "";

      // AI Analysis section
      const aiAnalysisHtml = r.aiAnalysis
        ? `
      <tr class="ai-analysis-row">
        <td colspan="5">
          <div class="ai-analysis-panel">
            <div class="ai-header">
              <span class="ai-icon">🤖</span>
              <span class="ai-title">AI Analysis</span>
              <span class="ai-classification" style="background: ${getClassificationColor(r.aiAnalysis.classification)}">
                ${getClassificationIcon(r.aiAnalysis.classification)} ${r.aiAnalysis.classification}
              </span>
              <span class="ai-confidence">Confidence: ${(r.aiAnalysis.confidence * 100).toFixed(0)}%</span>
            </div>
            <div class="ai-reasoning">${r.aiAnalysis.reasoning}</div>
            ${
              r.aiAnalysis.suggestions.length > 0
                ? `
              <div class="ai-suggestions">
                <strong>💡 Suggestions:</strong>
                <ul>
                  ${r.aiAnalysis.suggestions.map((s) => `<li>${s}</li>`).join("")}
                </ul>
              </div>
            `
                : ""
            }
            ${
              r.aiAnalysis.changedElements.length > 0
                ? `
              <div class="ai-changed-elements">
                <strong>🔍 Changed Elements:</strong>
                <table class="elements-table">
                  <thead>
                    <tr>
                      <th>Selector</th>
                      <th>Change Type</th>
                      <th>Impact</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${r.aiAnalysis.changedElements
                      .map(
                        (el) => `
                      <tr>
                        <td><code>${el.selector}</code></td>
                        <td><span class="change-type ${el.changeType}">${el.changeType}</span></td>
                        <td><span class="impact ${el.impact}">${el.impact}</span></td>
                        <td>${el.description}</td>
                      </tr>
                    `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
                : ""
            }
            ${
              r.aiAnalysis.accessibilityIssues.length > 0
                ? `
              <div class="ai-a11y-issues">
                <strong>♿ Accessibility Issues:</strong>
                <ul>
                  ${r.aiAnalysis.accessibilityIssues
                    .map(
                      (issue) => `
                    <li><span class="severity ${issue.severity}">${issue.severity.toUpperCase()}</span> ${issue.rule} - ${issue.element}: ${issue.description}</li>
                  `
                    )
                    .join("")}
                </ul>
              </div>
            `
                : ""
            }
            <div class="ai-metadata">
              <small>Model: ${r.aiMetadata?.model ?? "N/A"} | Latency: ${r.aiMetadata?.latencyMs ?? 0}ms${r.aiMetadata?.fallbackUsed ? " | ⚠️ Fallback used: " + r.aiMetadata.fallbackReason : ""}</small>
            </div>
          </div>
        </td>
      </tr>
    `
        : "";

      return `
      <tr class="${statusClass}-row">
        <td><strong>${r.pageName}</strong></td>
        <td class="${statusClass}">${statusText}</td>
        <td>${r.diffPercent}%</td>
        <td>${r.diffPixels.toLocaleString()} px</td>
        <td>${r.aiAnalysis ? `<span class="ai-badge" style="background: ${getClassificationColor(r.aiAnalysis.classification)}">${getClassificationIcon(r.aiAnalysis.classification)} ${r.aiAnalysis.classification}</span>` : "—"}</td>
      </tr>
      ${errorRow}
      ${
        !r.error
          ? `
      <tr class="images-row">
        <td colspan="5">
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
      ${aiAnalysisHtml}
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

    /* AI Analysis Styles */
    .ai-analysis-row td { background: #151821; padding: 0; }
    .ai-analysis-panel {
      padding: 1.5rem;
      border-left: 4px solid #60a5fa;
    }
    .ai-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .ai-icon { font-size: 1.5rem; }
    .ai-title { font-size: 1.1rem; font-weight: 600; color: #fff; }
    .ai-classification {
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #000;
    }
    .ai-confidence {
      margin-left: auto;
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .ai-reasoning {
      background: #1e2433;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      line-height: 1.6;
      border: 1px solid #2d3748;
    }
    .ai-suggestions {
      background: #1e2433;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      border: 1px solid #2d3748;
    }
    .ai-suggestions ul { margin-left: 1.5rem; }
    .ai-suggestions li { margin: 0.5rem 0; }
    .ai-changed-elements {
      background: #1e2433;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      border: 1px solid #2d3748;
      overflow-x: auto;
    }
    .elements-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .elements-table th,
    .elements-table td {
      padding: 0.5rem;
      border: 1px solid #2d3748;
      text-align: left;
    }
    .elements-table th {
      background: #2d3748;
      color: #94a3b8;
    }
    .elements-table code {
      background: #0f1117;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .change-type { text-transform: capitalize; }
    .change-type.added { color: #4ade80; }
    .change-type.removed { color: #f87171; }
    .change-type.moved { color: #60a5fa; }
    .change-type.styled { color: #fbbf24; }
    .change-type.text_changed { color: #f87171; }
    .change-type.attribute_changed { color: #a78bfa; }
    .impact { text-transform: capitalize; }
    .impact.none { color: #4b5563; }
    .impact.low { color: #4ade80; }
    .impact.medium { color: #fbbf24; }
    .impact.high { color: #fb923c; }
    .impact.critical { color: #f87171; font-weight: bold; }
    .ai-a11y-issues {
      background: #2d1f1f;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      border: 1px solid #f87171;
    }
    .ai-a11y-issues ul { margin-left: 1.5rem; }
    .ai-a11y-issues li { margin: 0.5rem 0; }
    .severity { padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-right: 0.5rem; }
    .severity.minor { background: #1e3a2a; color: #4ade80; }
    .severity.moderate { background: #3a2e1e; color: #fbbf24; }
    .severity.serious { background: #3a1e1e; color: #fb923c; }
    .severity.critical { background: #3a1e1e; color: #f87171; }
    .ai-metadata {
      color: #6b7280;
      font-size: 0.75rem;
    }
    .ai-badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #000;
    }

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
        <th>AI Classification</th>
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
