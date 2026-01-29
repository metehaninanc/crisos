import { useEffect, useMemo, useState } from "react";
import {
  adminCreateRow,
  adminDeleteRow,
  adminGetTable,
  adminUpdateRow,
} from "../../app/api";

const TABLE_CONFIG = {
  supply_points: {
    labels: {
      city_name: "City",
      category: "Category",
      name: "Location Name",
      address: "Address",
      description: "Description",
      phone: "Phone",
      updated_at: "Updated",
    },
    order: ["city_name", "category", "name", "address", "description", "phone", "updated_at"],
    formHidden: ["updated_at"],
    select: {
      category: ["food", "water", "baby_food", "hygiene_kit", "accommodation"],
    },
  },
  contact_points: {
    labels: {
      city_name: "City",
      name: "Institution",
      address: "Address",
      description: "Description",
      phone: "Phone",
    },
    order: ["city_name", "name", "address", "phone", "description"],
  },
  emergency_numbers: {
    labels: {
      city_name: "City",
      label: "Institution",
      scope: "Scope",
      phone: "Phone",
    },
    order: ["scope", "city_name", "label", "phone"],
    select: {
      scope: ["national", "city"],
    },
  },
  users: {
    labels: {
      username: "Username",
      user_type: "User Type",
      created_at: "Created",
      password: "Password",
      password_confirm: "Confirm Password",
    },
    order: ["username", "password", "password_confirm", "user_type", "created_at"],
    formHidden: ["created_at", "password_hash"],
    select: {
      user_type: ["admin", "operator"],
    },
    passwords: true,
  },
};

const MULTILINE_FIELDS = new Set([
  "content",
  "description",
  "message_body",
  "summary_json",
]);

const inputTypeFor = (column) => {
  if (!column?.data_type) return "text";
  if (column.data_type === "password") return "password";
  if (column.data_type.includes("int")) return "number";
  if (column.data_type.includes("numeric")) return "number";
  return "text";
};

const isMultiline = (column) =>
  column.data_type === "text" &&
  (column.name.length > 12 || MULTILINE_FIELDS.has(column.name));

const buildOrderedNames = (columns, config) => {
  const baseNames = columns.map((col) => col.name);
  const order = config.order && config.order.length ? config.order : baseNames;
  const ordered = [];
  order.forEach((name) => {
    if (baseNames.includes(name) && !ordered.includes(name)) {
      ordered.push(name);
    }
  });
  baseNames.forEach((name) => {
    if (!ordered.includes(name)) {
      ordered.push(name);
    }
  });
  return ordered;
};

export default function TableManager({ token, tableName }) {
  const [columns, setColumns] = useState([]);
  const [primaryKey, setPrimaryKey] = useState(null);
  const [rows, setRows] = useState([]);
  const [formData, setFormData] = useState({});
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [error, setError] = useState(null);

  const config = TABLE_CONFIG[tableName] || {};
  const formHidden = new Set(config.formHidden || []);
  const labels = config.labels || {};
  const selectOptions = config.select || {};
  const listHidden = useMemo(() => {
    const hidden = new Set(config.listHidden || []);
    if (primaryKey) {
      hidden.add(primaryKey);
    }
    hidden.add("password_hash");
    return hidden;
  }, [config.listHidden, primaryKey]);

  useEffect(() => {
    if (!token || !tableName) return;
    adminGetTable(token, tableName)
      .then((data) => {
        setColumns(data.columns || []);
        setPrimaryKey(data.primary_key);
        setRows(data.rows || []);
        setError(null);
        setFormData({});
      })
      .catch((err) => setError(err.message));
  }, [token, tableName]);

  const columnMap = useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      map[col.name] = col;
    });
    return map;
  }, [columns]);

  const orderedNames = useMemo(
    () => buildOrderedNames(columns, config),
    [columns, config]
  );

  const formFields = useMemo(() => {
    if (!columns.length) return [];
    const base = orderedNames
      .filter((name) => name !== primaryKey)
      .filter((name) => !formHidden.has(name))
      .map((name) => columnMap[name]);

    if (config.passwords) {
      const passwordFields = [
        { name: "password", data_type: "password", nullable: false },
        { name: "password_confirm", data_type: "password", nullable: false },
      ];
      return base.filter((field) => field.name !== "password_hash").concat(passwordFields);
    }

    return base;
  }, [columns, orderedNames, primaryKey, formHidden, columnMap, config]);

  const tableColumns = useMemo(() => {
    if (!columns.length) return [];
    return orderedNames
      .filter((name) => columnMap[name] && !listHidden.has(name))
      .map((name) => columnMap[name]);
  }, [columns, orderedNames, columnMap, listHidden]);

  const labelFor = (name) => {
    if (labels[name]) return labels[name];
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const validatePasswords = (data) => {
    const password = data.password || "";
    const confirm = data.password_confirm || "";
    if (!password && !confirm) {
      return { ok: true, payload: { ...data } };
    }
    if (password !== confirm) {
      return { ok: false, message: "Passwords do not match." };
    }
    const payload = { ...data };
    delete payload.password_confirm;
    return { ok: true, payload };
  };

  const handleCreate = () => {
    let payload = { ...formData };
    if (config.passwords) {
      const result = validatePasswords(payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      payload = result.payload;
      if (!payload.password) {
        setError("Password is required.");
        return;
      }
    }

    adminCreateRow(token, tableName, payload)
      .then(() => adminGetTable(token, tableName))
      .then((data) => {
        setRows(data.rows || []);
        setFormData({});
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  const handleEditSave = (rowId) => {
    let payload = { ...editData };
    if (config.passwords) {
      const result = validatePasswords(payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      payload = result.payload;
      if (!payload.password) {
        delete payload.password;
      }
    }

    adminUpdateRow(token, tableName, rowId, payload)
      .then(() => adminGetTable(token, tableName))
      .then((data) => {
        setRows(data.rows || []);
        setEditId(null);
        setEditData({});
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  const handleDelete = (rowId) => {
    if (!window.confirm("Delete this row?")) return;
    adminDeleteRow(token, tableName, rowId)
      .then(() => adminGetTable(token, tableName))
      .then((data) => setRows(data.rows || []))
      .catch((err) => setError(err.message));
  };

  return (
    <div className="min-w-0 rounded-3xl border border-clay/70 bg-white/80 p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{labelFor(tableName)}</p>
        {error && <p className="text-xs text-ember">{error}</p>}
      </div>

      <div className="mt-4 grid gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ash">
          Add new
        </p>
          <div className="grid gap-3 md:grid-cols-2">
            {formFields.map((column) => (
              <label key={column.name} className="flex flex-col gap-1 text-xs">
              <span className="text-ash">{labelFor(column.name)}</span>
              {selectOptions[column.name] ? (
                <select
                  value={formData[column.name] || ""}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      [column.name]: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60"
                >
                  <option value="">Select</option>
                  {selectOptions[column.name].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : isMultiline(column) ? (
                <textarea
                  value={formData[column.name] || ""}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      [column.name]: event.target.value,
                    }))
                  }
                  className="min-h-[80px] rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60"
                />
              ) : (
                <input
                  type={inputTypeFor(column)}
                  value={formData[column.name] || ""}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      [column.name]: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60"
                />
              )}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="self-end rounded-2xl bg-slate px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Add
        </button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-ash">
            <tr>
              {tableColumns.map((column) => (
                <th key={column.name} className="py-2 pr-4">
                  {labelFor(column.name)}
                </th>
              ))}
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {rows.map((row) => {
              const isProtectedUser =
                tableName === "users" && row.username === "crisos_admin";
              return (
              <tr
                key={row[primaryKey] ?? JSON.stringify(row)}
                className="border-t border-clay/50"
              >
                {tableColumns.map((column) => {
                  const value = row[column.name] ?? "";
                  if (
                    editId === row[primaryKey] &&
                    column.name !== primaryKey &&
                    !formHidden.has(column.name)
                  ) {
                    return (
                      <td key={column.name} className="py-2 pr-4">
                        {selectOptions[column.name] ? (
                          <select
                            value={editData[column.name] ?? value ?? ""}
                            onChange={(event) =>
                              setEditData((prev) => ({
                                ...prev,
                                [column.name]: event.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-clay/60 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Select</option>
                            {selectOptions[column.name].map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={inputTypeFor(column)}
                            value={editData[column.name] ?? value ?? ""}
                            onChange={(event) =>
                              setEditData((prev) => ({
                                ...prev,
                                [column.name]: event.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-clay/60 bg-white px-2 py-1 text-xs"
                          />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={column.name} className="py-2 pr-4">
                      {String(value)}
                    </td>
                  );
                })}
                <td className="py-2">
                  {isProtectedUser ? (
                    <span className="text-[10px] font-semibold uppercase text-ash">
                      Locked
                    </span>
                  ) : editId === row[primaryKey] ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditSave(row[primaryKey])}
                        className="rounded-full border border-sky/40 bg-sky/20 px-3 py-1 text-[10px] font-semibold uppercase text-slate"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(null);
                          setEditData({});
                        }}
                        className="rounded-full border border-clay/80 bg-clay/40 px-3 py-1 text-[10px] font-semibold uppercase text-ash"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(row[primaryKey]);
                          setEditData({});
                        }}
                        className="rounded-full border border-slate/10 bg-white px-3 py-1 text-[10px] font-semibold uppercase text-slate"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row[primaryKey])}
                        className="rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-[10px] font-semibold uppercase text-ember"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
