import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { treeListInterface, treeItemInterface } from './types';
import { fileName } from './utils';

// 需要过滤掉的文件路径
const filterMenuList = ['.DS_Store', 'node_modules', '.git'];

// 初始化目录obj
export function initTree(dir: any): treeItemInterface[] {
    dir = dir.replace(/\\/g, "/")
    let rootPath = dir.slice(0, dir.lastIndexOf('/')).replace(/\\/g, "/");
    // var filesNameArr = [];
    // 用个hash队列保存每个目录的深度
    var mapDeep: any = {};
    mapDeep[dir] = 0;
    // 先遍历一遍给其建立深度索引
    function getMap(dir: any, curIndex: any) {
        var files = fs.readdirSync(dir); //同步拿到文件目录下的所有文件名
        files.map(function (file: any) {
            //var subPath = path.resolve(dir, file) //拼接为绝对路径
            var subPath = path.join(dir, file); //拼接为相对路径

            var stats = fs.statSync(subPath); //拿到文件信息对象
            // 必须过滤掉node_modules文件夹
            if (!subPath.includes('node_modules')) {
                mapDeep[file] = curIndex + 1;
                if (stats.isDirectory()) { //判断是否为文件夹类型
                    return getMap(subPath, mapDeep[file]); //递归读取文件夹
                }
            }
        });
    }
    getMap(dir, mapDeep[dir]);
    function readdirs(dir: any, folderName: any, myroot?: any) {
        dir = dir.replace(/\\/g, "/")
        var result: any = { //构造文件夹数据
            title: path.basename(dir),
            // remark: path.basename(dir),
            remark: '',
            isFile: false,
            isDir: true,
            relativePath: dir.replace(rootPath, ''),
            resourcePath: dir,
            type: 'directory',
            deep: mapDeep[folderName],
        };
        var files = fs.readdirSync(dir); //同步拿到文件目录下的所有文件名
        // 过滤不需要的目录
        filterMenuList.forEach((item: string) => {
            files.forEach((fileItem: string, index: number) => {
                if (fileItem.indexOf(item) !== -1) {
                    files.splice(index, 1);
                }
            });
        });
        // 对树形菜单进行排序
        files.sort((s1, s2) => {
            var s1SubPath = path.join(dir, s1); //拼接为相对路径
            var s1Stats = fs.statSync(s1SubPath); //拿到文件信息对象
            var s2SubPath = path.join(dir, s2); //拼接为相对路径
            var s2Stats = fs.statSync(s2SubPath); //拿到文件信息对象
            if (s1Stats.isDirectory() && s2Stats.isDirectory()) {
                return 1;
            } else if (s1Stats.isDirectory()) {
                return -1;
            } else {
                return 1;
            }
        });
        result.children = files.map(function (file: any) {
            //var subPath = path.resolve(dir, file) //拼接为绝对路径
            var subPath = path.join(dir, file).replace(/\\/g, "/"); //拼接为相对路径
            var stats = fs.statSync(subPath); //拿到文件信息对象
            if (stats.isDirectory()) { //判断是否为文件夹类型
                return readdirs(subPath, file, file); //递归读取文件夹
            }
            return { //构造文件数据
                title: file,
                remark: '',
                isFile: true,
                isDir: false,
                relativePath: subPath.replace(rootPath, ''),
                resourcePath: subPath,
                type: 'file',
            };
        });
        return result; //返回数据
    }
    // filesNameArr.push(readdirs(dir, dir));
    // return filesNameArr;
    return readdirs(dir, dir);
}

// json文件树和文件系统读取的树对比，返回符合实际的树和备注
export function compareTree(cataTree: any, jsonTree: any): any{
    // if (cataTree.lenth > 0) {
        cataTree.forEach((cataItem: any, cataIndex: number) => {
            jsonTree.forEach((jsonItem: any, jsonIndex: any) => {
                if (cataItem.title === jsonItem.title) {
                    if (!['', undefined].includes(jsonItem.remark)) {
                        console.log('jsonItem.remark', jsonItem.remark);
                        
                    }
                    cataItem.remark = jsonItem.remark;
                }
                if (jsonItem.children && cataItem.children && cataItem.children.length > 0 && jsonItem.children.length > 0) {
                    cataItem.children = compareTree(cataItem.children, jsonItem.children);
                }
            });
        });
    // }
    return cataTree;
}


export class treeList implements treeListInterface {
    [x: string]: any
    constructor() {
        this.cataNotesUrl = ''; // 写入文件地址
        this.treeList = {};
        this.initTree();
    }
    // 初始化目录树状结构
    initTree(): Array<treeItemInterface> {
        let treeList: Array<treeItemInterface> = [];
        console.log(vscode.workspace.workspaceFolders, vscode.workspace.rootPath);
        const workspaceFoldersList = vscode.workspace.workspaceFolders;
        workspaceFoldersList?.forEach((workspaceFoldersItem) => {
            let jsonPath = path.join(workspaceFoldersItem.uri.fsPath, ".vscode");
            let jsonPathFile = path.join(`${workspaceFoldersItem.uri.fsPath}/.vscode/`, fileName);
            let treeListItem;
            // 如果有对应的文件，从文件直接读取，对应的数据，如果没有的话，重新初始化
            if(fs.existsSync(jsonPathFile)){
                let cataTree = initTree(`${workspaceFoldersItem.uri.fsPath}`);
                let jsonTree =  JSON.parse(fs.readFileSync(path.join(`${workspaceFoldersItem.uri.fsPath}/.vscode/`, fileName), { encoding: "utf-8" }));
                let cloneTreeListItem = JSON.stringify(compareTree([cataTree], [jsonTree]));
                treeListItem = JSON.parse(cloneTreeListItem.slice(1, cloneTreeListItem.length - 1));
            } else {
                treeListItem = initTree(`${workspaceFoldersItem.uri.fsPath}`);
                if (!fs.existsSync(jsonPath)) {
                    fs.mkdirSync(jsonPath);
                }
                if (!fs.existsSync(path.join(jsonPath, fileName))) {
                    fs.writeFileSync(path.join(jsonPath, fileName), "[]");
                }
                // this.treeList = treeList;
            }
            let res = fs.writeFileSync(
                path.join(jsonPath, fileName),
                `${JSON.stringify(treeListItem)}`
            );
            console.log('res', res);
            
            treeList.push(treeListItem);
            console.log('treeList', treeList);
        });
        this.treeList = treeList;
        return treeList;
    }
    // 保存树的json数据
    async save2JSON(): Promise<void> {
        let treeList = await this.initTree();

        let settingJsonPath = (vscode.workspace.workspaceFolders || [])[0]?.uri
            .fsPath;
        this.cataNotesUrl = path.join(settingJsonPath, ".vscode");
        if (!fs.existsSync(this.cataNotesUrl)) {
            fs.mkdirSync(this.cataNotesUrl);
        }
        if (!fs.existsSync(path.join(this.cataNotesUrl, fileName))) {
            fs.writeFileSync(path.join(this.cataNotesUrl, fileName), "[]");
        }
        this.treeList = treeList;
        fs.writeFileSync(
            path.join(this.cataNotesUrl, fileName),
            `${JSON.stringify(treeList)}`
        );
    }
    // 获取以前的备注
    getRemark(url: string): string {
        let urlArr: Array<string> = url.split('/');
        let remark: string = '';
        let treeClone = JSON.parse(JSON.stringify(this.treeList));
        urlArr.forEach((urlItem: string, urlIndex: number) => {
            treeClone.some((treeItem: treeItemInterface) => {
                if (treeItem.title === urlItem) {
                    if (urlIndex === urlArr.length - 1) {
                        remark = treeItem.remark;
                        return true;
                    } else {
                        treeClone = treeItem.children;
                    }
                }
            });
        });
        return remark;
    }
    // 写入备注信息
    setReamrk(url: string, val: string, tree: Array<treeItemInterface>): void {
        let settingJsonPath = (vscode.workspace.workspaceFolders || [])[0]?.uri
            .fsPath;
        this.cataNotesUrl = path.join(settingJsonPath, ".vscode");
        let urlArr: Array<string> = url.split('/');
        urlArr.forEach((urlItem: string, urlIndex: number) => {
            tree.some((treeItem: treeItemInterface) => {
                if (treeItem.title === urlItem) {
                    if (urlIndex === urlArr.length - 1) {
                        treeItem.remark = val;
                        console.log('remarkval');
                        this.treeList.some((treeItem: treeItemInterface, index: number) => {
                            if (treeItem.resourcePath === settingJsonPath) {
                                fs.writeFileSync(
                                    path.join(this.cataNotesUrl, fileName),
                                    `${JSON.stringify(this.treeList[index])}`
                                );
                            }
                        });
                        return true;
                    } else if (treeItem.children !== undefined) {
                        return this.setReamrk(url, val, treeItem.children);   
                    }
                }
            });
        });
    }
}

export const trees = new treeList();