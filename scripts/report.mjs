const escapeTitle = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function reportDocument(title, body, extraStyles = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeTitle(title)}</title><style>
  *{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#171717;background:#fff}main{max-width:1400px;padding:24px;margin:auto}a{color:#124e91;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible,.scroll:focus-visible{outline:3px solid #075db3;outline-offset:3px}h1{font-size:28px;margin:0}h2{font-size:21px}p{max-width:90ch}.observations{table-layout:fixed;min-width:720px}.observations th:first-child{width:22%}.observations th:nth-child(2),.observations th:nth-child(3){width:10%}.observations td:last-child{min-width:0}.cards.single{grid-template-columns:1fr}.cards li{margin:8px 0}.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{border:1px solid #bbb;padding:16px}article h2{margin-top:0}section{margin:32px 0}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}caption{text-align:left;font-weight:600;margin-bottom:8px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccc;padding:10px;overflow-wrap:anywhere}th{font-weight:600}td:last-child{min-width:260px}th span{font-weight:400}summary{cursor:pointer;padding:8px 0}.notice{border-left:4px solid #925500;padding:12px;background:#fff8e9}footer{border-top:1px solid #aaa;padding-top:16px}@media(max-width:600px){main{padding:16px}.cards{grid-template-columns:1fr}}@media print{details> :not(summary){display:block!important}details{display:block!important}summary{display:none}main{max-width:none;padding:0}body{font-size:10pt}table{font-size:9pt}.scroll{overflow:visible}th,td{padding:5px}.observations{min-width:0}section{break-before:page}tr{break-inside:avoid}caption,thead{break-after:avoid}a{color:inherit;text-decoration:none}@page{size:A4 landscape;margin:12mm}}
  .lead h1{font-size:24px}.lead .when{margin:2px 0 0;color:#555;font-size:14px}.lead .block{margin:20px 0}.lead h2{font-size:17px;margin:0 0 4px}.lead p,.lead ul,.lead ol{margin:4px 0}.lead li{margin:8px 0;max-width:90ch}.lead .where{font-size:14px;color:#444}.internal,.operator{font-size:14px}
  ${extraStyles}</style></head><body>${body}<script>
  let closedForPrint;
  addEventListener('beforeprint',()=>{if(closedForPrint)return;closedForPrint=[...document.querySelectorAll('details:not([open])')];closedForPrint.forEach(d=>d.open=true)});
  addEventListener('afterprint',()=>{closedForPrint?.forEach(d=>d.open=false);closedForPrint=undefined});
  </script></body></html>`;
}

// Dates and durations as a person would say them. Machine values stay in the JSON.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});
export function humanDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "date not recorded";
  return dateFormat.format(d).replace(" at ", ", ");
}
export function humanDuration(ms) {
  if (!Number.isFinite(ms)) return "";
  const s = Math.round(ms / 1000);
  if (s < 90) return `${Math.max(1, s)} seconds`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes`;
  return `${(m / 60).toFixed(1).replace(/\.0$/, "")} hours`;
}
export function ago(iso, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}
