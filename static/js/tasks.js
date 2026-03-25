"use strict";

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
