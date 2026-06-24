import { categoryMeta, CATEGORY_ORDER } from "@/lib/categories";

export interface NotifyListing {
  company: string;
  title: string;
  category: string;
  locations: string[];
  applyUrl: string;
}

function locText(locations: string[]): string {
  if (!locations.length) return "Location N/A";
  return locations.slice(0, 3).join(" · ") + (locations.length > 3 ? " …" : "");
}

// Group listings by category in the canonical category order.
function groupByCategory(
  listings: NotifyListing[],
): Array<{ key: string; label: string; color: string; items: NotifyListing[] }> {
  const groups = new Map<string, NotifyListing[]>();
  for (const l of listings) {
    const arr = groups.get(l.category) ?? [];
    arr.push(l);
    groups.set(l.category, arr);
  }
  return CATEGORY_ORDER.filter((k) => groups.has(k)).map((k) => ({
    key: k,
    label: categoryMeta(k).label,
    color: categoryMeta(k).color,
    items: groups.get(k)!,
  }));
}

// Clean HTML email, dark "dawn" theme, roles grouped by category with apply CTAs.
export function buildEmailHtml(
  listings: NotifyListing[],
  appUrl: string,
): { subject: string; html: string } {
  const n = listings.length;
  const subject = `🐦 ${n} new internship${n === 1 ? "" : "s"} on EarlyBird`;

  const groups = groupByCategory(listings)
    .map((g) => {
      const rows = g.items
        .map(
          (l) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #262633;">
            <div style="color:#ece6da;font-size:15px;font-weight:600;">${esc(l.company)}</div>
            <div style="color:#cfc8ba;font-size:14px;">${esc(l.title)}</div>
            <div style="color:#a6a090;font-size:12px;font-family:monospace;margin-top:2px;">${esc(locText(l.locations))}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #262633;text-align:right;vertical-align:middle;">
            <a href="${esc(l.applyUrl)}" style="background:#ff9f1c;color:#0a0a0f;text-decoration:none;font-weight:600;font-size:13px;padding:8px 14px;border-radius:8px;display:inline-block;">Apply ↗</a>
          </td>
        </tr>`,
        )
        .join("");
      return `
      <div style="margin:22px 0 6px;">
        <span style="color:${g.color};font-family:monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${esc(g.label)} · ${g.items.length}</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#0a0a0f;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#14141d;border:1px solid #262633;border-radius:16px;padding:28px;">
        <tr><td>
          <div style="font-size:26px;color:#ece6da;font-weight:700;">Early<span style="color:#ff9f1c;font-style:italic;">Bird</span> 🐦</div>
          <div style="color:#a6a090;font-size:13px;margin-top:4px;">${n} fresh role${n === 1 ? "" : "s"} matched your alert.</div>
          ${groups}
          <div style="margin-top:26px;text-align:center;">
            <a href="${esc(appUrl)}" style="color:#ffbf5e;font-size:13px;text-decoration:none;">Open the live feed →</a>
          </div>
          <div style="color:#6b6658;font-size:11px;font-family:monospace;margin-top:18px;border-top:1px solid #262633;padding-top:14px;">
            You're receiving this because you set up an EarlyBird alert. Manage it at ${esc(appUrl)}/settings
          </div>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  return { subject, html };
}

// Compact message for Discord / Telegram (capped to keep within message limits).
export function buildChatText(listings: NotifyListing[], appUrl: string): string {
  const n = listings.length;
  const head = `🐦 **EarlyBird** — ${n} new internship${n === 1 ? "" : "s"}`;
  const lines = listings
    .slice(0, 20)
    .map(
      (l) =>
        `• ${l.company} — ${l.title} @ ${locText(l.locations)}\n  ${l.applyUrl}`,
    );
  const more = n > 20 ? `\n…and ${n - 20} more → ${appUrl}` : `\n${appUrl}`;
  return [head, "", ...lines].join("\n") + more;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
