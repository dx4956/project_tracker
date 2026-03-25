"use strict";

// ─── State ────────────────────────────────────────────────────────────────────
let draggedCard = null;

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

function onDragStart(e, card) {
  draggedCard = card;
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd(e, card) {
  card.classList.remove("dragging");
  draggedCard = null;
  document
    .querySelectorAll(".col-body")
    .forEach((col) => col.classList.remove("drag-over"));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onDragEnter(e, col) {
  e.preventDefault();
  if (draggedCard) col.classList.add("drag-over");
}

function onDragLeave(e, col) {
  if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over");
}

async function onDrop(e, col) {
  e.preventDefault();
  col.classList.remove("drag-over");
  if (!draggedCard) return;

  const newContainer = col.dataset.container;
  const taskId = parseInt(draggedCard.dataset.id);
  const oldContainer = draggedCard.dataset.container;
  if (newContainer === oldContainer) return;

  // Optimistic update
  draggedCard.dataset.container = newContainer;
  col.insertBefore(draggedCard, col.querySelector(".empty-placeholder"));
  updateEmptyStates();
  updateCounts();

  try {
    const res = await fetch(`/project/${PROJECT_ID}/task/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ container: newContainer }),
    });
    if (!res.ok) throw new Error();
  } catch {
    showToast("Could not move task. Try again.", "error");
    draggedCard.dataset.container = oldContainer;
    const orig = document.getElementById(`col-${oldContainer}`);
    orig.insertBefore(draggedCard, orig.querySelector(".empty-placeholder"));
    updateEmptyStates();
    updateCounts();
  }
}

// ─── Add Task ─────────────────────────────────────────────────────────────────

let pendingContainer = null;
const COL_LABELS = { todo: "To Do", doing: "In Progress", done: "Done" };

function openAddModal(container) {
  pendingContainer = container;
  document.getElementById("taskTitle").value = "";
  document.getElementById("taskDesc").value = "";
  document.querySelector('input[name="taskPriority"][value="none"]').checked =
    true;
  document.getElementById("addTaskColLabel").textContent =
    "→ " + COL_LABELS[container];
  openModal("addTaskModal");
  setTimeout(() => document.getElementById("taskTitle").focus(), 50);
}

async function submitAddTask() {
  const titleEl = document.getElementById("taskTitle");
  const title = titleEl.value.trim();
  if (!title) {
    titleEl.focus();
    titleEl.style.outline = "3px solid #e84855";
    setTimeout(() => (titleEl.style.outline = ""), 1500);
    return;
  }

  const priority =
    document.querySelector('input[name="taskPriority"]:checked')?.value ||
    "none";
  const description = document.getElementById("taskDesc").value.trim();

  closeModal("addTaskModal");

  try {
    const res = await fetch(`/project/${PROJECT_ID}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority,
        container: pendingContainer,
      }),
    });
    if (!res.ok) throw new Error();
    const task = await res.json();
    appendTaskCard(task, pendingContainer);
    updateCounts();
  } catch {
    showToast("Could not add task. Try again.", "error");
  }
}

function appendTaskCard(task, container) {
  const col = document.getElementById(`col-${container}`);
  const placeholder = col.querySelector(".empty-placeholder");

  const badgeStyle = {
    high: "background:#e84855; color:#fff;    border:2px solid rgba(0,0,0,0.3);",
    moderate:
      "background:#f5a500; color:#1a0900; border:2px solid rgba(0,0,0,0.2);",
    low: "background:#06d6a0; color:#003d2a; border:2px solid rgba(0,0,0,0.2);",
  };

  const priorityBadge =
    task.priority !== "none"
      ? `<span style="${badgeStyle[task.priority]} font-size:10px; font-weight:900; text-transform:uppercase;
                    letter-spacing:0.05em; padding:2px 9px; border-radius:99px;">${task.priority}</span>`
      : "<span></span>";

  const descHtml = task.description
    ? `<p style="font-size:11px; color:#6a6485; font-weight:700; margin:7px 0 0 8px; line-height:1.5;
                 display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
                 white-space:pre-line;">${escHtml(task.description)}</p>`
    : "";

  const deleteBtn = IS_OWNER
    ? `<button onclick="deleteTask(${task.id}, this)" title="Delete"
         style="background:none; border:none; cursor:pointer; font-size:15px; font-weight:900;
                color:#3a3455; line-height:1; padding:0; flex-shrink:0; margin-top:1px; transition:color 0.1s;"
         onmouseover="this.style.color='#e84855'" onmouseout="this.style.color='#3a3455'">&#x2715;</button>`
    : "";

  const div = document.createElement("div");
  div.className = "task-card";
  div.draggable = true;
  div.dataset.id = task.id;
  div.dataset.container = container;
  div.addEventListener("dragstart", (e) => onDragStart(e, div));
  div.addEventListener("dragend", (e) => onDragEnd(e, div));

  div.innerHTML = `
    <div style="display:flex; align-items:flex-start; gap:8px; padding-left:8px;">
      <p style="flex:1; font-size:13px; font-weight:800; line-height:1.4; color:#e8e4ff; margin:0;">
        ${escHtml(task.title)}
      </p>
      ${deleteBtn}
    </div>
    ${descHtml}
    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px; padding-left:8px;">
      ${priorityBadge}
      <span style="font-size:10px; color:#3a3455; font-weight:700;">${escHtml(task.created_at)}</span>
    </div>
  `;

  col.insertBefore(div, placeholder);
  updateEmptyStates();
}

// ─── Delete Task ──────────────────────────────────────────────────────────────

async function deleteTask(taskId, btn) {
  if (!IS_OWNER) return;
  const card = btn.closest(".task-card");
  if (!card) return;

  card.style.transition = "opacity 0.15s, transform 0.15s";
  card.style.opacity = "0";
  card.style.transform = "scale(0.9)";

  try {
    const res = await fetch(`/project/${PROJECT_ID}/task/${taskId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error();
    card.remove();
    updateEmptyStates();
    updateCounts();
  } catch {
    card.style.opacity = "1";
    card.style.transform = "";
    showToast("Could not delete task.", "error");
  }
}

// ─── Members ──────────────────────────────────────────────────────────────────

async function submitAddMember() {
  if (!IS_OWNER) return;

  const input = document.getElementById("memberInput");
  const errEl = document.getElementById("memberError");
  const identifier = input.value.trim();

  errEl.style.display = "none";

  if (!identifier) {
    input.focus();
    return;
  }

  try {
    const res = await fetch(`/project/${PROJECT_ID}/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || "Something went wrong.";
      errEl.style.display = "block";
      return;
    }
    input.value = "";
    appendMemberRow(data);
  } catch {
    errEl.textContent = "Network error. Please try again.";
    errEl.style.display = "block";
  }
}

function appendMemberRow(user) {
  const list = document.getElementById("memberList");
  const li = document.createElement("li");
  li.id = `member-row-${user.id}`;
  li.style.cssText = `display:flex; align-items:center; justify-content:space-between;
    background:#13101f; border:2.5px solid #3a3650; border-radius:12px; padding:10px 14px;`;

  li.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="width:34px; height:34px; border-radius:50%; border:2.5px solid #3a3650;
                  background:#4f46e5; color:white; font-size:11px; font-weight:900;
                  display:flex; align-items:center; justify-content:center; flex-shrink:0;
                  box-shadow:2px 2px 0 0 #07050f;">
        ${escHtml(user.initials)}
      </div>
      <span style="font-size:13px; font-weight:800; color:#e8e4ff;">${escHtml(user.username)}</span>
    </div>
    <button onclick="removeMember(${user.id}, '${escHtml(user.username)}')"
      style="border:2.5px solid #b02030; border-radius:10px; font-weight:900; font-size:11px;
             padding:5px 12px; cursor:pointer; box-shadow:2px 2px 0 #07050f;
             background:#e84855; color:white; font-family:'Nunito',sans-serif;
             transition:box-shadow 0.1s, transform 0.1s;"
      onmouseover="this.style.boxShadow='3px 3px 0 #07050f'; this.style.transform='translate(-1px,-1px)';"
      onmouseout="this.style.boxShadow='2px 2px 0 #07050f'; this.style.transform='';">
      Remove
    </button>
  `;
  list.appendChild(li);
}

async function removeMember(userId, username) {
  if (!IS_OWNER) return;
  if (!confirm(`Remove ${username} from this project?`)) return;

  try {
    const res = await fetch(`/project/${PROJECT_ID}/member/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to remove member.", "error");
      return;
    }
    document.getElementById(`member-row-${userId}`)?.remove();
  } catch {
    showToast("Network error.", "error");
  }
}

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

// ─── SSE — real-time updates scoped to this project ───────────────────────────

(function initSSE() {
  const evtSource = new EventSource(`/project/${PROJECT_ID}/stream`);

  // ── Task created by someone else ──
  evtSource.addEventListener("task_created", (e) => {
    const task = JSON.parse(e.data);
    if (task.by === CURRENT_USER_ID) return;
    appendTaskCard(task, task.container);
    updateCounts();
  });

  // ── Task moved or edited by someone else ──
  evtSource.addEventListener("task_updated", (e) => {
    const task = JSON.parse(e.data);
    if (task.by === CURRENT_USER_ID) return;
    const card = document.querySelector(`.task-card[data-id="${task.id}"]`);
    if (!card) return;
    card.dataset.container = task.container;
    const col = document.getElementById(`col-${task.container}`);
    if (col) {
      col.insertBefore(card, col.querySelector(".empty-placeholder"));
      updateEmptyStates();
      updateCounts();
    }
  });

  // ── Task deleted by someone else ──
  evtSource.addEventListener("task_deleted", (e) => {
    const { id, by } = JSON.parse(e.data);
    if (by === CURRENT_USER_ID) return;
    const card = document.querySelector(`.task-card[data-id="${id}"]`);
    if (!card) return;
    card.style.transition = "opacity 0.2s, transform 0.2s";
    card.style.opacity = "0";
    card.style.transform = "scale(0.9)";
    setTimeout(() => {
      card.remove();
      updateEmptyStates();
      updateCounts();
    }, 200);
  });

  // ── Member added ──
  evtSource.addEventListener("member_added", (e) => {
    const user = JSON.parse(e.data);
    if (user.by === CURRENT_USER_ID) return;
    appendMemberRow(user);
  });

  // ── Member removed ──
  evtSource.addEventListener("member_removed", (e) => {
    const { id, by } = JSON.parse(e.data);
    if (by === CURRENT_USER_ID) return;
    document.getElementById(`member-row-${id}`)?.remove();
  });

  // Reconnect silently on error — browser will retry automatically
  evtSource.onerror = (e) => {
    if (evtSource.readyState === EventSource.CLOSED) {
      evtSource.close(); // Stop the infinite retries
    }
  };
})();
