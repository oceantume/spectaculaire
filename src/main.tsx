import { hydrate } from "preact";
import { App } from "./App";
import { allEvents, feq2026Config } from "./data";
import "./index.css";

if (typeof window !== "undefined") {
  const path = window.location.pathname.replace(/\/$/, "");
  const eventKey = path.slice(1);
  const event = allEvents.find((e) => e.key === eventKey) ?? feq2026Config;
  const root = document.getElementById("app");
  if (root) hydrate(<App event={event} />, root);
}

export async function prerender({ url }: { url: string }) {
  const { default: renderToString } = await import("preact-render-to-string");

  const pathname = new URL(url, "http://localhost").pathname.replace(/\/$/, "") || "/";

  if (pathname === "/" || pathname === "") {
    return {
      html: "",
      links: new Set(["/feq2026", "/envolet2026"]),
    };
  }

  const key = pathname.slice(1);
  const prerenderEvent = allEvents.find((e) => e.key === key) ?? feq2026Config;
  const html = renderToString(<App event={prerenderEvent} />);

  return {
    html,
    links: new Set(["/feq2026", "/envolet2026"]),
    head: {
      title: `Spectaculaire — ${prerenderEvent.label}`,
      elements: new Set([
        <meta name="description" content={`Horaire de la programmation — ${prerenderEvent.label}`} />,
      ]),
    },
  };
}
