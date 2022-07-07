# cataRemark README

这是一个给文件及文件夹设置备注的插件,生成的有对应的目录菜单，方便查看备注

## Features

给文件及文件夹设置备注，显示在 title 当中，备注数据存储在.vscode/cata-notes.json中
1.设置文件备注
![](https://github.com/zjc2233/cataRemark/tree/main/media/images/setting.png)
2.鼠标悬停查看文件备注
![](https://github.com/zjc2233/cataRemark/tree/main/media/images/remark.jpg)
3.目录树查看备注，点击展开文件夹和打开文件，工作区正常
![](https://github.com/zjc2233/cataRemark/tree/main/media/images/tree.png)

## Extension Settings

后续可能允许在备注树上进行设置备注和对文件进行增删改操作

## Known Issues

手动更改 cata-notes.json 需重启才能生效

## Release Notes

现在插件加载时会自动创建存储文件，新增文件和删除文件时备注树会同步修改

若 json 中某路径无对应提示信息，会在下一次设置或更新备注后从 json 中移除


**Note:**

该插件刚起步，欢迎提 issue 和 pr
https://github.com/zjc2233/cataRemark

**Enjoy!**
