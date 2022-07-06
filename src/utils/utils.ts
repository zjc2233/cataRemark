import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { trees } from "./tree";


export const fileName: string = 'cata-notes.json';

export function getBasePath(uri: vscode.Uri) {
    return vscode.workspace.getWorkspaceFolder(uri);
}
export function getRelativePath(pathUri: vscode.Uri): string {
    let basePath = getBasePath(pathUri)?.uri.fsPath.replace(/\\/g, "/") || "";
    basePath = basePath.slice(0, basePath.lastIndexOf('/'));
    let path = pathUri.fsPath;
    return path.replace(basePath, "").replace(/\\/g, "/");
}

export class NoteDecorationProvider {
    public disposables;
    constructor() {
        this.disposables = [];
        this.disposables.push(vscode.window.registerFileDecorationProvider(this));
    }
    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration {
        let relativePath = getRelativePath(uri);
        let txt = trees.getRemark(relativePath);
        // let txt = '特色';
        console.log('txt', txt);
        
        if (!txt) {
            return {};
        }
        return {
            tooltip: txt,
            propagate: true,
        };
    }
    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
/**
* 提示提供器实例
*/
let provider: NoteDecorationProvider;
export function createProvider() {
    provider = new NoteDecorationProvider();
    return provider;
}