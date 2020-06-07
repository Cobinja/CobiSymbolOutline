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
  ProviderResult
} from "vscode";

import * as path from "path";
import deepEqual = require("deep-equal");

import { getIcon } from "./icons";

let optsSortOrder: number[] = [];
let optsTopLevel: number[] = [];
let optsExpandableNodes: number[] = [];
let optsSortBy: any = null;
let optsHidden: number[] = [];
let context: ExtensionContext;
let treeView: TreeView<CobiTreeItem>;

enum OptsChanges {
  NONE = 0,
  SORT_ORDER = 1 << 0,
  SORT_BY = 1 << 1,
  TOP_LEVEL = 1 << 2,
  EXPANDABLE_NODES = 1 << 3,
  HIDDEN_SYMBOLS = 1 << 4,
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

function getKindOrder(kind: SymbolKind): number {
  let ix = optsSortOrder.indexOf(kind);
  if (ix < 0) {
    ix = optsSortOrder.indexOf(-1);
  }
  return ix;
}

function compareByKind(a: CobiTreeItem, b: CobiTreeItem): number {
  let kindOrder = getKindOrder(a.symbol.kind) - getKindOrder(b.symbol.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  let kindSort = a.symbol.kind - b.symbol.kind;
  if (kindSort !== 0) {
    return kindSort;
  }
  return compareByName(a, b);
}

function compareByRange(a: CobiTreeItem, b: CobiTreeItem) {
  let result = a.symbol.range.start.compareTo(b.symbol.range.start);
  if (result === 0) {
    result = b.symbol.range.end.compareTo(a.symbol.range.end);
  }
  if (result === 0) {
    result = compareByName(a, b);
  }
  return result;
}

function compareByName(a: CobiTreeItem, b: CobiTreeItem) {
  if (a.symbol.name < b.symbol.name) {
    return -1;
  }
  else if (a.symbol.name > b.symbol.name) {
    return 1;
  }
    return 0;
}

function readOpts(): number {
  let changed = OptsChanges.NONE;
  let opts = workspace.getConfiguration("cobiSymbolOutline");
  
  let newExpandableNodes = convertNamesToEnumValues(opts.get<string[]>("expandableNodes"));
  if (!deepEqual(newExpandableNodes, optsExpandableNodes)) {
    optsExpandableNodes = newExpandableNodes;
    changed = changed | OptsChanges.EXPANDABLE_NODES;
  }
  
  let newTopLevel = convertNamesToEnumValues(opts.get<string[]>("topLevel"));
  if (!deepEqual(newTopLevel, optsTopLevel)) {
    optsTopLevel = newTopLevel;
    changed = changed | OptsChanges.TOP_LEVEL;
  }
  
  let newSortOrder = convertNamesToEnumValues(opts.get<string[]>("sortOrder"));
  if (!deepEqual(newSortOrder, optsSortOrder)) {
    optsSortOrder = newSortOrder;
    changed = changed | OptsChanges.SORT_ORDER;
  }
  
  let newHidden = convertNamesToEnumValues(opts.get<string[]>("hiddenNodes"));
  if (!deepEqual(newHidden, optsHidden)) {
    optsHidden = newHidden;
    changed = changed | OptsChanges.HIDDEN_SYMBOLS;
  }
  
  let newSortBy = opts.get<string>("sortBy");
  let newFn = null;
  switch (newSortBy) {
    case "Name":
      newFn = compareByName;
      break;
    case "Position":
      newFn = compareByRange;
      break;
    case "Kind":
    default:
      newFn = compareByKind;
      break;
  }
  if (optsSortBy !== newFn) {
    optsSortBy = newFn;
    changed = changed | OptsChanges.SORT_BY;
  }
  
  return changed;
}

class CobiTreeItem extends TreeItem {
  public parent: CobiTreeItem = null;
  public children: CobiTreeItem[] = [];
  
  constructor(public symbol?: DocumentSymbol) {
    super(symbol ? symbol.name : "", TreeItemCollapsibleState.Collapsed);
    
    if (symbol) {
      let kind = symbol.kind;
      this.tooltip = `${symbol.name} (${SymbolKind[kind]})`;
      this.iconPath = getIcon(kind, context);
      
      symbol.children.forEach(child => {
        this.addChild(child);
      });
      if (optsExpandableNodes.indexOf(kind) < 0 || this.children.length === 0) {
        this.collapsibleState = TreeItemCollapsibleState.None;
      }
    }
  }
  
  addChild(child: DocumentSymbol) {
    let hidden = (optsHidden.indexOf(child.kind) >= 0);
    if (!hidden) {
      let newChild = new CobiTreeItem(child);
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
  
  sort() {
    this.children.sort(optsSortBy);
    this.children.forEach(child => {
      child.sort();
    });
  }
}

class CobiTree {
  public root: CobiTreeItem = new CobiTreeItem();
  public loading: boolean = false;
  
  constructor(public document: TextDocument, public owner: CobiTreeDataProvider) { }
  
  private doRefresh(): Thenable<void> {
    return this.getSymbols()
    .then(symbols => {
      if (symbols) {
        symbols.forEach((symbol: DocumentSymbol) => {
          let showTopLevel = (optsTopLevel.indexOf(-1) >= 0) ||
            (optsTopLevel.indexOf(symbol.kind) >= 0);
          if (showTopLevel) {
            this.root.addChild(symbol);
          }
        });
        this.root.sort();
      }
      this.loading = false;
      this.owner.refreshView();
    });
  }
  
  refreshSymbols() {
    if (!this.loading) {
      this.loading = true;
      this.root.dispose();
      this.root = new CobiTreeItem();
      this.owner.refreshView();
      // Initial load fails if the langaguage server is not yet started, so do it twice
      this.doRefresh()
      .then(() => {
        if (this.root.children.length == 0) {
          // Wait 1 second before trying again
          setTimeout(() => {
            this.doRefresh();
          }, 1000);
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
  
  dispose() {
    this.root.dispose();
    this.document = null;
    this.owner = null;
    this.root = null;
  }
}

class CobiTreeDataProvider implements TreeDataProvider<CobiTreeItem> {
  private _onDidChangeTreeData: EventEmitter<CobiTreeItem | null> = new EventEmitter<CobiTreeItem | null>();
  readonly onDidChangeTreeData: Event<CobiTreeItem | null> = this._onDidChangeTreeData.event;
  
  private trees: CobiTree[] = [];
  public currentTree: CobiTree = null;
  public dummyTreeItem: CobiTreeItem = new CobiTreeItem();
  
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
        tree.root.sort();
      });
    }
    this._onDidChangeTreeData.fire();
  }
  
  refreshSymbols(document?: TextDocument) {
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
  readOpts();
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
    if (event.affectsConfiguration("cobiSymbolOutline")) {
      let changed = readOpts();
      if (changed <= OptsChanges.SORT_BY) {
        treeDataProvider.refreshView(true);
      }
      else if (changed !== OptsChanges.NONE) {
        treeDataProvider.refreshAllSymbols();
      }
    }
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
