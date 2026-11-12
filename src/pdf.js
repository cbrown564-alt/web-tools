import { jsPDF } from "jspdf";
import { captureFor, dateLabel } from "./model.js";

const colours = {
  ink: "#263536",
  muted: "#616966",
  accent: "#a4472a",
  paper: "#f5f3ec",
  line: "#d9dcd4",
};
async function bytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return new Uint8Array(await r.arrayBuffer());
}
function base64(data) {
  let result = "";
  for (let i = 0; i < data.length; i += 8192)
    result += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(result);
}
export async function createPdf({ project, pages, manifest, device }) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a3",
    compress: true,
  });
  const [regular, bold] = await Promise.all(
    ["fonts/lato-regular.ttf", "fonts/lato-bold.ttf"].map(bytes),
  );
  doc.addFileToVFS("Lato-Regular.ttf", base64(regular));
  doc.addFont("Lato-Regular.ttf", "Lato", "normal");
  doc.addFileToVFS("Lato-Bold.ttf", base64(bold));
  doc.addFont("Lato-Bold.ttf", "Lato", "bold");
  doc.setProperties({
    title: `${project.name} | Before & After`,
    subject: `${device} website comparison - proposed redesign`,
    author: "Web Tools",
    creator: "Before & After",
  });
  const text = (
    value,
    x,
    y,
    {
      size = 11,
      colour = colours.ink,
      bold = false,
      width,
      lineHeight = 1.4,
    } = {},
  ) => {
    doc.setFont("Lato", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(colour);
    doc.setLineHeightFactor(lineHeight);
    const lines = width ? doc.splitTextToSize(value, width) : value;
    doc.text(lines, x, y);
    return Array.isArray(lines)
      ? lines.length * size * 0.3528 * lineHeight
      : size * 0.3528 * lineHeight;
  };
  for (const [index, page] of pages.entries()) {
    if (index) doc.addPage("a3", "landscape");
    doc.setFillColor(colours.paper);
    doc.rect(0, 0, 420, 297, "F");
    doc.setFillColor(colours.ink);
    doc.rect(16, 14, 2.5, 6, "F");
    doc.setFillColor(colours.accent);
    doc.rect(20, 14, 2.5, 6, "F");
    text("before & after", 26, 19, { size: 12, bold: true });
    text(`${project.name.toUpperCase()} / WEBSITE REVIEW`, 249, 19, {
      size: 9,
      colour: colours.muted,
    });
    doc.setDrawColor(colours.line);
    doc.line(16, 25, 404, 25);
    text(`0${index + 1} / ${page.label.toUpperCase()}`, 16, 35, {
      size: 9,
      colour: colours.accent,
      bold: true,
    });
    text(page.heading, 16, 47, { size: 24, width: 388, lineHeight: 1.15 });
    text(page.summary, 16, 61, { size: 11, width: 355, colour: colours.muted });
    const colWidth = 187;
    const imageTop = 88;
    const imageHeight = 136.35;
    for (const [side, x] of [
      ["before", 16],
      ["after", 217],
    ]) {
      const capture = captureFor(manifest, page, device, side);
      if (!capture)
        throw new Error(`Missing ${page.id} ${device} ${side} capture`);
      text(
        side === "before"
          ? "BEFORE / CURRENT WEBSITE"
          : "AFTER / PROPOSED REDESIGN",
        x,
        80,
        {
          size: 9,
          bold: true,
          colour: side === "after" ? colours.accent : colours.muted,
        },
      );
      doc.setFillColor(side === "after" ? "#e2e8df" : "#e9ece6");
      doc.rect(x, imageTop, colWidth, imageHeight, "F");
      const png = await bytes(capture.src);
      const width = Math.min(
        colWidth,
        (imageHeight * capture.viewport.width) / capture.viewport.height,
      );
      const height = (width * capture.viewport.height) / capture.viewport.width;
      doc.addImage(
        png,
        "PNG",
        x + (colWidth - width) / 2,
        imageTop + (imageHeight - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
      doc.setDrawColor("#bcc5bb");
      doc.rect(x, imageTop, colWidth, imageHeight);
      text(
        `${device === "desktop" ? "Desktop" : "Mobile"} / ${capture.viewport.width} x ${capture.viewport.height} / ${dateLabel(capture.capturedAt)}`,
        x,
        231,
        { size: 8, colour: colours.muted },
      );
      text(
        side === "before" ? "THE STARTING POINT" : "THE PROPOSED CHANGE",
        x,
        241,
        {
          size: 9,
          bold: true,
          colour: side === "after" ? colours.accent : colours.ink,
        },
      );
      text(page[`${side}Note`], x, 249, { size: 11, width: colWidth - 3 });
      text(capture.url, x, 273, {
        size: 7,
        colour: colours.muted,
        width: colWidth,
      });
      doc.link(x, 269, colWidth, 6, { url: capture.url });
    }
    doc.setDrawColor(colours.line);
    doc.line(16, 280, 404, 280);
    text(
      "First-screen captures. Preview for discussion. Not client approval or a production launch.",
      16,
      287,
      { size: 8, colour: colours.muted },
    );
    text(
      `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`,
      388,
      287,
      { size: 9, colour: colours.muted },
    );
  }
  return doc.output("blob");
}
