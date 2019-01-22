import * as path from "path";
import { ExtensionContext, SymbolKind } from "vscode";

export const getIcon = (
  kind: SymbolKind,
  context: ExtensionContext
): { dark: string; light: string } => {
  let icon: string;
  switch (kind) {
    case SymbolKind.Array:
      icon = "Indexer";
      break;
    case SymbolKind.Class:
      icon = "Class";
      break;
    case SymbolKind.Constant:
      icon = "Constant";
      break;
    case SymbolKind.Constructor:
    case SymbolKind.Function:
    case SymbolKind.Method:
      icon = "Method";
      break;
    case SymbolKind.Enum:
      icon = "Enumerator";
      break;
    case SymbolKind.EnumMember:
      icon = "EnumItem";
      break;
    case SymbolKind.Event:
      icon = "Event";
      break;
    case SymbolKind.Field:
      icon = "Field";
      break;
    case SymbolKind.File:
      icon = "Document";
      break;
    case SymbolKind.Interface:
      icon = "Interface";
      break;
    case SymbolKind.Module:
    case SymbolKind.Namespace:
    case SymbolKind.Object:
      icon = "Namespace";
      break;
    case SymbolKind.Operator:
      icon = "Operator";
      break;
    case SymbolKind.Package:
      icon = "module";
      break;
    case SymbolKind.Property:
      icon = "Property";
      break;
    case SymbolKind.Struct:
      icon = "Structure";
      break;
    case SymbolKind.Variable:
      icon = "Variable";
      break;
    case SymbolKind.Number:
      icon = "Numeric";
      break;
    case SymbolKind.Boolean:
    case SymbolKind.Null:
      icon = "Boolean";
      break;
    case SymbolKind.Key:
    case SymbolKind.String:
      icon = "String";
      break;
    case SymbolKind.TypeParameter:
      icon = "Template";
      break;
    default:
      icon = "Field";
      break;
  }
  icon += ".svg";
  return {
    dark: context.asAbsolutePath(path.join("resources", "dark", icon)),
    light: context.asAbsolutePath(path.join("resources", "light", icon))
  };
};
