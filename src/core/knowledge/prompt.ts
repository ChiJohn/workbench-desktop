export function askPrompt(question: string, project?: string): string {
  const scope = project?.trim() ? `优先查看「项目/${project.trim()}/」和「知识/${project.trim()}」。` : '没有限定项目。'
  return `你是工作台的知识库问答助手。当前工作目录是 Obsidian vault，只读，不要修改、创建或删除任何文件。
只依据笔记内容回答，找不到就明确说找不到。
优先阅读「知识/」「项目/」「任务/」。${scope}
不要引用「汇报/」和「问答/」，除非问题本身在问汇报或以前的问答。
用中文 Markdown 回答。最后单独一行写 SOURCES:，之后每行一个你实际读过的笔记路径（相对 vault 根目录，用 / 分隔，不要加列表符号）。

问题：${question.trim()}`
}

export function distillPrompt(title: string, material: string): string {
  return `把下面的材料收成一条知识笔记。只输出这些内容，不要解释：
第一行 TITLE: 不超过 20 个字的标题
空一行
然后是 2 到 6 条「- 」开头的要点，保留文件路径、字段名和规则，去掉过程流水账。

建议标题：${title.trim() || '未命名'}

材料：
${material.trim()}`
}
