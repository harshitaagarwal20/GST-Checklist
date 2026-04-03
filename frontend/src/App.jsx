import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = ["Yes", "No", "NA"];
const DEFAULT_STATUS = "NA";
const DEFAULT_UPLOAD_HINT =
  "Upload your checklist workbook to begin GST audit review.";
const DEFAULT_FIRM_NAME = "Firm 1";

function buildFreshRowsFromTemplate(templateRows) {
  return templateRows.map((row, index) => ({
    ...row,
    id: index + 1,
    status: DEFAULT_STATUS,
    comments: ""
  }));
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function App() {
  const [firms, setFirms] = useState([
    {
      id: "firm-1",
      name: DEFAULT_FIRM_NAME,
      rows: [],
      fileName: "",
      uploadHint: DEFAULT_UPLOAD_HINT
    }
  ]);
  const [activeFirmId, setActiveFirmId] = useState("firm-1");
  const [showAddFirmModal, setShowAddFirmModal] = useState(false);
  const [modalFirmName, setModalFirmName] = useState("");
  const [templateRows, setTemplateRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState([...STATUS_OPTIONS]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeFirm = useMemo(
    () => firms.find((firm) => firm.id === activeFirmId) || firms[0],
    [firms, activeFirmId]
  );
  const rows = activeFirm?.rows || [];
  const fileName = activeFirm?.fileName || "";
  const uploadHint = activeFirm?.uploadHint || DEFAULT_UPLOAD_HINT;

  const filteredRows = useMemo(() => {
    let result = [...rows];

    result = result.filter((row) => statusFilter.includes(row.status));
    return result;
  }, [rows, statusFilter]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    for (const row of filteredRows) {
      const sectionName = row.heading || "Uncategorized Section";
      if (!groups.has(sectionName)) {
        groups.set(sectionName, []);
      }
      groups.get(sectionName).push(row);
    }
    return Array.from(groups.entries());
  }, [filteredRows]);

  const activeSection = groupedRows[activeSectionIndex] || null;

  useEffect(() => {
    if (!groupedRows.length) {
      setActiveSectionIndex(0);
      return;
    }

    if (activeSectionIndex >= groupedRows.length) {
      setActiveSectionIndex(0);
    }
  }, [groupedRows, activeSectionIndex]);

  function updateActiveFirm(patch) {
    setFirms((current) =>
      current.map((firm) =>
        firm.id === activeFirmId
          ? {
              ...firm,
              ...patch
            }
          : firm
      )
    );
  }

  function addFirm(nameOverride) {
    const trimmedName = String(nameOverride || "").trim();
    const nextIndex = firms.length + 1;
    const id = `firm-${Date.now()}`;
    const name = trimmedName || `Firm ${nextIndex}`;
    const rowsForFirm = templateRows.length ? buildFreshRowsFromTemplate(templateRows) : [];

    setFirms((current) => [
      ...current,
      {
        id,
        name,
        rows: rowsForFirm,
        fileName: fileName || "",
        uploadHint: templateRows.length
          ? "Checklist template applied. You can start filling this firm now."
          : DEFAULT_UPLOAD_HINT
      }
    ]);
    setActiveFirmId(id);
    setModalFirmName("");
    setShowAddFirmModal(false);
    setActiveSectionIndex(0);
    setStatusFilter([...STATUS_OPTIONS]);
  }

  function duplicateActiveFirm() {
    if (!activeFirm) {
      return;
    }
    const nextIndex = firms.length + 1;
    const id = `firm-${Date.now()}`;
    const duplicateRows = rows.map((row, index) => ({
      ...row,
      id: index + 1
    }));
    const duplicateName = `${activeFirm.name || `Firm ${nextIndex}`} Copy`;

    setFirms((current) => [
      ...current,
      {
        id,
        name: duplicateName,
        rows: duplicateRows,
        fileName: activeFirm.fileName || "",
        uploadHint: `Duplicated from ${activeFirm.name || DEFAULT_FIRM_NAME}.`
      }
    ]);
    setActiveFirmId(id);
    setActiveSectionIndex(0);
    setStatusFilter([...STATUS_OPTIONS]);
  }

  function deleteActiveFirm() {
    if (firms.length <= 1) {
      setError("At least one firm is required. You cannot delete the last firm.");
      return;
    }
    let nextActiveId = activeFirmId;
    setFirms((current) => {
      const currentIndex = current.findIndex((firm) => firm.id === activeFirmId);
      const nextFirms = current.filter((firm) => firm.id !== activeFirmId);
      const fallbackFirm = nextFirms[Math.max(0, currentIndex - 1)] || nextFirms[0];
      nextActiveId = fallbackFirm?.id || "";
      return nextFirms;
    });
    setActiveFirmId(nextActiveId);
    setError("");
    setActiveSectionIndex(0);
    setStatusFilter([...STATUS_OPTIONS]);
  }

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
      const data = await parseJsonSafely(response);

      if (!response.ok) {
        throw new Error(data?.error || "Upload failed.");
      }

      const uploadedRows = data?.rows || [];
      setTemplateRows(uploadedRows);
      updateActiveFirm({
        rows: uploadedRows,
        fileName: data?.fileName || file.name,
        uploadHint: "Workbook loaded. You can now review and update statuses."
      });
      setActiveSectionIndex(0);
    } catch (uploadError) {
      setError(uploadError.message || "Something went wrong while uploading.");
      updateActiveFirm({
        rows: [],
        fileName: "",
        uploadHint: DEFAULT_UPLOAD_HINT
      });
      setActiveSectionIndex(0);
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id, field, value) {
    updateActiveFirm({
      rows: rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    });
  }

  function updateFirmName(value) {
    updateActiveFirm({
      name: value
    });
  }

  function selectFirm(id) {
    setActiveFirmId(id);
    setActiveSectionIndex(0);
    setStatusFilter([...STATUS_OPTIONS]);
  }

  function syncTemplateToOtherFirms() {
    if (!templateRows.length) {
      setError("Upload one checklist first to sync template across firms.");
      return;
    }
    setError("");
    setFirms((current) =>
      current.map((firm) => {
        if (firm.id === activeFirmId) {
          return firm;
        }
        return {
          ...firm,
          rows: buildFreshRowsFromTemplate(templateRows),
          uploadHint: "Checklist template synced. Start filling this firm."
        };
      })
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
        body: JSON.stringify({
          rows,
          firmName: activeFirm?.name || DEFAULT_FIRM_NAME
        })
      });

      if (!response.ok) {
        const errData = await parseJsonSafely(response);
        throw new Error(errData?.error || "Download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeFirmName = (activeFirm?.name || "firm")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      link.download = `gst_audit_checklist_${safeFirmName || "firm"}_updated.xlsx`;
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
        <section className="firm-toolbar-card">
          <div className="firm-toolbar-head">
            <h3>Selected Firm</h3>
            <span>{firms.length} firm(s)</span>
          </div>
          <div className="firm-toolbar-grid">
            <select
              className="input-text"
              value={activeFirmId}
              onChange={(event) => selectFirm(event.target.value)}
            >
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </select>
            <input
              className="input-text"
              placeholder="Rename selected firm..."
              value={activeFirm?.name || ""}
              onChange={(event) => updateFirmName(event.target.value)}
            />
            <div className="firm-actions">
              <button
                type="button"
                className="section-nav-btn"
                onClick={() => {
                  setModalFirmName("");
                  setShowAddFirmModal(true);
                }}
              >
                Add Firm
              </button>
              <button type="button" className="section-nav-btn" onClick={duplicateActiveFirm}>
                Duplicate Firm
              </button>
              <button type="button" className="section-nav-btn danger-btn" onClick={deleteActiveFirm}>
                Delete Firm
              </button>
            </div>
            <button
              type="button"
              className="section-nav-btn sync-btn"
              onClick={syncTemplateToOtherFirms}
              disabled={!templateRows.length || firms.length < 2}
            >
              Sync Checklist To All Firms
            </button>
          </div>
        </section>

        <div className="top-banner">
          <div>
            <p className="eyebrow">AO MITTAL & ASSOCIATES LLP</p>
            <h2>
              GST Compliance Review Desk
            </h2>
            <p className="active-firm-text">Active firm: {activeFirm?.name || DEFAULT_FIRM_NAME}</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {!rows.length && !error && (
          <section className="empty-state">
            Upload a checklist Excel file to start your audit review.
          </section>
        )}

        {!!rows.length && (
          <>
            {!!rows.length && !filteredRows.length && (
              <section className="empty-state">
                No rows match the current search or status filters.
              </section>
            )}

            {!!activeSection && (
              <>
                <section className="section-nav-card">
                  <button
                    type="button"
                    className="section-nav-btn"
                    onClick={() => setActiveSectionIndex((index) => Math.max(index - 1, 0))}
                    disabled={activeSectionIndex === 0}
                  >
                    Previous Section
                  </button>

                  <div className="section-nav-center">
                    <label htmlFor="sectionSelect">Current Section</label>
                    <select
                      id="sectionSelect"
                      className="section-select"
                      value={activeSectionIndex}
                      onChange={(event) =>
                        setActiveSectionIndex(Number(event.target.value))
                      }
                    >
                      {groupedRows.map(([heading], index) => (
                        <option key={heading} value={index}>
                          {index + 1}. {heading}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="section-nav-btn"
                    onClick={() =>
                      setActiveSectionIndex((index) =>
                        Math.min(index + 1, groupedRows.length - 1)
                      )
                    }
                    disabled={activeSectionIndex === groupedRows.length - 1}
                  >
                    Next Section
                  </button>
                </section>

                <section className="section-card">
                  <div className="section-head">
                    <h4>{activeSection[0]}</h4>
                    <span>
                      Section {activeSectionIndex + 1} of {groupedRows.length} |{" "}
                      {activeSection[1].length} items
                    </span>
                  </div>

                  {activeSection[1].map((row) => (
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
              </>
            )}
          </>
        )}
      </main>

      {showAddFirmModal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowAddFirmModal(false);
            setModalFirmName("");
          }}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Add New Firm</h3>
            <p>Create another firm profile for independent checklist filling.</p>
            <input
              className="input-text modal-input"
              placeholder={`Firm ${firms.length + 1}`}
              value={modalFirmName}
              onChange={(event) => setModalFirmName(event.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="section-nav-btn"
                onClick={() => {
                  setShowAddFirmModal(false);
                  setModalFirmName("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="section-nav-btn"
                onClick={() => addFirm(modalFirmName)}
              >
                Create Firm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
