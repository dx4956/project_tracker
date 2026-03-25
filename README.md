# ProjectTrack

A collaborative project management app built with Flask. Create projects, organize tasks on a Kanban board, and invite team members — changes appear live for everyone on the same board without refreshing.

## Features

- **Authentication** — Signup, login, logout with hashed passwords
- **Recovery code** — Generated at signup, shown once; used to reset forgotten passwords without email
- **Multiple projects** — Each user can create and manage unlimited projects
- **Kanban board** — Drag and drop tasks between To Do / In Progress / Done columns
- **Task priorities** — None, Low, Moderate, High with color-coded badges
- **Team collaboration** — Owner invites members by username or email; members must have an account first
- **Role-based permissions** — Members can add and move tasks; only the owner can delete tasks, delete the project, or manage members
- **Real-time updates (SSE)** — Task moves, additions, deletions, and member changes are pushed live to every browser tab watching the same project
- **Change password** — Update password from the dashboard while logged in

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask 3 |
| ORM | Flask-SQLAlchemy (SQLite) |
| Auth | Flask-Login + Werkzeug password hashing |
| Real-time | Server-Sent Events (SSE) via `threading.Queue` |
| Frontend | Tailwind CSS (CDN), Vanilla JS |
| Database | SQLite (file-based, zero config) |

## Project Structure

```
project_tracker/
├── app.py                      # All routes, models, SSE infrastructure, business logic
├── requirements.txt
├── .gitignore
├── instance/
│   └── projecttracker.db       # Auto-created SQLite database
├── templates/
│   ├── base.html               # Shared layout, Nunito font, cartoony CSS system
│   ├── dashboard.html          # Project cards grid + new project modal
│   ├── project.html            # Kanban board + member panel
│   ├── auth/
│   │   ├── login.html
│   │   ├── signup.html
│   │   ├── forgot_password.html
│   │   └── recovery_code.html  # View-once recovery code display
│   └── settings/
│       └── password.html       # Change password (logged-in)
└── static/
    └── js/
        └── kanban.js           # Drag-and-drop, task CRUD, member management, SSE client
```

## Getting Started

**1. Create and activate a virtual environment**

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

**2. Install dependencies**

```bash
pip install -r requirements.txt
```

**3. Run the app**

```bash
python app.py
```

The database is created automatically on first run. Open `http://127.0.0.1:5000` in your browser.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `change-this-in-production` | Flask session signing key — **change before deploying** |

```bash
# Windows
set SECRET_KEY=your-random-secret-here

# macOS / Linux
export SECRET_KEY=your-random-secret-here
```

---

## Real-Time Updates (SSE)

### How it works

When a user opens a project board, their browser opens a persistent HTTP connection to `/project/<id>/stream`. The server keeps this connection alive and pushes small text messages down it whenever something changes — no polling, no WebSockets, no external dependencies.

This is **Server-Sent Events (SSE)**: a standard browser API built on plain HTTP, where the server streams `text/event-stream` responses. The browser's `EventSource` object reconnects automatically if the connection drops.

### Why SSE instead of WebSockets

WebSockets are bidirectional and require an async server (eventlet, gevent, or uvicorn). SSE is one-way (server → client) which is all a Kanban board needs — the browser already sends changes to the server via regular `fetch()` calls. SSE works on Flask's default threaded dev server with no extra packages.

### Project-scoped queues — the design

The core problem: when Alice moves a task, only people viewing **that same project** should see the update. People on different projects should not receive it.

```
_sse_queues = {
    project_id_1: { Queue(Alice), Queue(Bob) },
    project_id_2: { Queue(Carol) },
    project_id_3: { Queue(Dave), Queue(Eve) },
}
```

Each connected browser tab gets its own `queue.Queue`. Queues are grouped by `project_id`. When something changes in project 1, only the queues in `_sse_queues[1]` receive the event. Project 2 and 3 are untouched.

`_sse_lock` is a `threading.Lock` that serialises access to `_sse_queues` because Flask runs each request in its own thread — multiple threads could add/remove queues at the same time without it.

### SSE functions in `app.py`

#### `_sse_push(project_id, event_type, data)`

Broadcasts one event to every client currently watching a specific project.

```
event_type examples: 'task_created', 'task_updated', 'task_deleted',
                     'member_added', 'member_removed'
data: a plain dict that gets JSON-serialised into the event body
```

Steps:
1. Serialises `data` to a JSON string and formats it as an SSE frame: `event: <type>\ndata: <json>\n\n`
2. Acquires the lock, then iterates every `Queue` in `_sse_queues[project_id]`
3. Calls `q.put_nowait(payload)` on each queue — non-blocking; if a queue is full (client is too slow, `maxsize=64`) it's marked as dead and removed
4. Releases the lock

This function is called at the end of every API endpoint that mutates data, after the database commit succeeds.

#### `project_stream(project_id)` — route `GET /project/<id>/stream`

The SSE endpoint. Handles one browser tab for one project.

Steps:
1. Checks the user is a member of the project — returns 403 if not
2. Creates a new `queue.Queue(maxsize=64)` and registers it in `_sse_queues[project_id]`
3. Returns a `Response` wrapping a generator function (`generate()`) with `mimetype='text/event-stream'`

The `generate()` generator runs for the lifetime of the connection:
- Yields `": connected\n\n"` immediately so the browser confirms the stream opened
- Enters an infinite loop calling `q.get(timeout=20)`:
  - If a payload arrives before 20 seconds, it yields the payload to the browser
  - If nothing arrives in 20 seconds (`queue.Empty`), it yields `": heartbeat\n\n"` — a comment that keeps the TCP connection alive through proxies and load balancers without triggering any client-side event handler
- The `finally` block runs when the browser disconnects (tab closed, navigated away, network drop): removes this queue from `_sse_queues[project_id]` so it stops receiving events and gets garbage-collected

`stream_with_context` is required so the generator can access Flask's request context (needed for `login_required` and any context-local objects) even though it runs outside the normal request lifecycle.

`X-Accel-Buffering: no` disables Nginx's response buffering so events reach the browser immediately instead of being held until the buffer fills.

---

## SSE Client — `kanban.js` Function Reference

### SSE setup

#### `initSSE()` (IIFE at bottom of file)

Opens the `EventSource` connection and registers all event handlers. Wrapped in an immediately-invoked function expression so it runs once on page load without polluting the global scope.

The key design decision in every handler: **idempotent checks instead of tracking who sent what**. Rather than attaching a user ID to every event and filtering on the client, each handler checks whether the DOM already reflects the change. If it does, the handler exits silently. This means:

- The user who made the change already applied it optimistically — their handler is a no-op
- Any other user on the board sees the change applied

**`task_created` handler**
Checks if a `.task-card[data-id="<id>"]` already exists in the DOM. If yes, the current user just created it and the optimistic insert already happened — skip. If no, calls `appendTaskCard()` to build and insert the card, then `updateCounts()`.

**`task_updated` handler**
Looks up the card by `data-id`. Checks `card.dataset.container` against the incoming `task.container`. If they match, the card is already in the right column (current user just dragged it) — skip. Otherwise moves the card DOM node into the correct column, then calls `updateEmptyStates()` and `updateCounts()`.

**`task_deleted` handler**
Looks up the card. If it's already gone (current user just deleted it) — skip silently. Otherwise fades the card out with a CSS transition, removes it from the DOM after 200 ms, then calls `updateEmptyStates()` and `updateCounts()`.

**`member_added` handler**
Checks for an existing `#member-row-<id>` in the member list. If absent, calls `appendMemberRow()` to insert the new row and shows a `showToast()` notification ("username joined the project").

**`member_removed` handler**
Removes `#member-row-<id>` from the DOM if it exists.

**`onerror` handler**
Set to a no-op. The browser's `EventSource` implementation automatically retries the connection after a short delay — no custom reconnect logic is needed.

---

### Drag and drop

#### `onDragStart(e, card)`
Called when a drag begins. Saves a reference to the dragged card in `draggedCard`, adds the `dragging` CSS class (reduces opacity + rotates slightly), and sets `effectAllowed = 'move'` on the data transfer object to signal this is a move not a copy.

#### `onDragEnd(e, card)`
Called when a drag ends (whether dropped or cancelled). Clears `draggedCard`, removes the `dragging` class, and strips the `drag-over` highlight from all column bodies.

#### `onDragOver(e)`
Called every few milliseconds while a dragged item is over a valid drop target. Calls `e.preventDefault()` to signal the target accepts drops (without this the browser plays a "not allowed" cursor and blocks `drop`). Sets `dropEffect = 'move'`.

#### `onDragEnter(e, col)`
Called when the dragged card first enters a column body. Adds the `drag-over` CSS class to draw the dashed highlight border around the column.

#### `onDragLeave(e, col)`
Called when the dragged card leaves a column body. Uses `col.contains(e.relatedTarget)` to check whether the pointer moved to a child element inside the column (not a real leave) vs. actually leaving — only removes `drag-over` on a real leave.

#### `onDrop(e, col)` (async)
Called when the card is released over a column. The full move sequence:

1. Removes the `drag-over` highlight
2. Reads `newContainer` from `col.dataset.container` — exits early if same column
3. **Optimistic update** — immediately moves the card DOM node into the new column and calls `updateEmptyStates()` and `updateCounts()` so the UI feels instant
4. Sends a `PATCH /project/<id>/task/<tid>` request with `{ container: newContainer }`
5. On success: nothing extra to do — the server then fires `_sse_push` which other clients pick up
6. On failure: **rollback** — moves the card back to its original column and shows an error toast

---

### Task management

#### `openAddModal(container)`
Opens the Add Task modal for a specific column. Clears the title/description fields, resets the priority selector to "None", updates the column label subtitle, calls `openModal()`, and focuses the title input after a short delay.

#### `submitAddTask()` (async)
Reads the form fields from the modal. If the title is empty, flashes a red outline on the input and returns. Otherwise closes the modal immediately (so the UI doesn't feel sluggish), sends `POST /project/<id>/task`, then calls `appendTaskCard()` on success. On failure, shows a toast and the user can try again.

#### `appendTaskCard(task, container)`
Builds a task card DOM node from a task dict and inserts it before the empty placeholder in the target column. Constructs the priority badge with the correct colour, the description (clamped to 2 lines), and the delete button (only if `IS_OWNER`). Attaches `dragstart` and `dragend` listeners directly to the element. Called both from `submitAddTask()` and from the SSE `task_created` handler.

#### `deleteTask(taskId, btn)` (async)
Finds the parent `.task-card` from the clicked button. Immediately fades it out (optimistic). Sends `DELETE /project/<id>/task/<tid>`. On success removes the node and updates counts. On failure restores visibility and shows a toast.

---

### Member management

#### `submitAddMember()` (async)
Reads the member input field. Sends `POST /project/<id>/member` with `{ identifier }`. On success clears the input and calls `appendMemberRow()`. On failure shows the error message inline below the input field (not a toast, since the user needs to read it and correct their input).

#### `appendMemberRow(user)`
Builds a member list item and appends it to `#memberList` inside the Team modal. The row has a dark background (`#13101f`) matching the theme. Includes the user's initials avatar, username, and a Remove button (styled as a danger button with an offset shadow). Called from both `submitAddMember()` and the SSE `member_added` handler.

#### `removeMember(userId, username)` (async)
Shows a `confirm()` dialog. On confirmation sends `DELETE /project/<id>/member/<uid>`. On success removes the `#member-row-<uid>` DOM node. On failure shows a toast.

---

### UI helpers

#### `openModal(id)`
Sets `el.style.display = 'flex'` on the modal backdrop. Attaches a one-time click listener on the backdrop itself (not its children) so clicking the dark overlay closes the modal.

#### `closeModal(id)`
Sets `el.style.display = 'none'`. Called by close buttons, cancel buttons, the Escape key handler, and internally after form submissions.

#### `updateCounts()`
Iterates the three column bodies, counts `.task-card` children in each, and updates the `#count-todo`, `#count-doing`, `#count-done` badge text.

#### `updateEmptyStates()`
For each column body, checks whether any `.task-card` children exist. Adds or removes the `hidden` class on `.empty-placeholder` accordingly — showing the dashed "Drop here" area only when a column is empty.

#### `showToast(message, type)`
Creates a positioned `div`, styles it as a coloured pill (red for error, green for success) with an offset box shadow, appends it to `<body>`, then fades it out and removes it after 3 seconds. Used for async operation feedback without blocking the UI.

#### `escHtml(str)`
Escapes `&`, `<`, `>`, `"`, `'` to their HTML entities before inserting user-supplied strings into `innerHTML`. Prevents XSS in dynamically built task cards and member rows.

---

## API Reference

### Tasks

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/project/<id>/task` | Member | Create a task |
| `PATCH` | `/project/<id>/task/<tid>` | Member | Update container / title / description / priority |
| `DELETE` | `/project/<id>/task/<tid>` | Owner only | Delete a task |

### Members

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/project/<id>/member` | Owner only | Add member by username or email |
| `DELETE` | `/project/<id>/member/<uid>` | Owner only | Remove a member |

### Real-time

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/project/<id>/stream` | Member | SSE stream for this project — keeps connection open and pushes events |

**SSE event types**

| Event | Payload | Trigger |
|---|---|---|
| `task_created` | Full task dict | A member adds a task |
| `task_updated` | Full task dict | A member moves or edits a task |
| `task_deleted` | `{ id }` | Owner deletes a task |
| `member_added` | `{ id, username, initials, email }` | Owner adds a member |
| `member_removed` | `{ id }` | Owner removes a member |

---

## Permissions

| Action | Owner | Member |
|---|---|---|
| Add tasks | yes | yes |
| Move tasks (drag-drop) | yes | yes |
| Edit task priority / description | yes | yes |
| Delete tasks | yes | no |
| Delete project | yes | no |
| Add / remove members | yes | no |

---

## Password Reset (No Email)

This app uses a **recovery code** system instead of email-based reset.

1. **Signup** — A one-time recovery code is generated and shown immediately after account creation. The page warns the user it will never be shown again.
2. **Forgot password** — Login page → *Forgot?* → enter email, recovery code, and new password. On success, the old code is invalidated and a new one is shown once.
3. **Change password** — While logged in, open the user menu → *Change password* — requires current password, no recovery code needed.

**Recovery code format**

```
be30-d00d-5103-8633-3df4-b971
```

- 96 bits of entropy (`secrets.token_hex(12)`)
- Stored as a bcrypt hash — never in plaintext
- Dashes are cosmetic; enter it with or without them
- Invalidated immediately after a successful password reset

> If the recovery code is lost there is no way to recover the account. Keep it in a password manager or somewhere safe.

---

## Database Models

```
User            — id, username, email, password_hash, recovery_code_hash, created_at
Project         — id, title, description, color, owner_id, created_at
ProjectMember   — id, project_id, user_id, role (owner|member), joined_at
Task            — id, project_id, title, description, container, priority, created_by, created_at
```
