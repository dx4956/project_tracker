"use strict";

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["addTaskModal", "memberModal"].forEach(closeModal);
  }
  if (e.key === "Enter" && !e.shiftKey) {
    const modal = document.getElementById("addTaskModal");
    if (modal && modal.style.display !== "none") {
      if (document.activeElement?.id !== "taskDesc") submitAddTask();
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const mi = document.getElementById("memberInput");
  if (mi)
    mi.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitAddMember();
    });
});
