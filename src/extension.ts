import * as vscode from "vscode";

import { CobiSymbolOutlineProvider } from "./symbolOutline";

export function activate(context: vscode.ExtensionContext) {
  const cobiSymbolOutlineProvider = new CobiSymbolOutlineProvider(context);
}
