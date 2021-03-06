# CobiSymbolOutline -- A symbol tree provider for Visual Studio Code

This is a fork of the deprecated and unpublished Visual Studio Code extension vscode-code-outline by https://github.com/patrys

## Features

Displays a symbol outline tree accessible via the activity bar.

## Language Support

For the outline to work, the language support plugins need to support symbol information.

For the outline to form a tree structure, the language support plugins need to report the entire definition range as part of the symbol.

See VS Code [issue #34968](https://github.com/Microsoft/vscode/issues/34968) and language server protocol [issue #132](https://github.com/Microsoft/language-server-protocol/issues/132) for a discussion.

Here is a list of languages known to work with CobiSymbolOutline:

| Language/Format | Extension |
| --- | --- |
| C | [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) |
| C++ | [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools), [cquery](https://github.com/cquery-project/vscode-cquery) |
| Docker | [Docker](https://marketplace.visualstudio.com/items?itemName=PeterJausovec.vscode-docker) |
| HTML | Comes with VS Code |
| Go | [Go](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go) |
| Java | [Language Support for Java(TM) by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java)
| JavaScript | Comes with VS Code |
| JSON | Comes with VS Code |
| Markdown | Comes with VS Code |
| Perl | [Perl](https://marketplace.visualstudio.com/items?itemName=henriiik.vscode-perl) |
| PHP | [PHP Symbols](https://marketplace.visualstudio.com/items?itemName=linyang95.php-symbols) |
| Powershell | [PowerShell](https://marketplace.visualstudio.com/items?itemName=ms-vscode.PowerShell) |
| Python | [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python) |
| Rust | [Rust (rls)](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust) |
| TypeScript | Comes with VS Code |
| YAML | [YAML Support by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) |

Please report any missing extensions and I'll update the list.

## Extension Settings

- **expandableNodes:** Kinds of nodes that show their children.
- **sortOrder:** Order to sort symbols in.
- **sortBy:** Sort by kind, name or position. If something other than name, symbols with matching properties are also sorted by name.
- **topLevel:** Which symbols are included at the topmost scope.
- **hiddenNodes:** List of symbol kinds that are hidden.
- **fallbackLoadDelay:** Time in milliseconds to delay the second load if the first one does not receive any symbols. Set to "-1" do disable the second load.

Default settings:

```json
{
  "cobiSymbolOutline.expandableNodes": {
    "type": "array",
    "default": [
      "File",
      "Module",
      "Namespace",
      "Package",
      "Class",
      "Enum",
      "Interface",
      "Object",
      "Struct"
    ],
    "description": "Kinds of nodes that show their children."
  },
  "cobiSymbolOutline.sortOrder": {
    "type": "array",
    "default": [
      "Class",
      "Module",
      "Constant",
      "Interface",
      "*",
      "Constructor",
      "Function",
      "Method"
    ],
    "description": "Order to sort symbols in. * is placeholder for all symbols not explicitly listed."
  },
  "cobiSymbolOutline.topLevel": {
    "type": "array",
    "default": [
      "*"
    ],
    "description": "Which symbols to include at the topmost level. * includes everything."
  },
  "cobiSymbolOutline.hiddenNodes": {
      "type": "array",
      "default": [],
      "description": "Defines which symbols are hidden.",
      "scope": "language-overridable"
  },
  "cobiSymbolOutline.sortBy": {
      "type": "string",
      "enum": [
          "Kind",
          "Name",
          "Position"
      ],
      "default": "Kind",
      "description": "Defines by which property symbols are sorted.\nIf \"Kind\" is used, symbols are sorted according to the \"Sort Order\" setting.\nIf a property other than \"Name\" is used, symbols with matching properties are also sorted by name.",
      "scope": "language-overridable"
  },
  "cobiSymbolOutline.fallbackLoadDelay": {
      "type": "integer",
      "minimum": 0,
      "default": 1000,
      "description": "Defines the delay in milliseconds of the second load if the first one fails. Set to\"-1\" to disable the second load",
      "scope": "language-overridable"
  }
}
```

## Known Issues

In some cases the symbol list may initially return an empty list. Use the "Refresh" button next to the title to fix this.
