import {
  Event,
  EventEmitter,
  ExtensionContext,
  Range,
  Selection,
  SymbolInformation,
  SymbolKind,
  TextDocument,
  TextEditor,
  TextEditorRevealType,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  TreeView,
  commands,
  window,
  workspace,
  Position
} from "vscode";

import { getIcon } from "./icons";

let optsSortOrder: number[] = [];
let optsTopLevel: number[] = [];
let optsExpandableNodes: number[] = [];

export class CobiSymbolNode {
  parent?: CobiSymbolNode;
  symbol: SymbolInformation;
  children: CobiSymbolNode[] = [];

  constructor(symbol?: SymbolInformation) {
    this.symbol = symbol;
    
    if (!!this.symbol && (optsExpandableNodes.indexOf(this.symbol.kind) >= 0)) {
      // @ts-ignore
      this.symbol.children.forEach((child: SymbolInformation) => {
        this.addChild(child);
      });
    }
  }

  private getKindOrder(kind: SymbolKind): number {
    let ix = optsSortOrder.indexOf(kind);
    if (ix < 0) {
      ix = optsSortOrder.indexOf(-1);
    }
    return ix;
  }

  private compareSymbols(a: CobiSymbolNode, b: CobiSymbolNode): number {
    const kindOrder = this.getKindOrder(a.symbol.kind) - this.getKindOrder(b.symbol.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    if (a.symbol.name.toLowerCase() > b.symbol.name.toLowerCase()) {
      return 1;
    }
    return -1;
  }

  sort() {
    this.children.sort(this.compareSymbols.bind(this));
    this.children.forEach(child => child.sort());
  }

  addChild(child: CobiSymbolNode | SymbolInformation) {
    if (child instanceof SymbolInformation) {
      child = new CobiSymbolNode(child);
    }
    child.parent = this;
    this.children.push(child);
  }
}

export class CobiSymbolOutlineTreeDataProvider
  implements TreeDataProvider<CobiSymbolNode> {
  private _onDidChangeTreeData: EventEmitter<CobiSymbolNode | null> = new EventEmitter<CobiSymbolNode | null>();
  readonly onDidChangeTreeData: Event<CobiSymbolNode | null> = this._onDidChangeTreeData.event;

  private context: ExtensionContext;
  private tree: CobiSymbolNode;
  private editor: TextEditor;

  constructor(context: ExtensionContext) {
    this.context = context;
  }

  private getSymbols(document: TextDocument): Thenable<SymbolInformation[]> {
    return commands.executeCommand<SymbolInformation[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
  }

  private compareSymbols(a: CobiSymbolNode, b: CobiSymbolNode) {
    const startComparison = a.symbol.location.range.start.compareTo(
      b.symbol.location.range.start
    );
    if (startComparison != 0) {
      return startComparison;
    }
    return b.symbol.location.range.end.compareTo(a.symbol.location.range.end);
  }

  private async updateSymbols(editor: TextEditor): Promise<void> {
    const tree = new CobiSymbolNode();
    this.editor = editor;
    if (editor) {
      readOpts();
      let symbols = await this.getSymbols(editor.document);
      if (optsTopLevel.indexOf(-1) < 0) {
        symbols = symbols.filter(sym => optsTopLevel.indexOf(sym.kind) >= 0);
      }
      // Create symbol nodes
      const symbolNodes = symbols.map(symbol => new CobiSymbolNode(symbol));
      // Sort nodes by left edge ascending and right edge descending
      symbolNodes.sort(this.compareSymbols);
      symbolNodes.forEach(currentNode => {
        tree.addChild(currentNode);
      });
      tree.sort();
    }
    this.tree = tree;
  }

  async getChildren(node?: CobiSymbolNode): Promise<CobiSymbolNode[]> {
    if (node) {
      return node.children;
    } else {
      await this.updateSymbols(window.activeTextEditor);
      return this.tree ? this.tree.children : [];
    }
  }

  getParent(node: CobiSymbolNode): CobiSymbolNode {
    return node.parent;
  }

  getNodeByPosition(position: Position): CobiSymbolNode {
    let node = this.tree;
    while (node.children.length) {
      const matching = node.children.filter(node =>
        node.symbol.location.range.contains(position)
      );
      if (!matching.length) {
        break;
      }
      node = matching[0];
    }
    if (node.symbol) {
      return node;
    }
  }

  getTreeItem(node: CobiSymbolNode): TreeItem {
    const { kind } = node.symbol;
    let treeItem = new TreeItem(node.symbol.name);
    
    treeItem.collapsibleState = node.children.length ? 
                                TreeItemCollapsibleState.Collapsed :
                                TreeItemCollapsibleState.None;
    
    treeItem.command = {
      command: "cobiSymbolOutline.revealRange",
      title: "",
      arguments: [this.editor, node.symbol.location.range]
    };
    
    treeItem.tooltip = `${node.symbol.name} (${SymbolKind[kind].toLowerCase()})`;
    
    treeItem.iconPath = getIcon(kind, this.context);
    return treeItem;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

export class CobiSymbolOutlineProvider {
  symbolViewer: TreeView<CobiSymbolNode>;
  
  constructor(context: ExtensionContext) {
    const treeDataProvider = new CobiSymbolOutlineTreeDataProvider(context);
    this.symbolViewer = window.createTreeView("cobiSymbolOutline", {
      treeDataProvider
    });
    commands.registerCommand("cobiSymbolOutline.refresh", () => {
      treeDataProvider.refresh();
    });
    commands.registerCommand(
      "cobiSymbolOutline.revealRange",
      (editor: TextEditor, range: Range) => {
        editor.revealRange(range.with(range.start, range.start), TextEditorRevealType.InCenterIfOutsideViewport);
        editor.selection = new Selection(range.start, range.start);
        commands.executeCommand("workbench.action.focusActiveEditorGroup");
      }
    );
    window.onDidChangeActiveTextEditor(editor => treeDataProvider.refresh());
    workspace.onDidCloseTextDocument(document => treeDataProvider.refresh());
    workspace.onDidChangeTextDocument(event => treeDataProvider.refresh());
    workspace.onDidSaveTextDocument(document => treeDataProvider.refresh());
    commands.registerTextEditorCommand(
      "cobiSymbolOutline.revealCurrentSymbol",
      (editor: TextEditor) => {
        if (editor.selections.length) {
          const node = treeDataProvider.getNodeByPosition(
            editor.selections[0].active
          );
          if (node) {
            this.symbolViewer.reveal(node);
          }
        }
      }
    );
  }
}

function readOpts() {
  let opts = workspace.getConfiguration("cobiSymbolOutline");
  optsExpandableNodes = convertNamesToEnumValues(opts.get<string[]>("expandableNodes"));
  optsSortOrder = convertNamesToEnumValues(opts.get<string[]>("sortOrder"));
  optsTopLevel = convertNamesToEnumValues(opts.get<string[]>("topLevel"));
}

function convertEnumValueToName(val: number): string | null {
  return null;
}

function convertNamesToEnumValues(names: string[]): number[] {
  return names.map(str => {
    let v = SymbolKind[str];
    return typeof v == "undefined" ? -1 : v;
  });
}
