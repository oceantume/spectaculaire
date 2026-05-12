export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v instanceof SafeHtml) {
      result += v.value;
    } else if (Array.isArray(v)) {
      result += v.map((item) => (item instanceof SafeHtml ? item.value : escapeHtml(String(item ?? "")))).join("");
    } else if (v == null || v === false) {
      // renders nothing
    } else {
      result += escapeHtml(String(v));
    }
    result += strings[i + 1];
  }
  return new SafeHtml(result);
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
