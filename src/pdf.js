import { jsPDF } from "jspdf";
import { captureFor, dateLabel } from "./model.js";

const colours = { ink: "#263536", muted: "#616966", accent: "#a4472a" };
// A3 landscape, in millimetres.
const page = { width: 420, height: 297, margin: 14, gap: 8 };
const colWidth = (page.width - page.margin * 2 - page.gap) / 2;
const imageTop = 62;
// Tall (mobile) captures are limited by height so the notes still fit beneath.
const maxImageHeight = 180;

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
    title: `${project.name} | Before & after`,
    subject: `${device} website comparison - ${project.labels.after.toLowerCase()}`,
    author: "Web Tools",
    creator: "Before & After",
  });
  // Draws text and returns the height it used, so following text can flow.
  const text = (
    value,
    x,
    y,
    {
      size = 11,
      colour = colours.ink,
      bold = false,
      width,
      align = "left",
      lineHeight = 1.4,
    } = {},
  ) => {
    doc.setFont("Lato", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(colour);
    doc.setLineHeightFactor(lineHeight);
    const lines = width ? doc.splitTextToSize(value, width) : [value];
    doc.text(lines, x, y, { align });
    return lines.length * size * 0.3528 * lineHeight;
  };
  for (const [index, entry] of pages.entries()) {
    if (index) doc.addPage("a3", "landscape");
    text(`${project.name} · ${entry.label}`, page.margin, 18, {
      size: 10,
      bold: true,
    });
    text(`${index + 1} / ${pages.length}`, page.width - page.margin, 18, {
      size: 10,
      colour: colours.muted,
      align: "right",
    });
    const headingHeight = text(entry.heading, page.margin, 31, {
      size: 18,
      bold: true,
      width: page.width - page.margin * 2,
      lineHeight: 1.2,
    });
    text(entry.summary, page.margin, 31 + headingHeight, {
      size: 11,
      colour: colours.muted,
      width: 300,
    });
    for (const [side, x] of [
      ["before", page.margin],
      ["after", page.margin + colWidth + page.gap],
    ]) {
      const capture = captureFor(manifest, entry, device, side);
      if (!capture)
        throw new Error(`Missing ${entry.id} ${device} ${side} capture`);
      const { width: vw, height: vh } = capture.viewport;
      const height = Math.min((colWidth * vh) / vw, maxImageHeight);
      const width = (height * vw) / vh;
      const name = side === "before" ? "Before" : "After";
      text(name, x, imageTop - 3, {
        size: 10,
        bold: true,
        colour: side === "after" ? colours.accent : colours.ink,
      });
      text(project.labels[side], x + doc.getTextWidth(name) + 2, imageTop - 3, {
        size: 10,
        colour: colours.muted,
      });
      doc.addImage(
        await bytes(capture.src),
        "PNG",
        x,
        imageTop,
        width,
        height,
        undefined,
        "FAST",
      );
      doc.setDrawColor("#bcc5bb");
      doc.rect(x, imageTop, width, height);
      let y = imageTop + height + 5;
      const source = `${vw} × ${vh} · ${dateLabel(capture.capturedAt)} · ${capture.url}`;
      const sourceHeight = text(source, x, y, {
        size: 8,
        colour: colours.muted,
        width: colWidth,
      });
      doc.link(x, y - 3, colWidth, sourceHeight, { url: capture.url });
      y += sourceHeight + 5;
      y += text(
        side === "before" ? "The starting point" : project.labels.afterNote,
        x,
        y,
        {
          size: 9,
          bold: true,
          colour: side === "after" ? colours.accent : colours.muted,
        },
      );
      text(entry[`${side}Note`], x, y + 1, { size: 11, width: colWidth - 4 });
    }
  }
  return doc.output("blob");
}
