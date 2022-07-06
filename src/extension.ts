// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";
import { trees } from "./utils/tree";
import { getRelativePath, createProvider } from "./utils/utils";

export function activate(context: vscode.ExtensionContext) {
  let provider = createProvider();
  // 初始化树
  trees;

  const sidebarProvider = new SidebarProvider(context.extensionUri);

  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  item.text = "$(beaker) Add Todo";
  item.command = "cataremark.addTodo";
  item.show();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("cataremark-sidebar", sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cataremark.addTodo", async () => {
      const { activeTextEditor } = vscode.window;

      if (!activeTextEditor) {
        vscode.window.showInformationMessage("No active text editor");
        return;
      }

      console.log('sidebarProvider._view?.webview', sidebarProvider._view?.webview);
      
      const text = activeTextEditor.document.getText(
        activeTextEditor.selection
      );
      
      sidebarProvider._view?.webview.postMessage({
        type: "new-todo",
        value: JSON.stringify(await trees.initTree()),
      });
    })
  );

  // 添加备注
  context.subscriptions.push(vscode.commands.registerCommand(
    "cataremark.setNote",
    (uri: vscode.Uri) => {
      console.log(123);
      
      if (!uri) {
        return vscode.window.showErrorMessage(
          "请从资源管理器右键，点击设置备注使用此功能"
        );
      }
      console.log('urr', uri);
      
      let relativePath = getRelativePath(uri);
      console.log('relativePath', relativePath);

      provider.provideFileDecoration(uri);
      
      let reamrkVal = trees.getRemark(relativePath);
      vscode.window
        .showInputBox({ placeHolder: "请输入本文件或文件夹的备注", value: reamrkVal })
        .then((txt: any) => {
          if (typeof txt === "undefined") {
            return;
          }
          console.log('txt', txt);
          trees.setReamrk(relativePath, txt, trees.treeList);
          // saveNote(relativePath, txt);
          provider.dispose();
          provider = createProvider();
          provider.provideFileDecoration(uri);
        });
    }
  ));
  // 创建文件时
  context.subscriptions.push(vscode.workspace.onDidCreateFiles((event: vscode.FileCreateEvent) => {
      trees.initTree();
  }));
  // 删除文件时
  context.subscriptions.push(vscode.workspace.onDidDeleteFiles((event: vscode.FileCreateEvent) => {
      trees.initTree();
  }));
}

// this method is called when your extension is deactivated
export function deactivate() {
  console.log('deactivate');
  
}
