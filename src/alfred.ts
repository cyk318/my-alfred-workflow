export interface AlfredItem {
  title: string;
  subtitle?: string;
  arg?: string;
  icon?: { path: string };
  uid?: string;
  valid?: boolean;
}

export function output(items: AlfredItem[]): void {
  console.log(JSON.stringify({ items }));
}

export function error(msg: string): void {
  output([{ title: msg, valid: false }]);
}
