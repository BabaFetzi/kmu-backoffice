export const EMPLOYEE_COLOR_PALETTE = [
  "#38BDF8",
  "#34D399",
  "#F59E0B",
  "#F472B6",
  "#818CF8",
  "#14B8A6",
  "#FB7185",
  "#22D3EE",
  "#A3E635",
  "#F97316",
  "#2DD4BF",
  "#60A5FA",
];

export function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^#?[0-9a-fA-F]{6}$/);
  if (!match) return null;
  return `#${raw.replace("#", "").toUpperCase()}`;
}

function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function hashSeed(seed) {
  const str = String(seed || "employee");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickEmployeeHexColor(seed) {
  const index = hashSeed(seed) % EMPLOYEE_COLOR_PALETTE.length;
  return EMPLOYEE_COLOR_PALETTE[index];
}

export function resolveEmployeeHexColor({ employeeUserId, employeeName, employeeColorByUserId = {} }) {
  const profileColor = employeeUserId ? normalizeHexColor(employeeColorByUserId[employeeUserId]) : null;
  if (profileColor) return profileColor;
  const fallbackSeed = employeeUserId || employeeName || "employee";
  return pickEmployeeHexColor(fallbackSeed);
}

export function toEmployeeEventColor(hexColor) {
  const rgb = hexToRgb(hexColor) || { r: 56, g: 189, b: 248 };
  return {
    bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`,
    bgSoft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
    bgStrong: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.34)`,
    border: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.86)`,
    accent: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.96)`,
    text: "#0F172A",
  };
}

export function resolveEmployeeEventColor(input) {
  const hex = resolveEmployeeHexColor(input);
  return {
    hex,
    ...toEmployeeEventColor(hex),
  };
}
