# KAnki Scribe

Kindle Scribe 专用的背单词应用，基于开源仓库 [KAnki](https://github.com/crizmo/KAnki)（原作者 Kurizu）二次开发。
针对 Kindle Scribe 的 **1860×2480 高分辨率墨水屏**进行了适配：词条示例区铺满整卡、单词大号加粗并紧贴顶栏、上一个/下一个控制按钮移到卡片外部、Reset 栏贴底、无滚动条，并加入了新的“上一词”与进度统计。

## 内置词库

应用内置了两套考研词汇（默认加载 `kanki_config.js`）：

| 词库 | 来源 | 说明 |
|------|------|------|
| 2024 红宝书考研词汇（必考词 + 基础词 + 超纲词） | [Anki 共享牌组 75315103](https://ankiweb.net/shared/info/75315103) | **默认**。收录尽可能全的词条（释义例句 / 真题例句 / 助记 / 分布 / 词源 / 词根词缀 / 中文释义 / 真题分布 / 辨析） |
| 考研英语真题生词（1995–2017 真题） | [Anki 共享牌组 934622764](https://ankiweb.net/shared/info/934622764) | 真题词汇，包含 柯林斯星级 / 真题原句 / 简明释义 / 扩展释义 / 柯林斯解释 / 来源年份 |

## 使用方法

1. **下载源码**：在仓库首页点击 `Code` → `Download ZIP`，解压到电脑。
2. **放入 Kindle**：
   - 用 USB 连接 Kindle，把它当作 U 盘打开。
   - 把解压得到的 **`kanki` 文件夹**和 **`kanki.sh`** 两个文件一起复制到 Kindle 的 `documents` 文件夹内。
   - 目录结构应为：

     ```
     documents/
       kanki.sh
       kanki/
         config.xml
         index.html
         main.css
         responsive.css
         main.js
         assets/fonts/language.otf
         js/
           kanki_config.js    # 当前使用的词库
           kanki_config2.js   # 另一套备用词库（切换见下）
           polyfill.min.js
           sdk.js
     ```

3. **断开 USB**，在 Kindle 主界面打开 KAnki 应用即可。

## 切换词库

应用默认加载 `kanki/js/kanki_config.js`。想改用另一套词库时：

1. 把 `kanki/js/kanki_config2.js` **重命名为** `kanki_config.js`（覆盖原来的即可）。
2. 重新打开应用（或点右上角 `⋮` → `Reload`）即可生效。

> 提示：切换会替换当前词库。两套不会同时生效，请先备份不想丢失的词库文件。

## 其它开源信息

- 本仓库为 **独立分支**，不与上游源库同步更新。
- 应用运行时进度保存在 Kindle 的 localStorage，重置进度不会影响词库文件。
- 原始启动脚本（`kanki.sh`）带有对 HackerDude 原始源码的致谢，予以保留。

## License

本仓库基于 [crizmo/KAnki](https://github.com/crizmo/KAnki) 派生，遵循 MIT 许可证。详见 [LICENSE](LICENSE)。
