import tls from "node:tls";
import { Resolver } from "node:dns/promises";
import { request } from "./core.mjs";
export async function transport(url) {
  const u = new URL(url);
  if (u.protocol !== "https:") return { status: "review", reason: "Not HTTPS" };
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: u.hostname,
      servername: u.hostname,
      port: Number(u.port) || 443,
      rejectUnauthorized: true,
    });
    socket.setTimeout(10000);
    socket.once("secureConnect", () => {
      const c = socket.getPeerCertificate();
      resolve({
        status: "ok",
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        issuer: c.issuer?.O,
        validFrom: c.valid_from,
        validTo: c.valid_to,
      });
      socket.destroy();
    });
    socket.once("error", (e) => {
      resolve({ status: "error", error: e.code || "TLS connection failed" });
      socket.destroy();
    });
    socket.once("timeout", () => {
      resolve({ status: "error", error: "TLS timeout" });
      socket.destroy();
    });
  });
}
export async function emailRecords(url) {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const resolver = new Resolver({ timeout: 4000, tries: 1 });
  const query = async (name, type) => {
    try {
      return {
        status: "ok",
        records: await (type === "mx"
          ? resolver.resolveMx(name)
          : resolver.resolveTxt(name)),
      };
    } catch (e) {
      return {
        status: ["ENODATA", "ENOTFOUND"].includes(e.code) ? "absent" : "error",
        code: e.code,
      };
    }
  };
  const [mx, txt, dmarc] = await Promise.all([
    query(domain, "mx"),
    query(domain, "txt"),
    query(`_dmarc.${domain}`, "txt"),
  ]);
  return {
    domain,
    mx,
    spf: {
      status: txt.status,
      records:
        txt.records
          ?.map((x) => x.join(""))
          .filter((x) => /^v=spf1\b/.test(x)) || [],
    },
    dmarc,
    dkim: {
      status: "not tested",
      reason:
        "DKIM requires a known selector; it cannot be inferred from public pages.",
    },
    method:
      "Exact site hostname with www removed. Hosting preview domains may not send email; absence needs review, not an automatic failure.",
  };
}
export async function httpRedirect(url) {
  const u = new URL(url);
  u.protocol = "http:";
  try {
    const r = await request(u.href);
    return {
      status: r.status,
      finalUrl: r.finalUrl,
      https: new URL(r.finalUrl).protocol === "https:",
      chain: r.chain,
    };
  } catch (e) {
    return { error: e.message };
  }
}
