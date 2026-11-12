import "./style.css";
import {
  fields,
  storageKey,
  validateNotes,
  mergePages,
  escapeHtml as h,
  captureFor,
  dateLabel,
  countWord,
  ordinal,
} from "./model.js";

const icons = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>',
  desktop:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8m-4-4v4"/></svg>',
  mobile:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg>',
  expand:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6m0 6 7-7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M6 18 18 6"/></svg>',
};
let project,
  manifest,
  notes,
  active,
  device = "desktop",
  mode = "side",
  single = "after";
let storageMessage = "",
  busy = false;
const app = document.querySelector("#app");
let noticeTimer;
const toast = (message) => {
  clearTimeout(noticeTimer);
  document.querySelector("#notice").textContent = message;
  noticeTimer = setTimeout(() => {
    document.querySelector("#notice").textContent = "";
  }, 8000);
};
const currentPages = () => mergePages(project, notes);
const current = () => currentPages().find((p) => p.id === active);
const capture = (page, side) => captureFor(manifest, page, device, side);
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function persist() {
  try {
    localStorage.setItem(storageKey(project.id), JSON.stringify(notes));
    storageMessage = "";
    return true;
  } catch {
    storageMessage =
      "Your browser could not save these notes. They remain in this tab. Download notes to keep a copy.";
    return false;
  }
}
function setQuery() {
  const url = new URL(location.href);
  url.searchParams.set("page", active);
  url.searchParams.set("device", device);
  url.searchParams.set("view", mode);
  history.replaceState(null, "", url);
}
function shell() {
  app.innerHTML = `
  <header class="site-header"><a class="wordmark" href="./" aria-label="Before and After home"><span class="mark" aria-hidden="true"><i></i><i></i></span>before <span class="amp">&</span> after<span class="wordmark-tag">A website review</span></a>
    <div class="header-actions"><button class="text-button" id="manage" aria-label="Project notes">Project notes <span aria-hidden="true">↗</span></button><button class="button button-dark" id="export">${icons.download}<span>Export PDF</span></button></div></header>
  <main><section class="intro" aria-labelledby="project-title"><div class="intro-copy"><p class="eyebrow"><span class="orange-dot"></span>${h(project.eyebrow)} <span class="eyebrow-divider">/</span> ${h(project.name)}</p>
    <h1 id="project-title">${h(project.title.split("\n")[0])}<br><em>${h(project.title.split("\n").slice(1).join(" "))}</em></h1><p class="intro-text">${h(project.intro)}</p></div>
    <aside class="project-card"><span class="mini-label">The project</span><h2>${h(project.name)}</h2><p>${h(project.tagline)}</p><div class="project-status"><span></span>${h(project.labels.after)}</div><p class="small">${h(project.labels.statusDetail)}</p></aside></section>
  <section id="comparison" class="workspace" aria-label="Website comparison" tabindex="-1"><aside class="page-sidebar"><p class="eyebrow">Explore the changes</p><nav id="page-nav" aria-label="Pages to compare"></nav><div class="sidebar-note"><span class="mini-label">A fair comparison</span><p>Same viewport.<br>Real captures.<br>Then and next.</p><a href="#capture-details">About these captures ↓</a></div></aside>
    <div class="review"><div class="review-toolbar"><div class="segmented" role="group" aria-label="Capture device"><button data-device="desktop">${icons.desktop}Desktop</button><button data-device="mobile">${icons.mobile}Mobile</button></div><div class="segmented view-controls" role="group" aria-label="Comparison layout"><button data-mode="side">Side by side</button><button data-mode="toggle">Toggle</button></div></div>
    <div id="review-content"></div></div></section>
  <section class="closing"><span class="mini-label">Made for a closer look</span><h2>Take the conversation <br><em>off-screen.</em></h2><div><p>Keep all ${countWord(project.pages.length)} comparisons together in a considered, side-by-side PDF. Your notes come with it.</p><button class="button button-outline" id="export-bottom">Download the review ${icons.download}</button><span class="small export-detail">${project.pages.length} pages · A3 landscape · Selected device</span></div></section></main>
  <footer class="site-footer"><span>Before & After <span class="muted">/ Web Tools</span></span><span>${h(project.name)} · ${h(project.labels.footer)}</span></footer>
  <div id="notice" class="notice" role="status" aria-live="polite"></div>
  <dialog id="editor" aria-labelledby="editor-title"></dialog><dialog id="inspector" aria-labelledby="inspector-title"></dialog><dialog id="manager" aria-labelledby="manager-title"></dialog>`;
  document
    .querySelectorAll("#export, #export-bottom")
    .forEach((b) => b.addEventListener("click", exportPdf));
  document.querySelector("#manage").addEventListener("click", openManager);
  document.querySelectorAll("[data-device]").forEach((b) =>
    b.addEventListener("click", () => {
      device = b.dataset.device;
      update();
    }),
  );
  document.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      update();
    }),
  );
  for (const d of document.querySelectorAll("dialog"))
    d.addEventListener("click", (e) => {
      if (
        e.target === d &&
        (e.clientX < d.getBoundingClientRect().left ||
          e.clientX > d.getBoundingClientRect().right ||
          e.clientY < d.getBoundingClientRect().top ||
          e.clientY > d.getBoundingClientRect().bottom)
      )
        d.close();
    });
  update();
  if (storageMessage) toast(storageMessage);
}
function figure(page, side) {
  const c = capture(page, side);
  return `<figure class="capture-card ${side}"><figcaption><span><i class="capture-dot"></i>${side === "before" ? "Before" : "After"}<small>${h(project.labels[side])}</small></span><button class="icon-button inspect" data-side="${side}" aria-label="Enlarge ${side} ${h(page.label)} capture" ${c ? "" : "disabled"}>${icons.expand}</button></figcaption>
  <div class="capture-mat ${device}">${c ? `<button class="image-button inspect" data-side="${side}" aria-label="Inspect ${side} ${h(page.label)} screenshot"><img src="${h(c.src)}" alt="${h(page.label)}, ${h(project.labels[side].toLowerCase())}, ${device} capture" width="${c.viewport.width}" height="${c.viewport.height}"></button><div class="image-error" hidden><strong>Capture unavailable</strong><p>The image could not load.</p><button class="button retry-image" data-side="${side}">Retry image</button></div>` : '<div class="missing"><strong>No capture yet</strong><p>Prepare this capture, then reload the review.</p></div>'}</div>
  <div class="capture-meta"><span>${c ? `${c.viewport.width} × ${c.viewport.height} · ${dateLabel(c.capturedAt)}` : "Not captured"}</span>${c ? `<a href="${h(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${side} ${h(page.label)} website in a new tab">Visit site ↗</a>` : ""}</div></figure>`;
}
function update() {
  setQuery();
  const page = current();
  const index = project.pages.findIndex((p) => p.id === active);
  document.querySelector("#page-nav").innerHTML = project.pages
    .map(
      (p, i) =>
        `<button class="page-link ${p.id === active ? "active" : ""}" data-page="${p.id}" ${p.id === active ? 'aria-current="page"' : ""}><span class="page-number">${ordinal(i + 1)}</span><span>${h(p.label)}</span><span class="nav-arrow" aria-hidden="true">↗</span></button>`,
    )
    .join("");
  document.querySelectorAll("[data-page]").forEach((b) =>
    b.addEventListener("click", () => {
      active = b.dataset.page;
      update();
      document.querySelector(`[data-page="${active}"]`).focus();
    }),
  );
  document
    .querySelectorAll("[data-device]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.device === device)),
    );
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
    );
  document.querySelector("#review-content").innerHTML =
    `<div class="review-heading"><div><span class="mini-label">${ordinal(index + 1)} / ${h(page.label)}</span><h2>${h(page.heading)}</h2><p>${h(page.summary)}</p></div><button class="text-button edit-notes">Edit notes <span aria-hidden="true">↗</span></button></div>
  ${mode === "toggle" ? `<div class="toggle-row"><span>One frame. Two perspectives.</span><div class="segmented" role="group" aria-label="Visible version"><button data-single="before" aria-pressed="${single === "before"}">Before</button><button data-single="after" aria-pressed="${single === "after"}">After</button></div></div>` : ""}
  <div class="comparison-grid ${mode} device-${device}">${mode === "side" ? figure(page, "before") + figure(page, "after") : figure(page, single)}</div>
  <div class="notes-grid"><div><span class="mini-label">The starting point</span><p>${h(page.beforeNote)}</p></div><div><span class="mini-label accent">${h(project.labels.afterNote)}</span><p>${h(page.afterNote)}</p></div></div>
  <details id="capture-details"><summary>About these captures <span>Sources & context</span></summary><div class="details-body"><p>These are frozen first-screen captures, not live websites. Both versions use the same ${project.devices[device].width} × ${project.devices[device].height} viewport. They show the public pages as captured; no page content has been removed. The original baseline is preserved when the newer captures are refreshed.</p><p>${h(project.labels.context)}</p>${[
    "before",
    "after",
  ]
    .map((s) => {
      const c = capture(page, s);
      return c
        ? `<p><strong>${s === "before" ? "Before" : "After"}:</strong> <a href="${h(c.url)}" target="_blank" rel="noopener noreferrer">${h(c.url)}</a><br>Captured ${h(new Date(c.capturedAt).toLocaleString("en-GB", { timeZone: "Europe/London" }))} (London time).</p>`
        : "";
    })
    .join("")}</div></details>
  <div class="review-pagination"><span>${ordinal(index + 1)} <span class="muted">/ ${ordinal(project.pages.length)}</span></span><button class="text-button" id="next-page">${index === project.pages.length - 1 ? `Back to ${h(project.pages[0].label)}` : `Next: ${h(project.pages[index + 1].label)}`} ${icons.arrow}</button></div>`;
  document.querySelector(".edit-notes").addEventListener("click", openEditor);
  document.querySelector("#next-page").addEventListener("click", () => {
    active = project.pages[(index + 1) % project.pages.length].id;
    update();
    document.querySelector("#comparison").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    document.querySelector("#next-page").focus();
  });
  document.querySelectorAll("[data-single]").forEach((b) =>
    b.addEventListener("click", () => {
      single = b.dataset.single;
      update();
      document.querySelector(`[data-single="${single}"]`).focus();
    }),
  );
  document
    .querySelectorAll(".inspect")
    .forEach((b) => b.addEventListener("click", () => inspect(b.dataset.side)));
  document.querySelectorAll(".image-button img").forEach((img) => {
    const fail = () => {
      img.parentElement.hidden = true;
      img.parentElement.nextElementSibling.hidden = false;
    };
    img.addEventListener("error", fail);
    if (img.complete && !img.naturalWidth) fail();
  });
  document.querySelectorAll(".retry-image").forEach((b) =>
    b.addEventListener("click", () => {
      update();
      toast(
        "Retrying the capture. If it still fails, reload the page or check the capture files.",
      );
    }),
  );
}
function inspect(side) {
  const c = capture(current(), side);
  const dialog = document.querySelector("#inspector");
  dialog.innerHTML = `<div class="dialog-header"><div><span class="mini-label">${device} / ${side}</span><h2 id="inspector-title">${h(current().label)} — a closer look</h2></div><button class="icon-button close-dialog" aria-label="Close enlarged screenshot">${icons.close}</button></div><div class="inspector-toolbar"><p class="inspector-hint">The complete capture, fitted to your screen.</p><div class="segmented" role="group" aria-label="Screenshot zoom"><button data-zoom="fit" aria-pressed="true">Fit to screen</button><button data-zoom="original" aria-pressed="false">Original size</button></div></div><div class="inspector-scroll" tabindex="0" aria-label="Screenshot view"><img src="${h(c.src)}" width="${c.viewport.width}" height="${c.viewport.height}" alt="Enlarged ${side} ${h(current().label)} screenshot"></div>`;
  dialog.querySelector(".close-dialog").onclick = () => dialog.close();
  dialog.querySelectorAll("[data-zoom]").forEach((button) =>
    button.addEventListener("click", () => {
      const original = button.dataset.zoom === "original";
      const stage = dialog.querySelector(".inspector-scroll");
      stage.classList.toggle("original-size", original);
      stage.scrollTo(0, 0);
      dialog
        .querySelectorAll("[data-zoom]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      dialog.querySelector(".inspector-hint").textContent = original
        ? "Original resolution. Scroll to explore the details."
        : "The complete capture, fitted to your screen.";
    }),
  );
  dialog.showModal();
}
function openEditor() {
  const page = current();
  const dialog = document.querySelector("#editor");
  const labels = {
    heading: "Page headline",
    summary: "Introduction",
    beforeNote: "The starting point",
    afterNote: project.labels.afterNote,
  };
  dialog.innerHTML = `<form id="notes-form"><div class="dialog-header"><div><span class="mini-label">${h(page.label)} / Your perspective</span><h2 id="editor-title">Make the notes your own.</h2></div><button type="button" class="icon-button close-dialog" aria-label="Close notes editor">${icons.close}</button></div><p class="dialog-intro">Your notes stay in this browser and appear in the PDF. Download a copy from Project notes to move them elsewhere.</p>${Object.entries(
    fields,
  )
    .map(
      ([key, limit]) =>
        `<label class="field">${h(labels[key])}<textarea name="${key}" rows="${key === "heading" ? 2 : 3}" maxlength="${limit}" required>${h(page[key])}</textarea><span class="small">Up to ${limit} characters</span></label>`,
    )
    .join(
      "",
    )}<div class="dialog-footer"><button type="button" class="text-button close-dialog">Cancel</button><button class="button button-dark" type="submit">Save notes ${icons.arrow}</button></div></form>`;
  dialog
    .querySelectorAll(".close-dialog")
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    for (const input of dialog.querySelectorAll("textarea")) {
      input.setCustomValidity(
        input.value.trim() ? "" : "Please add a short note.",
      );
      if (!input.reportValidity()) return;
    }
    notes.pages[active] = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        v.trim().replace(/\s+/g, " "),
      ]),
    );
    const saved = persist();
    dialog.close();
    update();
    toast(
      saved
        ? "Notes saved in this browser. Your next PDF will include them."
        : storageMessage,
    );
    document.querySelector(".edit-notes").focus();
  };
  dialog
    .querySelectorAll("textarea")
    .forEach((t) => (t.oninput = () => t.setCustomValidity("")));
  dialog.showModal();
}
function openManager() {
  const dialog = document.querySelector("#manager");
  dialog.innerHTML = `<div class="dialog-header"><div><span class="mini-label">${h(project.name)}</span><h2 id="manager-title">Your project notes.</h2></div><button class="icon-button close-dialog" aria-label="Close project notes">${icons.close}</button></div><p class="dialog-intro">The captures stay fixed. Your words are saved on this device. Download notes to keep a backup or transfer them to another browser.</p><div class="manager-actions"><button class="button button-dark" id="download-notes">${icons.download} Download notes</button><label class="button button-outline upload-label">Import notes<input type="file" id="import-notes" accept=".json,application/json"></label></div><p id="manager-status" class="manager-status" role="status">${h(storageMessage || "Notes are private to this browser. Nothing is sent to a server.")}</p><div class="reset-section"><h3>Return to the original notes</h3><p>This replaces your notes for all ${countWord(project.pages.length)} pages. Download a copy first if you want to keep them.</p><button class="text-button" id="reset-notes">Reset all notes</button><div id="reset-confirm" hidden><p>Replace your notes with the original project copy?</p><button class="button button-outline" id="confirm-reset">Yes, reset notes</button> <button class="text-button" id="cancel-reset">Keep my notes</button></div></div>`;
  dialog.querySelector(".close-dialog").onclick = () => dialog.close();
  dialog.querySelector("#download-notes").onclick = () => {
    download(
      new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" }),
      `${project.id}-notes.json`,
    );
    dialog.querySelector("#manager-status").textContent =
      "Notes downloaded. Keep this file to restore your edits.";
  };
  dialog.querySelector("#import-notes").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 50000)
        throw new Error(
          "This file is too large. Choose an exported notes JSON file.",
        );
      const imported = validateNotes(JSON.parse(await file.text()), project);
      // Preserve unmentioned pages; the import replaces only explicitly supplied page notes.
      notes = { ...notes, pages: { ...notes.pages, ...imported.pages } };
      const saved = persist();
      update();
      dialog.querySelector("#manager-status").textContent = saved
        ? "Notes imported and saved. Your PDF will use this copy."
        : storageMessage;
    } catch (e) {
      dialog.querySelector("#manager-status").textContent =
        `Import failed. ${e instanceof SyntaxError ? "The file is not valid JSON." : e.message} Your existing notes are unchanged.`;
    }
    e.target.value = "";
  };
  dialog.querySelector("#reset-notes").onclick = () => {
    dialog.querySelector("#reset-confirm").hidden = false;
    dialog.querySelector("#confirm-reset").focus();
  };
  dialog.querySelector("#cancel-reset").onclick = () => {
    dialog.querySelector("#reset-confirm").hidden = true;
    dialog.querySelector("#reset-notes").focus();
  };
  dialog.querySelector("#confirm-reset").onclick = () => {
    notes = { version: 1, projectId: project.id, pages: {} };
    const saved = persist();
    update();
    dialog.close();
    toast(saved ? "Original project notes restored." : storageMessage);
  };
  dialog.showModal();
}
async function exportPdf() {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("#export, #export-bottom")];
  const old = buttons.map((b) => b.innerHTML);
  buttons.forEach((b) => {
    b.disabled = true;
    b.textContent = "Preparing PDF…";
  });
  toast(
    `Preparing all ${countWord(project.pages.length)} comparisons. Your review will download shortly.`,
  );
  const snapshot = {
    project,
    pages: structuredClone(currentPages()),
    manifest,
    device,
  };
  try {
    const { createPdf } = await import("./pdf.js");
    const blob = await createPdf(snapshot);
    download(blob, `${project.id}-comparison-${snapshot.device}.pdf`);
    toast(
      `Your PDF is ready. All ${countWord(project.pages.length)} pages include your current notes.`,
    );
  } catch (e) {
    console.error(e);
    toast(
      "PDF export failed. Your notes are safe in this tab. Check the captures and your connection, then select Export PDF to retry.",
    );
  } finally {
    busy = false;
    buttons.forEach((b, i) => {
      b.disabled = false;
      b.innerHTML = old[i];
    });
  }
}
async function boot() {
  try {
    const results = await Promise.all(
      ["project.json", "captures/manifest.json"].map(async (path) => {
        const r = await fetch(path);
        if (!r.ok) throw new Error(`Could not load ${path}`);
        return r.json();
      }),
    );
    [project, manifest] = results;
    active = project.pages[0].id;
    notes = { version: 1, projectId: project.id, pages: {} };
    try {
      const stored = localStorage.getItem(storageKey(project.id));
      if (stored) notes = validateNotes(JSON.parse(stored), project);
    } catch {
      storageMessage =
        "Saved notes could not be loaded. Original notes are shown. Import a backup through Project notes, or edit and download a new copy.";
    }
    const params = new URLSearchParams(location.search);
    if (project.pages.some((p) => p.id === params.get("page")))
      active = params.get("page");
    if (params.get("device") === "mobile") device = "mobile";
    if (params.get("view") === "toggle") mode = "toggle";
    shell();
  } catch (e) {
    app.innerHTML =
      '<main class="boot"><p class="eyebrow">Before & After</p><h1>The review couldn’t load.</h1><p>Your saved notes have not been changed. Check your connection and try again.</p><button class="button button-dark" id="retry-boot">Try again</button></main>';
    document.querySelector("#retry-boot").onclick = boot;
    console.error(e);
  }
}
boot();
