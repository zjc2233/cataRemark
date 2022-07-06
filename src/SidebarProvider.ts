import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { trees } from "./utils/tree";
const os = require('os');


export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;

  constructor(private readonly _extensionUri: vscode.Uri) { }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        // 打开某个文件
        case "open-file": {
          if (os.type() === 'Windows_NT') {
            //windows
            let path = await vscode.workspace.openTextDocument(data.value.replace(/\//g, "\\\\"));
            vscode.window.showTextDocument(path);
          } else if (os.type() === 'Darwin') {
            //mac
            let path = await vscode.workspace.openTextDocument(data.value);
            vscode.window.showTextDocument(path);
          } 
        }
        // 初始化tree
        case "init-tree": {
          // 通过postmessage向webview传递json树
          webviewView.webview.postMessage({
            type: "new-todo",
            value: JSON.stringify(trees.treeList),
          });
        }
        // case "onError": {
        //   if (!data.value) {
        //     return;
        //   }
        //   vscode.window.showErrorMessage(data.value);
        //   break;
        // }
      }
    });
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "svelte", "compiled/sidebar.js")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "svelte", "compiled/sidebar.css")
    );
    const styleCarbonUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webviews", "styles/css/g100.css")
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource
      }; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">
        <link href="${styleCarbonUri}" rel="stylesheet">
        <script nonce="${nonce}">
          const tsvscode = acquireVsCodeApi();
        </script>
			</head>
      <body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}
