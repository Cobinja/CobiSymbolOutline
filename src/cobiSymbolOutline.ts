import {
  DocumentSymbol,
  Event,
  EventEmitter,
  ExtensionContext,
  Range,
  Selection,
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
  Position,
  ProviderResult,
  WorkspaceConfiguration,
  ConfigurationChangeEvent
} from "vscode";

import * as path from "path";
import deepEqual = require("deep-equal");

import { getIcon } from "./icons";

let context: ExtensionContext;
let treeView: TreeView<CobiTreeItem>;

type CompareFn = (a: CobiTreeItem, b: CobiTreeItem) => number;

interface Settings {
  sortOrder?: number[];
  topLevel?: number[];
  expandableNodes?: number[];
  sortBy?: string;
  hidden?: number[];
  fallbackLoadDelay?: number;
}

function convertNamesToEnumValues(names: string[]): number[] {
  let result: number[] = [];
  if (names) {
    names.forEach(name => {
      if (name === "*") {
        result.push(-1);
        return;
      }
      let val = SymbolKind[name];
      if (typeof val !== "undefined") {
        result.push(val);
      }
    });
  }
  return result;
}

function compareByKind(a: CobiTreeItem, b: CobiTreeItem): number {
  let kindOrder = a.getKindOrder() - b.getKindOrder();
  if (kindOrder !== 0) {
    return kindOrder;
  }
  let kindSort = a.symbol.kind - b.symbol.kind;
  if (kindSort !== 0) {
    return kindSort;
  }
  return compareByName(a, b);
}

function compareByRange(a: CobiTreeItem, b: CobiTreeItem): number {
  let result = a.symbol.range.start.compareTo(b.symbol.range.start);
  if (result === 0) {
    result = b.symbol.range.end.compareTo(a.symbol.range.end);
  }
  if (result === 0) {
    result = compareByName(a, b);
  }
  return result;
}

function compareByName(a: CobiTreeItem, b: CobiTreeItem): number {
  if (a.symbol.name < b.symbol.name) {
    return -1;
  }
  else if (a.symbol.name > b.symbol.name) {
    return 1;
  }
    return 0;
}

function readSettings(document?: TextDocument): Settings {
  let result: Settings = {} as Settings;
  let opts: WorkspaceConfiguration = workspace.getConfiguration("cobiSymbolOutline", document);;
  
  result.expandableNodes = convertNamesToEnumValues(opts.get<string[]>("expandableNodes"));
  result.topLevel = convertNamesToEnumValues(opts.get<string[]>("topLevel"));
  result.sortOrder = convertNamesToEnumValues(opts.get<string[]>("sortOrder"));
  result.hidden = convertNamesToEnumValues(opts.get<string[]>("hiddenNodes"));
  result.sortBy = opts.get<string>("sortBy");
  result.fallbackLoadDelay = opts.get<number>("fallbackLoadDelay");
  
  return result;
}

class CobiTreeItem extends TreeItem {
  public parent: CobiTreeItem = null;
  public children: CobiTreeItem[] = [];
  
  constructor(private tree: CobiTree, public symbol?: DocumentSymbol) {
    super(symbol ? symbol.name : "", TreeItemCollapsibleState.Collapsed);
    
    if (symbol) {
      let kind = symbol.kind;
      this.tooltip = `${symbol.name} (${SymbolKind[kind]})`;
      this.iconPath = getIcon(kind, context);
      
      symbol.children.forEach(child => {
        this.addChild(child);
      });
      if (this.tree.settings.expandableNodes.indexOf(kind) < 0 || this.children.length === 0) {
        this.collapsibleState = TreeItemCollapsibleState.None;
      }
    }
  }
  
  addChild(child: DocumentSymbol) {
    let hidden = (this.tree.settings.hidden.indexOf(child.kind) >= 0);
    if (!hidden) {
      let newChild = new CobiTreeItem(this.tree, child);
      newChild.parent = this;
      this.children.push(newChild);
    }
  }
  
  dispose() {
    this.children.forEach(child => {
      child.dispose();
    });
    this.parent = null;
    this.children = [];
  }
  
  sort(sortBy: CompareFn) {
    this.children.sort(sortBy);
    this.children.forEach(child => {
      child.sort(sortBy);
    });
  }
  
  getKindOrder(): number {
    let sortOrder = this.tree.settings.sortOrder;
    let result = sortOrder.indexOf(this.symbol.kind);
    if (result < 0) {
      result = sortOrder.indexOf(-1);
    }
    return result;
  }
}

class CobiTree {
  public root: CobiTreeItem = new CobiTreeItem(this);
  public loading: boolean = false;
  public settings: Settings = null;
  
  constructor(public document: TextDocument, public owner: CobiTreeDataProvider) {
    this.settings = readSettings(document);
  }
  
  public getCompareFunction(): CompareFn {
    let result: CompareFn;
    switch (this.settings.sortBy) {
      case "Name":
        result = compareByName;
        break;
      case "Position":
        result = compareByRange;
        break;
      case "Kind":
      default:
        result = compareByKind;
        break;
    }
    return result;
  }
  
  private doRefresh(): Thenable<void> {
    return this.getSymbols()
    .then(symbols => {
      if (symbols) {
        symbols.forEach((symbol: DocumentSymbol) => {
          let showTopLevel = (this.settings.topLevel.indexOf(-1) >= 0) ||
            (this.settings.topLevel.indexOf(symbol.kind) >= 0);
          if (showTopLevel) {
            this.root.addChild(symbol);
          }
        });
        this.root.sort(this.getCompareFunction());
      }
      this.loading = false;
      this.owner.refreshView();
    });
  }
  
  refreshSymbols() {
    if (!this.loading) {
      this.loading = true;
      this.root.dispose();
      this.root = new CobiTreeItem(this);
      this.owner.refreshView();
      this.doRefresh()
      .then(() => {
        if (this.root.children.length == 0 && this.settings.fallbackLoadDelay >= 0) {
          setTimeout(() => {
            this.doRefresh();
          }, this.settings.fallbackLoadDelay);
        }
      });
    }
  }
  
  getSymbols(): Thenable<DocumentSymbol[]> {
    return commands.executeCommand<DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      this.document.uri
    );
  }
  
  onSettingsChanged(event: ConfigurationChangeEvent): void {
    if (event && !(event.affectsConfiguration("cobiSymbolOutline", this.document))) {
      return;
    }
    let newSettings: Settings = readSettings(this.document);
    if (!deepEqual(this.settings, newSettings)) {
      this.settings = newSettings;
      this.refreshSymbols();
    }
  }
  
  dispose() {
    this.root.dispose();
    this.document = null;
    this.owner = null;
    this.root = null;
    this.settings = null;
  }
  
  sort() {
    this.root.sort(this.getCompareFunction());
  }
}

class CobiTreeDataProvider implements TreeDataProvider<CobiTreeItem> {
  private _onDidChangeTreeData: EventEmitter<CobiTreeItem | null> = new EventEmitter<CobiTreeItem | null>();
  readonly onDidChangeTreeData: Event<CobiTreeItem | null> = this._onDidChangeTreeData.event;
  
  private trees: CobiTree[] = [];
  public currentTree: CobiTree = null;
  public dummyTreeItem: CobiTreeItem = new CobiTreeItem(null);
  
  constructor() {
    this.dummyTreeItem.collapsibleState = TreeItemCollapsibleState.None;
    window.visibleTextEditors.forEach(editor => {
      this.addDocument(editor.document);
    });
  }
  
  private findTreeForDocument(document: TextDocument) {
    for (let i = 0; i < this.trees.length; i++) {
      let tree = this.trees[i];
      if (tree.document === document) {
        return {tree: tree, index: i} as any;
      }
    }
    return {tree: null as CobiTree, index: -1};
  }
  
  refreshView(sort?: boolean) {
    if (sort) {
      this.trees.forEach(tree => {
        tree.sort();
      });
    }
    this._onDidChangeTreeData.fire(null);
  }
  
  refreshSymbols(document?: TextDocument) {
    // readOpts(document);
    let tree: CobiTree;
    if (document) {
      tree = this.findTreeForDocument(document).tree;
    }
    else {
      tree = this.currentTree;
    }
    if (tree) {
      tree.refreshSymbols();
    }
  }
  
  refreshAllSymbols() {
    this.trees.forEach(tree => {
      tree.refreshSymbols();
    });
  }
  
  onSettingsChanged(event: ConfigurationChangeEvent) {
    this.trees.forEach(tree => {
      tree.onSettingsChanged(event);
    });
  }
  
  getTreeItem(element: CobiTreeItem): TreeItem | Thenable<TreeItem> {
    if (element.symbol) {
      element.command = {
        command: "cobiSymbolOutline.revealRange",
        title: "",
        arguments: [window.activeTextEditor, element.symbol.range]
      };
    }
    
    return element;
  }
  
  getChildren(element?: CobiTreeItem): ProviderResult<CobiTreeItem[]> {
    if (element) {
      return element.children;
    }
    else if (this.currentTree) {
      if (this.currentTree.loading) {
        this.dummyTreeItem.label = "Loading symbols for '" + path.basename(this.currentTree.document.fileName) + "'";
      }
      else if (this.currentTree.root.children.length > 0) {
        return this.currentTree.root.children;
      }
      else {
        this.dummyTreeItem.label = "No data available. Please click 'Refresh' to try again";
      }
    }
    else {
      this.dummyTreeItem.label = "No data available";
    }
    return [this.dummyTreeItem];
  }
  
  getParent(element: CobiTreeItem): ProviderResult<CobiTreeItem> {
    return element.parent;
  }

  addDocument(document: TextDocument) {
    let {tree} = this.findTreeForDocument(document);
    if (!tree) {
      let newTree = new CobiTree(document, this);
      this.trees.push(newTree);
      if (document === window.activeTextEditor.document) {
        this.currentTree = newTree;
      }
      this.refreshView();
      newTree.refreshSymbols();
    }
  }
  
  removeDocument(document: TextDocument) {
    let {tree, index} = this.findTreeForDocument(document);
    if (tree) {
      tree.dispose();
      this.trees.splice(index, 1);
    }
  }
  
  setActiveDocument() {
    if (!window.activeTextEditor) {
      this.currentTree = null;
      this.refreshView();
      return;
    }
    let activeDocument = window.activeTextEditor.document;
    let {tree} = this.findTreeForDocument(activeDocument);
    if (tree) {
      this.currentTree = tree;
      this.refreshView();
    }
    else {
      this.addDocument(activeDocument);
    }
  }
  
  getNodeByPosition(position: Position): CobiTreeItem {
    let item = this.currentTree.root;
    while (item.children.length) {
      const matching = item.children.filter(node =>
        node.symbol.range.contains(position)
      );
      if (!matching.length) {
        break;
      }
      item = matching[0];
    }
    if (item.symbol) {
      return item;
    }
  }
}

export function initSymbolOutline(ctx: ExtensionContext) {
  context = ctx;
  let treeDataProvider = new CobiTreeDataProvider();
  treeView = window.createTreeView("cobiSymbolOutline", {
    treeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  
  context.subscriptions.push(window.onDidChangeActiveTextEditor(() => treeDataProvider.setActiveDocument()));
  context.subscriptions.push(workspace.onDidCloseTextDocument(document => treeDataProvider.removeDocument(document)));
  context.subscriptions.push(workspace.onDidChangeTextDocument(event => treeDataProvider.refreshSymbols(event.document)));
  context.subscriptions.push(workspace.onDidChangeConfiguration(event => {
    treeDataProvider.onSettingsChanged(event);
  }));
  
  context.subscriptions.push(treeView.onDidExpandElement(event => {
    event.element.collapsibleState = TreeItemCollapsibleState.Expanded;
  }));
  context.subscriptions.push(treeView.onDidCollapseElement(event => {
    event.element.collapsibleState = TreeItemCollapsibleState.Collapsed;
  }));
  
  context.subscriptions.push(commands.registerCommand("cobiSymbolOutline.refresh", () => {
    treeDataProvider.refreshSymbols();
  }));
  context.subscriptions.push(commands.registerCommand(
    "cobiSymbolOutline.revealRange",
    (editor: TextEditor, range: Range) => {
      editor.revealRange(range.with(range.start, range.start), TextEditorRevealType.InCenterIfOutsideViewport);
      editor.selection = new Selection(range.start, range.start);
      commands.executeCommand("workbench.action.focusActiveEditorGroup");
    }
  ));
  context.subscriptions.push(commands.registerTextEditorCommand(
    "cobiSymbolOutline.revealCurrentSymbol",
    (editor: TextEditor) => {
      if (editor.selections.length > 0) {
        const node = treeDataProvider.getNodeByPosition(
          editor.selections[0].active
        );
        if (node) {
          commands.executeCommand("workbench.view.extension.outline")
          .then(() => {
            treeView.reveal(node);
          });
        }
      }
    }
  ));
  treeDataProvider.setActiveDocument();
  // commands.executeCommand("setContext", "cobiSymbolOutlineActivated", true);
}
