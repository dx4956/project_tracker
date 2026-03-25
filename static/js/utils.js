"use strict";

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function updateCounts() {
  ["todo", "doing", "done"].forEach((id) => {
    const col = document.getElementById(`col-${id}`);
    const count = col.querySelectorAll(".task-card").length;
    document.getElementById(`count-${id}`).textContent = count;
  });
}

function updateEmptyStates() {
  document.querySelectorAll(".col-body").forEach((col) => {
    const hasCards = col.querySelectorAll(".task-card").length > 0;
    const placeholder = col.querySelector(".empty-placeholder");
    if (placeholder) placeholder.classList.toggle("hidden", hasCards);
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  el.style.display = "flex";
  el.addEventListener("click", function handler(e) {
    if (e.target === el) {
      closeModal(id);
      el.removeEventListener("click", handler);
    }
  });
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function showToast(message, type = "error") {
  const isErr = type === "error";
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed; top:16px; right:16px; z-index:9999;
    padding:12px 18px; border-radius:12px; font-size:13px; font-weight:900;
    border:2.5px solid ${isErr ? "#b02030" : "#04a076"};
    box-shadow:4px 4px 0 #07050f;
    font-family:'Nunito',sans-serif;
    background:${isErr ? "#e84855" : "#06d6a0"};
    color:${isErr ? "#fff" : "#003d2a"};
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
