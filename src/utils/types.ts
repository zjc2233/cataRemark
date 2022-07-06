
export interface treeListInterface {
    initTree(): void
    getRemark(url: string): string
    setReamrk(url: string, val: string, tree: Array<treeItemInterface>): void
}
export interface treeItemInterface {
    id?: number | string
    title: number | string // 当前文件夹目录或者文件名
    remark: string | never // 当前备注
    isFile: boolean // 是否是文件
    isDir: boolean // 是否是目录
    relativePath: string // 相对路径
    resourcePath: string // 在本地的全路径
    children?: Array<treeItemInterface> // 子级
    deep?: number // 第几层
}