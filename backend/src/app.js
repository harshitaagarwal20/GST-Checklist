const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DEFAULT_STATUS = "NA";
const STATUS_OPTIONS = new Set(["YES", "NO", "NA"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function resolveStatus(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (STATUS_OPTIONS.has(raw)) {
    return raw === "YES" ? "Yes" : raw === "NO" ? "No" : "NA";
  }
  return DEFAULT_STATUS;
}

function findColumn(headerMap, keys, fallback) {
  for (const key of keys) {
    if (headerMap.has(key)) {
      return headerMap.get(key);
    }
  }
  return fallback;
}

function parseChecklistWorksheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rows.length) {
    return [];
  }

  const firstRow = rows[0];
  const headerMap = new Map();
  Object.keys(firstRow).forEach((header) => {
    headerMap.set(normalizeHeader(header), header);
  });

  const headingCol = findColumn(headerMap, ["heading", "section", "group"], "Heading");
  const itemCol = findColumn(
    headerMap,
    ["item", "checklistitem", "checkpoint", "question", "points"],
    "Item"
  );
  const statusCol = findColumn(headerMap, ["status", "result"], "Status");
  const commentsCol = findColumn(headerMap, ["comments", "remarks", "note", "notes"], "Comments");

  return rows
    .filter((row) => !isBlank(row[itemCol]) || !isBlank(row[headingCol]))
    .map((row, index) => ({
      id: index + 1,
      heading: String(row[headingCol] || "").trim(),
      item: String(row[itemCol] || "").trim(),
      status: resolveStatus(row[statusCol]),
      comments: String(row[commentsCol] || "").trim()
    }));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/checklist/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload an Excel file." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: "Workbook does not contain any sheet." });
    }

    const worksheet = workbook.Sheets[sheetName];
    const parsedRows = parseChecklistWorksheet(worksheet);

    return res.json({
      fileName: req.file.originalname,
      rows: parsedRows
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read uploaded workbook." });
  }
});

app.post("/api/checklist/export", (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const exportRows = rows.map((row) => ({
      Heading: String(row.heading || ""),
      Item: String(row.item || ""),
      Status: resolveStatus(row.status),
      Comments: String(row.comments || "")
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "GST Checklist");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=\"gst_audit_checklist_updated.xlsx\""
    );
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: "Failed to export workbook." });
  }
});

module.exports = app;
