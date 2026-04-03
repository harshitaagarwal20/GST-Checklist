import { useMemo, useState } from "react";

const STATUS_OPTIONS = ["Yes", "No", "NA"];

function buildSummary(rows) {
  const total = rows.length;
  const yes = rows.filter((row) => row.status === "Yes").length;
  const no = rows.filter((row) => row.status === "No").length;
  const na = rows.filter((row) => row.status === "NA").length;
  return { total, yes, no, na };
}

function formatPercent(value, total) {
  if (!total) {
    return "0%";
  }
  return `${Math.round((value / total) * 100)}%`;
}

function App() {
  const [rows, setRows] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState([...STATUS_OPTIONS]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadHint, setUploadHint] = useState(
    "Upload your checklist workbook to begin GST audit review."
  );

  const summary = useMemo(() => buildSummary(rows), [rows]);

  const filteredRows = useMemo(() => {
    let result = [...rows];
    const search = searchText.trim().toLowerCase();

    if (search) {
      result = result.filter(
        (row) =>
          row.item.toLowerCase().includes(search) ||
          row.heading.toLowerCase().includes(search)
      );
    }

    result = result.filter((row) => statusFilter.includes(row.status));
    return result;
  }, [rows, searchText, statusFilter]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of filteredRows) {
      if (!groups.has(row.heading)) {
        groups.set(row.heading, []);
      }
      groups.get(row.heading).push(row);
    }
    return Array.from(groups.entries());
  }, [filteredRows]);

  async function handleUpload(file) {
    if (!file) {
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/checklist/upload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setRows(data.rows || []);
      setFileName(data.fileName || file.name);
      setUploadHint("Workbook loaded. You can now review and update statuses.");
    } catch (uploadError) {
      setError(uploadError.message || "Something went wrong while uploading.");
      setRows([]);
      setFileName("");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id, field, value) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function toggleStatusFilter(status) {
    setStatusFilter((current) => {
      if (current.includes(status)) {
        const next = current.filter((item) => item !== status);
        return next.length ? next : current;
      }
      return [...current, status];
    });
  }

  async function downloadUpdatedChecklist() {
    setError("");
    try {
      const response = await fetch("/api/checklist/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rows })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gst_audit_checklist_updated.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download checklist.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>GST Audit Checklist</h1>
          <p>Professional compliance review workspace</p>
        </div>

        <div className="panel">
          <label className="label">Checklist Excel file</label>
          <input
            className="input-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => handleUpload(event.target.files?.[0])}
            disabled={loading}
          />
          <p className="muted">{loading ? "Uploading..." : uploadHint}</p>
          {fileName && <p className="file-name">Current file: {fileName}</p>}
        </div>

        <div className="panel">
          <label className="label" htmlFor="search">
            Search checklist items
          </label>
          <input
            id="search"
            className="input-text"
            placeholder="Type keyword or phrase..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <div className="panel">
          <p className="label">Show statuses</p>
          <div className="filter-row">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={
                  statusFilter.includes(status)
                    ? "filter-chip active"
                    : "filter-chip"
                }
                onClick={() => toggleStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="download-btn"
          onClick={downloadUpdatedChecklist}
          disabled={!rows.length}
        >
          Download Updated Checklist
        </button>
      </aside>

      <main className="main-content">
        <div className="top-banner">
          <div>
            <p className="eyebrow">AO MITTAL & ASSOCIATES LLP</p>
            <h2>GST Compliance Review Desk</h2>
            <p>Review by section, capture remarks, and finalize workbook output.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        <section className="metrics-grid">
          <article className="metric-card">
            <p>Total Items</p>
            <h3>{summary.total}</h3>
          </article>
          <article className="metric-card">
            <p>Yes</p>
            <h3>{summary.yes}</h3>
            <span>{formatPercent(summary.yes, summary.total)}</span>
          </article>
          <article className="metric-card">
            <p>No</p>
            <h3>{summary.no}</h3>
            <span>{formatPercent(summary.no, summary.total)}</span>
          </article>
          <article className="metric-card">
            <p>NA</p>
            <h3>{summary.na}</h3>
            <span>{formatPercent(summary.na, summary.total)}</span>
          </article>
        </section>

        {!rows.length && !error && (
          <section className="empty-state">
            Upload a checklist Excel file to start your audit review.
          </section>
        )}

        {!!rows.length && !filteredRows.length && (
          <section className="empty-state">
            No rows match the current search or status filters.
          </section>
        )}

        {groupedRows.map(([heading, headingRows]) => (
          <section key={heading} className="section-card">
            <div className="section-head">
              <h4>{heading || "Uncategorized Section"}</h4>
              <span>{headingRows.length} items</span>
            </div>

            {headingRows.map((row) => (
              <div className="checklist-row" key={row.id}>
                <div className="item-block">
                  <p className="item-text">{row.item}</p>
                  <span className={`status-badge ${row.status.toLowerCase()}`}>
                    {row.status}
                  </span>
                </div>

                <select
                  className="status-select"
                  value={row.status}
                  onChange={(event) =>
                    updateRow(row.id, "status", event.target.value)
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <input
                  className="comment-input"
                  value={row.comments}
                  onChange={(event) =>
                    updateRow(row.id, "comments", event.target.value)
                  }
                  placeholder="Add comments..."
                />
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

export default App;
