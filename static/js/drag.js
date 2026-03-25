"use strict";

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let draggedCard = null;

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
