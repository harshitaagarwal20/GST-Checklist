const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");

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

function countNonEmptyHeadings(rows) {
  return rows.reduce((count, row) => count + (isBlank(row.heading) ? 0 : 1), 0);
}

function isSerialOrBullet(value) {
  return /^\d+(\.\d+)*$/.test(value) || /^[-#*]$/.test(value);
}

function isLikelyHeadingText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (/^[-#*]\s*/.test(text)) {
    return false;
  }
  if (isSerialOrBullet(text)) {
    return false;
  }
  if (/[?]$/.test(text)) {
    return false;
  }
  return true;
}

function isSerialMarker(value) {
  return /^\d+(\.\d+)*$/.test(String(value || "").trim());
}

function isContinuationBulletLine(value) {
  return /^[-#*]\s*/.test(String(value || "").trim());
}

function parseChecklistWithNamedColumns(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rows.length) {
    return [];
  }

  const firstRow = rows[0];
  const headerMap = new Map();
  Object.keys(firstRow).forEach((header) => {
    headerMap.set(normalizeHeader(header), header);
  });

  const headingCol = findColumn(headerMap, ["heading", "headings", "section", "group"], "Heading");
  const itemCol = findColumn(
    headerMap,
    ["item", "checklistitem", "checkpoint", "question", "points"],
    "Item"
  );
  const serialCol = findColumn(
    headerMap,
    ["srno", "sno", "serialno", "serialnumber", "sr", "no"],
    "Sr. No."
  );
  const statusCol = findColumn(headerMap, ["status", "result"], "Status");
  const commentsCol = findColumn(headerMap, ["comments", "remarks", "note", "notes"], "Comments");
  const headingColumnPresent = Object.prototype.hasOwnProperty.call(firstRow, headingCol);
  const itemColumnPresent = Object.prototype.hasOwnProperty.call(firstRow, itemCol);

  if (!itemColumnPresent && !headingColumnPresent) {
    return [];
  }

  const parsedRows = [];
  let currentHeading = "";

  for (const row of rows) {
    const rawSerial = String(row[serialCol] || "").trim();
    const rawHeading = String(row[headingCol] || "").trim();
    const rawItem = String(row[itemCol] || "").trim();
    const rawStatus = String(row[statusCol] || "").trim();
    const rawComments = String(row[commentsCol] || "").trim();
    const headingIsSerial = isSerialMarker(rawHeading);
    const serialIsTopLevel = /^\d+$/.test(rawSerial);
    const serialPrefix = headingIsSerial || /^[-#*]$/.test(rawHeading);

    if (!isBlank(rawHeading) && (!headingIsSerial || isBlank(rawItem))) {
      currentHeading = rawHeading;
    }

    // Template pattern:
    // Sr.No=1, Heading=REGISTRATION, Item blank -> section row
    if (!isBlank(rawHeading) && isBlank(rawItem) && serialIsTopLevel) {
      currentHeading = rawHeading;
      continue;
    }

    // Some templates keep section titles in the item column without a status/comments value.
    if (
      isBlank(rawHeading) &&
      !isBlank(rawItem) &&
      isBlank(rawStatus) &&
      isBlank(rawComments) &&
      isLikelyHeadingText(rawItem)
    ) {
      currentHeading = rawItem;
      continue;
    }

    if (isBlank(rawItem) && !isBlank(rawHeading) && isBlank(rawStatus) && isBlank(rawComments)) {
      continue;
    }

    if (isBlank(rawItem) && isBlank(rawHeading)) {
      continue;
    }

    if (
      isContinuationBulletLine(rawHeading) &&
      isBlank(rawItem) &&
      isBlank(rawStatus) &&
      isBlank(rawComments) &&
      parsedRows.length
    ) {
      parsedRows[parsedRows.length - 1].item = `${parsedRows[parsedRows.length - 1].item}\n${rawHeading}`;
      continue;
    }

    if (
      isBlank(rawHeading) &&
      isContinuationBulletLine(rawItem) &&
      isBlank(rawStatus) &&
      isBlank(rawComments) &&
      parsedRows.length
    ) {
      parsedRows[parsedRows.length - 1].item = `${parsedRows[parsedRows.length - 1].item}\n${rawItem}`;
      continue;
    }

    const itemText = !isBlank(rawItem)
      ? serialPrefix
        ? `${rawHeading} ${rawItem}`.trim()
        : rawItem
      : rawHeading;

    parsedRows.push({
      id: parsedRows.length + 1,
      heading: currentHeading || rawHeading,
      item: itemText,
      status: resolveStatus(rawStatus),
      comments: rawComments
    });
  }

  return parsedRows;
}

function parseChecklistFromSectionLayout(ws) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  const parsedRows = [];
  let currentHeading = "";

  for (const row of grid) {
    const firstCell = String(row[0] || "").trim();
    const secondCell = String(row[1] || "").trim();
    const thirdCell = String(row[2] || "").trim();
    const fourthCell = String(row[3] || "").trim();

    const firstFour = [firstCell, secondCell, thirdCell, fourthCell];
    const nonEmptyIndices = firstFour
      .map((value, index) => ({ value, index }))
      .filter((cell) => !isBlank(cell.value))
      .map((cell) => cell.index);
    const isSerial = /^\d+(\.\d+)*$/.test(firstCell);
    const isBullet = /^[-#*]$/.test(firstCell);
    const singleTextCell = nonEmptyIndices.length === 1 ? firstFour[nonEmptyIndices[0]] : "";
    const isHeadingRow =
      nonEmptyIndices.length === 1 &&
      nonEmptyIndices[0] <= 1 &&
      isLikelyHeadingText(singleTextCell) &&
      !STATUS_OPTIONS.has(singleTextCell.toUpperCase());

    if (isHeadingRow) {
      currentHeading = singleTextCell;
      continue;
    }

    let itemText = "";
    if (secondCell) {
      itemText = isSerial || isBullet ? `${firstCell} ${secondCell}`.trim() : secondCell;
    } else if (firstCell && !isHeadingRow) {
      itemText = firstCell;
    }

    if (!itemText) {
      continue;
    }

    if (
      isContinuationBulletLine(itemText) &&
      isBlank(thirdCell) &&
      isBlank(fourthCell) &&
      parsedRows.length
    ) {
      parsedRows[parsedRows.length - 1].item = `${parsedRows[parsedRows.length - 1].item}\n${itemText}`;
      continue;
    }

    parsedRows.push({
      id: parsedRows.length + 1,
      heading: currentHeading,
      item: itemText,
      status: resolveStatus(thirdCell),
      comments: fourthCell
    });
  }

  return parsedRows;
}

function parseChecklistWorksheet(ws) {
  const parsedWithHeaders = parseChecklistWithNamedColumns(ws);
  const parsedFromSectionLayout = parseChecklistFromSectionLayout(ws);

  if (!parsedWithHeaders.length) {
    return parsedFromSectionLayout;
  }

  if (!parsedFromSectionLayout.length) {
    return parsedWithHeaders;
  }

  const headerHeadingCount = countNonEmptyHeadings(parsedWithHeaders);
  const layoutHeadingCount = countNonEmptyHeadings(parsedFromSectionLayout);

  if (layoutHeadingCount > headerHeadingCount) {
    return parsedFromSectionLayout;
  }

  return parsedWithHeaders;
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

app.post("/api/checklist/export", async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const firmName = String(req.body?.firmName || "").trim() || "Unknown Firm";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("GST Checklist");

    worksheet.mergeCells("A1:D1");
    const firmCell = worksheet.getCell("A1");
    firmCell.value = `Firm Name: ${firmName}`;
    firmCell.font = { bold: true, size: 14 };
    firmCell.alignment = { vertical: "middle", horizontal: "left" };

    worksheet.getRow(2).height = 8;

    const headerRow = worksheet.addRow(["Heading", "Item", "Status", "Comments"]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E78" }
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFC9D7EC" } },
        left: { style: "thin", color: { argb: "FFC9D7EC" } },
        bottom: { style: "thin", color: { argb: "FFC9D7EC" } },
        right: { style: "thin", color: { argb: "FFC9D7EC" } }
      };
    });

    rows.forEach((row) => {
      const status = resolveStatus(row.status);
      const dataRow = worksheet.addRow([
        String(row.heading || ""),
        String(row.item || ""),
        status,
        String(row.comments || "")
      ]);

      dataRow.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFDCE6F5" } },
          left: { style: "thin", color: { argb: "FFDCE6F5" } },
          bottom: { style: "thin", color: { argb: "FFDCE6F5" } },
          right: { style: "thin", color: { argb: "FFDCE6F5" } }
        };
      });

      const statusCell = dataRow.getCell(3);
      statusCell.alignment = { vertical: "middle", horizontal: "center" };
      if (status === "Yes") {
        statusCell.font = { bold: true, color: { argb: "FF0B5D1E" } };
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFCBEAD4" }
        };
      } else if (status === "No") {
        statusCell.font = { bold: true, color: { argb: "FF7A0A0A" } };
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8CDCD" }
        };
      }
    });

    worksheet.columns = [
      { key: "heading", width: 34 },
      { key: "item", width: 80 },
      { key: "status", width: 14 },
      { key: "comments", width: 42 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();

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
