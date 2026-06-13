# 题库练习

在线答题器，支持多题库、多模式、错题本管理。

## 部署

将以下文件放到同一目录，推送到 GitHub Pages 即可：

- `index.html` — 页面结构
- `style.css` — 样式
- `app.js` — 逻辑
- `*.json` — 题库数据

## 添加题库

1. 将 JSON 文件放到同目录
2. 在 `app.js` 顶部 `QUIZ_SOURCES` 数组添加一行：

```js
const QUIZ_SOURCES = [
  { file: 'Marxism.json', name: '马克思主义基本原理' },
  { file: 'math.json', name: '高等数学' },
];
```

### JSON 格式

必填字段：`question`、`answer`、`options`（选择题）

可选字段：`sequence`、`chapter`、`type`、`difficulty`

```json
{
  "sequence": 1,
  "chapter": "第一章",
  "type": "single_choice",
  "difficulty": "easy",
  "question": "题干文本",
  "answer": "A",
  "options": [
    { "label": "A", "text": "选项A" },
    { "label": "B", "text": "选项B" },
    { "label": "C", "text": "选项C" },
    { "label": "D", "text": "选项D" }
  ]
}
```

- `type`：`single_choice` / `multiple_choice` / `true_false`，缺失时根据答案自动推断
- `difficulty`：`easy` / `medium` / `hard`，缺失时隐藏难度筛选
- `chapter`：缺失时隐藏章节筛选
- 判断题无需 `options`，答案为 `正确` 或 `错误`

## 答题模式

| 模式 | 说明 |
|------|------|
| 重做错题 | 从错题本抽取，答对移除暂时错题，可选是否含长期记忆 |
| 闯关模式 | 答错100道即失败 |
| 无限模式 | 答对3次的题不再出现，错题反复出现 |
| 限时模式 | 选章节/难度，10分钟50题，查看答案时暂停计时 |

## 错题本

- **暂时错题**：答错自动加入，重做答对后自动移除
- **长期记忆**：用户主动加入，重做答对不移除，需手动移除
- 点击首页绿色"错题本"可浏览、分类、移除
- 答题时点 `+` 号可切换分类、写备注

## 交互

- 单选/判断：点击即判定，1.5秒自动下一题
- 多选：点击切换选中，确认按钮提交
- 连击特效：连续3题答对闪绿光，10题掉落+Perfect，可在 `+` 号开关

## 进度管理

无限模式齿轮设置面板可导出/导入进度 JSON，包含无限模式进度、自定义难度、错题本、备注。
