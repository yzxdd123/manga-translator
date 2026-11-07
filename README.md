# 漫画日译中 · Safari 扩展

在 **Kindle 网页版**（`read.amazon.co.jp`）读日文漫画时，自动识别气泡里的对白（竖排、横排都能识别），用 AI 大模型翻译成自然的简体中文，再把译文直接“嵌”回气泡里。翻页时自动翻译，像在读汉化版。

支持 **Mac、iPad、iPhone** 上的 Safari。

![效果图](docs/screenshot.webp)

## 特点

- **像汉化版一样的排版**：在白色等纯色气泡里，插件逐像素抹掉日文，再用同样的底色写上中文，不会出现突兀的方框，也不挡画面。竖排气泡里的译文也竖排。文字压在画面上时（标题、旁白、拟声词），会垫一块和周围颜色一致的底板。想看原文时：Mac 上按住 **⌥ Option**，iPad/iPhone 上按住右下角的 **「原」** 按钮。
- **翻页自动翻译**：开启后不用每页点一次。Kindle 已经加载的前后页会提前翻译，翻过去就能直接看。翻过的页面会缓存（最近 400 页），重读时不再花 API 费用。
- **能识别竖排对白**：使用苹果系统新版的文字识别（Vision `RecognizeTextRequest`，旧接口完全不认竖排日文）。同一气泡里的多列文字会按从右到左合并成一句再翻译。
- **AI 翻译，不是机翻腔**：整页一次性交给大模型，附带前几页的内容，并自动积累人名译名表，语气更自然，称呼前后一致。支持任何 OpenAI 兼容接口，AI 出错时自动退回苹果系统翻译。
- **用量与费用一目了然**：页面右下角状态条会显示本页消耗的 token 数和预估费用，以及本书累计的页数、tokens 和费用，例如“本页 4.0k tokens ≈ ¥0.0012 · 本书 12 页 36.0k tokens ≈ ¥0.011”。设置页的“用量统计”按书列出明细，还会按平均每页的费用推算 200 页一本大约多少钱。费用按内置的参考单价（见下表）估算，也可以在设置里填自己的单价。从缓存读取的页面不计费。
- **隐私**：识别在本机完成。API Key 只存在本机扩展里，请求由扩展的原生部分直接发给你填写的接口，不经过第三方服务器。

## 我在用的模型：Qwen3.7-Flash

作者日常用的是 **阿里云百炼的 `qwen3.7-flash`**。它翻译漫画口语很自然，速度快，价格也很低（见下表），插件里默认就是它。插件会自动关闭它的“思考”模式，并用流式输出，避免等待超时。

配置方法：Safari 设置 → 扩展 → 漫画日译中 → 设置（或点页面右下角状态条上的 ⚙）：

1. 翻译引擎选“AI 大模型”，服务商选“阿里云百炼 · qwen3.7-flash”。
2. 粘贴 API Key。如果你的控制台给了专属工作空间地址（形如 `https://ws-xxxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`），把它填到“接口地址”里。
3. 点“测试连接”，成功后点“保存”。

其他内置预设：DeepSeek、通义千问、Kimi、智谱、豆包、硅基流动、OpenAI、Gemini、OpenRouter、本机 Ollama。

## 常见模型费用参考

统一假设：一本 **200 页**漫画，先识别出日文，再翻成中文，累计消耗 **10 万输入 + 6 万输出 tokens**。

> 这只是预算样例，不是实际测量。美元按 1 美元 ≈ 7 元人民币估算，不含免费额度、缓存或批处理折扣。价格会变动，请以各家官网为准。

| 模型 | 输入／输出单价（元／百万 tokens） | 一本漫画示例费用 |
| --- | --- | --- |
| 智谱 GLM-4-FlashX-250414 | 0.10／0.10 | 约 0.016 元 |
| **Qwen3.7-Flash**（作者在用） | 0.20／0.80 | 约 0.068 元 |
| 豆包 Seed 2.0 Mini | 0.20／2.00 | 约 0.14 元 |
| Claude Haiku 5.5 | 0.70／3.50 | 约 0.28 元 |
| DeepSeek Flash | 闲时 1／4；峰时 2／8 | 约 0.34–0.68 元 |
| Gemini 3.1 Flash-Lite | 1.75／10.50 | 约 0.81 元起 |
| GPT-5.4 Mini | 5.25／31.50 | 约 2.42 元 |

表中这些模型的单价已内置在插件里，按模型名自动匹配，用来估算费用。其他模型可在设置里手动填写单价，不填则只统计 token 数。插件会请求接口返回真实的 token 用量（`stream_options.include_usage`）。接口不返回时按字数粗估，状态条上会标“约”。

也就是说，用 Qwen3.7-Flash 看一本漫画不到一毛钱。勾选“把页面图片发给 AI”（看图纠错）会增加输入 tokens，费用会相应上升。

## 系统要求

- macOS 26 / iPadOS 26 / iOS 26 或更新版本（竖排识别依赖新版 Vision 接口）。
- 只用苹果系统翻译、不用 AI 时，需要先下载日语和简体中文翻译语言：Mac 在“系统设置 → 通用 → 语言与地区 → 翻译语言”，iPhone/iPad 在“设置 → App → 翻译”。

## 下载安装

Safari 扩展必须装在一个 App 里才能安装。这里的 App 只是一个空壳，只显示一页“如何开启扩展”的说明，所有功能都在扩展里。

### Mac：下载即用

1. 到 [Releases](https://github.com/yzxdd123/manga-translator/releases/latest) 下载 `MangaTranslator-vX.Y.Z-macOS.zip`，解压后把 `MangaTranslator.app` 拖进“应用程序”文件夹。
2. 第一次打开：这个版本没有经过苹果公证，双击会提示“无法验证开发者”。点“完成”，再到 **系统设置 → 隐私与安全性**，在页面底部点 **“仍要打开”**。也可以在终端执行：
   ```sh
   xattr -dr com.apple.quarantine /Applications/MangaTranslator.app
   ```
3. 打开一次 App 后退出即可。然后在 Safari 允许未签名的扩展：Safari → 设置 → 高级，勾选“显示网页开发者功能”；再到 **设置 → 开发者**，勾选 **“允许未签名的扩展”**。
4. Safari → 设置 → 扩展，勾选“漫画日译中”，并允许它访问 `read.amazon.co.jp`。
5. 打开 Kindle 漫画，点工具栏上的扩展按钮，图标显示“开”就开启了自动翻译。

> “允许未签名的扩展”在 **每次退出 Safari 后会自动关闭**，下次打开 Safari 需要重新勾选（第 3 步），这是苹果对未签名扩展的限制。作者加入付费的 Apple 开发者计划后，会改为经过公证的签名版本，届时就不需要第 2、3 步了。

### iPad / iPhone：需要自己用 Xcode 安装

苹果不允许在 iPad / iPhone 上安装来自网页的 App，只能通过 App Store、TestFlight，或者自己用 Xcode 装。目前还没有上架，需要一台装有 Xcode 的 Mac：

1. 下载本仓库（绿色 Code 按钮 → Download ZIP，或 `git clone`）。
2. 用 Xcode 打开 `MangaTranslator-iOS/MangaTranslator.xcodeproj`。分别选中两个 target（MangaTranslator 和 MangaTranslator Extension），在 Signing & Capabilities 里把 Team 改成你自己的 Apple ID，并把 Bundle Identifier 里的 `local` 改成你自己的前缀（比如 `com.你的名字`）。
3. 用数据线连接 iPad，在 Xcode 顶部选中它，按 ⌘R 安装。第一次需要在 iPad 的 设置 → 通用 → VPN 与设备管理 里信任你的开发者证书，并在 设置 → 隐私与安全性 里打开“开发者模式”。
4. 设置 → App → Safari → 扩展 → 漫画日译中：打开开关，并允许访问 `read.amazon.co.jp`。
5. 在 Safari 打开 Kindle 漫画，点地址栏左侧的页面菜单 → 漫画日译中，开启自动翻译。

> 用免费 Apple ID 安装的 App **7 天后会失效**，到时用 Xcode 再装一次即可（设置和用量记录不会丢失）。付费开发者账号可以装一年。

### 从源码构建 Mac 版

用 Xcode 打开 `MangaTranslator/MangaTranslator.xcodeproj`，在 Signing 里选你自己的开发团队，按 ⌘R 运行，之后同上面的第 3–5 步。

两个工程共用同一份扩展代码，都在 `MangaTranslator/MangaTranslator Extension/`。

命令行构建：

```sh
xcodebuild -project MangaTranslator/MangaTranslator.xcodeproj -scheme MangaTranslator -configuration Debug -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project MangaTranslator-iOS/MangaTranslator.xcodeproj -scheme MangaTranslator -configuration Debug -sdk iphonesimulator -derivedDataPath build-ios CODE_SIGNING_ALLOWED=NO build
```

## 项目结构

```
MangaTranslator/MangaTranslator Extension/
  Resources/            扩展网页部分（manifest、content.js、background.js、设置页）
  MangaOCR.swift        Vision 竖排／横排识别 + 气泡分组
  HTTPProxy.swift       原生代发 AI 请求（避开 CORS，支持 SSE 流式）
  SafariWebExtensionHandler.swift   原生消息入口：ocr / translate / http
MangaTranslator-iOS/    iPhone / iPad 的外壳 App 工程
extension/              Resources 的副本
```

开发注意：扩展里的 `.js` 文件必须保持纯 ASCII（中文写成 `\uXXXX`），否则 Safari 可能读错编码，导致脚本出错。

## 已知限制

- 手写体、艺术字拟声词仍可能漏识别。
- 小气泡里的长译文可能会溢出。
- iPhone 上的 Safari 可能会把 Kindle 网页引导到 Kindle App。iPad 的体验更接近 Mac。
- 只适配了 Kindle 网页版，Kindle 改版后可能需要调整查找漫画图片的逻辑。

## 致谢

思路参考了 [FrankYomik](https://github.com/akitaonrails/FrankYomik) 和 [PanoraTL](https://github.com/PanoraTL/extension)。

## 许可

[MIT](LICENSE)。本项目仅供个人学习和阅读辅助使用，请尊重漫画版权。
