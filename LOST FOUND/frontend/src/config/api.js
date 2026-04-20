const normalizeApiBase = (value) => {
  const base = String(value || "").trim().replace(/\/+$/, "");
  return base.replace(/\/api$/i, "");
};

export const API_BASE = normalizeApiBase(
  process.env.REACT_APP_API_URL || "http://localhost:8000",
);
