import * as vscode from "vscode";

import { initSymbolOutline as init } from "./cobiSymbolOutline";

export function activate(context: vscode.ExtensionContext) {
  init(context);
}
