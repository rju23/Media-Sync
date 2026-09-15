const { exec, spawn } = require("child_process");
const path = require("path");

const sessionsDiv = document.getElementById("sessions");
const projectDir = __dirname;

let allSessions = [];
let selectedSessions = [];
let syncActive = false;
let syncInterval = null;
let lastStates = {};
let isToggling = false;  // Lock to prevent cascade
let activeProcesses = [];  // Track all child processes

// --- Cleanup on exit ---
window.addEventListener("beforeunload", () => {
  stopSync();
  // Kill all tracked child processes
  activeProcesses.forEach(p => {
    try { p.kill("SIGKILL"); } catch (e) {}
  });
  activeProcesses = [];
});

// --- Core: run dotnet commands ---
function runDotnet(args) {
  return new Promise((resolve) => {
    const exePath = path.join(projectDir, "bin", "helper", "MediaSessionHelper.exe");
    const proc = exec(
      `"${exePath}" ${args}`,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // Remove from tracked processes when done
        activeProcesses = activeProcesses.filter(p => p !== proc);

        if (error) {
          console.error("dotnet error:", error.message);
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          console.error("JSON parse error:", e, stdout);
          resolve(null);
        }
      }
    );
    activeProcesses.push(proc);
  });
}

// --- Load sessions ---
async function loadSessions() {
  const data = await runDotnet("get");
  if (!data) return;

  allSessions = data.sessions || [];

  // Keep selected sessions up to date with latest status
  selectedSessions = selectedSessions.map(sel => {
    const fresh = allSessions.find(s => s.app_key === sel.app_key);
    return fresh || sel;
  });

  if (!syncActive) {
    renderSessions();
  }
}

// --- Render sessions (selection screen) ---
function renderSessions() {
  if (allSessions.length === 0) {
    sessionsDiv.innerHTML = `<p>No active media sessions found. Play something in Spotify, Chrome, etc.</p>`;
    return;
  }

  const sel1 = selectedSessions[0];
  const sel2 = selectedSessions[1];

  // Sync button requirements check
  let syncBlocked = null;
  if (selectedSessions.length === 2) {
    const status1 = sel1.status;
    const status2 = sel2.status;
    const onePlayingOnePaused =
      (status1 === "Playing" && status2 === "Paused") ||
      (status1 === "Paused" && status2 === "Playing");

    if (!onePlayingOnePaused) {
      if (status1 === status2 && status1 === "Playing") {
        syncBlocked = "Both are playing — pause one before starting sync.";
      } else if (status1 === status2 && status1 === "Paused") {
        syncBlocked = "Both are paused — play one before starting sync.";
      } else {
        syncBlocked = "One must be playing and one must be paused to start sync.";
      }
    }
  } else {
    syncBlocked = "Select exactly 2 sources.";
  }

  const canSync = !syncBlocked;

  let html = `<h2>Active Media Sessions</h2>
    <p>Select exactly 2 sources to sync:</p><div>`;

  allSessions.forEach((session, index) => {
    const isSelected = selectedSessions.some(s => s.app_key === session.app_key);
    const isDisabled = !isSelected && selectedSessions.length >= 2;
    const statusIcon = session.status === "Playing" ? "▶️" : "⏸️";

    html += `
      <label style="display:block; margin:10px 0; cursor:${isDisabled ? "not-allowed" : "pointer"}; opacity:${isDisabled ? "0.4" : "1"};">
        <input type="checkbox" value="${index}"
               ${isSelected ? "checked" : ""}
               ${isDisabled ? "disabled" : ""}
               onchange="toggleSelection(${index})" />
        <strong>${session.app}</strong> — ${statusIcon} ${session.status}
        ${session.title
          ? `<span style="color:#aaa; font-size:13px;"> · ${session.title}${session.artist ? ` by ${session.artist}` : ""}</span>`
          : ""}
      </label>`;
  });

  html += `</div>`;

  if (syncBlocked && selectedSessions.length === 2) {
    html += `<p style="color:#f0ad4e; font-size:13px; margin-top:10px;">⚠️ ${syncBlocked}</p>`;
  }

  html += `
    <button onclick="startSync()"
      ${canSync ? "" : "disabled"}
      style="margin-top:15px; padding:10px 20px; border:none; border-radius:4px;
             cursor:${canSync ? "pointer" : "not-allowed"};
             background:${canSync ? "#28a745" : "#555"}; color:white;">
      ${canSync ? "Start Sync" : `Start Sync (${selectedSessions.length}/2 selected)`}
    </button>`;

  sessionsDiv.innerHTML = html;
}

// --- Render sync status screen ---
function renderSyncStatus() {
  const s1 = selectedSessions[0];
  const s2 = selectedSessions[1];
  const state1 = lastStates[s1.app_key] || "...";
  const state2 = lastStates[s2.app_key] || "...";
  const icon = (s) => s === "Playing" ? "▶️" : "⏸️";

  sessionsDiv.innerHTML = `
    <div style="background:#1a3a2a; padding:20px; border-radius:8px; border:1px solid #2d6a4f;">
      <h3 style="margin-top:0;">🔄 Sync Active</h3>
      <p><strong>${s1.app}</strong>: ${icon(state1)} ${state1}</p>
      <p><strong>${s2.app}</strong>: ${icon(state2)} ${state2}</p>
      <p style="font-size:12px; color:#aaa; margin-top:15px;">
        Pause one — the other plays. Play one — the other pauses.
      </p>
      <button onclick="stopSync()"
        style="margin-top:10px; padding:8px 16px; border:none; border-radius:4px;
               background:#dc3545; color:white; cursor:pointer;">
        Stop Sync
      </button>
    </div>`;
}

// --- Selection ---
function toggleSelection(index) {
  const session = allSessions[index];
  const isSelected = selectedSessions.some(s => s.app_key === session.app_key);

  if (isSelected) {
    selectedSessions = selectedSessions.filter(s => s.app_key !== session.app_key);
  } else if (selectedSessions.length < 2) {
    selectedSessions.push(session);
  }

  renderSessions();
}

// --- Sync ---
async function startSync() {
  if (selectedSessions.length !== 2) return;

  // Snapshot current states as the truth
  const data = await runDotnet("get");
  if (!data) return;

  data.sessions.forEach(s => {
    lastStates[s.app_key] = s.status;
  });

  // Double-check the one-playing-one-paused rule
  const s1status = lastStates[selectedSessions[0].app_key];
  const s2status = lastStates[selectedSessions[1].app_key];
  const valid =
    (s1status === "Playing" && s2status === "Paused") ||
    (s1status === "Paused" && s2status === "Playing");

  if (!valid) {
    renderSessions();
    return;
  }

  syncActive = true;
  isToggling = false;
  renderSyncStatus();

  // Poll every 700ms
  syncInterval = setInterval(syncTick, 700);
}

async function syncTick() {
  if (!syncActive || isToggling) return;

  const data = await runDotnet("get");
  if (!data || !syncActive) return;

  const s1 = selectedSessions[0];
  const s2 = selectedSessions[1];

  const fresh = {};
  data.sessions.forEach(s => { fresh[s.app_key] = s.status; });

  const prev1 = lastStates[s1.app_key];
  const prev2 = lastStates[s2.app_key];
  const curr1 = fresh[s1.app_key] || prev1;
  const curr2 = fresh[s2.app_key] || prev2;

  const changed1 = curr1 !== prev1;
  const changed2 = curr2 !== prev2;

  if (changed1 && !changed2) {
    // s1 changed — react on s2
    const desired2 = curr1 === "Playing" ? "Paused" : "Playing";
    if (curr2 !== desired2) {
      isToggling = true;
      await runDotnet(`toggle ${s2.app_key}`);
      // Wait for the toggle to settle before polling again
      await new Promise(r => setTimeout(r, 1000));
      isToggling = false;
    }
  } else if (changed2 && !changed1) {
    // s2 changed — react on s1
    const desired1 = curr2 === "Playing" ? "Paused" : "Playing";
    if (curr1 !== desired1) {
      isToggling = true;
      await runDotnet(`toggle ${s1.app_key}`);
      await new Promise(r => setTimeout(r, 1000));
      isToggling = false;
    }
  }

  // Enforce: two can never be in the same state
  if (curr1 === curr2 && !isToggling) {
    // States are the same — something went wrong, correct s2
    const desired2 = curr1 === "Playing" ? "Paused" : "Playing";
    isToggling = true;
    console.warn(`State mismatch detected (both ${curr1}) — correcting ${s2.app_key}`);
    await runDotnet(`toggle ${s2.app_key}`);
    await new Promise(r => setTimeout(r, 1000));
    isToggling = false;
  }

  // Only update tracked state after settling
  if (!isToggling) {
    if (curr1) lastStates[s1.app_key] = curr1;
    if (curr2) lastStates[s2.app_key] = curr2;
    renderSyncStatus();
  }
}

function stopSync() {
  syncActive = false;
  isToggling = false;

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  // Kill any in-flight dotnet processes
  activeProcesses.forEach(p => {
    try { p.kill("SIGKILL"); } catch (e) {}
  });
  activeProcesses = [];
  lastStates = {};

  if (!window.isUnloading) {
    selectedSessions = [];
    loadSessions();
  }
}

// --- Init ---
window.isUnloading = false;
window.addEventListener("beforeunload", () => {
  window.isUnloading = true;
  stopSync();
});

loadSessions();
setInterval(() => {
  if (!syncActive) loadSessions();
}, 3000);