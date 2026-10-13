const KEY = "cine-scope-sidebar-v1";
export function readSidebarOpen() {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}
export function writeSidebarOpen(open) {
  localStorage.setItem(KEY, String(open));
}
