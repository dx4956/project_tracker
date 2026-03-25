"use strict";

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
