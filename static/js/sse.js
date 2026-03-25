"use strict";

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
