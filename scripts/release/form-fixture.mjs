import { createServer } from "node:http";
import { Readable } from "node:stream";
import { sha } from "./files.mjs";
export async function formFixture(project, { wrongRecipient = false } = {}) {
  const messages = new Map(),
    name = `Local form fixture — ${project.name}`;
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      res.setHeader("Cache-Control", "no-store");
      if (u.pathname === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local form fixture</title><style>body{font:16px/1.5 system-ui;max-width:600px;margin:24px auto;padding:16px}label{display:block;margin-top:16px}input,textarea,button{font:inherit;max-width:100%;box-sizing:border-box;padding:8px}input,textarea{width:100%}button{margin-top:16px}:focus-visible{outline:3px solid #075db3}#feedback{padding:12px}</style><main><h1 id="name"></h1><p>Local capture inbox only. Synthetic data; no external email delivery.</p><form id="enquiry"><label for="person">Name</label><input id="person" name="name" required><label for="email">Email</label><input id="email" name="email" type="email" required><label for="company">Company (optional)</label><input id="company" name="company"><label for="message">Message</label><textarea id="message" name="message" required></textarea><label for="attachment">Attachment (optional DOCX)</label><input id="attachment" name="attachment" type="file" accept=".docx"><input id="marker" name="marker" type="hidden"><button type="submit">Send test enquiry</button><p id="feedback" role="status" tabindex="-1"></p></form></main><script>document.querySelector('#name').textContent=${JSON.stringify(name).replaceAll("<", "\\u003c")};const form=document.querySelector('form'),button=form.querySelector('button'),feedback=document.querySelector('#feedback');form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;feedback.textContent='Sending';try{const response=await fetch('/submit',{method:'POST',body:new FormData(form)});if(!response.ok)throw Error('Transport error');const result=await response.json();if(!result.received)throw Error('Response unavailable');feedback.textContent='Test message received';form.dataset.state='received';}catch(error){feedback.textContent='We could not confirm whether your message arrived. Your details are still here. Retry manually.';form.dataset.state='failed';}finally{button.disabled=false;feedback.focus();}});</script></html>`,
        );
      }
      if (u.pathname === "/submit" && req.method === "POST") {
        const request = new Request("http://localhost/submit", {
            method: "POST",
            headers: req.headers,
            body: Readable.toWeb(req),
            duplex: "half",
          }),
          data = await request.formData(),
          marker = String(data.get("marker") || "");
        if (!/^WEBTOOLS-TEST-[a-f0-9-]{36}$/.test(marker)) {
          res.writeHead(400);
          return res.end("Missing test marker");
        }
        if (
          !data.get("name") ||
          !/^.+@example\.invalid$/.test(String(data.get("email"))) ||
          !String(data.get("message")).includes(marker)
        ) {
          res.writeHead(400);
          return res.end("Synthetic fields required");
        }
        const file = data.get("attachment"),
          attachments = [];
        if (file && typeof file !== "string" && file.size) {
          if (!file.name.endsWith(".docx") || file.size > 8192) {
            res.writeHead(400);
            return res.end("Attachment rejected");
          }
          attachments.push({
            name: file.name,
            bytes: file.size,
            sha256: sha(Buffer.from(await file.arrayBuffer())),
          });
        }
        const old = messages.get(marker);
        messages.set(marker, {
          marker,
          recipient: wrongRecipient
            ? "wrong-local-inbox"
            : "local-capture-inbox",
          name: String(data.get("name")),
          email: String(data.get("email")),
          company: String(data.get("company") || ""),
          message: String(data.get("message")),
          attachments,
          receivedAt: old?.receivedAt || new Date().toISOString(),
        });
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ received: true }));
      }
      if (u.pathname === "/inbox" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            messages: u.searchParams.has("marker")
              ? [messages.get(u.searchParams.get("marker"))].filter(Boolean)
              : [...messages.values()],
          }),
        );
      }
      if (u.pathname === "/inbox" && req.method === "DELETE") {
        const marker = u.searchParams.get("marker");
        if (!/^WEBTOOLS-TEST-[a-f0-9-]{36}$/.test(marker || "")) {
          res.writeHead(400);
          return res.end("Marker required");
        }
        messages.delete(marker);
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ removed: marker }));
      }
      res.writeHead(404);
      res.end("Not found");
    } catch (error) {
      res.writeHead(500);
      res.end("Fixture error");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    messages,
    close: () => new Promise((r) => server.close(r)),
  };
}
